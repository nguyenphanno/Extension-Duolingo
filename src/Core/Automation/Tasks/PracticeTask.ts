/**
 * PracticeTask.ts — opens and closes N practice sessions.
 *
 * Each session gets a random lesson length, a short "reading" pause between
 * opening and submitting, and a jittered gap before the next one. The jitter
 * is not cosmetic: evenly spaced writes are the easiest pattern to flag.
 */
import type { SessionResult, TaskOutcome } from '@Shared/Types';
import { randomBetween, randomInt } from '@Shared/Utils/Time';
import { outcome, skip, type AutomationTask, type TaskContext } from '../Task';

const LABEL = 'Practice sessions';

export const practiceTask: AutomationTask = {
  key: 'practice',
  label: 'Practice sessions',
  weight: 6,

  isEnabled: (settings) => settings.practice.enabled && settings.practice.sessions > 0,

  async run(ctx: TaskContext): Promise<TaskOutcome> {
    const startedAt = Date.now();
    const { practice } = ctx.settings;
    if (!practice.enabled) return skip('practice', LABEL, 'Disabled in settings.', startedAt);
    if (practice.sessions <= 0) return skip('practice', LABEL, 'Session count is 0.', startedAt);
    if (ctx.dryRun) {
      return skip('practice', LABEL, `Dry run — would complete ${practice.sessions} sessions.`, startedAt);
    }

    const sessions: SessionResult[] = [];
    let totalXp = 0;
    const budget = Math.max(0, practice.xpBudget);
    let budgetHit = false;

    for (let index = 1; index <= practice.sessions; index += 1) {
      ctx.signal.throwIfAborted();

      if (budget > 0 && totalXp >= budget) {
        budgetHit = true;
        ctx.log.info(`XP budget reached (${totalXp}/${budget}) — stopping early.`);
        break;
      }

      ctx.report((index - 1) / practice.sessions, `Session ${index}/${practice.sessions}`);

      const durationSec = randomInt(practice.minDurationSec, practice.maxDurationSec);
      try {
        const session = await ctx.api.startPractice(ctx.profile.fromLanguage, ctx.profile.learningLanguage);
        const sessionId = String(session.id ?? '');
        ctx.log.info(`Session ${index} opened`, { sessionId, durationSec });

        await ctx.wait(randomBetween(2500, 4500));
        const completed = await ctx.api.completePractice(session, {
          durationSec,
          heartsLeft: practice.heartsLeft,
        });

        totalXp += completed.xpGain;
        sessions.push({ index, sessionId, xp: completed.xpGain, durationMs: durationSec * 1000, ok: true });
        ctx.log.success(`Session ${index} completed (+${completed.xpGain} XP)`);
        ctx.report(index / practice.sessions, `Session ${index}/${practice.sessions}`);
      } catch (error) {
        if (ctx.signal.aborted) throw error;
        const message = (error as Error).message;
        sessions.push({ index, sessionId: '', xp: 0, durationMs: 0, ok: false, error: message });
        ctx.log.warn(`Session ${index} failed: ${message}`);
        if (practice.stopOnError) break;
      }

      if (index < practice.sessions) {
        await ctx.wait(randomBetween(practice.delayMinMs, practice.delayMaxMs));
      }
    }

    const okCount = sessions.filter((session) => session.ok).length;
    const failed = sessions.length - okCount;
    const details: string[] = [];
    if (failed > 0) details.push(`${failed} session(s) failed.`);
    if (budgetHit) details.push(`Stopped at the ${budget} XP budget.`);

    return outcome(
      'practice',
      LABEL,
      okCount > 0 ? 'done' : 'failed',
      `${okCount}/${practice.sessions} sessions · +${totalXp} XP`,
      {
        detail: details.length ? details.join(' ') : undefined,
        metrics: { xp: totalXp, sessions: okCount, failed },
        startedAt,
      },
    );
  },
};
