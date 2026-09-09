import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  type Auth,
} from 'firebase/auth';
import { setErrorTrackingUser, addBreadcrumb } from '@/lib/errorTracking';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  token: string | null;
  /**
   * Authorization vocabulary for the signed-in user. The Firebase ID token
   * proves identity only, so this is empty until the server supplies it.
   */
  permissions: string[];
  login: () => void;
  logout: () => void;
  devLogin?: () => void;
  hasRole: (role: string) => boolean;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * The Firebase web API key is a public client identifier, not a secret: it
 * only names the project the SDK talks to. Access is enforced by the token
 * verification on the API side, never by the key's confidentiality.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

/**
 * Local development bypass. Mirrors the backend's `AUTH_MODE=demo`, which
 * supplies the identity server-side; the frontend simply stops asking for a
 * token. Gated on `import.meta.env.DEV` so a production bundle can never
 * contain a reachable bypass.
 */
const DEMO_MODE = import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE === 'demo';

/** sessionStorage key holding the demo bypass session. Demo mode only. */
const DEMO_SESSION_KEY = 'grc-demo-session';

/**
 * Resolve the Firebase Auth instance, initialising the default app on first
 * use. Returns null when the project is not configured (demo-only checkouts),
 * so the provider can degrade instead of throwing at module load.
 */
function firebaseAuth(): Auth | null {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) return null;
  const app: FirebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);
  return getAuth(app);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  // The demo identity mirrors the row seeded by database/dev-bootstrap.sql, so
  // the UI's role gates agree with what the API will answer under AUTH_MODE=demo.
  const applyDemoIdentity = useCallback(() => {
    setUser({
      id: '8f88a42b-e799-455c-b68a-308d7d2e9aa4',
      email: 'john.doe@example.com',
      name: 'John Doe',
      role: 'admin',
      organizationId: '8924f0c1-7bb1-4be8-84ee-ad8725c712bf',
    });
    setToken(null);
    setPermissions([]);
    setIsAuthenticated(true);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // In demo mode there is no identity provider to restore from, so the
    // bypass session is kept in sessionStorage. Without this a page refresh
    // silently signs you out, which the Keycloak-era devLogin did not do.
    if (DEMO_MODE && sessionStorage.getItem(DEMO_SESSION_KEY) === 'active') {
      applyDemoIdentity();
      return;
    }

    const auth = firebaseAuth();
    if (!auth) {
      setIsLoading(false);
      return;
    }

    // A single `onIdTokenChanged` subscription covers every transition:
    // session restore on page load, interactive sign-in, sign-out, and the
    // silent hourly refresh the SDK performs on its own. There is nothing to
    // schedule, no expiry to watch and no double-init to guard against.
    return onIdTokenChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setIsAuthenticated(false);
        setUser(null);
        setToken(null);
        setPermissions([]);
        setErrorTrackingUser(null);
        setIsLoading(false);
        return;
      }

      try {
        // Never persisted: the SDK owns the refresh credential, and a stored
        // copy of the ID token goes stale within the hour.
        const idToken = await firebaseUser.getIdToken();
        setToken(idToken);

        // The token carries identity only. Role, organization and permissions
        // are authoritative in PostgreSQL.
        // TODO: populate `role`, `organizationId` and `permissions` from
        // `GET /api/users/me` (usersApi.getMe) once it returns the caller's
        // database row for a Firebase-verified request.
        setUser({
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || firebaseUser.email || '',
          role: '',
          organizationId: '',
        });
        setPermissions([]);
        setIsAuthenticated(true);

        setErrorTrackingUser({
          id: firebaseUser.uid,
          email: firebaseUser.email || undefined,
        });
        addBreadcrumb({ category: 'auth', message: 'User logged in' });
      } finally {
        setIsLoading(false);
      }
    });
  }, []);

  const login = useCallback(() => {
    const auth = firebaseAuth();
    if (!auth) {
      console.error('Firebase auth is not configured (VITE_FIREBASE_* missing)');
      return;
    }

    const provider = new GoogleAuthProvider();
    const allowedDomain = import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN;
    if (allowedDomain) {
      // `hd` is a UI hint only: it pre-filters Google's account chooser. It is
      // not present in the resulting Firebase ID token and a caller can
      // trivially bypass it, so the real restriction is enforced server-side
      // (email suffix check plus a required database row).
      provider.setCustomParameters({ hd: allowedDomain });
    }

    // Popup, not redirect: Firebase's redirect flow needs a cross-origin
    // iframe to `<project>.firebaseapp.com`, which browsers that block
    // third-party storage break. Every documented workaround requires either
    // Firebase Hosting or reverse-proxying `/__/auth/` under our own origin.
    signInWithPopup(auth, provider).catch((error) => {
      console.error('Google sign-in failed:', error);
    });
  }, []);

  const logout = useCallback(() => {
    // Clear local state immediately; the token-change callback will also fire.
    sessionStorage.removeItem(DEMO_SESSION_KEY);
    setIsAuthenticated(false);
    setUser(null);
    setToken(null);
    setPermissions([]);
    setErrorTrackingUser(null);
    addBreadcrumb({ category: 'auth', message: 'User logged out' });

    const auth = firebaseAuth();
    if (auth) {
      signOut(auth).catch((error) => {
        console.error('Sign-out failed:', error);
      });
    }
  }, []);

  // Demo bypass: marks the context authenticated with NO token. The backend
  // running with AUTH_MODE=demo resolves the identity itself; the values below
  // only mirror that identity (database/dev-bootstrap.sql) so the UI's own
  // role gates behave the way the API will.
  const demoLogin = useCallback(() => {
    if (!DEMO_MODE) return;
    sessionStorage.setItem(DEMO_SESSION_KEY, 'active');
    applyDemoIdentity();
  }, [applyDemoIdentity]);

  const hasRole = (role: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.role === role;
  };

  const hasPermission = (permission: string): boolean => {
    // Single dev-only bypass, matching the backend's AUTH_MODE=demo: the demo
    // stack has no /api/users/me row to read permissions from.
    if (DEMO_MODE && isAuthenticated) return true;
    // Otherwise permissions are granted by the server, never inferred from the
    // token or from a client-side role table. Absent permissions allow nothing.
    return permissions.includes(permission);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        token,
        permissions,
        login,
        logout,
        devLogin: DEMO_MODE ? demoLogin : undefined,
        hasRole,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
