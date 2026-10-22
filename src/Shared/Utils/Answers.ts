// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * Answers.ts — the decision layer for auto-answering a lesson challenge.
 *
 * Deliberately DOM-free and dependency-free: everything here is a pure function
 * of (what the page shows, what we know the answer to be). The content script
 * only does two things around it — read the DOM into a `ChallengeView`, and
 * execute the returned `SolvePlan`. That split is what makes the interesting
 * half testable, because a wrong click in a lesson costs real XP.
 *
 * The guiding rule is **fail closed**. Every function here would rather return
 * `skip`/`idle` than guess. A missed answer costs nothing; a wrong one loses a
 * heart and, worse, looks like it worked.
 *
 * Where the answers come from
 * ---------------------------
 * Two sources, in order:
 *   1. The lesson payload (`challenges[].correctSolutions`), captured by a
 *      MAIN-world fetch hook. Free — no exercise is spent.
 *   2. Skip-and-learn: press Skip, read the answer Duolingo reveals, remember it
 *      keyed by the prompt. Costs one exercise per *new* sentence, then never
 *      again. This is what the original Selenium script did, and it stays as an
 *      explicit opt-in fallback because it is the only path that cannot desync
 *      from what is actually on screen.
 */

/* ------------------------------------------------------------------ *
 * Challenge vocabulary
 * ------------------------------------------------------------------ */

/**
 * The subset of Duolingo challenge types worth driving. Taken from the
 * `data-test="challenge challenge-<kind>"` attribute, which is far more stable
 * than the hashed class names.
 */
export type ChallengeKind =
  | 'translate'
  | 'reverseTranslate'
  | 'name'
  | 'select'
  | 'judge'
  | 'form'
  | 'gapFill'
  | 'tapComplete'
  | 'dialogue'
  | 'readComprehension'
  | 'match'
  | 'unknown';

/** Types where exactly one option is correct, and the answer is that option's text. */
const SINGLE_CHOICE: ReadonlySet<ChallengeKind> = new Set<ChallengeKind>([
  'select',
  'judge',
  'form',
  'gapFill',
  'dialogue',
  'readComprehension',
]);

/** Types where the answer is assembled by clicking tokens in order. */
const TOKEN_BUILD: ReadonlySet<ChallengeKind> = new Set<ChallengeKind>([
  'translate',
  'reverseTranslate',
  'tapComplete',
]);

export interface ChallengeView {
  kind: ChallengeKind;
  /** The text the challenge asks about — the cache key, and what the user reads. */
  prompt: string;
  /** Text of each clickable option, in DOM order. */
  options: string[];
  /** Where an answer would be typed, if anywhere. */
  input: 'none' | 'text' | 'textarea';
}

export interface KnownAnswer {
  /** The canonical solution, as Duolingo reports it. */
  text: string;
  /** Other accepted solutions. Any one of them is enough to act on. */
  alternatives: string[];
}

/* ------------------------------------------------------------------ *
 * Text normalisation
 * ------------------------------------------------------------------ */

/**
 * Fold a string down to something comparable.
 *
 * Two things matter here and both come from real lessons:
 *  - Duolingo mixes typographic quotes (`’`) with ASCII (`'`), so a naive
 *    compare misses "l'homme" against "l’homme".
 *  - Punctuation is shown differently in the prompt and in the solution
 *    ("¿Cómo estás?" vs "Cómo estás"), so it must not participate in matching.
 *
 * Accents are *kept*. Stripping them would let "esta" match "está", which is a
 * different word.
 */
