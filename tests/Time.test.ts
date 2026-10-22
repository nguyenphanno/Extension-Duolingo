// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Time.test.ts — tests for time utilities.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, formatDuration, isWithinQuietHours, hoursUntilQuietEnd } from '../src/Shared/Utils/Time.ts';

describe('dayKey', () => {
  it('formats a date as YYYY-MM-DD', () => {
    const ts = new Date(2026, 0, 5).getTime();
    assert.equal(dayKey(ts), '2026-01-05');
  });

  it('pads single-digit months and days', () => {
    const ts = new Date(2026, 2, 1).getTime();
    assert.equal(dayKey(ts), '2026-03-01');
  });
});

describe('formatDuration', () => {
  it('formats sub-second durations in ms', () => {
    assert.equal(formatDuration(500), '500ms');
  });

  it('formats seconds-only', () => {
    assert.equal(formatDuration(30_000), '30s');
  });

  it('formats minutes and seconds', () => {
    assert.equal(formatDuration(125_000), '2m 05s');
  });
});

describe('isWithinQuietHours', () => {
  it('returns false when start === end', () => {
    assert.equal(isWithinQuietHours(12, 12, 12), false);
  });

  it('handles a same-day window (9–17)', () => {
    assert.equal(isWithinQuietHours(10, 9, 17), true);
    assert.equal(isWithinQuietHours(8, 9, 17), false);
    assert.equal(isWithinQuietHours(17, 9, 17), false);
  });

  it('handles a wrap-past-midnight window (22–6)', () => {
    assert.equal(isWithinQuietHours(23, 22, 6), true);
    assert.equal(isWithinQuietHours(2, 22, 6), true);
    assert.equal(isWithinQuietHours(7, 22, 6), false);
    assert.equal(isWithinQuietHours(21, 22, 6), false);
  });
});

describe('hoursUntilQuietEnd', () => {
  it('returns the positive delta when hour < end', () => {
    assert.equal(hoursUntilQuietEnd(2, 6), 4);
  });

  it('wraps past midnight when hour >= end', () => {
    assert.equal(hoursUntilQuietEnd(23, 6), 7);
  });

  it('returns 24 when hour === end', () => {
    assert.equal(hoursUntilQuietEnd(6, 6), 24);
  });
});
