// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Route.ts — is this a page where a lesson is in progress?
 *
 * Duolingo is a single-page app, so the URL changes without a reload. The
 * content script polls this predicate instead of listening for navigation
 * events, because there is no navigation event that fires for every transition.
 *
 * Kept as a pure string check so the rule can be tested without a DOM.
 */
const LESSON_PATHS = ['/lesson', '/practice', '/stories'] as const;

export function isLessonPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return LESSON_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** True when the URL carries a session id, which also means "in a lesson". */
export function isLessonUrl(href: string): boolean {
  try {
    const url = new URL(href);
    if (isLessonPath(url.pathname)) return true;
    return url.searchParams.has('sessionId') || url.searchParams.has('challengeId');
  } catch {
    return false;
  }
}
