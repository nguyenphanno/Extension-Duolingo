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

export type RunTrigger = 'manual' | 'schedule' | 'context-menu' | 'command' | 'content-script';

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
}

export interface ScheduleSettings {
  enabled: boolean;
  intervalMinutes: number;
  quietHours: { enabled: boolean; startHour: number; endHour: number };
  runOnStartup: boolean;
  /** Weekdays the scheduler may fire on. 0 = Sunday … 6 = Saturday. */
  days: number[];
}

export interface BehaviorSettings {
  dryRun: boolean;
  notifications: boolean;
  badgeText: boolean;
  openSidePanelOnRun: boolean;
  keepServiceWorkerAlive: boolean;
  /** Minimum seconds between two runs, to avoid hammering the API. */
  cooldownSeconds: number;
}

export interface UiSettings {
  theme: ThemePreference;
  locale: Locale;
  reduceMotion: boolean;
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
