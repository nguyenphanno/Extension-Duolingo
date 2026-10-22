/**
 * TaskRegistry.ts — the ordered run plan.
 *
 * Order matters: practice first (it may consume hearts), then value-granting
 * actions, then safety nets. Anything disabled is filtered before the run.
 */
import type { Settings, TaskKey } from '@Shared/Types';
import type { AutomationTask } from './Task';
import { badgeTask } from './Tasks/BadgeTask';
import { boostTask } from './Tasks/BoostTask';
import { freezeTask } from './Tasks/FreezeTask';
import { practiceTask } from './Tasks/PracticeTask';
import { rewardsTask } from './Tasks/RewardsTask';
import { superTask } from './Tasks/SuperTask';

export const ALL_TASKS: AutomationTask[] = [
  practiceTask,
  rewardsTask,
  badgeTask,
  boostTask,
  superTask,
  freezeTask,
];

/**
 * Build the ordered run plan.
 *
 * `only` narrows the plan to an explicit subset — used by "retry failed tasks"
 * and by the per-task run button. A narrowed plan deliberately ignores
 * `isEnabled`, because the user is asking for that task specifically; it still
 * respects the task's own internal guards.
 */
export function planFor(settings: Settings, only?: TaskKey[]): AutomationTask[] {
  if (only && only.length > 0) {
    const wanted = new Set(only);
    return ALL_TASKS.filter((task) => wanted.has(task.key));
  }
  return ALL_TASKS.filter((task) => task.isEnabled(settings));
}

export function totalWeight(tasks: AutomationTask[]): number {
  return tasks.reduce((sum, task) => sum + task.weight, 0) || 1;
}
