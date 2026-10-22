// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Scheduler.ts — replaces the GitHub Actions cron with chrome.alarms.
 *
 * chrome.alarms is the only timer that survives service-worker suspension, so
 * the whole schedule is expressed as two alarms:
 *
 *   duo.schedule — "run every N minutes" (the normal cadence),
 *   duo.guard    — "run once, late in the day, but only if the streak is about
 *                  to die" (the safety net).
 *
 * Both alarms always fire; whether they actually run is decided here, at fire
 * time, from the current wall clock. That keeps weekday and quiet-hour rules
 * correct even if the user changes them between alarms.
 */
import { ALARM_GUARD, ALARM_SCHEDULE } from '@Shared/Constants';
import type { Settings } from '@Shared/Types';
import { isWithinQuietHours } from '@Shared/Utils/Time';
import type { AppContext } from './AppContext';

export type ScheduleBlock = 'disabled' | 'quiet-hours' | 'off-day' | null;

const BLOCK_TEXT: Record<Exclude<ScheduleBlock, null>, string> = {
  disabled: 'Scheduled runs are off.',
  'quiet-hours': 'Scheduled run skipped — quiet hours.',
  'off-day': 'Scheduled run skipped — not an active weekday.',
};

export type GuardBlock = 'disabled' | 'no-streak' | 'already-earned' | 'off-day' | null;

const GUARD_TEXT: Record<Exclude<GuardBlock, null>, string> = {
  disabled: 'Streak guard is off.',
  'no-streak': 'Streak guard skipped — there is no streak to protect yet.',
  'already-earned': 'Streak guard skipped — XP already earned today.',
  'off-day': 'Streak guard skipped — today is not an active weekday.',
};

export class Scheduler {
  constructor(private readonly app: AppContext) {}

  async sync(settings: Settings): Promise<number | null> {
    if (typeof chrome === 'undefined' || !chrome.alarms) return null;

    await chrome.alarms.clear(ALARM_SCHEDULE);
    await chrome.alarms.clear(ALARM_GUARD);

    if (settings.schedule.enabled) {
      const period = Math.max(15, settings.schedule.intervalMinutes);
      await chrome.alarms.create(ALARM_SCHEDULE, {
        delayInMinutes: period,
        periodInMinutes: period,
      });
    }

    // The guard is independent of the interval schedule on purpose: the interval
    // answers "how often", the guard answers "at the last useful moment".
    if (settings.schedule.guard.enabled) {
      await chrome.alarms.create(ALARM_GUARD, {
        when: this.guardTimeAt(settings),
        periodInMinutes: 24 * 60,
      });
    }

    return settings.schedule.enabled ? Date.now() + Math.max(15, settings.schedule.intervalMinutes) * 60_000 : null;
  }

  async nextRunAt(): Promise<number | null> {
    if (typeof chrome === 'undefined' || !chrome.alarms) return null;
    const alarm = await chrome.alarms.get(ALARM_SCHEDULE);
    return alarm?.scheduledTime ?? null;
  }

  async nextGuardAt(): Promise<number | null> {
    if (typeof chrome === 'undefined' || !chrome.alarms) return null;
    const alarm = await chrome.alarms.get(ALARM_GUARD);
    return alarm?.scheduledTime ?? null;
  }

  /** The next local occurrence of the guard time — today if still ahead. */
  guardTimeAt(settings: Settings, now: Date = new Date()): number {
    const target = new Date(now);
    target.setHours(settings.schedule.guard.hour, settings.schedule.guard.minute, 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    return target.getTime();
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

  /**
   * Why the streak guard must not fire right now, or `null` when it should.
   *
   * Quiet hours deliberately do not apply: the user picked this exact time, so
   * honouring a night window here would silently defeat the whole feature.
   */
  guardBlock(settings: Settings, todayXp: number, streak: number, now: Date = new Date()): GuardBlock {
    if (!settings.schedule.guard.enabled) return 'disabled';
    if (streak <= 0) return 'no-streak';
    if (todayXp > 0) return 'already-earned';

    const days = settings.schedule.days;
    if (days.length === 0 || !days.includes(now.getDay())) return 'off-day';
    return null;
  }

  describeBlock(reason: ScheduleBlock): string | null {
    return reason ? BLOCK_TEXT[reason] : null;
  }

  describeGuard(reason: GuardBlock): string | null {
    return reason ? GUARD_TEXT[reason] : null;
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
