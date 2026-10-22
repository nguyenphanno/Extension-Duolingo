/**
 * UseLocale.ts — keeps the shared formatter in sync with the chosen locale and
 * forces a re-render when it changes.
 */
import { useEffect, useState } from 'react';
import { setFormatLocale, currentLocale } from '@Shared/Utils/Format';
import type { Locale } from '@Shared/Types';

export function useLocale(locale: Locale | undefined): string {
  const [active, setActive] = useState(currentLocale());

  useEffect(() => {
    if (!locale) return;
    setFormatLocale(locale);
    setActive(currentLocale());
  }, [locale]);

  return active;
}
