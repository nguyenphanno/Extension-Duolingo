// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * FreezeTask.test.ts — the wiring between the policy and the shop.
 *
 * `Insurance.test.ts` covers the arithmetic; this covers the part that could
 * still be wrong: which policy runs, how many purchases that becomes, and what
 * a 400 from the shop means. The API is a stub, so no network is involved.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { freezeTask } from '../src/Core/Automation/Tasks/FreezeTask.ts';
import type { TaskContext } from '../src/Core/Automation/Task.ts';
import { DEFAULT_SETTINGS } from '../src/Core/Storage/SettingsRepository.ts';
import { AppError } from '../src/Shared/Result.ts';
import type { Profile } from '../src/Shared/Types.ts';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    userId: '42',
    username: 'ada',
    displayName: 'Ada',
    streak: 40,
    totalXp: 1000,
    gems: 500,
    hearts: 5,
    maxHearts: 5,
    fromLanguage: 'en',
    learningLanguage: 'es',
    streakFreezes: 0,
    hasPlus: false,
    league: null,
    avatarUrl: null,
    fetchedAt: 0,
    ...overrides,
  };
}

interface Harness {
  ctx: TaskContext;
  purchases: number[];
}

function harness(options: {
  freeze?: Partial<{ enabled: boolean; targetCount: number; autoInsure: boolean }>;
  profile?: Partial<Profile>;
  todayXp?: number;
  dryRun?: boolean;
  buy?: () => Promise<{ status: number }>;
}): Harness {
  const purchases: number[] = [];
  const ctx = {
    api: {
      buyStreakFreeze: async () => {
        purchases.push(purchases.length + 1);
        return options.buy ? options.buy() : { status: 200 };
      },
    },
    pro: {},
    settings: {
      ...structuredClone(DEFAULT_SETTINGS),
      freeze: { enabled: true, targetCount: 2, autoInsure: false, ...options.freeze },
    },
    profile: profile(options.profile),
    dryRun: options.dryRun ?? false,
    todayXp: options.todayXp ?? 0,
    signal: new AbortController().signal,
    log: { info() {}, warn() {}, success() {}, error() {}, debug() {} },
    wait: async () => {},
    report: () => {},
  } as unknown as TaskContext;

  return { ctx, purchases };
}

describe('freezeTask — top-up policy', () => {
  it('buys one freeze when inventory is below target', async () => {
    const { ctx, purchases } = harness({ profile: { streakFreezes: 0 } });
    const result = await freezeTask.run(ctx);

    assert.equal(purchases.length, 1);
    assert.equal(result.metrics.purchased, 1);
  });

  it('reports a full inventory without calling the shop', async () => {
    const { ctx, purchases } = harness({ profile: { streakFreezes: 2 } });
    const result = await freezeTask.run(ctx);

    assert.equal(purchases.length, 0);
    assert.match(result.headline, /Inventory full/);
  });
});

describe('freezeTask — insurance policy', () => {
  it('buys every missing day when there is no cover at all', async () => {
    const { ctx, purchases } = harness({
      freeze: { autoInsure: true, targetCount: 2 },
      profile: { streakFreezes: 0 },
      todayXp: 0,
    });
    const result = await freezeTask.run(ctx);

    assert.equal(purchases.length, 2);
    assert.equal(result.metrics.purchased, 2);
    assert.match(result.headline, /2 streak freeze/);
  });

  it('buys nothing when today\'s XP already counts as one day of cover', async () => {
    const { ctx, purchases } = harness({
      freeze: { autoInsure: true, targetCount: 2 },
      profile: { streakFreezes: 1 },
      todayXp: 30,
    });
    const result = await freezeTask.run(ctx);

    assert.equal(purchases.length, 0);
    assert.match(result.headline, /Covered/);
  });

  it('runs even when the plain top-up is switched off', async () => {
    const { ctx, purchases } = harness({
      freeze: { enabled: false, autoInsure: true, targetCount: 1 },
      profile: { streakFreezes: 0 },
    });
    const result = await freezeTask.run(ctx);

    assert.equal(purchases.length, 1);
    assert.equal(result.status, 'done');
  });

  it('does nothing without a streak to protect', async () => {
    const { ctx, purchases } = harness({
      freeze: { autoInsure: true },
      profile: { streak: 0, streakFreezes: 0 },
    });
    await freezeTask.run(ctx);

    assert.equal(purchases.length, 0);
  });

  it('changes nothing on a dry run', async () => {
    const { ctx, purchases } = harness({ freeze: { autoInsure: true }, dryRun: true });
    const result = await freezeTask.run(ctx);

    assert.equal(purchases.length, 0);
    assert.equal(result.status, 'skipped');
    assert.match(result.headline, /Dry run/);
  });

  it('treats a 400 as "already full" and stops buying', async () => {
    const { ctx, purchases } = harness({
      freeze: { autoInsure: true, targetCount: 2 },
      profile: { streakFreezes: 0 },
      buy: async () => {
        throw new AppError('HTTP', 'HTTP 400', { status: 400 });
      },
    });
    const result = await freezeTask.run(ctx);

    assert.equal(purchases.length, 1);
    assert.equal(result.status, 'done');
    assert.match(result.headline, /already full/);
  });

  it('fails the task when the first purchase errors for another reason', async () => {
    const { ctx } = harness({
      freeze: { autoInsure: true, targetCount: 2 },
      profile: { streakFreezes: 0 },
      buy: async () => {
        throw new AppError('NETWORK', 'Network unreachable.', { retryable: true });
      },
    });

    await assert.rejects(freezeTask.run(ctx), /Network unreachable/);
  });
});
