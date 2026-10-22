// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Pause.test.ts — the vacation window.
 *
 * Calendar days are compared as strings, so the cases that matter are the
 * boundaries (inclusive on both ends) and the open-ended shapes, which are easy
 * to get wrong by treating an empty bound as "never".
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPausedOn } from '../src/Shared/Utils/Pause.ts';

const window = (from: string, to: string, enabled = true) => ({ enabled, from, to });

describe('isPausedOn', () => {
  it('is off when the toggle is off', () => {
    assert.equal(isPausedOn(window('2026-11-01', '2026-11-10', false), '2026-11-05'), false);
  });

  it('is off when both bounds are empty', () => {
    assert.equal(isPausedOn(window('', ''), '2026-11-05'), false);
  });

  it('covers both ends of the window', () => {
    const pause = window('2026-11-01', '2026-11-10');

    assert.equal(isPausedOn(pause, '2026-11-01'), true);
    assert.equal(isPausedOn(pause, '2026-11-10'), true);
    assert.equal(isPausedOn(pause, '2026-11-05'), true);
  });

  it('is off the day before and the day after', () => {
    const pause = window('2026-11-01', '2026-11-10');

    assert.equal(isPausedOn(pause, '2026-10-31'), false);
    assert.equal(isPausedOn(pause, '2026-11-11'), false);
  });

  it('treats a missing end as open-ended', () => {
    assert.equal(isPausedOn(window('2026-11-01', ''), '2030-01-01'), true);
    assert.equal(isPausedOn(window('2026-11-01', ''), '2026-10-31'), false);
  });

  it('treats a missing start as open-ended', () => {
    assert.equal(isPausedOn(window('', '2026-11-10'), '2020-01-01'), true);
    assert.equal(isPausedOn(window('', '2026-11-10'), '2026-11-11'), false);
  });

  it('handles a single-day window', () => {
    const pause = window('2026-11-05', '2026-11-05');

    assert.equal(isPausedOn(pause, '2026-11-05'), true);
    assert.equal(isPausedOn(pause, '2026-11-06'), false);
  });

  it('compares across a year boundary', () => {
    const pause = window('2026-12-28', '2027-01-03');

    assert.equal(isPausedOn(pause, '2026-12-31'), true);
    assert.equal(isPausedOn(pause, '2027-01-01'), true);
    assert.equal(isPausedOn(pause, '2027-01-04'), false);
  });
});
