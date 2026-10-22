// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Types.ts — the single source of truth for every shape that crosses a
 * boundary (service worker <-> UI, storage <-> runtime, network <-> domain).
 *
 * Rule: nothing in this file imports anything. It must stay dependency-free
 * so the service worker, content script and React apps can all consume it.
 */

/* ------------------------------------------------------------------ *
 * Logging
 * ------------------------------------------------------------------ */

export type LogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  at: number;
  level: LogLevel;
  scope: string;
  message: string;
  data?: unknown;
}

/* ------------------------------------------------------------------ *
 * Duolingo domain
 * ------------------------------------------------------------------ */

export interface Profile {
  userId: string;
  username: string;
  displayName: string;
  streak: number;
  totalXp: number;
  gems: number;
  hearts: number;
  maxHearts: number;
  fromLanguage: string;
  learningLanguage: string;
  streakFreezes: number;
  hasPlus: boolean;
  league: string | null;
  avatarUrl: string | null;
  fetchedAt: number;
  /** Raw reward bundles, kept so the rewards sweep needs no second request. */
  rawBundles?: DuoRewardBundle[];
}

/** Small, chart-friendly slice persisted with every run. */
export interface ProfileSnapshot {
  streak: number;
  totalXp: number;
  gems: number;
  hearts: number;
}

export interface SessionResult {
  index: number;
  sessionId: string;
  xp: number;
  durationMs: number;
  ok: boolean;
  error?: string;
}

export interface RewardClaimDetail {
  type: string;
  rewardId: string;
  gems: number;
}

export type TaskKey = 'practice' | 'rewards' | 'badge' | 'freeze' | 'super' | 'boost';

export interface TaskOutcome {
  task: TaskKey;
  label: string;
  status: 'done' | 'skipped' | 'failed';
  headline: string;
  detail?: string;
  metrics: Record<string, number>;
  startedAt: number;
  finishedAt: number;
}

export type RunTrigger = 'manual' | 'schedule' | 'context-menu' | 'command' | 'content-script' | 'guard';

export interface RunSummary {
  id: string;
  startedAt: number;
  finishedAt: number;
  trigger: RunTrigger;
  dryRun: boolean;
  xpGained: number;
  rewardsClaimed: number;
  gemsClaimed: number;
  sessions: SessionResult[];
  tasks: TaskOutcome[];
  before: ProfileSnapshot | null;
  after: ProfileSnapshot | null;
  badgeStatus: string;
  error: string | null;
}

/* ------------------------------------------------------------------ *
 * Live run state
 * ------------------------------------------------------------------ */

export type RunPhase = 'idle' | 'preparing' | 'running' | 'finishing' | 'done' | 'failed' | 'cancelled';

