// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Protocol.ts — the typed contract between UI surfaces and the service worker.
 *
 * Every request is a discriminated union, every response is a `Result`.
 * The long-lived port carries `StreamEvent`s so the UI never polls.
 */
import type { Result } from './Result';
import type {
  HistoryStats,
  LogEntry,
  PacingState,
  Profile,
  RunState,
  RunSummary,
  RunTrigger,
  Settings,
  TaskKey,
} from './Types';

export interface TokenInfo {
  present: boolean;
  valid: boolean;
  source: 'cookie' | 'manual' | 'none';
  userId: string | null;
  username: string | null;
  expiresAt: number | null;
  daysLeft: number | null;
  message: string;
}

export interface UiState {
  settings: Settings;
  profile: Profile | null;
  run: RunState;
  stats: HistoryStats;
  logs: LogEntry[];
  token: TokenInfo;
  lastSummary: RunSummary | null;
  version: string;
  schedule: { nextRunAt: number | null; guardAt: number | null; watchAt: number | null };
  pacing: PacingState;
}

export type UiRequest =
  | { type: 'state/get' }
  | { type: 'settings/save'; settings: Settings }
  | { type: 'settings/export' }
  | { type: 'settings/import'; payload: string }
  | { type: 'settings/reset' }
  | { type: 'profile/refresh' }
  | { type: 'run/start'; trigger?: RunTrigger; only?: TaskKey[] }
  | { type: 'run/cancel' }
  | { type: 'history/list' }
  | { type: 'history/clear' }
  | { type: 'logs/clear' }
  | { type: 'token/set'; token: string }
  | { type: 'token/test'; token: string }
  | { type: 'panel/open' }
  | { type: 'tab/open'; url: string };

export type UiResponse = Result<unknown>;

export type StreamEvent =
  | { type: 'hello'; state: UiState }
  | { type: 'state'; state: UiState }
  | { type: 'log'; entry: LogEntry }
  | { type: 'run'; run: RunState }
  | { type: 'profile'; profile: Profile | null }
  | { type: 'toast'; level: 'success' | 'warn' | 'error' | 'info'; message: string };
