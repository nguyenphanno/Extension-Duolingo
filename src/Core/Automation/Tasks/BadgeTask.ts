/**
 * BadgeTask.ts — reports missing monthly badges and (optionally) asks the
 * third-party PRO service to grant one.
 */
import type { TaskOutcome } from '@Shared/Types';
import { outcome, skip, type AutomationTask, type TaskContext } from '../Task';

const LABEL = 'Monthly badges';

export const badgeTask: AutomationTask = {
  key: 'badge',
  label: LABEL,
  weight: 2,

  isEnabled: (settings) => settings.badges.enabled,

  async run(ctx: TaskContext): Promise<TaskOutcome> {
    const startedAt = Date.now();
    const { badges } = ctx.settings;
    if (!badges.enabled) return skip('badge', LABEL, 'Disabled in settings.', startedAt);

    ctx.report(0.2, 'Reading goals progress');
    const missing = await ctx.api.missingBadges(badges.timezone, badges.years);

    if (missing.length === 0) {
      return outcome('badge', LABEL, 'done', 'Every monthly badge is earned', { startedAt });
    }

    const list = missing
      .slice(0, 6)
      .map((entry) => `${String(entry.month).padStart(2, '0')}/${entry.year}`)
      .join(' · ');

    if (!badges.request || badges.maxRequestsPerRun === 0) {
      return outcome('badge', LABEL, 'done', `${missing.length} badge(s) missing`, {
        detail: `${list} — request disabled.`,
        metrics: { missing: missing.length },
        startedAt,
      });
    }

    if (!ctx.settings.pro.enabled || !ctx.settings.pro.acknowledgeRisk) {
      return outcome('badge', LABEL, 'skipped', `${missing.length} badge(s) missing`, {
        detail: 'PRO service is off — enable it and accept the risk to auto-request.',
        metrics: { missing: missing.length },
        startedAt,
      });
    }

    if (ctx.dryRun) {
      return skip('badge', LABEL, `Dry run — would request ${missing[0]?.month}/${missing[0]?.year}.`, startedAt);
    }

    let requested = 0;
    let granted = 0;
    const notes: string[] = [];

    for (const entry of missing.slice(0, badges.maxRequestsPerRun)) {
      ctx.signal.throwIfAborted();
      ctx.report(0.5, `Requesting ${entry.month}/${entry.year}`);
      try {
        const response = await ctx.pro.claimMonthlyBadge(entry.month, entry.year);
        requested += 1;
        const head = response.notification?.head ?? '';
        const body = response.notification?.body ?? '';
        if (response.status === 'success' || Number(response.percentage ?? 0) > 0) {
          granted += 1;
          notes.push(`${entry.month}/${entry.year} granted`);
        } else if (head.includes('Limit') || body.includes('resets back')) {
          notes.push(`Cooldown: ${body || head}`);
          break;
        } else {
          notes.push(`${entry.month}/${entry.year}: ${head || response.status || 'unknown response'}`);
        }
      } catch (error) {
        notes.push(`${entry.month}/${entry.year} failed: ${(error as Error).message}`);
      }
    }

    return outcome(
      'badge',
      LABEL,
      granted > 0 ? 'done' : 'failed',
      granted > 0 ? `${granted} badge(s) granted` : `Requested ${requested}, none granted`,
      { detail: notes.join(' · '), metrics: { missing: missing.length, requested, granted }, startedAt },
    );
  },
};
