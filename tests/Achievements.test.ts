// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Achievements.test.ts — tests for the achievement specs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeAchievements, achievementSummary } from '../src/Shared/Utils/Achievements.ts';
import type { HistoryStats, Profile, Settings } from '../src/Shared/Types.ts';

const BASE_PROFILE: Profile = {
  userId: '1',
  username: 'test',
  displayName: 'Test',
  streak: 5,
  totalXp: 500,
  gems: 100,
  hearts: 5,
  maxHearts: 5,
  fromLanguage: 'en',
  learningLanguage: 'vi',
  streakFreezes: 2,
  hasPlus: false,
  league: null,
  avatarUrl: null,
  fetchedAt: 0,
};

const BASE_STATS: HistoryStats = {
  runs: 10,
  xp: 500,
  gems: 50,
  rewards: 20,
  successRate: 90,
  currentStreakOfRuns: 3,
  lastRunAt: Date.now(),
  daily: [{ day: '2026-01-01', xp: 50, runs: 1 }],
};

const BASE_SETTINGS: Settings = {
  schemaVersion: 2,
  tokenSource: 'cookie',
  manualToken: '',
  practice: { enabled: true, sessions: 5, minDurationSec: 35, maxDurationSec: 60, delayMinMs: 2000, delayMaxMs: 3500, stopOnError: false, heartsLeft: 5, dailyXpGoal: 50, xpBudget: 0, stopAtDailyGoal: false },
  rewards: { enabled: true, maxClaims: 35 },
  badges: { enabled: true, request: false, timezone: 'UTC', years: [2026], maxRequestsPerRun: 1 },
  freeze: { enabled: true, targetCount: 2 },
  super: { enabled: false },
  boost: { enabled: false },
  pro: { enabled: false, acknowledgeRisk: false },
  schedule: { enabled: false, intervalMinutes: 240, quietHours: { enabled: false, startHour: 23, endHour: 6 }, runOnStartup: false, days: [0,1,2,3,4,5,6], guard: { enabled: false, hour: 20, minute: 30 } },
  behavior: { dryRun: false, notifications: true, badgeText: true, openSidePanelOnRun: false, keepServiceWorkerAlive: true, cooldownSeconds: 45 },
  ui: { theme: 'system', locale: 'en', reduceMotion: false },
};

describe('computeAchievements', () => {
  it('returns a non-empty list', () => {
    const list = computeAchievements({ stats: BASE_STATS, profile: BASE_PROFILE, settings: BASE_SETTINGS });
    assert.ok(list.length > 0);
  });

  it('each achievement has an id, labelKey, hintKey and a boolean unlocked', () => {
    const list = computeAchievements({ stats: BASE_STATS, profile: BASE_PROFILE, settings: BASE_SETTINGS });
    for (const item of list) {
      assert.ok(item.id);
      assert.ok(item.labelKey);
      assert.ok(item.hintKey);
      assert.equal(typeof item.unlocked, 'boolean');
    }
  });
});

describe('achievementSummary', () => {
  it('counts unlocked vs total', () => {
    const list = computeAchievements({ stats: BASE_STATS, profile: BASE_PROFILE, settings: BASE_SETTINGS });
    const summary = achievementSummary(list);
    assert.equal(summary.total, list.length);
    assert.ok(summary.unlocked >= 0);
    assert.ok(summary.unlocked <= summary.total);
    assert.ok(summary.ratio >= 0 && summary.ratio <= 1);
  });
});
