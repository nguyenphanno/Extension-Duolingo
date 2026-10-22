// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Result.ts — explicit success/failure without throwing across boundaries.
 *
 * Errors that cross the extension message bus are plain objects, because
 * structured-clone drops class prototypes and stack traces.
 */
import type { AppErrorShape, ErrorCode } from './Types';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly detail?: string;
  /** Server-requested wait, when the response carried `Retry-After`. */
  readonly retryAfterMs?: number;

  constructor(
    code: ErrorCode,
    message: string,
    options: { status?: number; retryable?: boolean; detail?: string; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.detail = options.detail;
    this.retryAfterMs = options.retryAfterMs;
  }

  toShape(): AppErrorShape {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      retryable: this.retryable,
      detail: this.detail,
    };
  }
}

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: AppErrorShape };
export type Result<T> = Ok<T> | Err;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

export const err = (error: unknown): Err => ({
  ok: false,
  error: toShape(error),
});

export function toShape(error: unknown): AppErrorShape {
  if (error instanceof AppError) return error.toShape();
  if (error instanceof Error) {
    if (error.name === 'AbortError') return { code: 'CANCELLED', message: 'Cancelled' };
    return { code: 'UNKNOWN', message: error.message };
  }
  return { code: 'UNKNOWN', message: typeof error === 'string' ? error : 'Unknown error', detail: String(error) };
}

export function fromShape(shape: AppErrorShape): AppError {
  return new AppError(shape.code, shape.message, {
    status: shape.status,
    retryable: shape.retryable,
    detail: shape.detail,
  });
}

export function assertOk<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  throw fromShape(result.error);
}

/** Human-facing, localisation-free fallback text for an error shape. */
export function describeError(shape: AppErrorShape): string {
  switch (shape.code) {
    case 'NO_TOKEN':
      return 'No Duolingo session found. Sign in at duolingo.com or paste a token.';
    case 'TOKEN_EXPIRED':
      return 'Your Duolingo session expired. Reload duolingo.com to refresh it.';
    case 'TOKEN_INVALID':
      return 'That token is not a valid Duolingo JWT.';
    case 'NETWORK':
      return 'Network unreachable. Check your connection.';
    case 'TIMEOUT':
      return 'The request timed out.';
    case 'RATE_LIMITED':
      return 'Rate limited by Duolingo. Try again later.';
    case 'UNAUTHORIZED':
      return 'Duolingo rejected the session (401).';
    case 'PRO_REQUIRED':
      return 'This action needs the third-party PRO service enabled.';
    case 'CANCELLED':
      return 'Cancelled.';
    default:
      return shape.message;
  }
}
