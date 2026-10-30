export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'resume-do:theme';
export const DEFAULT_THEME: ThemePreference = 'dark';

export function normalizeThemePreference(value: unknown): ThemePreference | null {
  return value === 'light' || value === 'dark' || value === 'system' ? value : null;
}

export function readStoredThemePreference(
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
): ThemePreference {
  try {
    return normalizeThemePreference(storage?.getItem(THEME_STORAGE_KEY)) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function prefersDark(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true;
  } catch {
    return true;
  }
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

export function applyTheme(
  preference: ThemePreference,
  systemDark: boolean = prefersDark(),
  root: HTMLElement = document.documentElement,
): ResolvedTheme {
  const resolved = resolveTheme(preference, systemDark);
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  return resolved;
}
