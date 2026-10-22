// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * DuolingoApi.test.ts — response normalisation and the reward sweep.
 *
 * These are the parts that break when Duolingo changes a payload shape, so the
 * tests pin the mapping (raw → domain) and the guard rails around the sweep:
 * claim caps, consumed rewards, and one failure not aborting the rest.
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HttpClient } from '../src/Core/Http/HttpClient.ts';
import { DuolingoApi, normaliseProfile } from '../src/Core/Http/DuolingoApi.ts';
import { endpoints } from '../src/Core/Http/Endpoints.ts';
import type { DuoProfileResponse } from '../src/Shared/Types.ts';

const realFetch = globalThis.fetch;
let calls: Array<{ url: string; init: RequestInit }> = [];

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function mockFetch(handler: Handler): void {
  calls = [];
  globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(handler(String(input), init));
  }) as typeof fetch;
}

function api(handler: Handler, userId = '42'): DuolingoApi {
  mockFetch(handler);
  const http = new HttpClient({ Authorization: 'Bearer test' }, { timeoutMs: 2000, retries: 0, minMutationGapMs: 0 });
  return new DuolingoApi(http, userId);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const bodyOf = (call: { init: RequestInit }) => JSON.parse(String(call.init.body));

afterEach(() => {
  globalThis.fetch = realFetch;
  calls = [];
});

describe('normaliseProfile', () => {
  it('maps a full payload onto the domain model', () => {
    const raw: DuoProfileResponse = {
      id: 99,
      username: 'ada',
      name: 'Ada Lovelace',
      streakData: { currentStreak: 41, freezeCount: 2 },
      totalXp: 12345,
      gems: 300,
      hearts: 4,
      maxHearts: 5,
      fromLanguage: 'en',
      learningLanguage: 'fr',
      hasPlus: true,
      picture: 'https://cdn.example/a.png',
      rewardBundles: [{ rewardBundleType: 'CHEST', rewards: [] }],
    };

    const profile = normaliseProfile(raw, '42');

    assert.equal(profile.userId, '99');
    assert.equal(profile.username, 'ada');
    assert.equal(profile.displayName, 'Ada Lovelace');
    assert.equal(profile.streak, 41);
    assert.equal(profile.streakFreezes, 2);
    assert.equal(profile.totalXp, 12345);
    assert.equal(profile.gems, 300);
    assert.equal(profile.learningLanguage, 'fr');
    assert.equal(profile.avatarUrl, 'https://cdn.example/a.png');
    assert.equal(profile.rawBundles?.length, 1);
  });

  it('falls back to sensible defaults for an empty payload', () => {
    const profile = normaliseProfile({}, '42');

    assert.equal(profile.userId, '42');
    assert.equal(profile.username, 'learner');
    assert.equal(profile.displayName, 'learner');
    assert.equal(profile.streak, 0);
    assert.equal(profile.streakFreezes, 0);
    assert.equal(profile.hearts, 5);
    assert.equal(profile.maxHearts, 5);
    assert.equal(profile.hasPlus, false);
    assert.equal(profile.avatarUrl, null);
    assert.deepEqual(profile.rawBundles, []);
  });

  it('prefers name over displayName and username', () => {
    assert.equal(normaliseProfile({ name: 'A', displayName: 'B', username: 'C' }, '1').displayName, 'A');
    assert.equal(normaliseProfile({ displayName: 'B', username: 'C' }, '1').displayName, 'B');
  });

  it('reads the legacy streak shape and the streakFreezeCount alias', () => {
    const profile = normaliseProfile({ streak: 7, streakData: { streakFreezeCount: 1 } }, '1');

    assert.equal(profile.streak, 7);
    assert.equal(profile.streakFreezes, 1);
  });

  it('falls back from gems to lingots and from picture to avatar', () => {
    const profile = normaliseProfile({ lingots: 55, avatar: 'https://cdn.example/b.png' }, '1');

    assert.equal(profile.gems, 55);
    assert.equal(profile.avatarUrl, 'https://cdn.example/b.png');
  });
});

describe('endpoints', () => {
  it('encodes ids and asks for the profile fields', () => {
    const url = endpoints.profile('a/b');

    assert.ok(url.includes('/users/a%2Fb?fields='));
    assert.ok(url.includes('streakData'));
    assert.ok(url.includes('rewardBundles'));
  });

  it('encodes the timezone on the goals endpoint', () => {
    assert.ok(endpoints.goalsProgress('42', 'Asia/Saigon').includes('timezone=Asia%2FSaigon'));
  });
});

describe('getProfile', () => {
  it('hits the profile endpoint with the client userId', async () => {
    const duo = api(() => json({ username: 'ada' }));
    const profile = await duo.getProfile();

    assert.equal(profile.username, 'ada');
    assert.ok(calls[0].url.includes('/users/42'));
  });
});

describe('startPractice', () => {
  it('posts a GLOBAL_PRACTICE session for the language pair', async () => {
    const duo = api(() => json({ id: 'session-1' }));
    const session = await duo.startPractice('en', 'es');

    assert.equal(session.id, 'session-1');
    assert.ok(calls[0].url.endsWith('/sessions'));
    assert.equal(calls[0].init.method, 'POST');
    const body = bodyOf(calls[0]);
    assert.equal(body.type, 'GLOBAL_PRACTICE');
    assert.equal(body.fromLanguage, 'en');
    assert.equal(body.learningLanguage, 'es');
    assert.ok(Array.isArray(body.challengeTypes) && body.challengeTypes.length > 0);
  });
});

describe('completePractice', () => {
  it('back-dates startTime by the session duration', async () => {
    const duo = api(() => json({ xpGain: 20 }));
    const before = Math.floor(Date.now() / 1000);

    const result = await duo.completePractice({ id: 'session-1' }, { durationSec: 45, heartsLeft: 3 });

    const body = bodyOf(calls[0]);
    assert.equal(result.xpGain, 20);
    assert.equal(body.heartsLeft, 3);
    assert.equal(body.failed, false);
    assert.ok(body.endTime >= before);
    assert.equal(body.endTime - body.startTime, 45);
    assert.ok(body.maxInLessonStreak >= 12 && body.maxInLessonStreak <= 18);
  });

  it('never reports a session shorter than 20 seconds', async () => {
    const duo = api(() => json({ xpGain: 15 }));
    await duo.completePractice({ id: 'session-1' }, { durationSec: 3, heartsLeft: 5 });

    const body = bodyOf(calls[0]);
    assert.equal(body.endTime - body.startTime, 20);
  });

  it('rejects a payload without a session id', async () => {
    const duo = api(() => json({}));
    await assert.rejects(duo.completePractice({}, { durationSec: 30, heartsLeft: 5 }), /no id/);
    assert.equal(calls.length, 0);
  });

  it('reads totalXpGain when xpGain is absent', async () => {
    const duo = api(() => json({ totalXpGain: 25 }));
    const result = await duo.completePractice({ id: 's' }, { durationSec: 30, heartsLeft: 5 });

    assert.equal(result.xpGain, 25);
  });

  it('falls back to 15 when the server sends an unusable value', async () => {
    const duo = api(() => json({ xpGain: 'lots' }));
    const result = await duo.completePractice({ id: 's' }, { durationSec: 30, heartsLeft: 5 });

    assert.equal(result.xpGain, 15);
  });
});

describe('claimRewards', () => {
  const profileWithBundles = () =>
    json({
      rewardBundles: [
        {
          rewardBundleType: 'DAILY_QUEST',
          rewards: [
            { id: 'r1', amount: 10 },
            { id: 'r2', consumed: true },
            { id: 'r3', items: [{ itemType: 'GEM', amount: 5 }, { itemType: 'FREEZE', amount: 1 }] },
          ],
        },
        { rewardBundleType: 'CHEST', rewards: [{ id: 'r4' }] },
      ],
    });

  it('claims unclaimed rewards, sums gems and reports leftovers', async () => {
    const duo = api((url, init) => (init.method === 'PATCH' ? json({}) : profileWithBundles()));

    const outcome = await duo.claimRewards(2);

    assert.equal(outcome.claimedCount, 2);
    assert.equal(outcome.gems, 15);
    assert.equal(outcome.remaining, true);
    assert.deepEqual(outcome.details[0], { type: 'DAILY_QUEST', rewardId: 'r1', gems: 10 });
    // profile + one PATCH per claimed reward
    assert.equal(calls.length, 3);
    assert.ok(calls[1].url.endsWith('/users/42/rewards/r1'));
  });

  it('skips consumed rewards and rewards without an id', async () => {
    const duo = api((url, init) =>
      init.method === 'PATCH' ? json({}) : json({
        rewardBundles: [
          { rewardBundleType: 'DAILY_QUEST', rewards: [{ id: 'r1' }, { id: 'r2', consumed: true }, { amount: 99 }] },
        ],
      }),
    );

    const outcome = await duo.claimRewards(5);

    // r2 is already consumed, the id-less reward is skipped, so exactly one PATCH.
    assert.equal(outcome.claimedCount, 1);
    assert.equal(calls.filter((call) => call.init.method === 'PATCH').length, 1);
    assert.ok(calls[1].url.endsWith('/rewards/r1'));
  });

  it('stops at the claim cap without touching the rest', async () => {
    const duo = api((url, init) => (init.method === 'PATCH' ? json({}) : profileWithBundles()));

    const outcome = await duo.claimRewards(1);

    assert.equal(outcome.claimedCount, 1);
    assert.equal(outcome.remaining, true);
    assert.equal(calls.filter((call) => call.init.method === 'PATCH').length, 1);
  });

  it('keeps sweeping when a single claim fails', async () => {
    const duo = api((url, init) => {
      if (init.method !== 'PATCH') return profileWithBundles();
      return url.endsWith('/r1') ? json({ error: 'nope' }, 500) : json({});
    });

    const outcome = await duo.claimRewards(5);

    assert.equal(outcome.claimedCount, 2);
    assert.equal(outcome.gems, 5);
    assert.equal(outcome.remaining, false);
    assert.deepEqual(
      outcome.details.map((detail) => detail.rewardId),
      ['r3', 'r4'],
    );
  });

  it('reports nothing claimed for an account with no bundles', async () => {
    const duo = api(() => json({}));
    const outcome = await duo.claimRewards(10);

    assert.deepEqual(outcome, { claimedCount: 0, gems: 0, details: [], remaining: false });
  });
});

describe('missingBadges', () => {
  it('treats either the challenge or the goal as earned', async () => {
    const duo = api(() =>
      json({ badges: { earned: ['2020_03_monthly_challenge', '2020_05_monthly_goal'] } }),
    );

    const missing = await duo.missingBadges('Asia/Saigon', [2020]);

    assert.equal(missing.length, 10);
    assert.ok(!missing.some((entry) => entry.month === 3 || entry.month === 5));
    assert.ok(missing.every((entry) => entry.year === 2020));
  });

  it('never reports months that have not finished yet', async () => {
    const duo = api(() => json({ badges: { earned: [] } }));
    const now = new Date();
    const currentYear = now.getFullYear();

    const missing = await duo.missingBadges('Asia/Saigon', [currentYear]);

    assert.equal(missing.length, Math.max(0, now.getMonth()));
    assert.ok(missing.every((entry) => entry.month < now.getMonth() + 1));
  });

  it('ignores future years entirely', async () => {
    const duo = api(() => json({ badges: { earned: [] } }));
    const missing = await duo.missingBadges('Asia/Saigon', [new Date().getFullYear() + 1]);

    assert.deepEqual(missing, []);
  });
});

describe('buyStreakFreeze', () => {
  it('posts the shop item and returns the status', async () => {
    const duo = api(() => json({}, 200));
    const result = await duo.buyStreakFreeze();

    assert.equal(result.status, 200);
    assert.ok(calls[0].url.endsWith('/users/42/shop-items'));
    assert.equal(bodyOf(calls[0]).itemId, 'streak_freeze');
  });

  it('surfaces a 400 as an error the caller can interpret', async () => {
    const duo = api(() => json({}, 400));

    await assert.rejects(duo.buyStreakFreeze(), (error: Error & { status?: number }) => {
      assert.equal(error.status, 400);
      return true;
    });
  });
});
