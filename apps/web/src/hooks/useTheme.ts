import { useEffect } from 'react';
import { setUserPref } from '@/lib/socket';
import { usePref } from '@/stores/preferences';

export type Theme = 'light' | 'dark';

const KEY = 'ui.theme';
const DEFAULT_THEME: Theme = 'dark';

/** Sincroniza el atributo `class="dark"` en <html> con la pref persistida. */
export function useThemeSync(): void {
  const stored = usePref(KEY);
  const theme: Theme = stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME;
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const stored = usePref(KEY);
  const theme: Theme = stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME;
  return {
    theme,
    toggle: () => {
      void setUserPref({ key: KEY, value: theme === 'dark' ? 'light' : 'dark' });
    },
  };
}
