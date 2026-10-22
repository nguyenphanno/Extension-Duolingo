/**
 * Time.ts — clock helpers. Every wait in the automation goes through here so
 * cancellation is honoured instantly instead of after a 5s sleep.
 */

import { currentLocale } from './Format';

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, ms));

    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Uniform random integer in [min, max]. */
export function randomInt(min: number, max: number): number {
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  if (high <= low) return low;
  const span = high - low + 1;
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return low + (buffer[0] % span);
}

/** Uniform random float in [min, max). */
export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

export function formatRelative(timestamp: number, now = Date.now()): string {
  const delta = timestamp - now;
  const abs = Math.abs(delta);
  const formatter = new Intl.RelativeTimeFormat(currentLocale(), { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['second', 1000],
    ['minute', 60_000],
    ['hour', 3_600_000],
    ['day', 86_400_000],
  ];
  let chosen: [Intl.RelativeTimeFormatUnit, number] = units[0];
  for (const unit of units) {
    if (abs >= unit[1]) chosen = unit;
  }
  return formatter.format(Math.round(delta / chosen[1]), chosen[0]);
}

export function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Handles quiet windows that wrap past midnight (22 -> 6). */
export function isWithinQuietHours(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

export function hoursUntilQuietEnd(hour: number, endHour: number): number {
  return (endHour - hour + 24) % 24 || 24;
}
