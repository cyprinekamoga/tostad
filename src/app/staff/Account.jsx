// Konto: kalenderlänk, lägga appen på hemskärmen och logga ut.
import { useEffect, useState } from 'preact/hooks';
import { supabase, isAdminRole, go } from '../../lib/supabase.js';
import { ErrorMsg, copyText } from '../ui.jsx';
import { calendarToken, newCalendarToken, calendarUrl } from './api.js';

export default function Account({ me }) {
  const [token, setToken] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);

  useEffect(() => {
    calendarToken(me.profile.id).then(setToken);
  }, []);

  const url = token ? calendarUrl(token) : '';
  const webcal = url.replace(/^https:/, 'webcal:');

  async function renew() {
    if (!window.confirm('Den gamla länken slutar fungera. Du behöver lägga till den nya i kalendern. Fortsätta?')) return;
    try {
      setToken(await newCalendarToken());
      setCopied(false);
    } catch (e) {
      setError(e.message);
    }
  }

  async function signOut() {
    await supabase().auth.signOut();
    go('/logga-in');
  }

  return (
    <div class="st-page">
      <section class="st-card">
        <h3>{me.profile.full_name}</h3>
        <p class="muted">{me.profile.email}{me.profile.phone ? ` · ${me.profile.phone}` : ''}</p>
        <p class="muted">Vill du byta lösenord? Säg till din chef så får du en länk där du väljer ett nytt.</p>
        {isAdminRole(me.profile.role) && <a class="btn btn--block" href="/admin">Till administrationen</a>}
      </section>

      <section class="st-card">
        <h3>Jobben i telefonens kalender</h3>
        <p class="muted">Dina jobb visas i kalendern på telefonen och uppdateras automatiskt. Kundens telefonnummer och pris visas inte där.</p>
        <ErrorMsg error={error} />
        {token && (
          <div class="st-actions st-actions--stack">
            <a class="btn" href={webcal}>{ios ? 'Lägg till i iPhone-kalendern' : 'Lägg till i kalendern'}</a>
            <a class="btn btn--ghost" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener">Lägg till i Google Kalender</a>
            <button class="btn btn--ghost" type="button" onClick={async () => setCopied(await copyText(url))}>{copied ? 'Länken är kopierad' : 'Kopiera länken'}</button>
            <button class="st-link" type="button" onClick={renew}>Skapa en ny länk (om någon annan har fått din)</button>
          </div>
        )}
      </section>

      <section class="st-card">
        <h3>Appen på hemskärmen</h3>
        {ios ? (
          <ol class="auth-steps">
            <li>Öppna tostadflytt.se/app i Safari.</li>
            <li>Tryck på dela-knappen (fyrkanten med en pil uppåt).</li>
            <li>Välj <strong>Lägg till på hemskärmen</strong>.</li>
          </ol>
        ) : (
          <ol class="auth-steps">
            <li>Öppna tostadflytt.se/app i Chrome.</li>
            <li>Tryck på menyn med tre prickar uppe till höger.</li>
            <li>Välj <strong>Lägg till på startskärmen</strong> eller <strong>Installera app</strong>.</li>
          </ol>
        )}
        <p class="muted">Du förblir inloggad på telefonen tills du loggar ut.</p>
      </section>

      <button class="btn btn--ghost btn--block" type="button" onClick={signOut}>Logga ut</button>
    </div>
  );
}
