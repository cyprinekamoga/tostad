// Lediga jobb från databasen (bara publicerade syns) och skicka ansökan.
import { SUPABASE_URL, SUPABASE_KEY, FUNCTIONS_URL } from '../../config/supabase.js';

const COLS = 'slug,title,location,employment,intro,description,requirements,salary,start_text,published_at,valid_through,created_at';

export async function loadVacancies() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?select=${COLS}&order=published_at.desc`, { headers: { apikey: SUPABASE_KEY } });
  if (!res.ok) throw new Error('Kunde inte hämta lediga jobb.');
  return res.json();
}

export async function loadVacancy(slug) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?select=${COLS}&slug=eq.${encodeURIComponent(slug)}`, { headers: { apikey: SUPABASE_KEY } });
  if (!res.ok) throw new Error('Kunde inte hämta annonsen.');
  return (await res.json())[0] ?? null;
}

export async function sendApplication(form) {
  const res = await fetch(`${FUNCTIONS_URL}/apply`, { method: 'POST', headers: { apikey: SUPABASE_KEY }, body: new FormData(form) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Kunde inte skicka ansökan. Försök igen.');
}
