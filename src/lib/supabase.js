// Gemensam Supabase-klient och hjälpfunktioner för inloggade sidor (körs bara i webbläsaren).
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, FUNCTIONS_URL } from '../config/supabase.js';

let client;
export function supabase() {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'tostad-auth' },
  });
  return client;
}

/** Anropar en edge function med den inloggades token. Kastar fel med svenskt meddelande. */
export async function callFunction(name, body) {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Något gick fel. Försök igen.');
  return json;
}

export const isAdminRole = (role) => role === 'owner' || role === 'admin';

/** Inloggad person, profil och säkerhetsnivå (aal1 = lösenord, aal2 = med tvåstegsverifiering). */
export async function loadMe() {
  const sb = supabase();
  const { data } = await sb.auth.getSession();
  const session = data.session;
  if (!session) return null;
  const { data: profile } = await sb.from('profiles').select('id, role, full_name, email, phone, active').eq('id', session.user.id).maybeSingle();
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  return { session, profile, aal: aal?.currentLevel, nextAal: aal?.nextLevel };
}

/** Tillåter bara interna adresser under /admin och /app som mål efter inloggning. */
export function safeNext(value) {
  return typeof value === 'string' && /^\/(admin|app)(\/[\w/-]*)?$/.test(value) ? value : null;
}

export function go(path) {
  window.location.assign(path);
}

const dateTime = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Stockholm' });
export const formatDateTime = (iso) => (iso ? dateTime.format(new Date(iso)) : '');
