/**
 * AppContext.ts — the service worker's single shared state container.
 *
 * MV3 workers can be torn down at any moment, so the authoritative state lives
 * in storage and this object is only a cache that is rebuilt on wake.
 */
import { tokenProvider } from '@Core/Auth/TokenProvider';
import { historyRepository, type HistoryRepository } from '@Core/Storage/HistoryRepository';
import { settingsRepository, type SettingsRepository } from '@Core/Storage/SettingsRepository';
import { readRaw, writeRaw } from '@Core/Storage/StorageArea';
import { STORAGE_KEYS } from '@Shared/Constants';
import { logger } from '@Shared/Logger';
import type { StreamEvent, UiState } from '@Shared/Protocol';
import type { Profile, RunState, RunSummary } from '@Shared/Types';
import { PortHub } from './PortHub';

export const IDLE_RUN: RunState = {
  phase: 'idle',
  runId: null,
  startedAt: null,
  finishedAt: null,
  trigger: null,
  currentTask: null,
  currentLabel: 'Idle',
  progress: 0,
  summary: null,
  error: null,
};

export class AppContext {
  readonly ports = new PortHub();
  readonly settings: SettingsRepository = settingsRepository;
  readonly history: HistoryRepository = historyRepository;
  readonly log = logger.scope('worker');

  profile: Profile | null = null;
  run: RunState = { ...IDLE_RUN };
  lastSummary: RunSummary | null = null;
  version = '2.0.0';

  broadcast(event: StreamEvent): void {
    this.ports.broadcast(event);
  }

  patchRun(patch: Partial<RunState>): void {
    this.run = { ...this.run, ...patch };
    void writeRaw('session', STORAGE_KEYS.runState, this.run);
    this.broadcast({ type: 'run', run: this.run });
  }

  setProfile(profile: Profile | null): void {
    this.profile = profile;
    if (profile) void writeRaw('local', STORAGE_KEYS.profileCache, profile);
    this.broadcast({ type: 'profile', profile });
  }

  /** Restore caches after the worker was suspended. */
  async hydrate(): Promise<void> {
    const [profile, run, last] = await Promise.all([
      readRaw<Profile>('local', STORAGE_KEYS.profileCache),
      readRaw<RunState>('session', STORAGE_KEYS.runState),
      this.history.last(),
    ]);
    if (profile) this.profile = profile;
    if (run) {
      const interrupted = ['running', 'preparing', 'finishing'].includes(run.phase);
      this.run = interrupted
        ? { ...IDLE_RUN, phase: 'failed', error: 'Interrupted — the service worker restarted.' }
        : { ...IDLE_RUN, ...run };
    }
    this.lastSummary = last;
  }

  async buildState(): Promise<UiState> {
    const settings = await this.settings.load();
    const [stats, token, alarm] = await Promise.all([
      this.history.stats(),
      tokenProvider.info({ source: settings.tokenSource, manualToken: settings.manualToken }),
      chrome.alarms?.get?.('duo.schedule') ?? Promise.resolve(undefined),
    ]);

    return {
      settings,
      profile: this.profile,
      run: this.run,
      stats,
      logs: logger.snapshot().slice(-150),
      token,
      lastSummary: this.lastSummary,
      version: this.version,
      schedule: { nextRunAt: alarm?.scheduledTime ?? null },
    };
  }

  async pushState(): Promise<void> {
    try {
      const state = await this.buildState();
      this.broadcast({ type: 'state', state });
    } catch (error) {
      this.log.warn(`Could not build UI state: ${(error as Error).message}`);
    }
  }

  toast(level: 'success' | 'warn' | 'error' | 'info', message: string): void {
    this.broadcast({ type: 'toast', level, message });
  }
}

export const app = new AppContext();
