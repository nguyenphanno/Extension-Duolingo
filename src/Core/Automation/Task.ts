/**
 * Task.ts — the contract every automation step implements.
 *
 * A task is a pure async function over a `TaskContext`: it gets the API, the
 * settings, a cancellation signal and a progress reporter, and returns an
 * outcome. No task knows about chrome.* or React, which keeps them testable.
 */
import type { ScopedLogger } from '@Shared/Logger';
import type { Profile, Settings, TaskKey, TaskOutcome } from '@Shared/Types';
import type { DuolingoApi } from '@Core/Http/DuolingoApi';
import type { ProApi } from '@Core/Http/ProApi';

export interface TaskContext {
  api: DuolingoApi;
  pro: ProApi;
  settings: Settings;
  profile: Profile;
  dryRun: boolean;
  signal: AbortSignal;
  log: ScopedLogger;
  /** Cancellable delay. */
  wait(ms: number): Promise<void>;
  /** Local progress 0..1 for this task plus a short status label. */
  report(progress: number, label: string): void;
}

export interface AutomationTask {
  key: TaskKey;
  label: string;
  /** Relative cost, used to distribute overall progress. */
  weight: number;
  isEnabled(settings: Settings): boolean;
  run(ctx: TaskContext): Promise<TaskOutcome>;
}

export function outcome(
  task: TaskKey,
  label: string,
  status: TaskOutcome['status'],
  headline: string,
  extra: { detail?: string; metrics?: Record<string, number>; startedAt?: number } = {},
): TaskOutcome {
  return {
    task,
    label,
    status,
    headline,
    detail: extra.detail,
    metrics: extra.metrics ?? {},
    startedAt: extra.startedAt ?? Date.now(),
    finishedAt: Date.now(),
  };
}

export function skip(task: TaskKey, label: string, reason: string, startedAt: number): TaskOutcome {
  return outcome(task, label, 'skipped', reason, { startedAt });
}
