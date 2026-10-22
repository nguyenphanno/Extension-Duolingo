// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Presets.ts — one-click run shapes.
 *
 * Presets mutate a *draft* of the settings object; the caller persists it. They
 * intentionally only touch the fields that define the shape of a run, so a
 * user's schedule, theme and PRO choices survive.
 */
import type { Settings } from './Types';

export type PresetId = 'quick' | 'balanced' | 'max' | 'rewards';

export interface RunPreset {
  id: PresetId;
  label: string;
  hint: string;
  apply: (draft: Settings) => void;
}

export const RUN_PRESETS: RunPreset[] = [
  {
    id: 'quick',
    label: 'Quick',
    hint: '1 lesson · rewards · freeze',
    apply: (draft) => {
      draft.practice.enabled = true;
      draft.practice.sessions = 1;
      draft.practice.stopOnError = true;
      draft.rewards.enabled = true;
      draft.badges.enabled = false;
      draft.freeze.enabled = true;
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    hint: '5 lessons · rewards · badges',
    apply: (draft) => {
      draft.practice.enabled = true;
      draft.practice.sessions = 5;
      draft.practice.stopOnError = false;
      draft.practice.delayMinMs = 2000;
      draft.practice.delayMaxMs = 3500;
      draft.rewards.enabled = true;
      draft.badges.enabled = true;
      draft.freeze.enabled = true;
    },
  },
  {
    id: 'max',
    label: 'Max XP',
    hint: '10 lessons · tighter gaps',
    apply: (draft) => {
      draft.practice.enabled = true;
      draft.practice.sessions = 10;
      draft.practice.stopOnError = false;
      draft.practice.delayMinMs = 900;
      draft.practice.delayMaxMs = 1800;
      draft.rewards.enabled = true;
      draft.badges.enabled = true;
      draft.freeze.enabled = true;
    },
  },
  {
    id: 'rewards',
    label: 'Rewards only',
    hint: 'no lessons · claim + badges',
    apply: (draft) => {
      draft.practice.enabled = false;
      draft.practice.sessions = 0;
      draft.rewards.enabled = true;
      draft.badges.enabled = true;
      draft.freeze.enabled = false;
    },
  },
];

export function presetById(id: PresetId): RunPreset | undefined {
  return RUN_PRESETS.find((preset) => preset.id === id);
}
