// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * WeeklyReport.tsx — this week vs last week, at a glance.
 *
 * Pure function of `HistoryStats.daily` — no storage, no side-effects. The
 * comparison is calendar-week based (Sunday start), so it stays stable even
 * across month boundaries.
 */
import { useMemo } from 'react';
import type { HistoryStats } from '@Shared/Types';
import { dayKey } from '@Shared/Utils/Time';
import { formatNumber } from '@Shared/Utils/Format';
import { useT } from '@Ui/I18n/I18n';
import { ChartIcon, FlameIcon, TargetIcon, TrophyIcon } from '@Ui/Icons/Icons';

interface WeeklyReportProps {
  stats: HistoryStats;
  dailyGoal: number;
}

interface WeekBucket {
  totalXp: number;
  activeDays: number;
  bestDay: number;
  goalHits: number;
  days: number;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function bucketWeek(daily: HistoryStats['daily'], weekStart: Date): WeekBucket {
  const prefix = dayKey(weekStart.getTime());
  const next = dayKey(weekStart.getTime() + 7 * 86_400_000);
  let totalXp = 0;
  let activeDays = 0;
  let bestDay = 0;
  let goalHits = 0;
  let days = 0;

  for (const point of daily) {
    if (point.day >= prefix && point.day < next) {
      days += 1;
      totalXp += point.xp;
      if (point.xp > 0) activeDays += 1;
      if (point.xp > bestDay) bestDay = point.xp;
    }
  }

  // Count goal hits from daily points that fall within this week
  goalHits = daily.filter((p) => p.day >= prefix && p.day < next && p.xp > 0).length;

  return { totalXp, activeDays, bestDay, goalHits, days };
}

export function WeeklyReport({ stats, dailyGoal }: WeeklyReportProps) {
  const t = useT();

  const report = useMemo(() => {
    const now = new Date();
    const thisStart = startOfWeek(now);
    const lastStart = new Date(thisStart);
    lastStart.setDate(lastStart.getDate() - 7);

    const thisWeek = bucketWeek(stats.daily, thisStart);
    const lastWeek = bucketWeek(stats.daily, lastStart);

    const avgThis = thisWeek.days > 0 ? Math.round(thisWeek.totalXp / 7) : 0;
    const avgLast = lastWeek.days > 0 ? Math.round(lastWeek.totalXp / 7) : 0;

    let trend: 'up' | 'down' | 'flat';
    let pct = 0;
    if (lastWeek.totalXp === 0 && thisWeek.totalXp === 0) {
      trend = 'flat';
    } else if (lastWeek.totalXp === 0) {
      trend = 'up';
      pct = 100;
    } else {
      pct = Math.round(((thisWeek.totalXp - lastWeek.totalXp) / lastWeek.totalXp) * 100);
      if (pct > 5) trend = 'up';
      else if (pct < -5) trend = 'down';
      else trend = 'flat';
    }

    return { thisWeek, lastWeek, avgThis, avgLast, trend, pct };
  }, [stats.daily]);

  if (stats.daily.length < 7) {
    return (
      <div className="weekly-report">
        <div className="weekly-report__head">
          <ChartIcon size={18} />
          <span>{t('weekly.title')}</span>
        </div>
        <p className="hint">{t('week.noData')}</p>
      </div>
    );
  }

  const trendTone = report.trend === 'up' ? 'up' : report.trend === 'down' ? 'down' : 'flat';

  return (
    <div className="weekly-report">
      <div className="weekly-report__head">
        <ChartIcon size={18} />
        <span>{t('weekly.title')}</span>
        <span className={`weekly-trend weekly-trend--${trendTone}`}>
          {t(`week.trend${report.trend.charAt(0).toUpperCase() + report.trend.slice(1)}` as 'week.trendUp')}
          {report.pct !== 0 ? ` ${Math.abs(report.pct)}%` : ''}
        </span>
      </div>

      <div className="weekly-report__grid">
        <div className="weekly-stat">
          <FlameIcon size={14} />
          <div>
            <b>{formatNumber(report.thisWeek.totalXp)}</b>
            <span>{t('week.totalXp')}</span>
            <em>{t('week.lastWeek')}: {formatNumber(report.lastWeek.totalXp)}</em>
          </div>
        </div>

        <div className="weekly-stat">
          <ChartIcon size={14} />
          <div>
            <b>{formatNumber(report.avgThis)}</b>
            <span>{t('week.avgPerDay')}</span>
            <em>{t('week.lastWeek')}: {formatNumber(report.avgLast)}</em>
          </div>
        </div>

        <div className="weekly-stat">
          <TrophyIcon size={14} />
          <div>
            <b>{formatNumber(report.thisWeek.bestDay)}</b>
            <span>{t('week.bestDay')}</span>
          </div>
        </div>

        <div className="weekly-stat">
          <TargetIcon size={14} />
          <div>
            <b>{report.thisWeek.goalHits}/7</b>
            <span>{t('week.goalHit')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
