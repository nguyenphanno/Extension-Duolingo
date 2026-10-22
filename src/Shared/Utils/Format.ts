/**
 * Format.ts — presentation helpers shared by every surface.
 *
 * The active locale lives at module scope (not React state) so plain helper
 * functions called outside components still format correctly. `useLocale` keeps
 * it in sync with settings.
 */
import type { Locale } from '../Types';

let activeLocale = 'en-US';

export function setFormatLocale(locale: Locale): void {
  activeLocale = locale === 'vi' ? 'vi-VN' : 'en-US';
}

export function currentLocale(): string {
  return activeLocale;
}

export function formatNumber(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale ?? activeLocale).format(Math.round(value));
}

export function formatCompact(value: number, locale?: string): string {
  if (Math.abs(value) < 1000) return formatNumber(value, locale);
  return new Intl.NumberFormat(locale ?? activeLocale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return clamp((value / total) * 100, 0, 100);
}

export function languageName(code: string): string {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'language' });
    return names.of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function titleCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
