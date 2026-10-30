import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type User } from './api';
import {
  THEME_STORAGE_KEY,
  applyTheme,
  normalizeThemePreference,
  prefersDark,
  readStoredThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useThemePreference(user: User | null | undefined): ThemeContextValue {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredThemePreference);
  const [systemDark, setSystemDark] = useState(prefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    applyTheme(preference, systemDark);
  }, [preference, systemDark]);

  const userId = user?.id;
  const serverPreference = user ? normalizeThemePreference(user.themePreference) : null;
  useEffect(() => {
    if (!serverPreference) return;
    setPreferenceState(serverPreference);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, serverPreference);
    } catch {
      // Local cache is best effort; the server value still applies this session.
    }
  }, [userId, serverPreference]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Keep the in-memory preference when storage is unavailable.
      }
      if (user) {
        void api.updateThemePreference(next).catch(() => {
          // Keep the local preference when the API is unreachable.
        });
      }
    },
    [user],
  );

  return useMemo(
    () => ({ preference, resolved: resolveTheme(preference, systemDark), setPreference }),
    [preference, systemDark, setPreference],
  );
}

export function ThemeProvider({
  value,
  children,
}: {
  value: ThemeContextValue;
  children: ReactNode;
}) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('ThemeProvider is missing');
  return value;
}

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: ReactNode }> = [
  {
    value: 'light',
    label: '浅色',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: '深色',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
      </svg>
    ),
  },
  {
    value: 'system',
    label: '跟随系统',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    ),
  },
];

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  return (
    <div className={`theme-toggle ${className}`.trim()} role="group" aria-label="主题">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={preference === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => setPreference(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
