// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * DomReader.ts — turn whatever is on screen into a `ChallengeView`.
 *
 * Duolingo hashes its class names on every deploy, so nothing here selects on a
 * class. Everything goes through `data-test`, which is stable because their own
 * end-to-end tests depend on it — that is the same insight the original Selenium
 * script was built on, and it is the reason this is worth attempting at all.
 *
 * Every selector is tried in a list and the first hit wins, because the same
 * challenge type is rendered slightly differently in a lesson, a story and a
 * practice session. When nothing matches, the reader returns `null` and the
 * pilot does nothing — a challenge we cannot read is a challenge we do not
 * touch.
 */
import type { ChallengeKind, ChallengeView } from '@Shared/Utils/Answers';

/** `data-test` on the challenge root is `"challenge challenge-<kind>"`. */
const CHALLENGE_TOKEN = /(^|\s)challenge(\s|$)/;

/**
 * Map the `challenge-*` token onto our vocabulary.
 *
 * Anything absent from this map is a type we deliberately do not drive:
 * listening, speaking, character puzzles and syllable taps all need audio or
 * drag, and a wrong answer there costs a heart.
 */
const KIND_BY_TOKEN: Record<string, ChallengeKind> = {
  'challenge-translate': 'translate',
  'challenge-reverse-translate': 'reverseTranslate',
  'challenge-name': 'name',
  'challenge-select': 'select',
  'challenge-judge': 'judge',
  'challenge-form': 'form',
  'challenge-gap-fill': 'gapFill',
  'challenge-tap-cloze': 'gapFill',
  'challenge-type-cloze': 'gapFill',
  'challenge-tap-complete': 'tapComplete',
  'challenge-dialogue': 'dialogue',
  'challenge-read-comprehension': 'readComprehension',
  'challenge-match': 'match',
};

/** Where the sentence being asked about might live, best first. */
const PROMPT_SELECTORS = [
  '[data-test="challenge-translate-prompt"]',
  '[data-test="challenge-sentence"]',
  '[data-test="challenge-prompt"]',
  '[data-test="stories-prompt"]',
  '[data-test="stories-phrase"]',
  'h1',
];

/** Tiles you tap to build a sentence, in tray order. */
const TOKEN_SELECTORS = ['[data-test="challenge-tap-token"]', '[data-test="challenge-token"]'];

/** Whole options you pick one of. */
const OPTION_SELECTORS = [
  '[data-test="challenge-choice"]',
  '[data-test="challenge-judge-option"]',
  '[data-test="challenge-form-option"]',
  '[data-test="challenge-select-option"]',
];

const TEXTAREA_SELECTORS = ['textarea[data-test="challenge-translate-input"]', '[data-test="challenge-translate-input"]'];
const INPUT_SELECTORS = ['input[data-test="challenge-text-input"]', '[data-test="challenge-text-input"]'];

/** Buttons, by the stable test id rather than by their translated label. */
export const BUTTONS = {
  next: '[data-test="player-next"]',
  skip: '[data-test="player-skip"]',
} as const;

export interface ChallengeHandles {
  view: ChallengeView;
  root: HTMLElement;
  /** Elements to click for `plan.action === 'click'`, in the same order as `view.options`. */
  options: HTMLElement[];
  /** Where to type, when `view.input !== 'none'`. */
  input: HTMLInputElement | HTMLTextAreaElement | null;
}

/** Is this element actually on screen and interactive? */
function visible(element: Element | null): boolean {
  if (!element) return false;
  const node = element as HTMLElement;
  if (!node.isConnected) return false;
  const rect = node.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  const style = getComputedStyle(node);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}

function text(element: Element | null): string {
  if (!element) return '';
  // `innerText` respects line breaks and hidden nodes; `textContent` does not.
  const raw = (element as HTMLElement).innerText ?? element.textContent ?? '';
  return raw.replace(/\s+/g, ' ').trim();
}

function firstMatch(selectors: readonly string[], within: ParentNode): HTMLElement | null {
  for (const selector of selectors) {
    const found = within.querySelector<HTMLElement>(selector);
    if (visible(found)) return found;
  }
  return null;
}

/**
 * Find the challenge root currently on screen.
 *
 * The root is the element whose `data-test` contains a bare `challenge` token.
 * Document order is outermost-first, so the first hit is the container and not
 * one of its children.
 */
