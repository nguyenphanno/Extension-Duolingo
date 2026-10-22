// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Constants.ts — magic values live here and nowhere else.
 */

export const APP_NAME = 'Duo Assist';
export const APP_TAGLINE = 'Duolingo automation, done properly.';

/* -------------------------------- Endpoints ------------------------------- */

export const DUO_API_BASE = 'https://www.duolingo.com/2017-06-30';
export const DUO_GOALS_BASE = 'https://goals-api.duolingo.com';
export const DUO_ORIGIN = 'https://www.duolingo.com';
export const PRO_API_URL = 'https://api.duolingopro.net/request';
export const PRO_API_VERSION = '3.1BETA.05.1';

/** Cookie that carries the Duolingo session JWT. */
export const JWT_COOKIE_NAME = 'jwt_token';

export const PROFILE_FIELDS = [
  'id',
  'username',
  'name',
  'picture',
  'currentCourse',
  'fromLanguage',
  'learningLanguage',
  'hearts',
  'maxHearts',
  'totalXp',
  'streak',
  'streakData',
  'gems',
  'lingots',
  'hasPlus',
  'rewardBundles',
].join(',');

/** Challenge mix sent when opening a practice session (mirrors the web client). */
export const CHALLENGE_TYPES = [
  'characterMatch',
  'characterPuzzle',
  'definition',
  'dialogue',
  'form',
  'freeResponse',
  'gapFill',
  'judge',
  'listen',
  'name',
  'listenComplete',
  'match',
  'readComprehension',
  'select',
  'selectPronunciation',
  'selectTranscription',
  'syllableTap',
  'syllableListenTap',
  'speak',
  'tapCloze',
  'tapClozeTable',
  'tapComplete',
  'tapCompleteTable',
  'translate',
  'typeCloze',
  'typeClozeTable',
  'typeCompleteTable',
  'writeComprehension',
] as const;

/* -------------------------------- Storage -------------------------------- */

export const STORAGE_KEYS = {
  settings: 'duo.settings',
  history: 'duo.history',
  runState: 'duo.run-state',
  profileCache: 'duo.profile',
  logs: 'duo.logs',
} as const;

export const SCHEMA_VERSION = 2;
export const HISTORY_LIMIT = 200;
export const LOG_BUFFER_LIMIT = 400;

/* ------------------------------- Messaging ------------------------------- */

export const PORT_NAME = 'duo.stream';
export const ALARM_SCHEDULE = 'duo.schedule';
export const ALARM_GUARD = 'duo.guard';
export const ALARM_KEEPALIVE = 'duo.keepalive';
export const MENU_RUN_NOW = 'duo.menu.run';
export const MENU_OPEN_PANEL = 'duo.menu.panel';

export const COMMAND_RUN = 'run-automation';
export const COMMAND_PANEL = 'open-side-panel';

/* -------------------------------- Defaults ------------------------------- */

export const DEFAULT_TIMEZONE =
  (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'Asia/Ho_Chi_Minh';

export const LIMITS = {
  sessions: { min: 0, max: 30 },
  durationSec: { min: 20, max: 300 },
  delayMs: { min: 0, max: 30_000 },
  maxClaims: { min: 0, max: 100 },
  intervalMinutes: { min: 15, max: 1440 },
  targetFreeze: { min: 0, max: 2 },
} as const;

export const NETWORK = {
  timeoutMs: 20_000,
  retries: 2,
  baseDelayMs: 700,
  /** Minimum spacing between mutating calls, to look human and dodge 429s. */
  minMutationGapMs: 900,
} as const;

/**
 * Adaptive throttle. Every 429 multiplies the gap between mutating requests by
 * `step`, up to `maxFactor`. The cap exists so a single bad burst cannot turn
 * the extension into a 30-second-per-request crawl.
 */
export const PACING = {
  step: 1.75,
  maxFactor: 6,
  /** Never honour a Retry-After longer than this — give up and report instead. */
  maxRetryAfterMs: 120_000,
} as const;

/** Streak guard defaults: late enough to matter, early enough to still act. */
export const GUARD = {
  hour: 20,
  minute: 30,
  /** Only one lesson — the guard is a rescue, not a run. */
  sessions: 1,
} as const;
