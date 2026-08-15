import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../types/database';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://nfusbrktrqfrnaetetmr.supabase.co';
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_FCxdA2r2MOReIzNfTKEtLA_3AtTiMqp';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

let client: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env.local and set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
    );
  }
  if (!client) {
    client = createClient<Database>(supabaseUrl, supabasePublishableKey);
  }
  return client;
}
