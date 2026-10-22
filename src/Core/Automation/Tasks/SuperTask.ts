/**
 * SuperTask.ts — optional Super activation through the PRO service.
 * Off by default; requires the PRO risk acknowledgement.
 */
import type { TaskOutcome } from '@Shared/Types';
import { outcome, skip, type AutomationTask, type TaskContext } from '../Task';

const LABEL = 'Super activation';

export const superTask: AutomationTask = {
  key: 'super',
  label: LABEL,
  weight: 1,

  isEnabled: (settings) => settings.super.enabled,

  async run(ctx: TaskContext): Promise<TaskOutcome> {
    const startedAt = Date.now();
    if (!ctx.settings.super.enabled) return skip('super', LABEL, 'Disabled in settings.', startedAt);
    if (!ctx.settings.pro.enabled || !ctx.settings.pro.acknowledgeRisk) {
      return skip('super', LABEL, 'PRO service is off.', startedAt);
    }
    if (ctx.dryRun) return skip('super', LABEL, 'Dry run — would request Super.', startedAt);

    ctx.report(0.4, 'Requesting Super');
    const response = await ctx.pro.activateSuper();
    const status = String(response.status ?? 'unknown');
    return outcome('super', LABEL, status === 'error' ? 'failed' : 'done', `Response: ${status}`, {
      detail: response.notification?.body,
      startedAt,
    });
  },
};
