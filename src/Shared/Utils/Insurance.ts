// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Insurance.ts — how much cover does this streak actually need?
 *
 * `Forecast` already answers "how many missed days can I absorb". `FreezeTask`
 * already knows how to buy cover. This file is the policy that joins them, and
 * it exists as its own unit so the rule can be tested without a network call.
 *
 * The one subtlety: slack counts *today* once XP has landed, so a day that is
 * already done needs one fewer freeze than a day that is not. Topping up to a
 * fixed inventory count therefore over-buys on good days.
 */
export interface InsuranceInput {
  /** How many days of cover the user wants to keep. */
  target: number;
  /** Freezes currently in inventory. */
  freezes: number;
  /** True once any XP has landed today. */
  todaySatisfied: boolean;
  /** Streak length — nothing to protect at 0. */
  streak: number;
}

export interface InsuranceVerdict {
  /** Freezes worth buying right now. */
  needed: number;
  /** Days the inventory can currently absorb, today included. */
  slack: number;
  /** Log-ready explanation. */
  reason: string;
}

export function insuranceVerdict(input: InsuranceInput): InsuranceVerdict {
  const target = Math.max(0, Math.floor(input.target));
  const freezes = Math.max(0, Math.floor(input.freezes));
  const slack = freezes + (input.todaySatisfied ? 1 : 0);

  if (input.streak <= 0) {
    return { needed: 0, slack, reason: 'No streak to protect yet.' };
  }
  if (target === 0) {
    return { needed: 0, slack, reason: 'Cover target is 0 — insurance is off.' };
  }

  const needed = Math.min(target, Math.max(0, target - slack));
  if (needed === 0) {
    return { needed, slack, reason: `Covered — ${slack} day(s) of slack against a target of ${target}.` };
  }

  return {
    needed,
    slack,
    reason: `${slack} day(s) of slack against a target of ${target} — buying ${needed} freeze(s).`,
  };
}
