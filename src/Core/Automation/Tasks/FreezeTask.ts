// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * FreezeTask.ts — tops up streak freezes so a missed day cannot break a streak.
 * The shop returns 400 when inventory is already full, which we treat as success.
 */
import { AppError } from '@Shared/Result';
import type { TaskOutcome } from '@Shared/Types';
import { outcome, skip, type AutomationTask, type TaskContext } from '../Task';

const LABEL = 'Streak freeze';

export const freezeTask: AutomationTask = {
  key: 'freeze',
  label: LABEL,
  weight: 1,

  isEnabled: (settings) => settings.freeze.enabled,

  async run(ctx: TaskContext): Promise<TaskOutcome> {
    const startedAt = Date.now();
    const { freeze } = ctx.settings;
    if (!freeze.enabled) return skip('freeze', LABEL, 'Disabled in settings.', startedAt);
    if (ctx.profile.streakFreezes >= freeze.targetCount) {
      return outcome('freeze', LABEL, 'done', `Inventory full (${ctx.profile.streakFreezes}/${freeze.targetCount})`, {
        startedAt,
      });
    }
    if (ctx.dryRun) return skip('freeze', LABEL, 'Dry run — would buy a streak freeze.', startedAt);

    ctx.report(0.5, 'Buying streak freeze');
    try {
      await ctx.api.buyStreakFreeze();
      return outcome('freeze', LABEL, 'done', 'Streak freeze purchased', {
        metrics: { purchased: 1 },
        startedAt,
      });
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined;
      if (status === 400) {
        return outcome('freeze', LABEL, 'done', 'Inventory already full', { startedAt });
      }
      throw error;
    }
  },
};
