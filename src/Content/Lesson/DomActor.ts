// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * DomActor.ts — do the clicking and typing.
 *
 * Two things matter here beyond "make it work":
 *
 *  1. **It must look human.** React ignores a bare `element.click()` on some
 *     components and, more importantly, a machine that answers in 40ms is
 *     trivially detectable. So a tap is a full pointer sequence with a pause,
 *     and typing is per-character at a plausible speed.
 *
 *  2. **It must never throw into the page.** Every entry point swallows its own
 *     failures and reports a boolean, because this runs inside a lesson the user
 *     may be sitting in.
 */
import { AUTO_ANSWER } from '@Shared/Constants';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** React tracks its own copy of an input's value; this is the way past it. */
function setNativeValue(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (setter) setter.call(field, value);
  else field.value = value;
}

/**
 * Tap an element the way a pointer would: down, up, click.
 *
 * The individual events are dispatched *and* `click()` is called, because some
 * handlers listen on `pointerdown` while React's `onClick` listens for the
 * click event. A real pointer produces both, so this does too.
 */
export async function tap(element: HTMLElement): Promise<boolean> {
  try {
    if (!element.isConnected) return false;
    element.scrollIntoView({ block: 'center', inline: 'center' });

    const rect = element.getBoundingClientRect();
    const init: PointerEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
    };

    element.dispatchEvent(new PointerEvent('pointerdown', init));
    element.dispatchEvent(new MouseEvent('mousedown', { ...init, buttons: 1 }));
    await sleep(24);
    element.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    element.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));

    // Focus first: some Duolingo inputs only enable their handler on focus.
    if (typeof element.focus === 'function') element.focus({ preventScroll: true });
    element.click();
    return true;
  } catch {
    return false;
  }
}

/** Tap a list of elements in order, with a gap between each. */
export async function tapSequence(elements: HTMLElement[], gapMs = AUTO_ANSWER.tapGapMs): Promise<number> {
  let tapped = 0;
  for (const element of elements) {
    if (!(await tap(element))) break;
    tapped += 1;
    if (tapped < elements.length) await sleep(gapMs);
  }
  return tapped;
}

/**
 * Type into a field, one character at a time.
 *
 * Per-character rather than one assignment because that is what a keystroke
 * looks like to the page — and because some of Duolingo's inputs validate on
 * every `input` event, so a single paste of a long sentence can leave the
 * component in a state it would never reach from typing.
 */
export async function typeInto(
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  cps = AUTO_ANSWER.typeCps,
): Promise<boolean> {
  try {
    if (!field.isConnected) return false;

    field.focus({ preventScroll: true });
    setNativeValue(field, '');
    field.dispatchEvent(new Event('input', { bubbles: true }));

    const gap = Math.max(8, Math.round(1000 / Math.max(1, cps)));
    let buffer = '';

    for (const character of value) {
      buffer += character;
      setNativeValue(field, buffer);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(gap);
    }

    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

/** Find the first matching, enabled, visible button. */
export function findButton(selectors: readonly string[], within: ParentNode = document): HTMLElement | null {
  for (const selector of selectors) {
    const candidates = within.querySelectorAll<HTMLElement>(selector);
    for (const element of candidates) {
      if (element.isConnected && !(element as HTMLButtonElement).disabled) return element;
    }
  }
  return null;
}

/** Poll until `predicate` returns something truthy, or the timeout expires. */
export async function waitFor<T>(
  predicate: () => T | null,
  timeoutMs: number,
  intervalMs = 150,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() >= deadline) return null;
    await sleep(intervalMs);
  }
}

export { sleep };
