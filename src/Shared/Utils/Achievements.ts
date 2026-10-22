// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Achievements.ts — milestones derived from history, never stored.
 *
 * Because every value is a pure function of `HistoryStats` + `Profile`, the
 * list is always consistent with what the user sees elsewhere, survives
 * history clearing, and needs no schema migration.
 *
 * Labels are returned as translation keys (`ach.<id>.label` / `.hint`) rather
 * than sentences: this file is in the dependency-free Shared layer, so it must
 * stay language-agnostic.
 */
import type { HistoryStats, Profile, Settings } from '../Types';

export type AchievementIcon =
  | 'flame'
  | 'gem'
  | 'trophy'
  | 'bolt'
  | 'star'
  | 'crown'
  | 'shield'
  | 'target'
  | 'heart'
  | 'chart';

export interface Achievement {
  id: string;
  /** Translation key for the name, e.g. `ach.firstRun.label`. */
  labelKey: string;
  /** Translation key for the requirement, e.g. `ach.firstRun.hint`. */
  hintKey: string;
  icon: AchievementIcon;
  value: number;
  target: number;
  /** 0..1, clamped. */
  progress: number;
  unlocked: boolean;
}

export interface AchievementInput {
  stats: HistoryStats;
  profile: Profile | null;
  settings: Settings;
}

interface Spec {
  id: string;
  icon: AchievementIcon;
  target: number;
  read: (input: AchievementInput) => number;
}

/** `first-run` -> `firstRun`, so ids stay kebab-case and keys stay camelCase. */
function camel(id: string): string {
  return id.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

const SPECS: Spec[] = [
  { id: 'first-run', icon: 'target', target: 1, read: ({ stats }) => stats.runs },
  { id: 'runs-10', icon: 'bolt', target: 10, read: ({ stats }) => stats.runs },
  { id: 'runs-50', icon: 'chart', target: 50, read: ({ stats }) => stats.runs },
  { id: 'runs-200', icon: 'crown', target: 200, read: ({ stats }) => stats.runs },
  { id: 'xp-1k', icon: 'star', target: 1_000, read: ({ stats }) => stats.xp },
  { id: 'xp-10k', icon: 'trophy', target: 10_000, read: ({ stats }) => stats.xp },
  { id: 'xp-50k', icon: 'crown', target: 50_000, read: ({ stats }) => stats.xp },
  { id: 'rewards-50', icon: 'gem', target: 50, read: ({ stats }) => stats.rewards },
  { id: 'gems-1k', icon: 'gem', target: 1_000, read: ({ stats }) => stats.gems },
  { id: 'clean-5', icon: 'shield', target: 5, read: ({ stats }) => stats.currentStreakOfRuns },
  { id: 'streak-7', icon: 'flame', target: 7, read: ({ profile }) => profile?.streak ?? 0 },
  { id: 'streak-30', icon: 'flame', target: 30, read: ({ profile }) => profile?.streak ?? 0 },
  { id: 'streak-100', icon: 'flame', target: 100, read: ({ profile }) => profile?.streak ?? 0 },
  { id: 'streak-365', icon: 'crown', target: 365, read: ({ profile }) => profile?.streak ?? 0 },
  { id: 'hearts-full', icon: 'heart', target: 5, read: ({ profile }) => profile?.hearts ?? 0 },
  { id: 'scheduler', icon: 'target', target: 1, read: ({ settings }) => (settings.schedule.enabled ? 1 : 0) },
];

export function computeAchievements(input: AchievementInput): Achievement[] {
  return SPECS.map((spec) => {
    const value = Math.max(0, spec.read(input));
    const progress = Math.min(1, value / spec.target);
    const key = camel(spec.id);
    return {
      id: spec.id,
      labelKey: `ach.${key}.label`,
      hintKey: `ach.${key}.hint`,
      icon: spec.icon,
      value,
      target: spec.target,
      progress,
      unlocked: value >= spec.target,
    };
  });
}

export function achievementSummary(list: Achievement[]): { unlocked: number; total: number; ratio: number } {
  const unlocked = list.filter((item) => item.unlocked).length;
  return { unlocked, total: list.length, ratio: list.length === 0 ? 0 : unlocked / list.length };
}
