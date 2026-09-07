import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../types/database';

const envSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const envSupabasePublishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
)?.trim() ?? '';

// Fallback is intentional — .env.production is committed so any host can build without extra setup (see .env.production:2)
export const supabaseUrl = envSupabaseUrl || 'https://nfusbrktrqfrnaetetmr.supabase.co';
export const supabasePublishableKey =
  envSupabasePublishableKey || 'sb_publishable_FCxdA2r2MOReIzNfTKEtLA_3AtTiMqp';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

if (!envSupabaseUrl || !envSupabasePublishableKey) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing at build — using committed fallback (.env.production). Set Vercel Env to silence.',
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