export interface RunState {
  phase: RunPhase;
  runId: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  trigger: RunTrigger | null;
  currentTask: TaskKey | null;
  currentLabel: string;
  /** 0..1 across the whole run. */
  progress: number;
  summary: RunSummary | null;
  error: string | null;
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export type ThemePreference = 'system' | 'light' | 'dark';
export type Locale = 'vi' | 'en';
export type TokenSource = 'cookie' | 'manual';

export interface PracticeSettings {
  enabled: boolean;
  sessions: number;
  minDurationSec: number;
  maxDurationSec: number;
  delayMinMs: number;
  delayMaxMs: number;
  stopOnError: boolean;
  heartsLeft: number;
  /** Soft daily XP target used by the popup ring. */
  dailyXpGoal: number;
  /** Hard ceiling for a single run. 0 means "no budget". */
  xpBudget: number;
  /**
   * Goal mode: stop the run as soon as *today's* XP reaches `dailyXpGoal`.
   * This is the difference between "farm XP" and "keep the streak alive with
   * the smallest footprint that still counts".
   */
  stopAtDailyGoal: boolean;
  /**
   * Size the run from the goal: the session count above becomes a ceiling and
   * the actual count is computed from `(goal − today's XP) / average XP per
   * lesson`. Off by default, because it makes a run's shape depend on history.
   */
  autoSize: boolean;
}

export interface RewardsSettings {
  enabled: boolean;
  maxClaims: number;
}

export interface BadgeSettings {
  enabled: boolean;
  /** Send the claim request to the third-party PRO service. */
  request: boolean;
  timezone: string;
  years: number[];
  maxRequestsPerRun: number;
}

export interface FreezeSettings {
  enabled: boolean;
  /** Stop buying once inventory reaches this count. */
  targetCount: number;
  /**
   * Insurance: instead of topping the inventory up to `targetCount`, buy only
   * the cover the forecast says is missing — slack counts today once XP lands,
   * so a good day needs one freeze fewer.
   */
  autoInsure: boolean;
}

/**
 * Streak guard — one late alarm that exists purely to stop a streak dying.
 *
 * It is deliberately separate from the interval schedule: the interval answers
 * "how often", the guard answers "at the last reasonable moment of the day".
 */
export interface GuardSettings {
  enabled: boolean;
  /** Local hour the guard fires at, 0–23. */
  hour: number;
  /** 0 or 30 — half-hour granularity is enough and keeps the UI simple. */
  minute: number;
}

export interface ScheduleSettings {
  enabled: boolean;
  intervalMinutes: number;
  quietHours: { enabled: boolean; startHour: number; endHour: number };
  runOnStartup: boolean;
  /** Weekdays the scheduler may fire on. 0 = Sunday … 6 = Saturday. */
  days: number[];
  guard: GuardSettings;
  /**
   * Last call: a notification that *asks* before anything is sent. The guard
   * acts on its own; this one only nudges, with a button to run or to wait.
   */
  watch: { enabled: boolean; hour: number; minute: number };
  /**
   * Vacation: an inclusive date window in which nothing runs — not the
   * interval schedule, not the guard, not the nudge.
   */
  pause: { enabled: boolean; from: string; to: string };
}

export interface BehaviorSettings {
  dryRun: boolean;
  notifications: boolean;
  badgeText: boolean;
  openSidePanelOnRun: boolean;
  keepServiceWorkerAlive: boolean;
  /**
   * Start a run the moment a lesson page opens. Off by default: it can overlap
   * with a lesson the user is doing by hand, which is surprising at best.
   */
  runOnLesson: boolean;
  /** Minimum seconds between two runs, to avoid hammering the API. */
  cooldownSeconds: number;
}

export interface UiSettings {
  theme: ThemePreference;
  locale: Locale;
  reduceMotion: boolean;
}

/**
 * Auto-answer — fill in a lesson's challenges while the user watches.
 *
 * Every field here is a *permission*, not a preference: the solver in
 * `Shared/Utils/Answers.ts` fails closed by design, and these are the only
 * reasons it is ever allowed to act. All of them default off except the two
 * that cost nothing.
 */
export interface AutoAnswerSettings {
  /** Master switch. Off by default — this one changes what happens in a lesson. */
  enabled: boolean;
  /**
   * Read answers out of the lesson payload before the exercise is shown.
   * Free: nothing is spent, nothing is submitted twice. This is the good path.
   */
  fromPayload: boolean;
  /**
   * Fall back to pressing Skip and reading the answer Duolingo reveals. Costs
   * one exercise per *new* sentence, then never again — but it is a real cost,
   * so it is opt-in and separate from `fromPayload`.
   */
  learnFromSkip: boolean;
  /** Pause before acting, so the answer does not appear the instant the page renders. */
  thinkMs: number;
  /** Ceiling on answers per lesson. 0 means "as many as the lesson has". */
  maxPerLesson: number;
  /** Submit after filling. Off means "fill it in and let me press Check". */
  autoSubmit: boolean;
}

export interface Settings {
  schemaVersion: number;
  tokenSource: TokenSource;
  manualToken: string;
  practice: PracticeSettings;
  rewards: RewardsSettings;
  badges: BadgeSettings;
  freeze: FreezeSettings;
  super: { enabled: boolean };
  boost: { enabled: boolean };
  pro: { enabled: boolean; acknowledgeRisk: boolean };
  schedule: ScheduleSettings;
  behavior: BehaviorSettings;
  ui: UiSettings;
  answers: AutoAnswerSettings;
}

/* ------------------------------------------------------------------ *
 * History & analytics
 * ------------------------------------------------------------------ */

export interface HistoryStats {
  runs: number;
  xp: number;
  gems: number;
  rewards: number;
  successRate: number;
  currentStreakOfRuns: number;
  lastRunAt: number | null;
  /** One entry per day, ascending. */
  daily: Array<{ day: string; xp: number; runs: number }>;
}

/**
 * Adaptive pacing — what the HTTP client learned during the last run.
 *
 * A 429 is the server telling us we are too fast. Instead of retrying at the
 * same rate, the client multiplies the minimum gap between mutating requests
 * and holds off until `Retry-After` expires. The factor is reported so the UI
 * can show it rather than hide it.
 */
export interface PacingState {
  /** Multiplier applied to the minimum gap between mutating requests. */
  factor: number;
  /** Epoch ms until which the client refuses to send anything mutating. */
  holdUntil: number | null;
  /** How many rate-limit responses were absorbed in the last run. */
  rateLimitHits: number;
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type ErrorCode =
  | 'NO_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'HTTP'
  | 'PARSE'
  | 'CANCELLED'
  | 'PRO_REQUIRED'
  | 'UNKNOWN';

export interface AppErrorShape {
  code: ErrorCode;
  message: string;
  status?: number;
  retryable?: boolean;
  detail?: string;
}

/* ------------------------------------------------------------------ *
 * Network payloads (partial — only the fields we actually read)
 * ------------------------------------------------------------------ */

export interface DuoProfileResponse {
  id?: number | string;
  username?: string;
  name?: string;
  displayName?: string;
  streak?: number;
  totalXp?: number;
  gems?: number;
  lingots?: number;
  hearts?: number;
  maxHearts?: number;
  fromLanguage?: string;
  learningLanguage?: string;
  hasPlus?: boolean;
  picture?: string;
  avatar?: string;
  streakData?: { currentStreak?: number; freezeCount?: number; streakFreezeCount?: number };
  rewardBundles?: DuoRewardBundle[];
  [key: string]: unknown;
}

export interface DuoRewardBundle {
  rewardBundleType?: string;
  rewards?: DuoReward[];
  [key: string]: unknown;
}

export interface DuoReward {
  id?: string;
  consumed?: boolean;
  amount?: number;
  items?: Array<{ itemType?: string; amount?: number }>;
  [key: string]: unknown;
}

export interface DuoSessionResponse {
  id?: string;
  [key: string]: unknown;
}

export interface DuoGoalsResponse {
  badges?: { earned?: string[]; [key: string]: unknown };
  [key: string]: unknown;
}

export interface ProResponse {
  status?: string;
  notification?: { head?: string; body?: string };
  percentage?: number;
  raw?: unknown;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ *
 * Cross-world messaging
 * ------------------------------------------------------------------ */

/**
 * What the MAIN-world capture script posts to the isolated world.
 *
 * Declared here rather than next to either endpoint because both sides need it,
 * and `Types.ts` is the only file both can import without pulling in code.
 * `pairs` mirrors `ExtractedAnswer` in `Shared/Utils/Answers.ts`, inlined so
 * this file keeps its no-imports rule.
 */
export interface AnswerCaptureMessage {
  __duoAssistAnswers: 1;
  /** The request the answers came from, for the log. */
  url: string;
  pairs: Array<{ prompt: string; solutions: string[] }>;
}
