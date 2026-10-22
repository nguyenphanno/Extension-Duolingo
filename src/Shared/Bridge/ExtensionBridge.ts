/**
 * ExtensionBridge.ts — the one place that knows whether we are running as an
 * extension or as a standalone preview.
 *
 * Every React surface talks to `bridge`, never to `chrome.*`. That keeps the
 * components identical in both modes and makes the preview a real UI test.
 */
import { PORT_NAME } from '../Constants';
import type { StreamEvent, UiRequest, UiState } from '../Protocol';
import { err, ok, type Result } from '../Result';
import type { LogEntry, RunSummary, Settings, TaskKey } from '../Types';
import { createId } from '../Utils/Id';
import { MOCK_LOGS, MOCK_PROFILE, MOCK_RUNS, MOCK_STATS, MOCK_SUMMARY, mockState } from './MockData';

export interface Bridge {
  readonly mode: 'extension' | 'preview';
  send<T = unknown>(request: UiRequest): Promise<Result<T>>;
  subscribe(listener: (event: StreamEvent) => void): () => void;
}

export function isExtensionContext(): boolean {
  try {
    return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Real extension
 * ------------------------------------------------------------------ */

class ExtensionBridge implements Bridge {
  readonly mode = 'extension' as const;
  private port: chrome.runtime.Port | null = null;

  private ensurePort(): chrome.runtime.Port | null {
    if (this.port) return this.port;
    try {
      this.port = chrome.runtime.connect({ name: PORT_NAME });
      this.port.onDisconnect.addListener(() => {
        this.port = null;
      });
      return this.port;
    } catch {
      return null;
    }
  }

  async send<T = unknown>(request: UiRequest): Promise<Result<T>> {
    try {
      const response = (await chrome.runtime.sendMessage(request)) as Result<T> | undefined;
      if (!response) return err(new Error('No response from the service worker.'));
      return response;
    } catch (error) {
      return err(error);
    }
  }

  subscribe(listener: (event: StreamEvent) => void): () => void {
    const port = this.ensurePort();
    if (!port) return () => undefined;
    const handler = (message: unknown) => {
      const event = message as StreamEvent;
      if (event && typeof event.type === 'string') listener(event);
    };
    port.onMessage.addListener(handler);
    return () => {
      try {
        port.onMessage.removeListener(handler);
      } catch {
        /* port already gone */
      }
    };
  }
}

/* ------------------------------------------------------------------ *
 * Standalone preview (no extension APIs)
 * ------------------------------------------------------------------ */

class PreviewBridge implements Bridge {
  readonly mode = 'preview' as const;
  private listeners = new Set<(event: StreamEvent) => void>();
  private state: UiState = mockState();
  private cancelled = false;
  private running = false;

  private emit(event: StreamEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private pushState(): void {
    this.emit({ type: 'state', state: structuredClone(this.state) });
  }

  private log(level: LogEntry['level'], scope: string, message: string): void {
    const entry: LogEntry = { id: createId('log'), at: Date.now(), level, scope, message };
    this.state.logs = [...this.state.logs, entry];
    this.emit({ type: 'log', entry });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async simulateRun(trigger: RunSummary['trigger'], only?: TaskKey[]): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.cancelled = false;
    const startedAt = Date.now();
    const wanted = (key: TaskKey) => !only || only.length === 0 || only.includes(key);

    this.state.run = {
      phase: 'preparing',
      runId: createId('run'),
      startedAt,
      finishedAt: null,
      trigger,
      currentTask: null,
      currentLabel: 'Resolving session',
      progress: 0.02,
      summary: null,
      error: null,
    };
    this.pushState();
    this.log('info', 'run', `Run started (${trigger})`);

    if (only && only.length > 0) {
      this.log('info', 'run', `Partial run requested: ${only.join(', ')}`);
    }

    await this.wait(500);
    this.log('success', 'run', 'Signed in as minh.learner · 128-day streak · 24580 XP');
    this.state.run = { ...this.state.run, phase: 'running', progress: 0.08, currentTask: 'practice', currentLabel: 'Practice sessions' };
    this.pushState();

    for (let index = 1; index <= 3; index += 1) {
      if (this.cancelled || !wanted('practice')) break;
      this.state.run = { ...this.state.run, currentLabel: `Session ${index}/3`, progress: 0.08 + index * 0.2 };
      this.pushState();
      this.log('info', 'practice', `Session ${index} opened`);
      await this.wait(700);
      this.log('success', 'practice', `Session ${index} completed (+15 XP)`);
    }

    if (!this.cancelled && wanted('rewards')) {
      this.state.run = { ...this.state.run, currentTask: 'rewards', currentLabel: 'Reward sweep', progress: 0.72 };
      this.pushState();
      this.log('info', 'rewards', 'Scanning reward bundles');
      await this.wait(600);
      this.log('success', 'rewards', '3 rewards claimed (+120 gems)');

      this.state.run = { ...this.state.run, currentTask: 'badge', currentLabel: 'Monthly badges', progress: 0.84 };
      this.pushState();
      await this.wait(500);
      this.log('warn', 'badge', 'Cooldown: resets back in 6h');

      this.state.run = { ...this.state.run, currentTask: 'freeze', currentLabel: 'Streak freeze', progress: 0.94 };
      this.pushState();
      await this.wait(450);
      this.log('success', 'freeze', 'Streak freeze purchased');
    }

    const summary: RunSummary = {
      ...MOCK_SUMMARY,
      id: this.state.run.runId ?? createId('run'),
      startedAt,
      finishedAt: Date.now(),
      trigger,
      error: this.cancelled ? 'Run cancelled.' : null,
    };

    this.state.run = {
      ...this.state.run,
      phase: this.cancelled ? 'cancelled' : 'done',
      finishedAt: summary.finishedAt,
      progress: 1,
      currentLabel: this.cancelled ? 'Cancelled' : 'Complete',
      currentTask: null,
      summary,
    };
    this.state.lastSummary = summary;
    this.state.profile = { ...MOCK_PROFILE, totalXp: MOCK_PROFILE.totalXp + summary.xpGained, gems: MOCK_PROFILE.gems + summary.gemsClaimed };
    this.state.stats = { ...MOCK_STATS, runs: MOCK_STATS.runs + 1, xp: MOCK_STATS.xp + summary.xpGained };
    this.log(this.cancelled ? 'warn' : 'success', 'run', this.cancelled ? 'Run cancelled.' : 'Run finished · +45 XP · 3 rewards · 120 gems');
    this.pushState();
    this.running = false;
  }

  async send<T = unknown>(request: UiRequest): Promise<Result<T>> {
    switch (request.type) {
      case 'state/get':
        return ok(structuredClone(this.state) as T);

      case 'settings/save':
        this.state.settings = request.settings as Settings;
        this.pushState();
        return ok(structuredClone(this.state) as T);

      case 'settings/reset':
        this.state.settings = mockState().settings;
        this.pushState();
        return ok(structuredClone(this.state) as T);

      case 'settings/export':
        return ok({ json: JSON.stringify(this.state.settings, null, 2) } as T);

      case 'settings/import': {
        try {
          this.state.settings = JSON.parse(request.payload) as Settings;
          this.pushState();
          return ok(structuredClone(this.state) as T);
        } catch (error) {
          return err(error);
        }
      }

      case 'profile/refresh':
        this.state.profile = { ...MOCK_PROFILE, fetchedAt: Date.now() };
        this.pushState();
        return ok(this.state.profile as T);

      case 'run/start':
        void this.simulateRun(request.trigger ?? 'manual', request.only);
        return ok({ started: true } as T);

      case 'run/cancel':
        this.cancelled = true;
        return ok({ cancelled: true } as T);

      case 'history/list':
        return ok([...(this.state.lastSummary ? [this.state.lastSummary] : []), ...MOCK_RUNS] as T);

      case 'history/clear':
        this.state.lastSummary = null;
        this.pushState();
        return ok({ cleared: true } as T);

      case 'logs/clear':
        this.state.logs = [];
        this.pushState();
        return ok({ cleared: true } as T);

      case 'token/test':
      case 'token/set':
        return ok(this.state.token as T);

      case 'panel/open':
      case 'tab/open':
        return ok({ opened: false, reason: 'Preview mode' } as T);

      default:
        return err(new Error('Unsupported in preview mode.'));
    }
  }

  subscribe(listener: (event: StreamEvent) => void): () => void {
    this.listeners.add(listener);
    listener({ type: 'hello', state: structuredClone(this.state) });
    if (this.state.logs.length === 0) this.state.logs = [...MOCK_LOGS];
    return () => this.listeners.delete(listener);
  }
}

export const bridge: Bridge = isExtensionContext() ? new ExtensionBridge() : new PreviewBridge();
