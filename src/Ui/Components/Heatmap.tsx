/**
 * Heatmap.tsx — a GitHub-style contribution grid for XP.
 *
 * Columns are weeks (oldest → newest), rows are weekdays starting Sunday, so a
 * horizontal band always means "the same weekday".
 */
import { useMemo } from 'react';
import { cx } from '../Utils/Cx';

export interface HeatCell {
  day: string;
  xp: number;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function Heatmap({ data, weeks = 8 }: { data: HeatCell[]; weeks?: number }) {
  const { columns, max, total } = useMemo(() => buildGrid(data, weeks), [data, weeks]);

  return (
    <div className="heat">
      <div className="heat__body">
        <div className="heat__days">
          {WEEKDAYS.map((label, index) => (
            <span key={index} className={cx(index % 2 === 1 && 'is-faint')}>
              {index % 2 === 1 ? label : ''}
            </span>
          ))}
        </div>
        <div className="heat__grid">
          {columns.map((column, columnIndex) => (
            <div className="heat__col" key={columnIndex}>
              {column.map((cell, rowIndex) =>
                cell ? (
                  <span
                    key={rowIndex}
                    className={cx('heat__cell', `heat__cell--${level(cell.xp, max)}`)}
                    title={`${cell.day} · ${cell.xp} XP`}
                  />
                ) : (
                  <span key={rowIndex} className="heat__cell heat__cell--empty" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="heat__legend">
        <span>{weeks} weeks · {total} XP</span>
        <span className="heat__scale">
          less
          {[0, 1, 2, 3, 4].map((step) => (
            <i key={step} className={`heat__cell heat__cell--${step}`} />
          ))}
          more
        </span>
      </div>
    </div>
  );
}

function level(xp: number, max: number): number {
  if (xp <= 0) return 0;
  const ratio = xp / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

function buildGrid(data: HeatCell[], weeks: number) {
  const byDay = new Map(data.map((cell) => [cell.day, cell.xp]));
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  // Walk back to the Sunday that opens the first column, so every column is a
  // full week and today lands in the last column.
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() - (weeks - 1) * 7);

  const columns: Array<Array<HeatCell | null>> = [];
  let total = 0;

  for (let week = 0; week < weeks; week += 1) {
    const column: Array<HeatCell | null> = [];
    for (let row = 0; row < 7; row += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + week * 7 + row);
      if (date > today) {
        column.push(null);
        continue;
      }
      const key = toKey(date);
      const xp = byDay.get(key) ?? 0;
      total += xp;
      column.push({ day: key, xp });
    }
    columns.push(column);
  }

  const max = Math.max(1, ...columns.flat().map((cell) => cell?.xp ?? 0));
  return { columns, max, total };
}

function toKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
