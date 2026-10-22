// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * PlanSize.test.ts — goal-sized plans.
 *
 * The two functions under test decide how many lessons a run will attempt, so
 * the cases that matter are the ones where being wrong is expensive: a cap that
 * must not be exceeded, a goal already met, and history that is too thin or too
 * noisy to average.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_XP_PER_SESSION,
  averageXpPerSession,
  sizePlan,
} from '../src/Shared/Utils/PlanSize.ts';
import type { RunSummary, TaskOutcome } from '../src/Shared/Types.ts';

function practiceTask(metrics: Record<string, number>, status: TaskOutcome['status'] = 'done'): TaskOutcome {
  return {
    task: 'practice',
    label: 'Practice sessions',
    status,
    headline: '',
    metrics,
    startedAt: 0,
    finishedAt: 0,
  };
}

function run(overrides: Partial<RunSummary> & { tasks?: TaskOutcome[] } = {}): RunSummary {
  return {
    id: 'run-1',
    startedAt: 0,
    finishedAt: 0,
    trigger: 'manual',
    dryRun: false,
    xpGained: 0,
    rewardsClaimed: 0,
    gemsClaimed: 0,
    sessions: [],
    tasks: [],
    before: null,
    after: null,
    badgeStatus: 'Not checked',
    error: null,
    ...overrides,
  };
}

describe('averageXpPerSession', () => {
  it('returns null with no history', () => {
    assert.equal(averageXpPerSession([]), null);
  });

  it('weights the average by session count, not by run', () => {
    const runs = [run({ tasks: [practiceTask({ xp: 30, sessions: 2 })] }), run({ tasks: [practiceTask({ xp: 45, sessions: 3 })] })];
    // 75 XP over 5 sessions — a per-run mean would wrongly say 37.5.
    assert.equal(averageXpPerSession(runs), 15);
  });

  it('rounds to one decimal', () => {
    const runs = [run({ tasks: [practiceTask({ xp: 100, sessions: 3 })] })];
    assert.equal(averageXpPerSession(runs), 33.3);
  });

  it('ignores dry runs, cancelled runs and failed practice tasks', () => {
    const runs = [
      run({ dryRun: true, tasks: [practiceTask({ xp: 999, sessions: 9 })] }),
      run({ error: 'Run cancelled.', tasks: [practiceTask({ xp: 999, sessions: 9 })] }),
      run({ tasks: [practiceTask({ xp: 999, sessions: 9 }, 'failed')] }),
      run({ tasks: [practiceTask({ xp: 30, sessions: 2 })] }),
    ];
    assert.equal(averageXpPerSession(runs), 15);
  });

  it('ignores runs with no practice task or no usable metrics', () => {
    const runs = [
      run({ tasks: [{ ...practiceTask({}), task: 'rewards' }] }),
      run({ tasks: [practiceTask({ xp: 0, sessions: 0 })] }),
      run({ tasks: [practiceTask({ xp: 20, sessions: 1 })] }),
    ];
    assert.equal(averageXpPerSession(runs), 20);
  });

  it('only samples the most recent runs', () => {
    const runs = [
      run({ tasks: [practiceTask({ xp: 20, sessions: 1 })] }),
      run({ tasks: [practiceTask({ xp: 40, sessions: 1 })] }),
    ];
    assert.equal(averageXpPerSession(runs, 1), 20);
    assert.equal(averageXpPerSession(runs, 2), 30);
  });
});

describe('sizePlan', () => {
  it('sizes down to what the remaining goal needs', () => {
    const result = sizePlan({ goal: 50, earned: 0, cap: 10, avgXpPerSession: 15 });

    assert.equal(result.sessions, 4);
    assert.equal(result.sized, true);
    assert.match(result.reason, /4 session/);
  });

  it('subtracts XP already earned today', () => {
    const result = sizePlan({ goal: 50, earned: 32, cap: 10, avgXpPerSession: 15 });

    assert.equal(result.sessions, 2); // ceil(18 / 15)
  });

  it('never exceeds the configured cap', () => {
    const result = sizePlan({ goal: 500, earned: 0, cap: 5, avgXpPerSession: 15 });

    assert.equal(result.sessions, 5);
    assert.equal(result.sized, false);
    assert.match(result.reason, /cap/);
  });

  it('always asks for at least one session when the goal is unmet', () => {
    assert.equal(sizePlan({ goal: 10, earned: 9, cap: 5, avgXpPerSession: 40 }).sessions, 1);
  });

  it('leaves the plan alone when the goal is already met', () => {
    const result = sizePlan({ goal: 50, earned: 50, cap: 5, avgXpPerSession: 15 });

    assert.equal(result.sessions, 5);
    assert.equal(result.sized, false);
    assert.match(result.reason, /already met/);
  });

  it('leaves the plan alone when there is no goal', () => {
    const result = sizePlan({ goal: 0, earned: 0, cap: 5, avgXpPerSession: 15 });

    assert.equal(result.sessions, 5);
    assert.equal(result.sized, false);
  });

  it('leaves practice off when the cap is zero', () => {
    assert.deepEqual(
      sizePlan({ goal: 50, earned: 0, cap: 0, avgXpPerSession: 15 }),
      { sessions: 0, sized: false, avgXpPerSession: 15, reason: 'Practice is off.' },
    );
  });

  it('falls back to a sane average when history is empty', () => {
    const result = sizePlan({ goal: 30, earned: 0, cap: 10, avgXpPerSession: null });

    assert.equal(result.avgXpPerSession, FALLBACK_XP_PER_SESSION);
    assert.equal(result.sessions, 2);
  });

  it('treats a zero or negative average as missing', () => {
    assert.equal(sizePlan({ goal: 30, earned: 0, cap: 10, avgXpPerSession: 0 }).sessions, 2);
  });

  it('floors a fractional cap instead of rounding up', () => {
    assert.equal(sizePlan({ goal: 500, earned: 0, cap: 3.9, avgXpPerSession: 15 }).sessions, 3);
  });
});
