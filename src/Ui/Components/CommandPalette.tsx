// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * CommandPalette.tsx — a command-palette launcher for every surface action.
 *
 * Deliberately dumb: it owns filtering, keyboard navigation and focus, but the
 * caller supplies the actions. That keeps it reusable across the options page,
 * the side panel and anything added later.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { cx } from '../Utils/Cx';
import { ChevronRightIcon, SearchIcon } from '../Icons/Icons';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon?: ReactNode;
  keywords?: string;
  /** Rendered on the right — e.g. a shortcut or current value. */
  trailing?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
  placeholder?: string;
  emptyLabel?: string;
}

function score(action: PaletteAction, query: string): number {
  if (!query) return 1;
  const needle = query.toLowerCase();
  const label = action.label.toLowerCase();

  if (label === needle) return 100;
  if (label.startsWith(needle)) return 80;
  if (label.includes(needle)) return 60;

  const haystack = `${label} ${action.hint ?? ''} ${action.keywords ?? ''} ${action.group}`.toLowerCase();
  if (haystack.includes(needle)) return 40;

  // Subsequence match, so "rnnow" still finds "Run now".
  let index = 0;
  for (const char of label) {
    if (char === needle[index]) index += 1;
    if (index === needle.length) return 20;
  }
  return 0;
}

export function CommandPalette({
  open,
  onClose,
  actions,
  placeholder = 'Search actions…',
  emptyLabel = 'Nothing matches that.',
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    return actions
      .map((action) => ({ action, rank: score(action, query) }))
      .filter((entry) => entry.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .map((entry) => entry.action);
  }, [actions, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>('.palette__item.is-active');
    node?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);

  if (!open) return null;

  const runAt = (index: number) => {
    const action = matches[index];
    if (!action) return;
    onClose();
    action.run();
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) {
      event.preventDefault();
      setCursor((value) => (matches.length === 0 ? 0 : (value + 1) % matches.length));
      return;
    }
    if (event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) {
      event.preventDefault();
      setCursor((value) => (matches.length === 0 ? 0 : (value - 1 + matches.length) % matches.length));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      runAt(cursor);
    }
  };

  let lastGroup = '';

  return (
    <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <button type="button" className="palette__scrim" aria-label="Close" onClick={onClose} />
      <div className="palette__panel" onKeyDown={onKeyDown}>
        <div className="palette__search">
          <span className="palette__search-icon" aria-hidden>
            <SearchIcon size={16} />
          </span>
          <input
            ref={inputRef}
            className="palette__input"
            value={query}
            placeholder={placeholder}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd className="palette__esc">esc</kbd>
        </div>

        <div className="palette__list" ref={listRef} role="listbox">
          {matches.length === 0 ? <div className="palette__empty">{emptyLabel}</div> : null}
          {matches.map((action, index) => {
            const showGroup = action.group !== lastGroup;
            lastGroup = action.group;
            return (
              <div key={action.id}>
                {showGroup ? <div className="palette__group">{action.group}</div> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === cursor}
                  className={cx('palette__item', index === cursor && 'is-active')}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => runAt(index)}
                >
                  <span className="palette__item-icon">{action.icon ?? <ChevronRightIcon size={15} />}</span>
                  <span className="palette__item-text">
                    <b>{action.label}</b>
                    {action.hint ? <em>{action.hint}</em> : null}
                  </span>
                  {action.trailing ? <span className="palette__item-trail">{action.trailing}</span> : null}
                </button>
              </div>
            );
          })}
        </div>

        <div className="palette__foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> run
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
