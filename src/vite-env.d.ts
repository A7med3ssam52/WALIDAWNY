/// <reference types="vite/client" />

interface Navigator {
  /** iOS Safari — true when running from the home-screen PWA. */
  standalone?: boolean;
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
