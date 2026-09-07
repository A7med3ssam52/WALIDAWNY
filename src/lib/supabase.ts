import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../types/database';

const envSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const envSupabasePublishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
)?.trim() ?? '';

export const isSupabaseConfigured = Boolean(envSupabaseUrl && envSupabasePublishableKey);

export const supabaseUrl =
  envSupabaseUrl || (import.meta.env.DEV ? 'https://nfusbrktrqfrnaetetmr.supabase.co' : '');
export const supabasePublishableKey =
  envSupabasePublishableKey ||
  (import.meta.env.DEV ? 'sb_publishable_FCxdA2r2MOReIzNfTKEtLA_3AtTiMqp' : '');

if (import.meta.env.DEV && !isSupabaseConfigured) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing — using DEV fallback. Set .env.local to silence this warning.',
  );
}

let client: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env.local and set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
    );
  }
  if (!client) {
    client = createClient<Database>(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
