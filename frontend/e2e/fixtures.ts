import { test as base, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Shared Playwright fixtures for the GigaChad GRC e2e suite.
 *
 * Every spec must import `test`/`expect` from here rather than from
 * `@playwright/test`, because the signed-in state cannot travel in the normal
 * `storageState` file.
 *
 * Why: the demo sign-in (`AUTH_MODE=demo`, the "Dev Login (Skip SSO)" button on
 * /login) records the session in **sessionStorage** under `grc-demo-session`
 * (see frontend/src/contexts/AuthContext.tsx). Playwright's `storageState`
 * captures cookies and localStorage only — sessionStorage is deliberately not
 * persisted. A project that relies on `storageState` alone therefore starts
 * every test signed out, gets bounced to /login by ProtectedRoute, and the
 * specs then assert against the login page instead of the app.
 *
 * So the state is carried in two halves:
 *   - cookies/localStorage -> playwright/.auth/user.json (Playwright's own file)
 *   - sessionStorage       -> playwright/.auth/session-storage.json, replayed
 *                             into each browser context by the fixture below.
 *
 * Both files are produced by auth.setup.ts, which signs in by clicking the real
 * button. Nothing here invents a session: it replays the one a real sign-in
 * produced.
 */

/** Playwright's own storage state (cookies + localStorage). */
export const AUTH_STATE_FILE = fileURLToPath(
  new URL('../playwright/.auth/user.json', import.meta.url),
);

/** sessionStorage captured after a real demo sign-in. */
export const SESSION_STORAGE_FILE = fileURLToPath(
  new URL('../playwright/.auth/session-storage.json', import.meta.url),
);

/** sessionStorage key the app writes when the demo bypass is active. */
export const DEMO_SESSION_KEY = 'grc-demo-session';

function readCapturedSessionStorage(): Record<string, string> {
  if (!existsSync(SESSION_STORAGE_FILE)) {
    throw new Error(
      `No captured sessionStorage at ${SESSION_STORAGE_FILE}. The 'setup' project ` +
        `(e2e/auth.setup.ts) must run first — run 'npx playwright test' rather than ` +
        `a single project, or add --project=setup.`,
    );
  }

  const captured = JSON.parse(readFileSync(SESSION_STORAGE_FILE, 'utf8')) as Record<string, string>;

  if (captured[DEMO_SESSION_KEY] !== 'active') {
    throw new Error(
      `Captured sessionStorage has no active '${DEMO_SESSION_KEY}'. The demo sign-in ` +
        `did not take; re-run the setup project against a frontend started with ` +
        `VITE_AUTH_MODE=demo.`,
    );
  }

  return captured;
}

export const test = base.extend({
  context: async ({ context }, use) => {
    const captured = readCapturedSessionStorage();

    // Runs before any page script on every navigation in this context, so the
    // AuthProvider sees the demo session on its first render instead of
    // redirecting to /login.
    await context.addInitScript((entries: Record<string, string>) => {
      for (const [key, value] of Object.entries(entries)) {
        window.sessionStorage.setItem(key, value);
      }
    }, captured);

    await use(context);
  },
});

export { expect };
