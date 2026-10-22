/**
 * NotificationService.ts — desktop notifications and the toolbar badge.
 * Both are best-effort: a browser without the API must not break a run.
 */
import type { RunState, RunSummary, Settings } from '@Shared/Types';
import { formatDuration } from '@Shared/Utils/Time';

const ICON = 'icons/icon128.png';

export class NotificationService {
  async runFinished(summary: RunSummary, settings: Settings): Promise<void> {
    if (!settings.behavior.notifications) return;
    if (typeof chrome === 'undefined' || !chrome.notifications) return;

    const failed = summary.tasks.filter((task) => task.status === 'failed').length;
    const title = summary.error
      ? 'Duo Assist — run cancelled'
      : failed > 0
        ? `Duo Assist — finished with ${failed} issue(s)`
        : 'Duo Assist — run complete';

    const parts = [
      `+${summary.xpGained} XP`,
      `${summary.rewardsClaimed} reward(s)`,
      `+${summary.gemsClaimed} gems`,
      formatDuration(summary.finishedAt - summary.startedAt),
    ];

    try {
      await chrome.notifications.create(`duo.run.${summary.id}`, {
        type: 'basic',
        iconUrl: ICON,
        title,
        message: parts.join(' · '),
        priority: 0,
        silent: true,
      });
    } catch {
      /* notifications can be blocked by the OS */
    }
  }

  async updateBadge(run: RunState, settings: Settings, streak: number | null): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.action) return;
    if (!settings.behavior.badgeText) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }

    if (run.phase === 'running' || run.phase === 'preparing' || run.phase === 'finishing') {
      await chrome.action.setBadgeBackgroundColor({ color: '#1CB0F6' });
      await chrome.action.setBadgeText({ text: '···' });
      return;
    }

    if (run.phase === 'failed') {
      await chrome.action.setBadgeBackgroundColor({ color: '#FF4B4B' });
      await chrome.action.setBadgeText({ text: '!' });
      return;
    }

    if (streak !== null && streak > 0) {
      await chrome.action.setBadgeBackgroundColor({ color: '#FF9600' });
      await chrome.action.setBadgeText({ text: streak > 999 ? '999' : String(streak) });
      return;
    }

    await chrome.action.setBadgeText({ text: '' });
  }
}

export const notificationService = new NotificationService();
