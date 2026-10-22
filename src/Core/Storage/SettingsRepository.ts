// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * SettingsRepository.ts — typed, versioned, defensive settings.
 *
 * Everything read from storage is treated as untrusted: it is deep-merged onto
 * defaults and every numeric field is clamped to its documented range. That
 * means a corrupted or hand-edited blob can never crash the automation.
 */
import { DEFAULT_TIMEZONE, GUARD, LIMITS, SCHEMA_VERSION, STORAGE_KEYS } from '@Shared/Constants';
import type { Settings } from '@Shared/Types';
import { clamp } from '@Shared/Utils/Format';
import { readRaw, writeRaw } from './StorageArea';

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SCHEMA_VERSION,
  tokenSource: 'cookie',
  manualToken: '',
  practice: {
    enabled: true,
    sessions: 5,
    minDurationSec: 35,
    maxDurationSec: 60,
    delayMinMs: 2000,
    delayMaxMs: 3500,
    stopOnError: false,
    heartsLeft: 5,
    dailyXpGoal: 50,
    xpBudget: 0,
    stopAtDailyGoal: false,
  },
  rewards: { enabled: true, maxClaims: 35 },
  badges: {
    enabled: true,
    request: false,
    timezone: DEFAULT_TIMEZONE,
    years: [new Date().getFullYear()],
    maxRequestsPerRun: 1,
  },
  freeze: { enabled: true, targetCount: 2 },
  super: { enabled: false },
  boost: { enabled: false },
  pro: { enabled: false, acknowledgeRisk: false },
  schedule: {
    enabled: false,
    intervalMinutes: 240,
    quietHours: { enabled: false, startHour: 23, endHour: 6 },
    runOnStartup: false,
    days: [0, 1, 2, 3, 4, 5, 6],
    guard: { enabled: false, hour: GUARD.hour, minute: GUARD.minute },
  },
  behavior: {
    dryRun: false,
    notifications: true,
    badgeText: true,
    openSidePanelOnRun: false,
    keepServiceWorkerAlive: true,
    cooldownSeconds: 45,
  },
  ui: { theme: 'system', locale: 'en', reduceMotion: false },
};

/**
 * Settings migration — bring an old blob up to the current schema.
 *
 * Each migration is a pure function that patches the raw blob *before*
 * `normaliseSettings` runs, so the normaliser only ever sees the shape it
 * expects. Migrations are cumulative: version 1 → 2 → 3, never skipping.
 *
 * The current schema version lives in `SCHEMA_VERSION` (see Constants.ts).
 * Bump it *and* add a migration here whenever a breaking change lands.
 */
const MIGRATIONS: Array<{ toVersion: number; patch: (raw: Json) => void }> = [
  {
    toVersion: 2,
    patch(raw) {
      // v1 → v2: add the streak guard block to schedule, plus stopAtDailyGoal.
      const schedule = isObject(raw.schedule) ? (raw.schedule as Json) : {};
      if (!isObject(schedule.guard)) {
        schedule.guard = { enabled: false, hour: GUARD.hour, minute: GUARD.minute };
        raw.schedule = schedule;
      }
      const practice = isObject(raw.practice) ? (raw.practice as Json) : {};
      if (practice.stopAtDailyGoal === undefined) {
        practice.stopAtDailyGoal = false;
        raw.practice = practice;
      }
    },
  },
  // Add future migrations here:
  // { toVersion: 3, patch(raw) { … } },
];

