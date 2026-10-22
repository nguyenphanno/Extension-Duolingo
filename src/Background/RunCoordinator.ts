// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * RunCoordinator.ts — owns the "only one run at a time" invariant.
 *
 * The engine does the work; this class wires it to persistence, notifications
 * and the UI stream, and makes sure a crashed run always leaves a coherent
 * state behind.
 */
import { AutomationEngine } from '@Core/Automation/AutomationEngine';
import { tokenProvider } from '@Core/Auth/TokenProvider';
import { GUARD } from '@Shared/Constants';
import { logger } from '@Shared/Logger';
import { AppError, err, ok, type Result } from '@Shared/Result';
import type { PacingState, RunSummary, RunTrigger, Settings, TaskKey } from '@Shared/Types';
import { averageXpPerSession, sizePlan } from '@Shared/Utils/PlanSize';
import type { AppContext } from './AppContext';
import { notificationService } from './NotificationService';

export class RunCoordinator {
  private engine: AutomationEngine | null = null;
  private readonly log = logger.scope('run');

  constructor(private readonly app: AppContext) {}

  get isRunning(): boolean {
    return this.engine !== null;
  }

  async start(trigger: RunTrigger = 'manual', only?: TaskKey[]): Promise<Result<RunSummary>> {
    if (this.engine) {
      return err(new AppError('UNKNOWN', 'A run is already in progress.'));
    }

    const loaded = await this.app.settings.load();
    const settings = await this.shapeForTrigger(trigger, loaded);

    // Cooldown: stop accidental double-clicks and rapid re-runs. Scheduled runs
    // are exempt because the alarm already spaces them out, and so are targeted
    // retries — the user is explicitly asking for one specific task.
    const cooldownMs = settings.behavior.cooldownSeconds * 1000;
    const lastFinished = this.app.lastSummary?.finishedAt ?? null;
    const targeted = Boolean(only && only.length > 0);
    const exempt = trigger === 'schedule' || trigger === 'guard' || targeted;
    if (!exempt && cooldownMs > 0 && lastFinished) {
      const remaining = cooldownMs - (Date.now() - lastFinished);
      if (remaining > 0) {
        return err(
          new AppError('RATE_LIMITED', `Cooling down — try again in ${Math.ceil(remaining / 1000)}s.`),
        );
      }
    }

    let token: string;
    try {
      token = await tokenProvider.resolve({
        source: settings.tokenSource,
        manualToken: settings.manualToken,
      });
    } catch (error) {
      return err(error);
    }

    const engine = new AutomationEngine({
      token,
      settings,
      trigger,
      only,
      todayXp: await this.todayXp(),
      hooks: {
        onState: (patch) => {
          const phaseChanged = patch.phase !== undefined && patch.phase !== this.app.run.phase;
          this.app.patchRun(patch);
          if (phaseChanged) {
            void notificationService.updateBadge(this.app.run, settings, this.app.profile?.streak ?? null);
            void this.app.pushState();
          }
        },
        onTaskDone: () => {
          void this.app.pushState();
        },
        onPacing: (pacing) => {
          this.app.setPacing(pacing);
          void this.app.pushState();
        },
      },
    });

    this.engine = engine;
    this.log.info(
      `Run started (${trigger}${targeted ? `, only ${only?.join('+')}` : ''}${settings.behavior.dryRun ? ', dry run' : ''})`,
    );

    try {
      const summary = await engine.run();
      this.app.lastSummary = summary;
      this.app.setPacing(engine.pacing);
      await this.app.history.append(summary);
      await notificationService.runFinished(summary, settings);
      await notificationService.updateBadge(this.app.run, settings, summary.after?.streak ?? null);
      this.log.success(
        `Run finished · +${summary.xpGained} XP · ${summary.rewardsClaimed} rewards · ${summary.gemsClaimed} gems`,
      );
      await this.app.pushState();
      return ok(summary);
    } catch (error) {
      const message = (error as Error).message;
      this.log.error(`Run failed: ${message}`);
      this.app.patchRun({
        phase: 'failed',
        finishedAt: Date.now(),
        error: message,
        currentLabel: 'Failed',
        currentTask: null,
      });
      await notificationService.updateBadge(this.app.run, settings, null);
      await this.app.pushState();
      return err(error);
    } finally {
      this.engine = null;
    }
  }

  /**
   * The streak guard is a rescue, not a run: one lesson, and stop the moment
   * the daily goal is met. Cloning the settings keeps the stored ones intact —
   * a guard must never quietly rewrite the user's configuration.
   *
   * Auto-size works the same way: it shapes a *copy* for this one run, so the
   * user's session count stays the ceiling it looks like in Options.
   */
  private async shapeForTrigger(trigger: RunTrigger, settings: Settings): Promise<Settings> {
    if (trigger === 'guard') {
      this.log.info(`Streak guard: one ${GUARD.sessions}-session rescue run.`);
      return {
        ...settings,
        practice: { ...settings.practice, sessions: GUARD.sessions, stopAtDailyGoal: true },
      };
    }

    if (!settings.practice.autoSize) return settings;

    const sized = sizePlan({
      goal: settings.practice.dailyXpGoal,
      earned: await this.todayXp(),
      cap: settings.practice.sessions,
      avgXpPerSession: averageXpPerSession(await this.app.history.list()),
    });

    if (!sized.sized) return settings;
    this.log.info(`Auto-size: ${sized.reason}`);
    return { ...settings, practice: { ...settings.practice, sessions: sized.sessions } };
  }

  /** XP already earned today, from our own run history. */
  private async todayXp(): Promise<number> {
    const stats = await this.app.history.stats();
    return stats.daily[stats.daily.length - 1]?.xp ?? 0;
  }

  cancel(): boolean {
    if (!this.engine) return false;
    this.engine.cancel();
    return true;
  }
}
