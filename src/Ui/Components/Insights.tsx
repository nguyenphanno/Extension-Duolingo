/**
 * Insights.tsx — two derived-view widgets: the streak forecast strip and the
 * achievements grid. Both render pre-computed data; the maths lives in
 * `Shared/Utils` so it stays testable and dependency-free.
 */
import type { ReactNode } from 'react';
import type { Achievement, AchievementIcon } from '@Shared/Utils/Achievements';
import type { StreakForecast } from '@Shared/Utils/Forecast';
import { cx } from '../Utils/Cx';
import { ProgressBar } from './Display';
import {
  BoltIcon,
  ChartIcon,
  CrownIcon,
  FlameIcon,
  GemIcon,
  HeartIcon,
  ShieldIcon,
  StarIcon,
  TargetIcon,
  TrophyIcon,
} from '../Icons/Icons';

const ACHIEVEMENT_ICONS: Record<AchievementIcon, ReactNode> = {
  flame: <FlameIcon size={18} />,
  gem: <GemIcon size={18} />,
  trophy: <TrophyIcon size={18} />,
  bolt: <BoltIcon size={18} />,
  star: <StarIcon size={18} />,
  crown: <CrownIcon size={18} />,
  shield: <ShieldIcon size={18} />,
  target: <TargetIcon size={18} />,
  heart: <HeartIcon size={18} />,
  chart: <ChartIcon size={18} />,
};

/* ------------------------------------------------------------------ *
 * Streak forecast
 * ------------------------------------------------------------------ */

export function StreakForecastStrip({
  forecast,
  dense = false,
  showHeadline = true,
}: {
  forecast: StreakForecast;
  dense?: boolean;
  showHeadline?: boolean;
}) {
  return (
    <div className={cx('forecast', dense && 'forecast--dense')}>
      <div className="forecast__days">
        {forecast.days.map((day) => (
          <div key={day.offset} className={cx('forecast__day', `forecast__day--${day.status}`)} title={day.note}>
            <span className="forecast__weekday">{day.offset === 0 ? 'Today' : day.weekday}</span>
            <span className="forecast__pip" />
          </div>
        ))}
      </div>
      {showHeadline ? <p className="forecast__headline">{forecast.detail}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Achievements
 * ------------------------------------------------------------------ */

export function AchievementGrid({ items }: { items: Achievement[] }) {
  const sorted = [...items].sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.progress - a.progress);

  return (
    <div className="achievements">
      {sorted.map((item) => (
        <div key={item.id} className={cx('achievement', item.unlocked && 'is-unlocked')} title={item.hint}>
          <span className="achievement__icon">{ACHIEVEMENT_ICONS[item.icon]}</span>
          <div className="achievement__body">
            <b>{item.label}</b>
            <em>{item.unlocked ? 'Unlocked' : item.hint}</em>
            <ProgressBar value={item.progress} height={6} tone={item.unlocked ? 'gold' : 'neutral'} />
          </div>
          <span className="achievement__count">
            {Math.min(item.value, item.target)}
            <i>/{item.target}</i>
          </span>
        </div>
      ))}
    </div>
  );
}
