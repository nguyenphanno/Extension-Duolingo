/**
 * Achievements.ts — milestones derived from history, never stored.
 *
 * Because every value is a pure function of `HistoryStats` + `Profile`, the
 * list is always consistent with what the user sees elsewhere, survives
 * history clearing, and needs no schema migration.
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
  label: string;
  hint: string;
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
  label: string;
  hint: string;
  icon: AchievementIcon;
  target: number;
  read: (input: AchievementInput) => number;
}

const SPECS: Spec[] = [
  {
    id: 'first-run',
    label: 'First steps',
    hint: 'Finish one run',
    icon: 'target',
    target: 1,
    read: ({ stats }) => stats.runs,
  },
  {
    id: 'runs-10',
    label: 'Getting regular',
    hint: 'Finish 10 runs',
    icon: 'bolt',
    target: 10,
    read: ({ stats }) => stats.runs,
  },
  {
    id: 'runs-50',
    label: 'Well oiled',
    hint: 'Finish 50 runs',
    icon: 'chart',
    target: 50,
    read: ({ stats }) => stats.runs,
  },
  {
    id: 'runs-200',
    label: 'Machine',
    hint: 'Finish 200 runs',
    icon: 'crown',
    target: 200,
    read: ({ stats }) => stats.runs,
  },
  {
    id: 'xp-1k',
    label: 'Warmed up',
    hint: 'Log 1,000 XP',
    icon: 'star',
    target: 1_000,
    read: ({ stats }) => stats.xp,
  },
  {
    id: 'xp-10k',
    label: 'Ten thousand',
    hint: 'Log 10,000 XP',
    icon: 'trophy',
    target: 10_000,
    read: ({ stats }) => stats.xp,
  },
  {
    id: 'xp-50k',
    label: 'Unstoppable',
    hint: 'Log 50,000 XP',
    icon: 'crown',
    target: 50_000,
    read: ({ stats }) => stats.xp,
  },
  {
    id: 'rewards-50',
    label: 'Collector',
    hint: 'Claim 50 rewards',
    icon: 'gem',
    target: 50,
    read: ({ stats }) => stats.rewards,
  },
  {
    id: 'gems-1k',
    label: 'Gem vault',
    hint: 'Bank 1,000 gems from runs',
    icon: 'gem',
    target: 1_000,
    read: ({ stats }) => stats.gems,
  },
  {
    id: 'clean-5',
    label: 'Spotless',
    hint: '5 clean runs in a row',
    icon: 'shield',
    target: 5,
    read: ({ stats }) => stats.currentStreakOfRuns,
  },
  {
    id: 'streak-7',
    label: 'One week',
    hint: 'Reach a 7-day streak',
    icon: 'flame',
    target: 7,
    read: ({ profile }) => profile?.streak ?? 0,
  },
  {
    id: 'streak-30',
    label: 'One month',
    hint: 'Reach a 30-day streak',
    icon: 'flame',
    target: 30,
    read: ({ profile }) => profile?.streak ?? 0,
  },
  {
    id: 'streak-100',
    label: 'Century',
    hint: 'Reach a 100-day streak',
    icon: 'flame',
    target: 100,
    read: ({ profile }) => profile?.streak ?? 0,
  },
  {
    id: 'streak-365',
    label: 'Full year',
    hint: 'Reach a 365-day streak',
    icon: 'crown',
    target: 365,
    read: ({ profile }) => profile?.streak ?? 0,
  },
  {
    id: 'hearts-full',
    label: 'Full hearts',
    hint: 'Keep all 5 hearts',
    icon: 'heart',
    target: 5,
    read: ({ profile }) => profile?.hearts ?? 0,
  },
  {
    id: 'scheduler',
    label: 'Set and forget',
    hint: 'Turn on scheduled runs',
    icon: 'target',
    target: 1,
    read: ({ settings }) => (settings.schedule.enabled ? 1 : 0),
  },
];

export function computeAchievements(input: AchievementInput): Achievement[] {
  return SPECS.map((spec) => {
    const value = Math.max(0, spec.read(input));
    const progress = Math.min(1, value / spec.target);
    return {
      id: spec.id,
      label: spec.label,
      hint: spec.hint,
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
