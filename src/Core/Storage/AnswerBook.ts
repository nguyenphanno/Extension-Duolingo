// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * AnswerBook.ts — the memory of "we have seen this sentence before".
 *
 * Deliberately dumb: a flat map from normalised prompt to the solution text, in
 * `chrome.storage.local` under its own key so a settings reset does not wipe it
 * and an answer-book wipe does not touch settings. It is the only thing that
 * makes skip-and-learn worth doing — the first time a sentence costs an
 * exercise, every time after it is free.
 *
 * Everything here is best-effort. If storage is unavailable the book simply
 * lives in memory for the tab, which is still better than nothing.
 *
 * Lives in `Core/Storage` rather than next to the pilot because the Options
 * page needs the count and the clear button, and two readers of one key should
 * share one parser.
 */
import { ANSWER_BOOK_LIMIT, STORAGE_KEYS } from '@Shared/Constants';
import type { KnownAnswer } from '@Shared/Utils/Answers';
import { normaliseText, toAnswerBook, type ExtractedAnswer } from '@Shared/Utils/Answers';

interface StoredEntry {
  text: string;
  alternatives: string[];
  /** When it was learned, so pruning drops the least useful first. */
  at: number;
}

export interface StoredBook {
  version: 1;
  entries: Record<string, StoredEntry>;
}

export interface AnswerBookStats {
  count: number;
  /** Newest sentences first, for the Options preview. */
  recent: Array<{ prompt: string; text: string }>;
}

export class AnswerBook {
  private entries = new Map<string, StoredEntry>();
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /** Number of remembered sentences. */
  get size(): number {
    return this.entries.size;
  }

  async load(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEYS.answers);
      const raw = stored?.[STORAGE_KEYS.answers] as StoredBook | undefined;
      if (!raw || raw.version !== 1 || typeof raw.entries !== 'object' || raw.entries === null) return;

      for (const [key, entry] of Object.entries(raw.entries)) {
        if (typeof key !== 'string' || key.length === 0) continue;
        if (!entry || typeof entry.text !== 'string' || entry.text.length === 0) continue;
        this.entries.set(key, {
          text: entry.text,
          alternatives: Array.isArray(entry.alternatives) ? entry.alternatives.filter((item) => typeof item === 'string') : [],
          at: typeof entry.at === 'number' ? entry.at : 0,
        });
      }
    } catch {
      /* storage is optional; memory still works */
    }
  }

  /**
   * Fold a freshly captured payload in. Existing entries keep their text and
   * only gain alternatives, so a later, differently-worded payload cannot
   * overwrite a solution that already worked.
   */
  absorb(pairs: ExtractedAnswer[]): number {
    const incoming = toAnswerBook(pairs);
    let added = 0;

    for (const [key, answer] of incoming) {
      const existing = this.entries.get(key);
      if (existing) {
        for (const candidate of [answer.text, ...answer.alternatives]) {
          if (candidate !== existing.text && !existing.alternatives.includes(candidate)) {
            existing.alternatives.push(candidate);
            this.dirty = true;
          }
        }
        continue;
      }

      this.entries.set(key, { text: answer.text, alternatives: answer.alternatives, at: Date.now() });
      added += 1;
      this.dirty = true;
    }

    if (added > 0) this.prune();
    if (this.dirty) this.scheduleFlush();
    return added;
  }

  /** Remember one answer we learned the hard way. */
  remember(prompt: string, text: string): boolean {
    const key = normaliseText(prompt);
    const value = text.trim();
    if (key.length === 0 || value.length === 0) return false;
    if (this.entries.has(key)) return false;

    this.entries.set(key, { text: value, alternatives: [], at: Date.now() });
    this.dirty = true;
    this.prune();
    this.scheduleFlush();
    return true;
  }

  lookup(prompt: string): KnownAnswer | null {
    const key = normaliseText(prompt);
    if (key.length === 0) return null;
    const entry = this.entries.get(key);
    return entry ? { text: entry.text, alternatives: entry.alternatives } : null;
  }

  async clear(): Promise<void> {
    this.entries.clear();
    this.dirty = false;
    try {
      await chrome.storage.local.remove(STORAGE_KEYS.answers);
    } catch {
      /* ignore */
    }
  }

  /** What the Options page shows: how much is remembered, and the newest few. */
  stats(limit = 4): AnswerBookStats {
    const ordered = [...this.entries.entries()].sort((a, b) => b[1].at - a[1].at);
    return {
      count: this.entries.size,
      recent: ordered.slice(0, limit).map(([prompt, entry]) => ({ prompt, text: entry.text })),
    };
  }

  /** Keep the newest `ANSWER_BOOK_LIMIT` entries. */
  private prune(): void {
    if (this.entries.size <= ANSWER_BOOK_LIMIT) return;

    const ordered = [...this.entries.entries()].sort((a, b) => a[1].at - b[1].at);
    const excess = this.entries.size - ANSWER_BOOK_LIMIT;
    for (let index = 0; index < excess; index += 1) {
      this.entries.delete(ordered[index][0]);
    }
  }

  /**
   * Coalesce writes. A lesson can deliver several payloads in a row, and each
   * `storage.local.set` is an IPC round trip.
   */
  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 1500);
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;

    const payload: StoredBook = { version: 1, entries: Object.fromEntries(this.entries) };
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.answers]: payload });
    } catch {
      this.dirty = true; // try again on the next change
    }
  }
}
