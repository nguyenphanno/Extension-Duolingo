// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Pilot.ts — the loop that drives one lesson.
 *
 * It is intentionally the *only* stateful piece. Everything it depends on is a
 * pure function or a thin DOM wrapper, so this file reads as the policy:
 *
 *   look at the challenge → look up the answer → ask `planAnswer` → act
 *
 * The failure modes are all "do nothing":
 *   - no challenge on screen          → wait (interstitial, or lesson over)
 *   - challenge cannot be read        → wait
 *   - no answer known                 → wait, or Skip if the user allowed it
 *   - answer known but does not fit   → wait; never guess
 *
 * The one thing it will not do is guess. A skipped challenge costs one exercise
 * and is recoverable; a wrong answer costs a heart and, worse, teaches the
 * answer book nothing.
 */
import { AUTO_ANSWER } from '@Shared/Constants';
import type { AutoAnswerSettings } from '@Shared/Types';
import { planAnswer, type SolvePlan } from '@Shared/Utils/Answers';
import { AnswerBook } from '@Core/Storage/AnswerBook';
import { findButton, sleep, tap, tapSequence, typeInto, waitFor } from './DomActor';
import { BUTTONS, challengeSignature, readChallenge, readRevealedAnswer, type ChallengeHandles } from './DomReader';

export interface PilotStats {
  /** Challenges this pilot completed. */
  answered: number;
  /** Challenges given up on, for any reason. */
  skipped: number;
  /** Sentences learned by pressing Skip. */
  learned: number;
  /** Challenges where an answer was known but could not be applied. */
  misses: number;
  /** Why the last decision was "do nothing". */
  lastReason: string;
}

export interface PilotHooks {
  onStats(stats: PilotStats): void;
  onStatus(text: string): void;
}

const EMPTY_STATS: PilotStats = { answered: 0, skipped: 0, learned: 0, misses: 0, lastReason: 'starting' };

export class LessonPilot {
  private stats: PilotStats = { ...EMPTY_STATS };
  private observer: MutationObserver | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private kickTimer: ReturnType<typeof setTimeout> | null = null;

  /** Signature of the challenge we already acted on, so we act once per challenge. */
  private actedOn: string | null = null;
  private busy = false;
  private running = false;
  /** Set false after a Skip fails to reveal a readable answer — bounds the damage to one exercise. */
  private skipAllowed = true;
  private stalls = 0;

  constructor(
    private readonly readSettings: () => AutoAnswerSettings,
    private readonly book: AnswerBook,
    private readonly hooks: PilotHooks,
  ) {}

  /* ------------------------------ lifecycle ------------------------------ */

