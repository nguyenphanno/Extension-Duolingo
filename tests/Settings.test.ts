// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Settings.test.ts — tests for normaliseSettings and migrate.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseSettings, DEFAULT_SETTINGS } from '../src/Core/Storage/SettingsRepository.ts';
import { SCHEMA_VERSION } from '../src/Shared/Constants.ts';

describe('normaliseSettings', () => {
  it('returns defaults for an empty blob', () => {
    const result = normaliseSettings(null);
    assert.deepEqual(result, DEFAULT_SETTINGS);
  });

  it('clamps sessions to 0–30', () => {
    const result = normaliseSettings({ practice: { sessions: 999 } });
    assert.equal(result.practice.sessions, 30);
  });

  it('clamps negative values to the minimum', () => {
    const result = normaliseSettings({ practice: { sessions: -5 } });
    assert.equal(result.practice.sessions, 0);
  });

  it('clamps xpBudget to 0–2000', () => {
    const result = normaliseSettings({ practice: { xpBudget: 5000 } });
    assert.equal(result.practice.xpBudget, 2000);
  });

  it('clamps dailyXpGoal to 10–500', () => {
    const result = normaliseSettings({ practice: { dailyXpGoal: 1 } });
    assert.equal(result.practice.dailyXpGoal, 10);
  });

  it('dedupes and sorts weekdays', () => {
    const result = normaliseSettings({ schedule: { days: [3, 1, 1, 6, 2] } });
    assert.deepEqual(result.schedule.days, [1, 2, 3, 6]);
  });

  it('falls back to every day for a missing days array', () => {
    const result = normaliseSettings({ schedule: {} });
    assert.deepEqual(result.schedule.days, [0, 1, 2, 3, 4, 5, 6]);
  });

  it('preserves an explicitly empty days list as "never"', () => {
    const result = normaliseSettings({ schedule: { days: [] } });
    assert.deepEqual(result.schedule.days, []);
  });

  it('always sets the current schemaVersion', () => {
    const result = normaliseSettings({ schemaVersion: 1 });
    assert.equal(result.schemaVersion, SCHEMA_VERSION);
  });

  it('snaps guard minute to 0 or 30', () => {
    const result = normaliseSettings({ schedule: { guard: { minute: 15 } } });
    assert.equal(result.schedule.guard.minute, 0);
    const result2 = normaliseSettings({ schedule: { guard: { minute: 45 } } });
    assert.equal(result2.schedule.guard.minute, 30);
  });

  it('clamps interval to 15–1440', () => {
    const result = normaliseSettings({ schedule: { intervalMinutes: 5 } });
    assert.equal(result.schedule.intervalMinutes, 15);
  });
});
