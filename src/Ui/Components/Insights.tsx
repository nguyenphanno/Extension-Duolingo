// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Insights.tsx — two derived-view widgets: the streak forecast strip and the
 * achievements grid. Both render pre-computed data; the maths lives in
 * `Shared/Utils` so it stays testable and dependency-free.
 */
import type { ReactNode } from 'react';
import type { Achievement, AchievementIcon } from '@Shared/Utils/Achievements';
import type { StreakForecast } from '@Shared/Utils/Forecast';
import { cx } from '../Utils/Cx';
import { useT } from '../I18n/I18n';
import type { MessageKey } from '../I18n/Messages';
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
  const t = useT();

  return (
    <div className={cx('forecast', dense && 'forecast--dense')}>
      <div className="forecast__days">
        {forecast.days.map((day) => (
          <div
            key={day.offset}
            className={cx('forecast__day', `forecast__day--${day.status}`)}
            title={t(day.note.key as MessageKey, day.note.vars)}
          >
            <span className="forecast__weekday">{day.offset === 0 ? t('forecast.today') : day.weekday}</span>
            <span className="forecast__pip" />
          </div>
        ))}
      </div>
      {showHeadline ? <p className="forecast__headline">{t(forecast.detail.key as MessageKey, forecast.detail.vars)}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Achievements
 * ------------------------------------------------------------------ */

export function AchievementGrid({ items }: { items: Achievement[] }) {
  const t = useT();
  const sorted = [...items].sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.progress - a.progress);

  return (
    <div className="achievements">
      {sorted.map((item) => {
        const hint = t(item.hintKey as MessageKey);
        return (
          <div key={item.id} className={cx('achievement', item.unlocked && 'is-unlocked')} title={hint}>
            <span className="achievement__icon">{ACHIEVEMENT_ICONS[item.icon]}</span>
            <div className="achievement__body">
              <b>{t(item.labelKey as MessageKey)}</b>
              <em>{item.unlocked ? t('ach.unlocked') : hint}</em>
              <ProgressBar value={item.progress} height={6} tone={item.unlocked ? 'gold' : 'neutral'} />
            </div>
            <span className="achievement__count">
              {Math.min(item.value, item.target)}
              <i>/{item.target}</i>
            </span>
          </div>
        );
      })}
    </div>
  );
}
