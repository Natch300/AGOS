// ============================================================
// AGOS — Supabase Client (ES Module via CDN)
// Pinned to v2.112.3 — latest stable with sb_publishable support
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'agos-session',
    storage: window.localStorage,
  }
});

export default supabase;