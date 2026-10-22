// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * TaskRegistry.test.ts — tests for planFor.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planFor, totalWeight, ALL_TASKS } from '../src/Core/Automation/TaskRegistry.ts';
import { DEFAULT_SETTINGS } from '../src/Core/Storage/SettingsRepository.ts';

describe('planFor', () => {
  it('returns enabled tasks when no only filter is given', () => {
    const plan = planFor(DEFAULT_SETTINGS);
    const keys = plan.map((t) => t.key);
    // practice, rewards, badge, freeze are enabled by default
    assert.ok(keys.includes('practice'));
    assert.ok(keys.includes('rewards'));
    assert.ok(keys.includes('badge'));
    assert.ok(keys.includes('freeze'));
    // super and boost are off by default
    assert.ok(!keys.includes('super'));
    assert.ok(!keys.includes('boost'));
  });

  it('returns only the requested tasks when only is given', () => {
    const plan = planFor(DEFAULT_SETTINGS, ['practice']);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].key, 'practice');
  });

  it('ignores isEnabled for a narrowed plan', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.practice.enabled = false;
    settings.rewards.enabled = false;
    const plan = planFor(settings, ['practice']);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].key, 'practice');
  });

  it('returns an empty array when nothing is enabled and no only filter', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.practice.enabled = false;
    settings.rewards.enabled = false;
    settings.badges.enabled = false;
    settings.freeze.enabled = false;
    settings.super.enabled = false;
    settings.boost.enabled = false;
    const plan = planFor(settings);
    assert.equal(plan.length, 0);
  });
});

describe('totalWeight', () => {
  it('returns the sum of task weights', () => {
    const w = totalWeight(ALL_TASKS);
    assert.ok(w > 0);
  });

  it('returns 1 for an empty plan to avoid division by zero', () => {
    assert.equal(totalWeight([]), 1);
  });
});
