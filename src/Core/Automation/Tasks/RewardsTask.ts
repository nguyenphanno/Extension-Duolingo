// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * RewardsTask.ts — sweeps unclaimed reward bundles (quests, chests, monthly
 * challenges, tournament prizes) and marks them consumed.
 */
import type { TaskOutcome } from '@Shared/Types';
import { outcome, skip, type AutomationTask, type TaskContext } from '../Task';

const LABEL = 'Reward sweep';

export const rewardsTask: AutomationTask = {
  key: 'rewards',
  label: LABEL,
  weight: 2,

  isEnabled: (settings) => settings.rewards.enabled,

  async run(ctx: TaskContext): Promise<TaskOutcome> {
    const startedAt = Date.now();
    if (!ctx.settings.rewards.enabled) return skip('rewards', LABEL, 'Disabled in settings.', startedAt);
    if (ctx.dryRun) return skip('rewards', LABEL, 'Dry run — would claim pending bundles.', startedAt);

    ctx.report(0.2, 'Scanning reward bundles');
    const result = await ctx.api.claimRewards(ctx.settings.rewards.maxClaims);
    ctx.report(1, 'Rewards claimed');

    if (result.claimedCount === 0) {
      return outcome('rewards', LABEL, 'done', 'Nothing to claim', { startedAt });
    }

    const breakdown = result.details
      .slice(0, 4)
      .map((detail) => `${detail.type} (+${detail.gems})`)
      .join(' · ');

    return outcome('rewards', LABEL, 'done', `${result.claimedCount} claimed · +${result.gems} gems`, {
      detail: breakdown || undefined,
      metrics: { claimed: result.claimedCount, gems: result.gems },
      startedAt,
    });
  },
};
