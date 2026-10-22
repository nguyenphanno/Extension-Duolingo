/**
 * UseTheme.ts — resolves 'system' against the OS and writes `data-theme`.
 */
import { useEffect } from 'react';
import type { ThemePreference } from '@Shared/Types';

export function useTheme(preference: ThemePreference | undefined): void {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const resolved = preference === 'system' || !preference ? (media.matches ? 'dark' : 'light') : preference;
      root.setAttribute('data-theme', resolved);
      root.style.colorScheme = resolved;
    };

    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);
}
