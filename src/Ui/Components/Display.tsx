// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Display.tsx — read-only presentation pieces: stat pills, progress, charts.
 */
import type { ReactNode } from 'react';
import { cx } from '../Utils/Cx';

export type Tone = 'green' | 'blue' | 'gold' | 'orange' | 'purple' | 'red' | 'neutral';

export function Stat({
  icon,
  value,
  label,
  tone = 'neutral',
  compact,
}: {
  icon: ReactNode;
  value: string | number;
  label: string;
  tone?: Tone;
  compact?: boolean;
}) {
  return (
    <div className={cx('stat', `stat--${tone}`, compact && 'stat--compact')}>
      <span className="stat__icon">{icon}</span>
      <span className="stat__body">
        <b className="stat__value">{value}</b>
        <span className="stat__label">{label}</span>
      </span>
    </div>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={cx('pill', `pill--${tone}`)}>{children}</span>;
}

export function ProgressBar({
  value,
  tone = 'green',
  height = 14,
  animated,
}: {
  value: number;
  tone?: Tone;
  height?: number;
  animated?: boolean;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className={cx('progress', `progress--${tone}`, animated && 'progress--animated')}
      style={{ height }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className="progress__fill" style={{ width: `${pct}%` }}>
        <span className="progress__gloss" />
      </span>
    </div>
  );
}

export function Ring({
  value,
  size = 96,
  stroke = 10,
  tone = 'green',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  children?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
        <circle
          className={cx('ring__fill', `ring__fill--${tone}`)}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring__center">{children}</div>
    </div>
  );
}

export function Bars({
  data,
  height = 64,
  tone = 'green',
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  tone?: Tone;
}) {
  const max = Math.max(1, ...data.map((point) => point.value));
  return (
    <div className={cx('bars', `bars--${tone}`)} style={{ height }}>
      {data.map((point, index) => (
        <div className="bars__col" key={`${point.label}-${index}`} title={`${point.label}: ${point.value}`}>
          <span className="bars__bar" style={{ height: `${Math.max(4, (point.value / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return <span className="skeleton" style={{ height, width }} />;
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="empty">
      <span className="empty__icon">{icon}</span>
      <h4 className="empty__title">{title}</h4>
      <p className="empty__body">{body}</p>
    </div>
  );
}

export function Divider() {
  return <hr className="divider" />;
}
