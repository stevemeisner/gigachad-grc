import { test as setup, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { AUTH_STATE_FILE, DEMO_SESSION_KEY, SESSION_STORAGE_FILE } from './fixtures';

/**
 * Authentication setup — runs once, before every other project.
 *
 * The app's only non-interactive way in is the demo bypass: with the frontend
 * started under `VITE_AUTH_MODE=demo` in dev mode (what scripts/start-demo.sh
 * does), /login renders a "Dev Login (Skip SSO)" button next to the Google
 * button. Clicking it is the same path a human takes, so that is what this does
 * — no storage is forged here. Google sign-in itself is not automatable without
 * a real Google account, and the backend under AUTH_MODE=demo accepts the demo
 * identity anyway, so the bypass is the correct target for the suite.
 *
 * The resulting session lives in sessionStorage, which Playwright's
 * `storageState` does not persist; see e2e/fixtures.ts for how it is carried
 * into the test projects.
 */
setup('authenticate', async ({ page }) => {
  await page.goto('/login');

  const devLogin = page.getByRole('button', { name: 'Dev Login (Skip SSO)' });

  // Fail loudly rather than saving an unauthenticated state: an empty state
  // file makes every downstream spec silently assert against the login page.
  await expect(
    devLogin,
    'The "Dev Login (Skip SSO)" button is missing from /login. It only renders when the ' +
      'frontend runs in dev mode with VITE_AUTH_MODE=demo (scripts/start-demo.sh sets this). ' +
      'A production build has no bypass and this suite cannot sign in.',
  ).toBeVisible();

  await devLogin.click();

  await page.waitForURL(/\/dashboard(\?|#|$)/);

  // Enumerated explicitly rather than JSON.stringify(sessionStorage): the
  // Storage object's key/value pairs are exposed through named property
  // getters, and this suite runs on WebKit and Firefox as well as Chromium.
  const captured = await page.evaluate(() => {
    const entries: Record<string, string> = {};
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key !== null) entries[key] = window.sessionStorage.getItem(key) ?? '';
    }
    return entries;
  });

  expect(
    captured[DEMO_SESSION_KEY],
    `Signed in but sessionStorage['${DEMO_SESSION_KEY}'] was not set; the demo session would ` +
      'not survive into the test projects.',
  ).toBe('active');

  mkdirSync(dirname(SESSION_STORAGE_FILE), { recursive: true });
  writeFileSync(SESSION_STORAGE_FILE, JSON.stringify(captured, null, 2));

  // Cookies and localStorage (theme, sidebar state, anything the app persists).
  await page.context().storageState({ path: AUTH_STATE_FILE });
});
