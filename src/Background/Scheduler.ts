/**
 * Scheduler.ts — replaces the GitHub Actions cron with chrome.alarms.
 *
 * chrome.alarms is the only timer that survives service-worker suspension, so
 * the whole schedule is expressed as a single periodic alarm. The alarm always
 * fires; whether it actually runs is decided here, at fire time, from the
 * current wall clock. That keeps weekday and quiet-hour rules correct even if
 * the user changes them between alarms.
 */
import { ALARM_SCHEDULE } from '@Shared/Constants';
import type { Settings } from '@Shared/Types';
import { isWithinQuietHours } from '@Shared/Utils/Time';
import type { AppContext } from './AppContext';

export type ScheduleBlock = 'disabled' | 'quiet-hours' | 'off-day' | null;

const BLOCK_TEXT: Record<Exclude<ScheduleBlock, null>, string> = {
  disabled: 'Scheduled runs are off.',
  'quiet-hours': 'Scheduled run skipped — quiet hours.',
  'off-day': 'Scheduled run skipped — not an active weekday.',
};

export class Scheduler {
  constructor(private readonly app: AppContext) {}

  async sync(settings: Settings): Promise<number | null> {
    if (typeof chrome === 'undefined' || !chrome.alarms) return null;
    await chrome.alarms.clear(ALARM_SCHEDULE);
    if (!settings.schedule.enabled) return null;

    const period = Math.max(15, settings.schedule.intervalMinutes);
    await chrome.alarms.create(ALARM_SCHEDULE, {
      delayInMinutes: period,
      periodInMinutes: period,
    });
    return Date.now() + period * 60_000;
  }

  async nextRunAt(): Promise<number | null> {
    if (typeof chrome === 'undefined' || !chrome.alarms) return null;
    const alarm = await chrome.alarms.get(ALARM_SCHEDULE);
    return alarm?.scheduledTime ?? null;
  }

  /** Why the scheduler must not fire right now, or `null` when it may. */
  blockReason(settings: Settings, now: Date = new Date()): ScheduleBlock {
    if (!settings.schedule.enabled) return 'disabled';

    const days = settings.schedule.days;
    // An empty selection is a deliberate "never" — the UI says as much.
    if (days.length === 0 || !days.includes(now.getDay())) return 'off-day';

    const quiet = settings.schedule.quietHours;
    if (quiet.enabled && isWithinQuietHours(now.getHours(), quiet.startHour, quiet.endHour)) {
      return 'quiet-hours';
    }
    return null;
  }

  describeBlock(reason: ScheduleBlock): string | null {
    return reason ? BLOCK_TEXT[reason] : null;
  }

  /** Kept for call sites that only care about the night window. */
  isQuietNow(settings: Settings): boolean {
    const quiet = settings.schedule.quietHours;
    if (!quiet.enabled) return false;
    return isWithinQuietHours(new Date().getHours(), quiet.startHour, quiet.endHour);
  }

  /** Human-readable summary of the active weekday set. */
  describeDays(settings: Settings): string {
    const days = settings.schedule.days;
    if (days.length === 0 || days.length === 7) return 'Every day';
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days.map((day) => names[day] ?? '?').join(', ');
  }
}
