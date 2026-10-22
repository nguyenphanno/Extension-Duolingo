// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Forecast.test.ts — tests for the streak-safety model.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { forecastStreak, forecastFromProfile } from '../src/Shared/Utils/Forecast.ts';

describe('forecastStreak', () => {
  it('returns a red tone when streak > 0, 0 freezes, and 0 XP today', () => {
    const result = forecastStreak({
      streak: 5,
      freezes: 0,
      todayXp: 0,
      dailyXpGoal: 50,
    });
    assert.equal(result.tone, 'red');
    assert.equal(result.slack, 0);
    assert.equal(result.todaySatisfied, false);
    assert.equal(result.headline.key, 'forecast.titleNone');
  });

  it('returns green when freezes cover the whole horizon', () => {
    const result = forecastStreak({
      streak: 10,
      freezes: 7,
      todayXp: 0,
      dailyXpGoal: 50,
      horizon: 7,
    });
    assert.equal(result.tone, 'green');
    assert.equal(result.slack, 7);
    assert.equal(result.headline.key, 'forecast.titleCovered');
  });

  it('counts today as safe once XP is earned', () => {
    const result = forecastStreak({
      streak: 3,
      freezes: 0,
      todayXp: 10,
      dailyXpGoal: 50,
    });
    assert.equal(result.todaySatisfied, true);
    assert.equal(result.slack, 1);
    assert.equal(result.tone, 'gold');
  });

  it('uses gold tone for a 0-streak profile', () => {
    const result = forecastStreak({
      streak: 0,
      freezes: 2,
      todayXp: 0,
      dailyXpGoal: 50,
    });
    assert.equal(result.tone, 'gold');
    assert.equal(result.headline.key, 'forecast.titleNoStreak');
  });

  it('slack = freezes + (todaySatisfied ? 1 : 0)', () => {
    for (const [xp, expected] of [[0, 2], [10, 3], [50, 3]] as const) {
      const result = forecastStreak({
        streak: 5,
        freezes: 2,
        todayXp: xp,
        dailyXpGoal: 50,
      });
      assert.equal(result.slack, expected);
    }
  });

  it('marks the first day as risk when today is unsatisfied', () => {
    const result = forecastStreak({
      streak: 1,
      freezes: 1,
      todayXp: 0,
      dailyXpGoal: 30,
    });
    assert.equal(result.days[0].status, 'risk');
    assert.equal(result.days[1].status, 'covered');
    assert.equal(result.days[2].status, 'risk');
  });
});

describe('forecastFromProfile', () => {
  it('handles a null profile', () => {
    const result = forecastFromProfile(null, 0, 50);
    assert.equal(result.tone, 'gold');
    assert.equal(result.slack, 0);
  });

  it('reads streak and freezes from the profile', () => {
    const result = forecastFromProfile(
      { streak: 7, streakFreezes: 2, userId: '1', username: 'test', displayName: 'Test', totalXp: 100, gems: 0, hearts: 5, maxHearts: 5, fromLanguage: 'en', learningLanguage: 'vi', hasPlus: false, league: null, avatarUrl: null, fetchedAt: 0 } as never,
      0,
      50,
    );
    assert.equal(result.slack, 2);
    assert.equal(result.tone, 'gold');
  });
});
