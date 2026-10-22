/**
 * BoostTask.ts — requests a 15-minute double-XP boost via the PRO service.
 */
import type { TaskOutcome } from '@Shared/Types';
import { outcome, skip, type AutomationTask, type TaskContext } from '../Task';

const LABEL = 'Double XP boost';

export const boostTask: AutomationTask = {
  key: 'boost',
  label: LABEL,
  weight: 1,

  isEnabled: (settings) => settings.boost.enabled,

  async run(ctx: TaskContext): Promise<TaskOutcome> {
    const startedAt = Date.now();
    if (!ctx.settings.boost.enabled) return skip('boost', LABEL, 'Disabled in settings.', startedAt);
    if (!ctx.settings.pro.enabled || !ctx.settings.pro.acknowledgeRisk) {
      return skip('boost', LABEL, 'PRO service is off.', startedAt);
    }
    if (ctx.dryRun) return skip('boost', LABEL, 'Dry run — would request a boost.', startedAt);

    ctx.report(0.5, 'Requesting boost');
    const response = await ctx.pro.doubleXpBoost();
    const status = String(response.status ?? 'unknown');
    return outcome('boost', LABEL, status === 'error' ? 'failed' : 'done', `Response: ${status}`, {
      detail: response.notification?.body,
      startedAt,
    });
  },
};
