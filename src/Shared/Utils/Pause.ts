// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Pause.ts — the vacation window, as one pure predicate.
 *
 * Dates are local calendar days (`YYYY-MM-DD`), so the comparison is plain
 * string ordering — no timezone maths and no Date parsing to get wrong.
 *
 * An empty bound is open-ended, which makes "from only" and "to only" behave
 * the obvious way instead of silently pausing forever.
 */
export interface PauseWindow {
  enabled: boolean;
  from: string;
  to: string;
}

export function isPausedOn(pause: PauseWindow, today: string): boolean {
  if (!pause.enabled) return false;
  if (!pause.from && !pause.to) return false;
  if (pause.from && today < pause.from) return false;
  if (pause.to && today > pause.to) return false;
  return true;
}