  start(): void {
    if (this.running) return;
    this.running = true;
    this.stats = { ...EMPTY_STATS };
    this.actedOn = null;
    this.skipAllowed = true;
    this.stalls = 0;
    this.report();

    // A lesson re-renders constantly, so mutations are debounced into one kick.
    this.observer = new MutationObserver(() => this.kick(220));
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-test', 'class', 'disabled'],
    });

    // Safety net: some transitions replace text without a structural mutation.
    this.interval = setInterval(() => this.kick(0), 1400);

    this.kick(400);
  }

  stop(): void {
    this.running = false;
    this.observer?.disconnect();
    this.observer = null;
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
    if (this.kickTimer !== null) clearTimeout(this.kickTimer);
    this.kickTimer = null;
    this.hooks.onStatus('off');
  }

  /** New answers arrived from the page. Fold them in and re-examine the screen. */
  absorb(pairs: Parameters<AnswerBook['absorb']>[0]): void {
    const added = this.book.absorb(pairs);
    if (added > 0) {
      this.hooks.onStatus(`${this.book.size} known`);
      // The answer for the challenge already on screen may have just arrived.
      this.kick(0);
    }
  }

  /** Called when a lesson page is left, so the next lesson starts clean. */
  reset(): void {
    this.actedOn = null;
    this.skipAllowed = true;
    this.stalls = 0;
    this.stats = { ...EMPTY_STATS };
    this.report();
  }

  /* -------------------------------- loop -------------------------------- */

  private kick(delayMs: number): void {
    if (!this.running) return;
    if (this.kickTimer !== null) return;
    this.kickTimer = setTimeout(() => {
      this.kickTimer = null;
      void this.run();
    }, delayMs);
  }

  private async run(): Promise<void> {
    if (this.busy || !this.running) return;
    const settings = this.readSettings();
    if (!settings.enabled) {
      this.hooks.onStatus('off');
      return;
    }

    this.busy = true;
    try {
      await this.step(settings);
    } catch {
      // A DOM we do not recognise is not an error worth surfacing in a lesson.
      this.hooks.onStatus('stalled');
    } finally {
      this.busy = false;
    }
  }

  private async step(settings: AutoAnswerSettings): Promise<void> {
    if (settings.maxPerLesson > 0 && this.stats.answered >= settings.maxPerLesson) {
      this.hooks.onStatus(`cap ${settings.maxPerLesson}`);
      return;
    }

    const handles = readChallenge();
    if (!handles) {
      this.stats.lastReason = 'no challenge';
      this.hooks.onStatus('waiting');
      return;
    }

    const signature = challengeSignature(handles);
    if (signature === this.actedOn) {
      // We already handled this one and the page has not moved on yet.
      this.hooks.onStatus('handled');
      return;
    }

    const answer = this.book.lookup(handles.view.prompt);
    const plan = planAnswer(handles.view, answer, { learnFromSkip: settings.learnFromSkip && this.skipAllowed });

    if (plan.action === 'idle') {
      this.stats.lastReason = plan.reason;
      this.hooks.onStatus(answer ? 'waiting' : 'no answer');
      this.report();
      return;
    }

    if (plan.action === 'skip' && plan.reason !== 'no-answer') {
      // A known answer that does not fit is a *bug in us*, not a reason to spend
      // an exercise. Leave it to the user and say so.
      this.stats.misses += 1;
      this.stats.lastReason = plan.reason;
      this.hooks.onStatus(`cannot apply (${plan.reason})`);
      this.actedOn = signature;
      this.report();
      return;
    }

    await sleep(settings.thinkMs);

    const changed = await this.act(handles, plan, settings);
    if (!changed) {
      this.stalls += 1;
      if (this.stalls >= AUTO_ANSWER.maxStalls) {
        this.hooks.onStatus('stalled');
        this.stop();
        return;
      }
    } else {
      this.stalls = 0;
    }

    this.actedOn = signature;
    this.report();
  }

  /** Execute a plan. Returns whether the page moved on afterwards. */
  private async act(handles: ChallengeHandles, plan: SolvePlan, settings: AutoAnswerSettings): Promise<boolean> {
    if (plan.action === 'click') {
      const elements = plan.indices.map((index) => handles.options[index]).filter(Boolean);
      if (elements.length !== plan.indices.length) {
        this.stats.misses += 1;
        this.hooks.onStatus('tile missing');
        return false;
      }

      const tapped = await tapSequence(elements);
      if (tapped !== elements.length) {
        this.stats.misses += 1;
        this.hooks.onStatus('tap failed');
        return false;
      }

      this.stats.answered += 1;
      this.hooks.onStatus(`answered ${this.stats.answered}`);
      return settings.autoSubmit ? this.submit() : true;
    }

    if (plan.action === 'type') {
      if (!handles.input) {
        this.stats.misses += 1;
        this.hooks.onStatus('no field');
        return false;
      }

      const typed = await typeInto(handles.input, plan.text);
      if (!typed) {
        this.stats.misses += 1;
        this.hooks.onStatus('typing failed');
        return false;
      }

      this.stats.answered += 1;
      this.hooks.onStatus(`answered ${this.stats.answered}`);
      return settings.autoSubmit ? this.submit() : true;
    }

    if (plan.action === 'skip') {
      return this.skipAndLearn(handles);
    }

    return false;
  }

  /**
   * Press Skip, read the answer Duolingo reveals, remember it.
   *
   * If the reveal cannot be read the exercise was spent for nothing, so skipping
   * is disabled for the rest of the lesson — one wasted exercise, not twenty.
   */
  private async skipAndLearn(handles: ChallengeHandles): Promise<boolean> {
    const skipButton = findButton([BUTTONS.skip]);
    if (!skipButton) {
      this.stats.lastReason = 'no skip button';
      this.hooks.onStatus('no skip button');
      return false;
    }

    await tap(skipButton);
    this.stats.skipped += 1;

    await sleep(AUTO_ANSWER.revealDelayMs);
    const revealed = await waitFor(() => readRevealedAnswer(handles.root), 2500, 120);

    if (revealed && this.book.remember(handles.view.prompt, revealed)) {
      this.stats.learned += 1;
      this.hooks.onStatus(`learned ${this.stats.learned}`);
    } else {
      this.skipAllowed = false;
      this.hooks.onStatus('reveal unreadable');
    }

    // Move past the reveal either way, otherwise the lesson is stuck.
    return this.submit();
  }

  /** Press Check / Continue and wait for the page to move on. */
  private async submit(): Promise<boolean> {
    const button = findButton([BUTTONS.next]);
    if (!button) return false;

    const before = this.actedOn;
    await tap(button);

    // Give the transition a moment; the signature check on the next tick is what
    // actually decides whether this worked.
    await waitFor(() => {
      const next = readChallenge();
      if (!next) return null;
      return challengeSignature(next) !== before ? next : null;
    }, AUTO_ANSWER.nextChallengeTimeoutMs);

    return true;
  }

  private report(): void {
    this.hooks.onStats({ ...this.stats });
  }
}
