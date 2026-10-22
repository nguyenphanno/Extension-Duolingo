// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Logger.ts — a tiny observable logger.
 *
 * The service worker is the only producer; every UI surface subscribes over a
 * long-lived port. Logs are also mirrored into a ring buffer so a freshly
 * opened popup can replay the last run.
 */
import { createId } from './Utils/Id';
import type { LogEntry, LogLevel } from './Types';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, success: 30, warn: 40, error: 50 };

export type LogSink = (entry: LogEntry) => void;

export interface ScopedLogger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  success(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export class Logger {
  private sinks = new Set<LogSink>();
  private buffer: LogEntry[] = [];

  constructor(
    private readonly minLevel: LogLevel = 'debug',
    private readonly capacity = 400,
  ) {}

  subscribe(sink: LogSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  snapshot(): LogEntry[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }

  write(level: LogLevel, scope: string, message: string, data?: unknown): LogEntry {
    const entry: LogEntry = { id: createId('log'), at: Date.now(), level, scope, message, data };
    if (ORDER[level] >= ORDER[this.minLevel]) {
      this.buffer.push(entry);
      if (this.buffer.length > this.capacity) this.buffer.shift();
      for (const sink of this.sinks) {
        try {
          sink(entry);
        } catch {
          /* a broken sink must never break the run */
        }
      }
      const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      consoleFn(`[${scope}] ${message}`, data ?? '');
    }
    return entry;
  }

  scope(name: string): ScopedLogger {
    return {
      debug: (message, data) => this.write('debug', name, message, data),
      info: (message, data) => this.write('info', name, message, data),
      success: (message, data) => this.write('success', name, message, data),
      warn: (message, data) => this.write('warn', name, message, data),
      error: (message, data) => this.write('error', name, message, data),
    };
  }
}

export const logger = new Logger('debug');
