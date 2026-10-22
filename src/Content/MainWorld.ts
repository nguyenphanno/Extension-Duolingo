// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * MainWorld.ts — the only code that runs in the page's own JavaScript world.
 *
 * Why it has to exist: the correct answer to a challenge is in the lesson
 * payload (`challenges[].correctSolutions`), which the page fetches and keeps to
 * itself. A content script lives in an isolated world and cannot see the page's
 * `window`, its `fetch`, or its variables — so the only way to read that payload
 * is to stand in front of the request and look at the response on the way past.
 *
 * What it does, precisely: wraps `fetch` and `XMLHttpRequest.send`, and for
 * responses whose URL looks like a lesson, reads a *clone* of the body, pulls
 * out every (prompt, solutions) pair, and posts them to the isolated world with
 * `window.postMessage`. It never modifies a request, a response, or a header,
 * and it swallows every error it can cause — a broken capture must never break
 * the page the user is learning on.
 *
 * The parsing lives in `Shared/Utils/Answers.ts` so it can be tested without a
 * browser; this file is only the plumbing.
 */
import { ANSWER_CHANNEL_TAG } from '@Shared/Constants';
import type { AnswerCaptureMessage } from '@Shared/Types';
import { extractAnswers } from '@Shared/Utils/Answers';

/** Set on `window` once the hooks are in place, so the isolated world can tell. */
const INSTALLED_FLAG = '__duoAssistMainInstalled';

/**
 * Only inspect URLs that plausibly carry a lesson.
 *
 * Deliberately broad: a missed URL costs a feature, an inspected one costs a
 * `JSON.parse` on a body we were going to parse anyway. But not so broad that
 * every profile poll gets cloned.
 */
const LESSON_URL = /(\/sessions?|\/lessons?|\/challenges?|\/practice|\/stories?|\/story)/i;

/** Bodies above this are not lesson payloads, and cloning them is not free. */
const MAX_BODY_BYTES = 3_000_000;

interface MainWorldGlobal extends Window {
  [INSTALLED_FLAG]?: boolean;
}

const host = window as MainWorldGlobal;

if (!host[INSTALLED_FLAG]) {
  host[INSTALLED_FLAG] = true;
  install();
}

function install(): void {
  hookFetch();
  hookXhr();
}

function post(url: string, payload: unknown): void {
  try {
    const pairs = extractAnswers(payload);
    if (pairs.length === 0) return;

    const message: AnswerCaptureMessage = { [ANSWER_CHANNEL_TAG]: 1, url, pairs };
    window.postMessage(message, window.location.origin);
  } catch {
    /* A payload we cannot walk is a payload we ignore. */
  }
}

function urlOf(input: RequestInfo | URL | string): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url ?? '';
}

/* --------------------------------- fetch --------------------------------- */

function hookFetch(): void {
  const original = window.fetch;
  if (typeof original !== 'function') return;

  window.fetch = function patchedFetch(this: unknown, ...args: Parameters<typeof fetch>): Promise<Response> {
    const result = original.apply(this as never, args);

    try {
      const url = urlOf(args[0]);
      if (LESSON_URL.test(url)) {
        // `.then` on a *separate* promise: the caller's promise is untouched,
        // so nothing about their control flow changes.
        result
          .then((response) => {
            if (!response?.ok) return;
            const type = response.headers.get('content-type') ?? '';
            if (!type.includes('json')) return;
            const length = Number(response.headers.get('content-length') ?? 0);
            if (length > MAX_BODY_BYTES) return;

            response
              .clone()
              .json()
              .then((body: unknown) => post(url, body))
              .catch(() => undefined);
          })
          .catch(() => undefined);
      }
    } catch {
      /* Never let the observer break the observed. */
    }

    return result;
  };
}

/* ------------------------------ XMLHttpRequest ---------------------------- */

/**
 * Older parts of Duolingo's client still use XHR, and a lesson can be opened
 * from one of them. This only *listens* — `open` and `send` keep their original
 * behaviour and return values.
 */
function hookXhr(): void {
  const XHR = window.XMLHttpRequest;
  if (typeof XHR !== 'function') return;

  const open = XHR.prototype.open;
  const send = XHR.prototype.send;

  XHR.prototype.open = function patchedOpen(this: XMLHttpRequest & { __duoUrl?: string }, ...args: unknown[]): void {
    try {
      this.__duoUrl = String(args[1] ?? '');
    } catch {
      /* ignore */
    }
    return (open as (...rest: unknown[]) => void).apply(this, args);
  };

  XHR.prototype.send = function patchedSend(this: XMLHttpRequest & { __duoUrl?: string }, ...args: unknown[]): void {
    try {
      const url = this.__duoUrl ?? '';
      if (LESSON_URL.test(url)) {
        this.addEventListener('load', () => {
          try {
            const type = this.responseType;
            if (type !== '' && type !== 'text' && type !== 'json') return;
            const body: unknown = type === 'json' ? this.response : JSON.parse(this.responseText);
            post(url, body);
          } catch {
            /* not JSON, or gone */
          }
        });
      }
    } catch {
      /* ignore */
    }
    return (send as (...rest: unknown[]) => void).apply(this, args);
  };
}
