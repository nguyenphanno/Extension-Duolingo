/** Cx.ts — 12-line class name joiner, so we do not pull in a dependency. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