export function findChallengeRoot(doc: Document = document): HTMLElement | null {
  const candidates = doc.querySelectorAll<HTMLElement>('[data-test]');
  for (const element of candidates) {
    const value = element.dataset.test ?? '';
    if (CHALLENGE_TOKEN.test(value) && visible(element)) return element;
  }
  return null;
}

function readKind(root: HTMLElement): ChallengeKind {
  const tokens = (root.dataset.test ?? '').split(/\s+/);
  for (const token of tokens) {
    const kind = KIND_BY_TOKEN[token];
    if (kind) return kind;
  }
  return 'unknown';
}

/**
 * Read the sentence being asked about.
 *
 * The `data-test` prompt nodes are authoritative. The `h1` fallback is for
 * challenge types that render their question as a heading, and it is filtered
 * so a heading that is really one of the options cannot be mistaken for the
 * prompt — that would key the answer book on the answer.
 */
function readPrompt(root: HTMLElement, optionNodes: HTMLElement[]): string {
  const direct = firstMatch(PROMPT_SELECTORS, root);
  if (direct) {
    const value = text(direct);
    if (value.length > 0) return value;
  }

  const headings = root.querySelectorAll<HTMLElement>('h1, h2, [data-test="challenge-header"] + *');
  for (const heading of headings) {
    if (!visible(heading)) continue;
    if (optionNodes.some((option) => option.contains(heading) || heading.contains(option))) continue;
    const value = text(heading);
    if (value.length > 0) return value;
  }

  return '';
}

function readOptions(root: HTMLElement): { nodes: HTMLElement[]; texts: string[] } {
  for (const selector of [...TOKEN_SELECTORS, ...OPTION_SELECTORS]) {
    const found = [...root.querySelectorAll<HTMLElement>(selector)].filter(visible);
    if (found.length === 0) continue;

    // A token's label is in a child with its own test id; a whole-option card
    // carries its text directly. Both end up as plain strings here.
    const texts = found.map((element) => {
      const label = element.querySelector<HTMLElement>('[data-test="challenge-tap-token-text"]');
      return text(label ?? element);
    });

    if (texts.every((value) => value.length > 0)) return { nodes: found, texts };
  }

  return { nodes: [], texts: [] };
}

function readInput(root: HTMLElement): { input: HTMLInputElement | HTMLTextAreaElement | null; kind: 'none' | 'text' | 'textarea' } {
  for (const selector of TEXTAREA_SELECTORS) {
    const found = root.querySelector<HTMLTextAreaElement>(selector);
    if (visible(found)) return { input: found, kind: 'textarea' };
  }
  for (const selector of INPUT_SELECTORS) {
    const found = root.querySelector<HTMLInputElement>(selector);
    if (visible(found)) return { input: found, kind: 'text' };
  }

  // Last resort: any text field inside the challenge that is not a hidden
  // helper. Scoped to the root, so it cannot pick up the page search box.
  const loose = root.querySelector<HTMLTextAreaElement>('textarea');
  if (visible(loose)) return { input: loose, kind: 'textarea' };

  return { input: null, kind: 'none' };
}

/** Read the whole challenge, or `null` if it cannot be read with confidence. */
export function readChallenge(doc: Document = document): ChallengeHandles | null {
  const root = findChallengeRoot(doc);
  if (!root) return null;

  const kind = readKind(root);
  const { nodes, texts } = readOptions(root);
  const { input, kind: inputKind } = readInput(root);
  const prompt = readPrompt(root, nodes);

  if (prompt.length === 0) return null;

  return { view: { kind, prompt, options: texts, input: inputKind }, root, options: nodes, input };
}

/**
 * A stable identity for "the challenge on screen right now".
 *
 * The pilot uses this to notice that the page moved on. Prompt plus options is
 * enough: two different challenges never share both, and the same challenge
 * re-rendered keeps the same signature.
 */
export function challengeSignature(handles: ChallengeHandles): string {
  return `${handles.view.kind}|${handles.view.prompt}|${handles.view.options.join('|')}`;
}

/** The revealed answer after a Skip, if Duolingo is showing one. */
const REVEAL_SELECTORS = [
  '[data-test="challenge-solution"]',
  '[data-test="blame-bubble"] [data-test="blame-correct"]',
  '[data-test="correct-answer"]',
  '[data-test="solution"]',
];

export function readRevealedAnswer(root: HTMLElement): string | null {
  const found = firstMatch(REVEAL_SELECTORS, root);
  const value = text(found);
  return value.length > 0 ? value : null;
}

export { visible as isVisible, text as readText };
