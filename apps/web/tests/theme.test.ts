import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyTheme,
  normalizeThemePreference,
  readStoredThemePreference,
  resolveTheme,
} from '../src/theme';

function storageWith(value: string | null) {
  return {
    getItem: (key: string) => (key === THEME_STORAGE_KEY ? value : null),
  };
}

test('theme preference defaults to dark and only accepts the three known values', () => {
  assert.equal(DEFAULT_THEME, 'dark');
  assert.equal(normalizeThemePreference('light'), 'light');
  assert.equal(normalizeThemePreference('dark'), 'dark');
  assert.equal(normalizeThemePreference('system'), 'system');
  assert.equal(normalizeThemePreference('Dark'), null);
  assert.equal(normalizeThemePreference(''), null);
  assert.equal(normalizeThemePreference(undefined), null);
});

test('stored preference is read safely and falls back to dark', () => {
  assert.equal(readStoredThemePreference(storageWith('light')), 'light');
  assert.equal(readStoredThemePreference(storageWith('system')), 'system');
  assert.equal(readStoredThemePreference(storageWith(null)), 'dark');
  assert.equal(readStoredThemePreference(storageWith('sepia')), 'dark');
  assert.equal(
    readStoredThemePreference({
      getItem: () => {
        throw new Error('storage disabled');
      },
    }),
    'dark',
  );
  assert.equal(readStoredThemePreference(undefined), 'dark');
});

test('system preference resolves from the media query, explicit modes ignore it', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
});

test('applyTheme writes the resolved theme and keeps the preference for the toggle', () => {
  const root = { dataset: {} as Record<string, string> } as unknown as HTMLElement;

  assert.equal(applyTheme('system', true, root), 'dark');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.dataset.themePreference, 'system');

  assert.equal(applyTheme('light', true, root), 'light');
  assert.equal(root.dataset.theme, 'light');
  assert.equal(root.dataset.themePreference, 'light');
});