/** Apply all migrations up to the current `SCHEMA_VERSION`. */
function migrate(raw: Json): Json {
  let version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;
  for (const migration of MIGRATIONS) {
    if (version < migration.toVersion) {
      migration.patch(raw);
      version = migration.toVersion;
    }
  }
  raw.schemaVersion = SCHEMA_VERSION;
  return raw;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Deep-merge an untrusted blob onto defaults, clamping as we go. */
export function normaliseSettings(input: unknown): Settings {
  const raw = isObject(input) ? input : {};
  const d = DEFAULT_SETTINGS;
  const practice = isObject(raw.practice) ? raw.practice : {};
  const rewards = isObject(raw.rewards) ? raw.rewards : {};
  const badges = isObject(raw.badges) ? raw.badges : {};
  const freeze = isObject(raw.freeze) ? raw.freeze : {};
  const schedule = isObject(raw.schedule) ? raw.schedule : {};
  const quiet = isObject(schedule.quietHours) ? schedule.quietHours : {};
  const guard = isObject(schedule.guard) ? schedule.guard : {};
  const behavior = isObject(raw.behavior) ? raw.behavior : {};
  const ui = isObject(raw.ui) ? raw.ui : {};
  const pro = isObject(raw.pro) ? raw.pro : {};

  const years = Array.isArray(badges.years)
    ? badges.years.map((year) => Number(year)).filter((year) => Number.isInteger(year) && year >= 2020 && year <= 2100)
    : d.badges.years;

  const days = Array.isArray(schedule.days)
    ? [...new Set(schedule.days.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort(
        (a, b) => a - b,
      )
    : d.schedule.days;

  return {
    schemaVersion: SCHEMA_VERSION,
    tokenSource: pickEnum(raw.tokenSource, ['cookie', 'manual'] as const, d.tokenSource),
    manualToken: str(raw.manualToken, d.manualToken),
    practice: {
      enabled: bool(practice.enabled, d.practice.enabled),
      sessions: num(practice.sessions, d.practice.sessions, LIMITS.sessions.min, LIMITS.sessions.max),
      minDurationSec: num(practice.minDurationSec, d.practice.minDurationSec, LIMITS.durationSec.min, LIMITS.durationSec.max),
      maxDurationSec: num(practice.maxDurationSec, d.practice.maxDurationSec, LIMITS.durationSec.min, LIMITS.durationSec.max),
      delayMinMs: num(practice.delayMinMs, d.practice.delayMinMs, LIMITS.delayMs.min, LIMITS.delayMs.max),
      delayMaxMs: num(practice.delayMaxMs, d.practice.delayMaxMs, LIMITS.delayMs.min, LIMITS.delayMs.max),
      stopOnError: bool(practice.stopOnError, d.practice.stopOnError),
      heartsLeft: num(practice.heartsLeft, d.practice.heartsLeft, 0, 5),
      dailyXpGoal: num(practice.dailyXpGoal, d.practice.dailyXpGoal, 10, 500),
      xpBudget: num(practice.xpBudget, d.practice.xpBudget, 0, 2000),
      stopAtDailyGoal: bool(practice.stopAtDailyGoal, d.practice.stopAtDailyGoal),
    },
    rewards: {
      enabled: bool(rewards.enabled, d.rewards.enabled),
      maxClaims: num(rewards.maxClaims, d.rewards.maxClaims, LIMITS.maxClaims.min, LIMITS.maxClaims.max),
    },
    badges: {
      enabled: bool(badges.enabled, d.badges.enabled),
      request: bool(badges.request, d.badges.request),
      timezone: str(badges.timezone, d.badges.timezone),
      years: years.length ? years : d.badges.years,
      maxRequestsPerRun: num(badges.maxRequestsPerRun, d.badges.maxRequestsPerRun, 0, 12),
    },
    freeze: {
      enabled: bool(freeze.enabled, d.freeze.enabled),
      targetCount: num(freeze.targetCount, d.freeze.targetCount, LIMITS.targetFreeze.min, LIMITS.targetFreeze.max),
    },
    super: { enabled: bool(isObject(raw.super) ? raw.super.enabled : undefined, d.super.enabled) },
    boost: { enabled: bool(isObject(raw.boost) ? raw.boost.enabled : undefined, d.boost.enabled) },
    pro: {
      enabled: bool(pro.enabled, d.pro.enabled),
      acknowledgeRisk: bool(pro.acknowledgeRisk, d.pro.acknowledgeRisk),
    },
    schedule: {
      enabled: bool(schedule.enabled, d.schedule.enabled),
      intervalMinutes: num(schedule.intervalMinutes, d.schedule.intervalMinutes, LIMITS.intervalMinutes.min, LIMITS.intervalMinutes.max),
      quietHours: {
        enabled: bool(quiet.enabled, d.schedule.quietHours.enabled),
        startHour: num(quiet.startHour, d.schedule.quietHours.startHour, 0, 23),
        endHour: num(quiet.endHour, d.schedule.quietHours.endHour, 0, 23),
      },
      runOnStartup: bool(schedule.runOnStartup, d.schedule.runOnStartup),
      // An explicitly empty list means "never" — only a missing/invalid value
      // falls back to every day.
      days: Array.isArray(schedule.days) ? days : d.schedule.days,
      guard: {
        enabled: bool(guard.enabled, d.schedule.guard.enabled),
        hour: num(guard.hour, d.schedule.guard.hour, 0, 23),
        // Snap to the half hour so the alarm never lands mid-minute.
        minute: num(guard.minute, d.schedule.guard.minute, 0, 59) < 30 ? 0 : 30,
      },
    },
    behavior: {
      dryRun: bool(behavior.dryRun, d.behavior.dryRun),
      notifications: bool(behavior.notifications, d.behavior.notifications),
      badgeText: bool(behavior.badgeText, d.behavior.badgeText),
      openSidePanelOnRun: bool(behavior.openSidePanelOnRun, d.behavior.openSidePanelOnRun),
      keepServiceWorkerAlive: bool(behavior.keepServiceWorkerAlive, d.behavior.keepServiceWorkerAlive),
      cooldownSeconds: num(behavior.cooldownSeconds, d.behavior.cooldownSeconds, 0, 600),
    },
    ui: {
      theme: pickEnum(ui.theme, ['system', 'light', 'dark'] as const, d.ui.theme),
      locale: pickEnum(ui.locale, ['vi', 'en'] as const, d.ui.locale),
      reduceMotion: bool(ui.reduceMotion, d.ui.reduceMotion),
    },
  };
}

export class SettingsRepository {
  private cache: Settings | null = null;

  async load(force = false): Promise<Settings> {
    if (this.cache && !force) return this.cache;
    const stored = await readRaw<unknown>('local', STORAGE_KEYS.settings);
    const raw = isObject(stored) ? migrate(stored as Json) : { schemaVersion: SCHEMA_VERSION };
    // If a migration patched the blob, persist the upgraded version so the
    // next load is fast and the schemaVersion in storage matches the code.
    if (isObject(stored) && (stored as Json).schemaVersion !== SCHEMA_VERSION) {
      void writeRaw('local', STORAGE_KEYS.settings, raw);
    }
    this.cache = normaliseSettings(raw);
    return this.cache;
  }

  async save(settings: Settings): Promise<Settings> {
    const normalised = normaliseSettings(settings);
    this.cache = normalised;
    await writeRaw('local', STORAGE_KEYS.settings, normalised);
    return normalised;
  }

  async patch(mutate: (draft: Settings) => Settings): Promise<Settings> {
    const current = await this.load(true);
    return this.save(mutate(structuredClone(current)));
  }

  async reset(): Promise<Settings> {
    this.cache = structuredClone(DEFAULT_SETTINGS);
    await writeRaw('local', STORAGE_KEYS.settings, this.cache);
    return this.cache;
  }

  exportJson(settings: Settings): string {
    return JSON.stringify({ kind: 'duo-assist.settings', exportedAt: new Date().toISOString(), settings }, null, 2);
  }

  importJson(payload: string): Settings {
    const parsed: unknown = JSON.parse(payload);
    const blob = isObject(parsed) && isObject(parsed.settings) ? parsed.settings : parsed;
    const migrated = isObject(blob) ? migrate(blob as Json) : { schemaVersion: SCHEMA_VERSION };
    return normaliseSettings(migrated);
  }
}

export const settingsRepository = new SettingsRepository();
