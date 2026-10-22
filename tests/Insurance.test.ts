// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Insurance.test.ts — the freeze policy, without a network call.
 *
 * The rule that matters: slack counts today once XP has landed, so a day that
 * is already done needs one freeze fewer. Topping up to a fixed inventory
 * count over-buys on exactly those days.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { insuranceVerdict } from '../src/Shared/Utils/Insurance.ts';

describe('insuranceVerdict', () => {
  it('buys nothing when the target is already covered', () => {
    const verdict = insuranceVerdict({ target: 2, freezes: 2, todaySatisfied: false, streak: 10 });

    assert.equal(verdict.needed, 0);
    assert.equal(verdict.slack, 2);
    assert.match(verdict.reason, /Covered/);
  });

  it('counts today as cover once XP has landed', () => {
    // One freeze plus today's XP is already the target of two.
    const verdict = insuranceVerdict({ target: 2, freezes: 1, todaySatisfied: true, streak: 10 });

    assert.equal(verdict.needed, 0);
    assert.equal(verdict.slack, 2);
  });

  it('buys the missing days on a day with no XP yet', () => {
    const verdict = insuranceVerdict({ target: 2, freezes: 0, todaySatisfied: false, streak: 10 });

    assert.equal(verdict.needed, 2);
    assert.equal(verdict.slack, 0);
    assert.match(verdict.reason, /buying 2 freeze/);
  });

  it('buys a single freeze when one day short', () => {
    const verdict = insuranceVerdict({ target: 2, freezes: 1, todaySatisfied: false, streak: 10 });

    assert.equal(verdict.needed, 1);
  });

  it('never asks for more than the target', () => {
    const verdict = insuranceVerdict({ target: 1, freezes: 0, todaySatisfied: false, streak: 3 });

    assert.equal(verdict.needed, 1);
  });

  it('does nothing without a streak', () => {
    const verdict = insuranceVerdict({ target: 2, freezes: 0, todaySatisfied: false, streak: 0 });

    assert.equal(verdict.needed, 0);
    assert.match(verdict.reason, /No streak/);
  });

  it('does nothing when the target is zero', () => {
    const verdict = insuranceVerdict({ target: 0, freezes: 0, todaySatisfied: false, streak: 12 });

    assert.equal(verdict.needed, 0);
    assert.match(verdict.reason, /target is 0/);
  });

  it('floors fractional and negative inputs instead of trusting them', () => {
    const verdict = insuranceVerdict({ target: 2.9, freezes: -3, todaySatisfied: false, streak: 5 });

    assert.equal(verdict.needed, 2);
    assert.equal(verdict.slack, 0);
  });
});
