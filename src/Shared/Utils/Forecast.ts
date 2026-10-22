// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Forecast.ts — a deterministic projection of streak safety.
 *
 * We cannot know whether future days will earn XP, so the model is explicit:
 *   - today is safe once any XP lands,
 *   - each remaining streak freeze covers exactly one missed day,
 *   - after the freezes run out the streak is exposed.
 *
 * That is honest about what it knows and still tells the user the one number
 * they care about: how many days of slack they have left.
 *
 * The copy is returned as *translation keys*, not sentences, because this file
 * lives in the dependency-free Shared layer and must not know which language
 * the UI is in. The surface decides how to render it.
 */
import type { Profile } from '../Types';
import { currentLocale } from './Format';

export type ForecastStatus = 'safe' | 'covered' | 'risk';

/** A translatable fragment: a key plus the values its placeholders need. */
export interface TextRef {
  key: string;
  vars?: Record<string, string | number>;
}

export interface ForecastDay {
  /** 0 = today. */
  offset: number;
  at: number;
  /** Localised short weekday, e.g. "Mon". */
  weekday: string;
  status: ForecastStatus;
  /** One short line explaining the status. */
  note: TextRef;
}

export interface ForecastInput {
  streak: number;
  freezes: number;
  todayXp: number;
  dailyXpGoal: number;
  now?: Date;
  horizon?: number;
}

export interface StreakForecast {
  days: ForecastDay[];
  /** How many missed days the inventory can absorb right now. */
  slack: number;
  /** Today's requirement, already satisfied or not. */
  todaySatisfied: boolean;
  /** Very short — fits a card header. */
  headline: TextRef;
  /** One full sentence explaining the headline. */
  detail: TextRef;
  tone: 'green' | 'gold' | 'red';
}

const MAX_HORIZON = 14;

export function forecastStreak(input: ForecastInput): StreakForecast {
  const now = input.now ?? new Date();
  const horizon = Math.min(MAX_HORIZON, Math.max(1, input.horizon ?? 7));
  const freezes = Math.max(0, Math.floor(input.freezes));
  const todaySatisfied = input.todayXp > 0;
  const remainingToday = Math.max(0, input.dailyXpGoal - input.todayXp);

  const days: ForecastDay[] = [];

  for (let offset = 0; offset < horizon; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const weekday = date.toLocaleDateString(currentLocale(), { weekday: 'short' });

    if (offset === 0) {
      days.push({
        offset,
        at: date.getTime(),
        weekday,
        status: todaySatisfied ? 'safe' : 'risk',
        note: todaySatisfied
          ? { key: 'forecast.noteEarned' }
          : { key: 'forecast.noteNeeds', vars: { n: remainingToday } },
      });
      continue;
    }

    // Freeze #1 covers tomorrow, #2 the day after, and so on.
    const covered = offset <= freezes;
    days.push({
      offset,
      at: date.getTime(),
      weekday,
      status: covered ? 'covered' : 'risk',
      note: covered
        ? { key: 'forecast.noteFreeze', vars: { index: offset, total: freezes } }
        : { key: 'forecast.noteNoCover' },
    });
  }

  const slack = freezes + (todaySatisfied ? 1 : 0);

  let headline: TextRef;
  let detail: TextRef;
  let tone: StreakForecast['tone'];

  if (input.streak === 0) {
    headline = { key: 'forecast.titleNoStreak' };
    detail = { key: 'forecast.bodyNoStreak' };
    tone = 'gold';
  } else if (slack >= horizon) {
    headline = { key: 'forecast.titleCovered' };
    detail = { key: 'forecast.bodyCovered', vars: { days: horizon } };
    tone = 'green';
  } else if (slack > 0) {
    headline = slack === 1 ? { key: 'forecast.titleSlackOne' } : { key: 'forecast.titleSlackMany', vars: { n: slack } };
    detail = slack === 1 ? { key: 'forecast.bodySlackOne' } : { key: 'forecast.bodySlackMany', vars: { n: slack } };
    tone = slack >= 3 ? 'green' : 'gold';
  } else {
    headline = { key: 'forecast.titleNone' };
    detail = { key: 'forecast.bodyNone' };
    tone = 'red';
  }

  return { days, slack, todaySatisfied, headline, detail, tone };
}

/** Convenience wrapper for the common `Profile` shape. */
export function forecastFromProfile(profile: Profile | null, todayXp: number, dailyXpGoal: number): StreakForecast {
  return forecastStreak({
    streak: profile?.streak ?? 0,
    freezes: profile?.streakFreezes ?? 0,
    todayXp,
    dailyXpGoal,
  });
}
