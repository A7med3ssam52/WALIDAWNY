/// <reference types="vite/client" />

interface Navigator {
  /** iOS Safari — true when running from the home-screen PWA. */
  standalone?: boolean;
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Full-screen security lockdown notice; baked at build time. "true" = locked. */
  readonly VITE_MAINTENANCE_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __BUILD_ID__: string;
