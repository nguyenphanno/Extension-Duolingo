// Copyright github.com/nguyenphanno © 2026. All rights reserved
/**
 * UseLocale.ts — keeps the shared formatter *and* the translator in sync with
 * the chosen locale, and forces a re-render when it changes.
 */
import { useEffect, useState } from 'react';
import { setFormatLocale, currentLocale } from '@Shared/Utils/Format';
import { setI18nLocale } from '@Ui/I18n/I18n';
import type { Locale } from '@Shared/Types';

export function useLocale(locale: Locale | undefined): string {
  const [active, setActive] = useState(currentLocale());

  useEffect(() => {
    if (!locale) return;
    setFormatLocale(locale);
    setI18nLocale(locale);
    setActive(currentLocale());
  }, [locale]);

  return active;
}
