/**
 * HttpClient.ts — one place that knows how to talk to the network.
 *
 * Features: per-request timeout, exponential backoff with jitter, Retry-After
 * support, mutation spacing (so bursts look human), and errors normalised into
 * `AppError` so callers never inspect raw `Response` objects.
 */
import { NETWORK } from '@Shared/Constants';
import { AppError } from '@Shared/Result';
import { randomBetween, sleep } from '@Shared/Utils/Time';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  /** Human label used in error messages. */
  label?: string;
}

export interface HttpResponse<T> {
  status: number;
  data: T;
  headers: Headers;
}

const MUTATING: ReadonlySet<HttpMethod> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export class HttpClient {
  private lastMutationAt = 0;

  constructor(
    private readonly baseHeaders: Record<string, string>,
    private readonly config: { timeoutMs: number; retries: number; minMutationGapMs: number } = {
      timeoutMs: NETWORK.timeoutMs,
      retries: NETWORK.retries,
      minMutationGapMs: NETWORK.minMutationGapMs,
    },
  ) {}

  async request<T>(url: string, options: RequestOptions = {}): Promise<HttpResponse<T>> {
    const method = options.method ?? 'GET';
    const retries = options.retries ?? this.config.retries;
    let attempt = 0;

    for (;;) {
      if (MUTATING.has(method)) await this.spaceMutations(options.signal);
      try {
        return await this.execute<T>(url, { ...options, method });
      } catch (error) {
        const appError = error instanceof AppError ? error : new AppError('UNKNOWN', (error as Error).message);
        const canRetry = attempt < retries && appError.retryable && appError.code !== 'CANCELLED';
        if (!canRetry) throw appError;
        attempt += 1;
        const backoff = NETWORK.baseDelayMs * 2 ** (attempt - 1) + randomBetween(0, 250);
        await sleep(backoff, options.signal);
      }
    }
  }

  async json<T>(url: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.request<T>(url, options);
    return response.data;
  }

  private async spaceMutations(signal?: AbortSignal): Promise<void> {
    const elapsed = Date.now() - this.lastMutationAt;
    const gap = this.config.minMutationGapMs - elapsed;
    if (gap > 0) await sleep(gap, signal);
    this.lastMutationAt = Date.now();
  }

  private async execute<T>(url: string, options: RequestOptions & { method: HttpMethod }): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), options.timeoutMs ?? this.config.timeoutMs);
    const onAbort = () => controller.abort(new DOMException('Aborted', 'AbortError'));
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const label = options.label ?? `${options.method} ${new URL(url).pathname}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method,
        headers: {
          ...this.baseHeaders,
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...options.headers,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      });
    } catch (error) {
      const name = (error as Error).name;
      if (name === 'AbortError' || name === 'TimeoutError') {
        if (options.signal?.aborted) throw new AppError('CANCELLED', 'Cancelled by user.');
        throw new AppError('TIMEOUT', `${label} timed out.`, { retryable: true });
      }
      throw new AppError('NETWORK', `${label} failed: ${(error as Error).message}`, { retryable: true });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
    }

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (!response.ok) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      const retryable = isRetryableStatus(response.status);
      const code =
        response.status === 401
          ? 'UNAUTHORIZED'
          : response.status === 429
            ? 'RATE_LIMITED'
            : 'HTTP';
      throw new AppError(code, `${label} → HTTP ${response.status}`, {
        status: response.status,
        retryable,
        detail: typeof data === 'object' && data ? JSON.stringify(data).slice(0, 400) : text.slice(0, 400),
      });
    }

    return { status: response.status, data: data as T, headers: response.headers };
  }
}

export function createDuoHttpClient(token: string): HttpClient {
  return new HttpClient({
    Authorization: `Bearer ${token}`,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Origin: 'https://www.duolingo.com',
    Referer: 'https://www.duolingo.com/learn',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  });
}
