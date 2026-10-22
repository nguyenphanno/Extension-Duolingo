// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * I18n.ts — a tiny reactive translator, deliberately not a framework.
 *
 * The locale lives at module scope so plain helpers (formatters, task labels)
 * can translate outside React. Components subscribe with `useT()`, which is a
 * `useSyncExternalStore` over a single string — that is the whole reactivity
 * model, and it re-renders every surface the instant the language changes.
 */
import { useSyncExternalStore } from 'react';
import type { Locale } from '@Shared/Types';
import { CATALOGS, type MessageKey } from './Messages';

export type Vars = Record<string, string | number>;

/** First paint follows the browser; settings take over as soon as they load. */
function detectLocale(): Locale {
  try {
    const language = (navigator.language ?? 'en').toLowerCase();
    return language.startsWith('vi') ? 'vi' : 'en';
  } catch {
    return 'en';
  }
}

let active: Locale = detectLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return active;
}

export function setI18nLocale(next: Locale): void {
  if (next === active) return;
  active = next;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** Look a key up in the active catalogue, falling back to English. */
export function t(key: MessageKey, vars?: Vars): string {
  const catalog = CATALOGS[active] ?? CATALOGS.en;
  return interpolate(catalog[key] ?? CATALOGS.en[key] ?? key, vars);
}

/**
 * Plural-aware lookup. `tp('weekday.count', 3)` resolves `weekday.countMany`;
 * Vietnamese has no plural inflection, so its catalog can simply repeat the
 * same sentence under both keys.
 */
export function tp(base: string, count: number, vars?: Vars): string {
  const key = `${base}${count === 1 ? 'One' : 'Many'}` as MessageKey;
  const merged = { n: count, ...vars };
  return key in CATALOGS.en ? t(key, merged) : t(base as MessageKey, merged);
}

/** Subscribe a component to locale changes and hand it the translator. */
export function useT(): typeof t {
  useSyncExternalStore(subscribe, getLocale, getLocale);
  return t;
}