export function normaliseText(raw: string): string {
  return raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\p{L}\p{N}'\-\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stable cache key for "the same question asked again". */
export function answerKey(kind: ChallengeKind, prompt: string): string {
  return `${kind}:${normaliseText(prompt)}`;
}

/** Split a normalised sentence into the tokens a learner would tap. */
export function tokenise(text: string): string[] {
  const normalised = normaliseText(text);
  return normalised.length === 0 ? [] : normalised.split(' ');
}

/* ------------------------------------------------------------------ *
 * Matching
 * ------------------------------------------------------------------ */

/** How many answer words a single tile may stand for ("n'est ce pas" as one). */
const MAX_ANSWER_SPAN = 4;
/** How many tiles may be needed to spell one answer word (elision: "j'" + "ai"). */
const MAX_TILE_PIECES = 3;
/** Ceiling on recursion, so a pathological tray degrades to "no match", not a hang. */
const SEARCH_BUDGET = 20_000;

/**
 * Map an answer sentence onto the tiles actually offered.
 *
 * Longest-span-first is the point. Splitting on spaces — what the Selenium
 * script did — breaks on any tile that is itself multi-word ("n'est-ce pas",
 * "du", "à la"), and it carried a visible workaround for the *opposite* case
 * too: an `apostrophe_counter` that toggled between "j'ai" and "j' ai" on
 * alternate attempts, hoping one of them matched.
 *
 * Both directions are real, so both are searched:
 *   - one tile, several words   → "n est ce pas" offered as a single tile
 *   - several tiles, one word   → "j'ai" offered as "j'" + "ai"
 *
 * The search backtracks rather than running greedy, because a greedy pass that
 * spends a tile early can strand a later word even though a valid assignment
 * exists. `SEARCH_BUDGET` bounds the worst case; when it runs out, or no
 * assignment exists, this returns null and the caller fails closed rather than
 * clicking.
 *
 * @returns indices into `options`, in the order they should be clicked.
 */
export function matchTokens(answer: string, options: string[]): number[] | null {
  const wanted = tokenise(answer);
  if (wanted.length === 0) return null;

  const pool = options.map(normaliseText);
  const used = new Array<boolean>(pool.length).fill(false);
  const clicks: number[] = [];
  let budget = SEARCH_BUDGET;

  /** Try to cover `wanted[at..]` using unused tiles. Mutates `clicks`/`used`. */
  const solve = (at: number): boolean => {
    if (at >= wanted.length) return true;
    if (budget <= 0) return false;
    budget -= 1;

    // (a) A tile that is itself several answer words.
    for (let span = Math.min(MAX_ANSWER_SPAN, wanted.length - at); span >= 1; span -= 1) {
      const candidate = wanted.slice(at, at + span).join(' ');
      for (let index = 0; index < pool.length; index += 1) {
        if (used[index] || pool[index] !== candidate) continue;

        used[index] = true;
        clicks.push(index);
        if (solve(at + span)) return true;
        clicks.pop();
        used[index] = false;
      }
    }

    // (b) Several tiles that together spell one answer word. Compared both with
    // and without the separator, because "j'ai" is offered as "j'" + "ai".
    const spare: number[] = [];
    for (let index = 0; index < pool.length; index += 1) {
      if (!used[index]) spare.push(index);
    }

    for (let take = 2; take <= Math.min(MAX_TILE_PIECES, spare.length); take += 1) {
      const combo = new Array<number>(take);

      const assemble = (depth: number, from: number): boolean => {
        if (budget <= 0) return false;
        budget -= 1;

        if (depth === take) {
          const pieces = combo.map((index) => pool[index]);
          if (pieces.join('') !== wanted[at] && pieces.join(' ') !== wanted[at]) return false;

          for (const index of combo) used[index] = true;
          clicks.push(...combo);
          if (solve(at + 1)) return true;
          clicks.length -= take;
          for (const index of combo) used[index] = false;
          return false;
        }

        for (let cursor = from; cursor < spare.length; cursor += 1) {
          combo[depth] = spare[cursor];
          if (assemble(depth + 1, cursor + 1)) return true;
        }
        return false;
      };

      if (assemble(0, 0)) return true;
    }

    return false;
  };

  return solve(0) ? clicks : null;
}

/**
 * Find the single option that is the answer.
 *
 * Returns null when zero options match *and* when more than one does. The second
 * case is the dangerous one: two options that normalise to the same string are
 * indistinguishable, and picking either is a coin flip.
 */
export function pickChoice(answer: string, options: string[]): number | null {
  const target = normaliseText(answer);
  if (target.length === 0) return null;

  const hits: number[] = [];
  options.forEach((option, index) => {
    if (normaliseText(option) === target) hits.push(index);
  });

  return hits.length === 1 ? hits[0] : null;
}

/* ------------------------------------------------------------------ *
 * Planning
 * ------------------------------------------------------------------ */

export type SkipReason = 'no-answer' | 'no-match' | 'ambiguous' | 'unsupported';

export type SolvePlan =
  | { action: 'click'; indices: number[] }
  | { action: 'type'; text: string }
  | { action: 'skip'; reason: SkipReason }
  | { action: 'idle'; reason: string };

export interface PlanOptions {
  /**
   * Whether a dead end may spend an exercise on Skip to learn the answer.
   * Off unless the user turned it on: skipping is a real cost.
   */
  learnFromSkip: boolean;
}

/**
 * Decide what to do with the challenge on screen.
 *
 * Order matters: typed input wins over options, because a `translate` challenge
 * can render either as tap tokens or as a textarea depending on the sentence.
 */
export function planAnswer(
  view: ChallengeView,
  answer: KnownAnswer | null,
  options: PlanOptions = { learnFromSkip: false },
): SolvePlan {
  if (!answer) {
    return options.learnFromSkip ? { action: 'skip', reason: 'no-answer' } : { action: 'idle', reason: 'no-answer' };
  }

  if (view.input !== 'none') {
    const text = answer.text.trim();
    return text.length > 0 ? { action: 'type', text } : { action: 'skip', reason: 'no-match' };
  }

  if (view.options.length === 0) return { action: 'skip', reason: 'unsupported' };

  // "Match the pairs" needs the pairing, which the DOM does not expose in a
  // usable order. Refusing beats clicking semi-randomly.
  if (view.kind === 'match') return { action: 'skip', reason: 'unsupported' };

  if (SINGLE_CHOICE.has(view.kind)) {
    const index = pickChoice(answer.text, view.options);
    if (index !== null) return { action: 'click', indices: [index] };
    return { action: 'skip', reason: 'ambiguous' };
  }

  if (TOKEN_BUILD.has(view.kind)) {
    const indices = matchTokens(answer.text, view.options);
    if (indices) return { action: 'click', indices };
    return { action: 'skip', reason: 'no-match' };
  }

  return { action: 'skip', reason: 'unsupported' };
}

/* ------------------------------------------------------------------ *
 * Reading answers out of a lesson payload
 * ------------------------------------------------------------------ */

export interface ExtractedAnswer {
  prompt: string;
  solutions: string[];
}

const PROMPT_FIELDS = ['prompt', 'sentence', 'sourceSentence', 'challengeHeader', 'displayPrompt'] as const;

/**
 * Pull every question/answer pair out of whatever the lesson endpoint returned.
 *
 * Intentionally shape-agnostic. The endpoint's exact schema is not part of any
 * contract we control, and it changes; so instead of hard-coding a path we walk
 * the payload looking for the two things that identify a solvable challenge —
 * a list of correct solutions and a prompt to key it by. Anything that does not
 * match is ignored, which means a schema change degrades to "no answers" rather
 * than to wrong answers.
 *
 * `limit` bounds the walk: lesson payloads are large and deeply nested.
 */
export function extractAnswers(payload: unknown, limit = 4000): ExtractedAnswer[] {
  const found: ExtractedAnswer[] = [];
  const seen = new Set<string>();
  let visited = 0;

  const walk = (node: unknown): void => {
    if (visited >= limit) return;
    if (node === null || typeof node !== 'object') return;
    visited += 1;

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    const record = node as Record<string, unknown>;
    const solutions = readSolutions(record);
    const prompt = readPrompt(record);

    if (solutions.length > 0 && prompt !== null) {
      const key = normaliseText(prompt);
      if (key.length > 0 && !seen.has(key)) {
        seen.add(key);
        found.push({ prompt, solutions });
      }
    }

    for (const value of Object.values(record)) {
      if (value !== null && typeof value === 'object') walk(value);
    }
  };

  walk(payload);
  return found;
}

function readSolutions(record: Record<string, unknown>): string[] {
  const many = record['correctSolutions'];
  if (Array.isArray(many)) {
    return many.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  const one = record['correctSolution'];
  if (typeof one === 'string' && one.trim().length > 0) return [one];

  return [];
}

function readPrompt(record: Record<string, unknown>): string | null {
  for (const field of PROMPT_FIELDS) {
    const value = record[field];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
}

/** Fold extracted pairs into the lookup shape the solver wants. */
export function toAnswerBook(pairs: ExtractedAnswer[]): Map<string, KnownAnswer> {
  const book = new Map<string, KnownAnswer>();
  for (const pair of pairs) {
    const key = normaliseText(pair.prompt);
    if (key.length === 0) continue;

    const existing = book.get(key);
    if (existing) {
      for (const solution of pair.solutions) {
        if (solution !== existing.text && !existing.alternatives.includes(solution)) {
          existing.alternatives.push(solution);
        }
      }
      continue;
    }

    book.set(key, { text: pair.solutions[0], alternatives: pair.solutions.slice(1) });
  }
  return book;
}

/**
 * Look an answer up by the prompt the *page* is showing.
 *
 * The lookup key is the normalised visible prompt, not an id, because the DOM
 * and the payload are the only two places the question exists and the text is
 * what they share. When they disagree the lookup simply misses — fail closed.
 */
export function lookupAnswer(book: Map<string, KnownAnswer>, prompt: string): KnownAnswer | null {
  const key = normaliseText(prompt);
  if (key.length === 0) return null;
  return book.get(key) ?? null;
}
