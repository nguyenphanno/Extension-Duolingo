// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * DuoArt.tsx — the artwork Duolingo actually ships.
 *
 * These are not UI glyphs. Gems, hearts, the streak flame and the XP bolt are
 * full-colour illustrations with their own outlines and highlights. Redrawing
 * them as monochrome `currentColor` paths (which is what this project used to
 * do) throws away the only thing that makes them recognisable, so they render
 * as images instead.
 *
 * The files live in `public/duo/` rather than being hotlinked because the CDN
 * names them by content hash (`/images/gems/45c14e05….svg`). Those URLs change
 * whenever the artwork does, so a hotlink would break the UI on an unrelated
 * Duolingo deploy.
 *
 * `size` is a height; width follows each file's own aspect ratio. That matters
 * because the source files are not square — the flame is 25×30, the gem 24×30,
 * the bolt 56×56. Forcing a square box would squash them.
 *
 * To add one: drop the SVG in `public/duo/`, add a line to `SOURCES`, done.
 */
import type { CSSProperties } from 'react';

const SOURCES = {
  // Reward objects — the values a stat row shows.
  gem: 'duo/gem.svg',
  heart: 'duo/heart.svg',
  streak: 'duo/streak.svg',
  xp: 'duo/xp.svg',

  // Category icons for the Options sidebar. Flat, filled, multi-colour — the
  // same construction as the reward objects above, which is why they live here
  // rather than in `Icons.tsx` next to the monochrome line glyphs.
  navAccount: 'duo/nav/home.svg',
  navPractice: 'duo/nav/practice.svg',
  navActivity: 'duo/nav/activity.svg',
  navRewards: 'duo/nav/rewards.svg',
  navShop: 'duo/nav/shop.svg',
  navSchedule: 'duo/nav/schedule.svg',
  navSafety: 'duo/nav/safety.svg',
  navAppearance: 'duo/nav/appearance.svg',
  navData: 'duo/nav/data.svg',
  navAbout: 'duo/nav/more.svg',

  // The popup's bottom tab bar.
  tasks: 'duo/nav/tasks.svg',
  log: 'duo/nav/log.svg',

  // Subject icons for widgets that are not a nav section: the four cells of the
  // weekly report, the heatmap, where a token came from, and the cached copy of
  // the profile.
  average: 'duo/nav/average.svg',
  star: 'duo/nav/star.svg',
  target: 'duo/nav/target.svg',
  heatmap: 'duo/nav/heatmap.svg',
  key: 'duo/nav/key.svg',
  archive: 'duo/nav/archive.svg',
  keyboard: 'duo/nav/keyboard.svg',
  bell: 'duo/nav/bell.svg',
  moon: 'duo/nav/moon.svg',
  plug: 'duo/nav/plug.svg',
  gauge: 'duo/nav/gauge.svg',
  warning: 'duo/nav/warning.svg',
  palette: 'duo/nav/palette.svg',
  console: 'duo/nav/console.svg',
  fortnight: 'duo/nav/fortnight.svg',
  sliders: 'duo/nav/sliders.svg',
  toggles: 'duo/nav/toggles.svg',

  // Named for what they depict, not for where they are used: the medal is the
  // badges task *and* the achievements header; the snowflake is the freeze task
  // *and* the streak-freeze card.
  badge: 'duo/nav/badge.svg',
  boost: 'duo/nav/boost.svg',
  crown: 'duo/nav/super.svg',
  freeze: 'duo/nav/freeze.svg',
} as const;

export type DuoArtName = keyof typeof SOURCES;

/** Works in extension pages, the preview, and content scripts alike. */
function assetUrl(path: string): string {
  const runtime = (globalThis as { chrome?: { runtime?: { getURL?: (path: string) => string } } }).chrome?.runtime;
  return runtime?.getURL ? runtime.getURL(path) : path;
}

export function DuoArt({
  name,
  size = 18,
  className,
  style,
  title,
}: {
  name: DuoArtName;
  /** Rendered height in px. Width follows the artwork's own aspect ratio. */
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Supply only when the artwork carries meaning no adjacent text already states. */
  title?: string;
}) {
  return (
    <img
      src={assetUrl(SOURCES[name])}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      draggable={false}
      className={className}
      style={{ height: size, width: 'auto', display: 'block', flex: 'none', ...style }}
    />
  );
}
