// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * FreezeTask.ts — tops up streak freezes so a missed day cannot break a streak.
 * The shop returns 400 when inventory is already full, which we treat as success.
 *
 * Two policies share the task:
 *   - top-up (default) — buy one per run until inventory reaches `targetCount`,
 *   - insurance — buy only the cover the forecast says is missing, which counts
 *     today once XP has landed, so a good day needs one freeze fewer.
 * Insurance can be on while top-up is off; they are separate decisions that
 * happen to buy the same thing.
 */
import { AppError } from '@Shared/Result';
import type { TaskOutcome } from '@Shared/Types';
import { insuranceVerdict } from '@Shared/Utils/Insurance';
import { outcome, skip, type AutomationTask, type TaskContext } from '../Task';

const LABEL = 'Streak freeze';

/** Never spend more than this in one run, even if the forecast asks for more. */
const MAX_PURCHASES = 2;

export const freezeTask: AutomationTask = {
  key: 'freeze',
  label: LABEL,
  weight: 1,

  isEnabled: (settings) => settings.freeze.enabled || settings.freeze.autoInsure,

  async run(ctx: TaskContext): Promise<TaskOutcome> {
    const startedAt = Date.now();
    const { freeze } = ctx.settings;
    if (!freeze.enabled && !freeze.autoInsure) return skip('freeze', LABEL, 'Disabled in settings.', startedAt);

    let planned = 0;
    let reason = '';

    if (freeze.autoInsure) {
      const verdict = insuranceVerdict({
        target: freeze.targetCount,
        freezes: ctx.profile.streakFreezes,
        todaySatisfied: ctx.todayXp > 0,
        streak: ctx.profile.streak,
      });
      if (verdict.needed === 0) {
        return outcome('freeze', LABEL, 'done', verdict.reason, { startedAt });
      }
      planned = Math.min(MAX_PURCHASES, verdict.needed);
      reason = verdict.reason;
      ctx.log.info(reason);
    } else {
      if (ctx.profile.streakFreezes >= freeze.targetCount) {
        return outcome('freeze', LABEL, 'done', `Inventory full (${ctx.profile.streakFreezes}/${freeze.targetCount})`, {
          startedAt,
        });
      }
      planned = 1;
    }

    if (ctx.dryRun) {
      return skip('freeze', LABEL, `Dry run — would buy ${planned} streak freeze(s).`, startedAt);
    }

    let purchased = 0;
    for (let index = 1; index <= planned; index += 1) {
      ctx.signal.throwIfAborted();
      ctx.report((index - 0.5) / planned, `Buying streak freeze ${index}/${planned}`);
      try {
        await ctx.api.buyStreakFreeze();
        purchased += 1;
      } catch (error) {
        const status = error instanceof AppError ? error.status : undefined;
        // 400 means the inventory is already full — the goal is met, not failed.
        if (status === 400) break;
        // Nothing landed: let the task fail so the run reports it properly.
        if (purchased === 0) throw error;
        ctx.log.warn(`Freeze ${index} failed after ${purchased} purchase(s): ${(error as Error).message}`);
        break;
      }
    }

    return outcome(
      'freeze',
      LABEL,
      'done',
      purchased > 0 ? `${purchased} streak freeze(s) purchased` : 'Inventory already full',
      { detail: reason || undefined, metrics: { purchased }, startedAt },
    );
  },
};
