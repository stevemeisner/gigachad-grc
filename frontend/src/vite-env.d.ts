/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // The Firebase web API key is a public client identifier, not a secret.
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  // UI hint for Google's account chooser; enforcement is server-side.
  readonly VITE_ALLOWED_EMAIL_DOMAIN: string;
  // 'demo' enables the local development auth bypass (dev builds only).
  readonly VITE_AUTH_MODE: string;
  readonly VITE_WS_URL: string;
  readonly VITE_ENABLE_DEMO_MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}





