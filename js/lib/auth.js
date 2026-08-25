// ============================================================
// AGOS — Auth helpers
// ============================================================
import { supabase } from './supabase.js';

/** Returns current Supabase session or null */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Returns current user profile from profiles table */
export async function getProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  if (error) return null;
  return data;
}

/** Guard: redirect to login if not authenticated */
export async function requireAuth(redirectTo = '../index.html') {
  const session = await getSession();
  if (!session) {
    window.location.href = redirectTo;
    return null;
  }
  return session;
}

/** Guard: redirect to login if not admin */
export async function requireAdmin(redirectTo = '../index.html') {
  const profile = await getProfile();
  if (!profile || !profile.is_admin) {
    window.location.href = redirectTo;
    return null;
  }
  return profile;
}

/** Sign out and redirect */
export async function signOut(redirectTo = '../index.html') {
  await supabase.auth.signOut();
  window.location.href = redirectTo;
}

/** Save accessibility preferences to localStorage */
export function savePrefs(prefs) {
  localStorage.setItem('agos-prefs', JSON.stringify(prefs));
}

/** Load accessibility preferences from localStorage */
export function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem('agos-prefs')) || {};
  } catch { return {}; }
}

/** Apply stored accessibility preferences to <html> */
export function applyPrefs() {
  const prefs = loadPrefs();
  if (prefs.theme === 'high-contrast') {
    document.documentElement.setAttribute('data-theme', 'high-contrast');
  }
  if (prefs.textScale) {
    document.documentElement.style.setProperty('--text-scale', prefs.textScale);
  }
  if (prefs.lang) {
    document.documentElement.lang = prefs.lang;
  }
}