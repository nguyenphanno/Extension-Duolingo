/**
 * AutomationEngine.ts — the orchestrator.
 *
 * Responsibilities: resolve identity, build clients, walk the task plan,
 * translate per-task progress into one overall progress value, and produce a
 * durable `RunSummary`. It never touches storage or chrome.* — the caller does.
 */
import { createDuoHttpClient } from '@Core/Http/HttpClient';
import { DuolingoApi } from '@Core/Http/DuolingoApi';
import { ProApi } from '@Core/Http/ProApi';
import { logger } from '@Shared/Logger';
import { AppError, toShape } from '@Shared/Result';
import type {
  Profile,
  ProfileSnapshot,
  RunState,
  RunSummary,
  RunTrigger,
  Settings,
  TaskKey,
  TaskOutcome,
} from '@Shared/Types';
import { createId } from '@Shared/Utils/Id';
import { sleep } from '@Shared/Utils/Time';
import { parseToken } from '@Core/Auth/Jwt';
import { planFor, totalWeight } from './TaskRegistry';
import type { TaskContext } from './Task';

export interface EngineHooks {
  onState: (patch: Partial<RunState>) => void;
  onTaskDone: (task: TaskOutcome) => void;
}

export interface EngineInput {
  token: string;
  settings: Settings;
  trigger: RunTrigger;
  hooks: EngineHooks;
  /** Run only these tasks, in registry order. Omit for the normal plan. */
  only?: TaskKey[];
}

const METRIC_LABELS: Record<string, string> = {
  xp: 'XP',
  sessions: 'sessions',
  failed: 'failed',
  claimed: 'claimed',
  gems: 'gems',
  missing: 'missing',
  requested: 'requested',
  granted: 'granted',
  purchased: 'purchased',
};

/** `{xp: 30, sessions: 2}` -> ` (XP 30 · sessions 2)` */
function formatMetrics(metrics: Record<string, number>): string {
  const parts = Object.entries(metrics)
    .filter(([, value]) => Number.isFinite(value))
    .map(([key, value]) => `${METRIC_LABELS[key] ?? key} ${value}`);
  return parts.length ? ` (${parts.join(' · ')})` : '';
}

const snapshot = (profile: Profile | null): ProfileSnapshot | null =>
  profile
    ? { streak: profile.streak, totalXp: profile.totalXp, gems: profile.gems, hearts: profile.hearts }
    : null;

export class AutomationEngine {
  private readonly controller = new AbortController();
  private readonly log = logger.scope('run');

  constructor(private readonly input: EngineInput) {}

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  cancel(reason = 'Cancelled by user.'): void {
    if (!this.controller.signal.aborted) {
      this.log.warn(reason);
      this.controller.abort(new DOMException(reason, 'AbortError'));
    }
  }

