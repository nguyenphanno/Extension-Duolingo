// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * PlanSize.ts — how many lessons does *this* run actually need?
 *
 * The extension knows two numbers nobody else has: today's XP and the XP this
 * account really earns per lesson. Goal mode already stops a run once the goal
 * is met, but it still *starts* with a fixed session count — so a run either
 * overshoots and stops early (wasted setup, wasted requests) or undershoots and
 * leaves the goal unmet until the next alarm.
 *
 * Sizing closes that gap: the plan is computed from `(goal − earned) / average`,
 * and the configured session count becomes a ceiling rather than a target.
 *
 * Everything here is pure. The caller owns storage and the clock.
 */
import type { RunSummary } from '@Shared/Types';

/** Used only when there is no usable history yet. */
export const FALLBACK_XP_PER_SESSION = 15;

/** How many recent runs the average is drawn from. */
export const SAMPLE_RUNS = 20;

export interface SizeInput {
  /** Daily XP target. `0` means "no goal", so sizing is a no-op. */
  goal: number;
  /** XP already earned today, as recorded by this extension. */
  earned: number;
  /** The user's session count — an upper bound, never exceeded. */
  cap: number;
  /** `null` when no run has produced a usable sample. */
  avgXpPerSession: number | null;
}

export interface SizeResult {
  sessions: number;
  /** True when the computed count differs from the cap. */
  sized: boolean;
  /** The average actually used, after the fallback. */
  avgXpPerSession: number;
  /** Short, log-ready explanation — never shown as a bare number. */
  reason: string;
}

/**
 * Average XP per completed lesson across recent runs.
 *
 * Reads `tasks[].metrics` rather than `RunSummary.sessions`, because the engine
 * collapses a practice task into a single synthetic session entry — the real
 * per-session count only survives in the task metrics.
 */
export function averageXpPerSession(runs: RunSummary[], sampleRuns = SAMPLE_RUNS): number | null {
  let xp = 0;
  let sessions = 0;

  for (const run of runs.slice(0, sampleRuns)) {
    if (run.dryRun || run.error) continue;
    const practice = run.tasks.find((task) => task.task === 'practice');
    if (!practice || practice.status !== 'done') continue;

    const runXp = Number(practice.metrics.xp ?? 0);
    const runSessions = Number(practice.metrics.sessions ?? 0);
    if (!(runXp > 0) || !(runSessions > 0)) continue;

    xp += runXp;
    sessions += runSessions;
  }

  if (sessions === 0) return null;
  return Math.round((xp / sessions) * 10) / 10;
}

/**
 * Pick a session count that should land on the goal without overshooting it.
 *
 * Returns the cap unchanged whenever sizing cannot help: no goal, goal already
 * met, practice disabled, or no history to learn from. A caller can therefore
 * apply the result unconditionally.
 */
export function sizePlan(input: SizeInput): SizeResult {
  const cap = Math.max(0, Math.floor(input.cap));
  const avg = input.avgXpPerSession && input.avgXpPerSession > 0 ? input.avgXpPerSession : FALLBACK_XP_PER_SESSION;
  const goal = Math.max(0, input.goal);
  const earned = Math.max(0, input.earned);

  if (cap === 0) {
    return { sessions: 0, sized: false, avgXpPerSession: avg, reason: 'Practice is off.' };
  }
  if (goal === 0) {
    return { sessions: cap, sized: false, avgXpPerSession: avg, reason: 'No daily goal set.' };
  }

  const remaining = goal - earned;
  if (remaining <= 0) {
    return { sessions: cap, sized: false, avgXpPerSession: avg, reason: `Goal already met (${earned}/${goal} XP).` };
  }

  const needed = Math.ceil(remaining / avg);
  const sessions = Math.min(cap, Math.max(1, needed));
  const sized = sessions !== cap;

  const reason = sized
    ? `Sized to ${sessions} session(s): ${remaining} XP to go at ~${avg} XP each.`
    : `${sessions} session(s) — the cap binds before the goal does.`;

  return { sessions, sized, avgXpPerSession: avg, reason };
}
