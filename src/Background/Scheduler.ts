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
import { ALARM_GUARD, ALARM_SCHEDULE, ALARM_WATCH } from '@Shared/Constants';
import type { Settings } from '@Shared/Types';
import { dayKey, isWithinQuietHours } from '@Shared/Utils/Time';
import { isPausedOn } from '@Shared/Utils/Pause';
import type { AppContext } from './AppContext';

export type ScheduleBlock = 'disabled' | 'paused' | 'quiet-hours' | 'off-day' | null;

const BLOCK_TEXT: Record<Exclude<ScheduleBlock, null>, string> = {
  disabled: 'Scheduled runs are off.',
  paused: 'Scheduled run skipped — the vacation window is active.',
  'quiet-hours': 'Scheduled run skipped — quiet hours.',
  'off-day': 'Scheduled run skipped — not an active weekday.',
};

export type GuardBlock = 'disabled' | 'paused' | 'no-streak' | 'already-earned' | 'off-day' | null;

const GUARD_TEXT: Record<Exclude<GuardBlock, null>, string> = {
  disabled: 'Streak guard is off.',
  paused: 'Streak guard skipped — the vacation window is active.',
  'no-streak': 'Streak guard skipped — there is no streak to protect yet.',
  'already-earned': 'Streak guard skipped — XP already earned today.',
  'off-day': 'Streak guard skipped — today is not an active weekday.',
};

export type WatchBlock = 'disabled' | 'paused' | 'no-streak' | 'already-earned' | 'off-day' | null;

const WATCH_TEXT: Record<Exclude<WatchBlock, null>, string> = {
  disabled: 'Last call is off.',
  paused: 'Last call skipped — the vacation window is active.',
  'no-streak': 'Last call skipped — there is no streak to protect yet.',
  'already-earned': 'Last call skipped — XP already earned today.',
  'off-day': 'Last call skipped — today is not an active weekday.',
};

export class Scheduler {
  constructor(private readonly app: AppContext) {}

  async sync(settings: Settings): Promise<number | null> {
    if (typeof chrome === 'undefined' || !chrome.alarms) return null;

    await chrome.alarms.clear(ALARM_SCHEDULE);
    await chrome.alarms.clear(ALARM_GUARD);
    await chrome.alarms.clear(ALARM_WATCH);

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

    // Last call asks rather than acts, so it only needs an alarm when the user
    // opted in — and it is independent of the guard, which may be off.
    if (settings.schedule.watch.enabled) {
      await chrome.alarms.create(ALARM_WATCH, {
        when: this.watchTimeAt(settings),
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

  async nextWatchAt(): Promise<number | null> {
    if (typeof chrome === 'undefined' || !chrome.alarms) return null;
    const alarm = await chrome.alarms.get(ALARM_WATCH);
    return alarm?.scheduledTime ?? null;
  }

  /** The next local occurrence of the guard time — today if still ahead. */
  guardTimeAt(settings: Settings, now: Date = new Date()): number {
    return this.dailyAt(settings.schedule.guard.hour, settings.schedule.guard.minute, now);
  }

  /** The next local occurrence of the last-call time — today if still ahead. */
  watchTimeAt(settings: Settings, now: Date = new Date()): number {
    return this.dailyAt(settings.schedule.watch.hour, settings.schedule.watch.minute, now);
  }

  private dailyAt(hour: number, minute: number, now: Date): number {
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    return target.getTime();
  }

  /**
   * Is the vacation window active? Dates are local calendar days, so the
   * comparison is plain string ordering on `YYYY-MM-DD` — no timezone maths.
   *
   * An empty bound is treated as open-ended, so "from only" and "to only"
   * both do the obvious thing instead of silently pausing forever.
   */
  isPaused(settings: Settings, now: Date = new Date()): boolean {
    return isPausedOn(settings.schedule.pause, dayKey(now.getTime()));
  }

  /** Why the scheduler must not fire right now, or `null` when it may. */
  blockReason(settings: Settings, now: Date = new Date()): ScheduleBlock {
    if (!settings.schedule.enabled) return 'disabled';
    if (this.isPaused(settings, now)) return 'paused';

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
    // A rescue run during a holiday would defeat the point of the holiday.
    if (this.isPaused(settings, now)) return 'paused';
    if (streak <= 0) return 'no-streak';
    if (todayXp > 0) return 'already-earned';

    const days = settings.schedule.days;
    if (days.length === 0 || !days.includes(now.getDay())) return 'off-day';
    return null;
  }

  /**
   * Why the last-call nudge must stay quiet, or `null` when it should ask.
   *
   * Same gates as the guard, for the same reason: never nag about a streak that
   * does not exist, is already safe today, or is deliberately on holiday.
   */
  watchBlock(settings: Settings, todayXp: number, streak: number, now: Date = new Date()): WatchBlock {
    if (!settings.schedule.watch.enabled) return 'disabled';
    if (this.isPaused(settings, now)) return 'paused';
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

  describeWatch(reason: WatchBlock): string | null {
    return reason ? WATCH_TEXT[reason] : null;
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