  async run(): Promise<RunSummary> {
    const { token, settings, trigger, hooks, only } = this.input;
    const runId = createId('run');
    const startedAt = Date.now();

    hooks.onState({
      phase: 'preparing',
      runId,
      startedAt,
      finishedAt: null,
      trigger,
      currentTask: null,
      currentLabel: 'Resolving session',
      progress: 0,
      summary: null,
      error: null,
    });

    const parsed = parseToken(token);
    if (!parsed.valid) {
      throw new AppError('TOKEN_EXPIRED', parsed.reason);
    }

    const http = createDuoHttpClient(parsed.token);
    const api = new DuolingoApi(http, parsed.userId);
    const pro = new ProApi(http);

    let profile: Profile | null = null;
    this.log.info('Fetching profile…');
    try {
      profile = await api.getProfile();
      this.log.success(`Signed in as ${profile.username} · ${profile.streak}-day streak · ${profile.totalXp} XP`);
    } catch (error) {
      this.log.warn(`Profile unavailable, continuing with defaults: ${(error as Error).message}`);
    }

    const effectiveProfile: Profile = profile ?? {
      userId: parsed.userId,
      username: parsed.username ?? 'learner',
      displayName: parsed.username ?? 'learner',
      streak: 0,
      totalXp: 0,
      gems: 0,
      hearts: 5,
      maxHearts: 5,
      fromLanguage: 'en',
      learningLanguage: 'es',
      streakFreezes: 0,
      hasPlus: false,
      league: null,
      avatarUrl: null,
      fetchedAt: Date.now(),
    };

    const tasks = planFor(settings, only);
    const weightTotal = totalWeight(tasks);
    const outcomes: TaskOutcome[] = [];
    let doneWeight = 0;
    let cancelled = false;

    if (only && only.length > 0) {
      this.log.info(`Partial run requested: ${tasks.map((task) => task.key).join(', ') || 'nothing enabled'}`);
    }

    if (tasks.length === 0) {
      throw new AppError(
        'UNKNOWN',
        only && only.length > 0
          ? 'None of the requested tasks are available.'
          : 'Nothing is enabled — turn on at least one task before running.',
      );
    }

    hooks.onState({ phase: 'running', currentLabel: tasks[0]?.label ?? 'Nothing to do' });

    for (const task of tasks) {
      if (this.signal.aborted) {
        cancelled = true;
        break;
      }

      let local = 0;
      hooks.onState({ currentTask: task.key, currentLabel: task.label });

      const ctx: TaskContext = {
        api,
        pro,
        settings,
        profile: effectiveProfile,
        dryRun: settings.behavior.dryRun,
        signal: this.signal,
        log: logger.scope(task.key),
        wait: (ms) => sleep(ms, this.signal),
        report: (progress, label) => {
          local = Math.min(1, Math.max(0, progress));
          hooks.onState({
            currentLabel: label,
            progress: Math.min(0.99, (doneWeight + local * task.weight) / weightTotal),
          });
        },
      };

      try {
        const result = await task.run(ctx);
        outcomes.push(result);
        hooks.onTaskDone(result);
        this.log.info(`${task.label}: ${result.headline}${formatMetrics(result.metrics)}`);
      } catch (error) {
        if (this.signal.aborted || (error as Error)?.name === 'AbortError') {
          cancelled = true;
          break;
        }
        const shape = toShape(error);
        const failed: TaskOutcome = {
          task: task.key,
          label: task.label,
          status: 'failed',
          headline: shape.message,
          detail: shape.detail,
          metrics: {},
          startedAt: Date.now(),
          finishedAt: Date.now(),
        };
        outcomes.push(failed);
        hooks.onTaskDone(failed);
        this.log.error(`${task.label} failed: ${shape.message}`);
      }

      doneWeight += task.weight;
      hooks.onState({ progress: Math.min(0.99, doneWeight / weightTotal) });
    }

    hooks.onState({ phase: 'finishing', currentLabel: 'Refreshing profile', currentTask: null });

    let after: Profile | null = null;
    try {
      after = await api.getProfile();
    } catch {
      /* best effort */
    }

    const sessions = outcomes.filter((entry) => entry.task === 'practice');
    const xpGained = outcomes
      .filter((entry) => entry.task === 'practice')
      .reduce((sum, entry) => sum + (entry.metrics.xp ?? 0), 0);
    const rewardsClaimed = outcomes.find((entry) => entry.task === 'rewards')?.metrics.claimed ?? 0;
    const gemsClaimed = outcomes.find((entry) => entry.task === 'rewards')?.metrics.gems ?? 0;
    const badgeOutcome = outcomes.find((entry) => entry.task === 'badge');

    const summary: RunSummary = {
      id: runId,
      startedAt,
      finishedAt: Date.now(),
      trigger,
      dryRun: settings.behavior.dryRun,
      xpGained,
      rewardsClaimed,
      gemsClaimed,
      sessions: sessions.flatMap((entry) =>
        entry.metrics.sessions
          ? [
              {
                index: 1,
                sessionId: '',
                xp: entry.metrics.xp ?? 0,
                durationMs: 0,
                ok: entry.status === 'done',
              },
            ]
          : [],
      ),
      tasks: outcomes,
      before: snapshot(profile),
      after: snapshot(after),
      badgeStatus: badgeOutcome ? `${badgeOutcome.headline}${badgeOutcome.detail ? ` — ${badgeOutcome.detail}` : ''}` : 'Not checked',
      error: cancelled ? 'Run cancelled.' : null,
    };

    hooks.onState({
      phase: cancelled ? 'cancelled' : 'done',
      finishedAt: summary.finishedAt,
      progress: 1,
      summary,
      currentLabel: cancelled ? 'Cancelled' : 'Complete',
      currentTask: null,
    });

    return summary;
  }
}
