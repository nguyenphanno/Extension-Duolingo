/**
 * Platform.ts — how a shortcut is written on *this* machine.
 *
 * The palette listens for metaKey on macOS and ctrlKey everywhere else, so the
 * hint next to it has to match. Printing "⌘" on Windows renders a tofu box
 * (Nunito has no glyph for it), which is worse than saying "Ctrl".
 */

let cached: string | null = null;

export function modKey(): string {
  if (cached) return cached;

  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = (uaData?.platform ?? navigator.platform ?? '').toLowerCase();
  cached = platform.includes('mac') || platform.includes('iphone') || platform.includes('ipad') ? '⌘' : 'Ctrl';
  return cached;
}

/** "Ctrl + K" / "⌘ + K" — used in the About shortcut table. */
export function modShortcut(key: string): string {
  return `${modKey()} + ${key}`;
}
