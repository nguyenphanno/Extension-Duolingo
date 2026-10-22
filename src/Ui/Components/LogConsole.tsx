// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * LogConsole.tsx — the live run log.
 *
 * Auto-sticks to the bottom while you are at the bottom, but stops following as
 * soon as you scroll up to read something (classic chat behaviour).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LogEntry, LogLevel } from '@Shared/Types';
import { formatClock } from '@Shared/Utils/Time';
import { cx } from '../Utils/Cx';
import { useT } from '../I18n/I18n';
import type { MessageKey } from '../I18n/Messages';

const FILTERS: Array<{ value: 'all' | LogLevel; key: MessageKey }> = [
  { value: 'all', key: 'console.all' },
  { value: 'info', key: 'console.info' },
  { value: 'warn', key: 'console.warn' },
  { value: 'error', key: 'console.error' },
];

export function LogConsole({
  logs,
  height = 220,
  filterable = true,
}: {
  logs: LogEntry[];
  height?: number;
  filterable?: boolean;
}) {
  const t = useT();
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [filter, setFilter] = useState<'all' | LogLevel>('all');

  const visible = useMemo(
    () => (filter === 'all' ? logs : logs.filter((entry) => entry.level === filter)),
    [logs, filter],
  );

  useEffect(() => {
    const node = scroller.current;
    if (!node || !stick.current) return;
    node.scrollTop = node.scrollHeight;
  }, [visible.length]);

  const onScroll = () => {
    const node = scroller.current;
    if (!node) return;
    stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 40;
  };

  return (
    <div className="console">
      {filterable ? (
        <div className="console__filters">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cx('console__filter', filter === option.value && 'is-active')}
              onClick={() => setFilter(option.value)}
            >
              {t(option.key)}
            </button>
          ))}
          <span className="console__count">{t('console.lines', { n: visible.length })}</span>
        </div>
      ) : null}
      <div
        ref={scroller}
        className={cx('log', visible.length === 0 && 'log--empty')}
        style={{ height }}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
      >
        {visible.length === 0
          ? t('console.empty')
          : visible.map((entry) => (
              <div key={entry.id} className={cx('log__row', `log__row--${entry.level}`)}>
                <span className="log__time">{formatClock(entry.at)}</span>
                <span className="log__scope">{entry.scope}</span>
                <span className="log__msg">{entry.message}</span>
              </div>
            ))}
      </div>
    </div>
  );
}
