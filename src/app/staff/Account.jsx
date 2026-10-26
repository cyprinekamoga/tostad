// Konto: notiser, kalenderlänk, lägga appen på hemskärmen och logga ut.
import { useEffect, useState } from 'preact/hooks';
import { supabase, isAdminRole, go } from '../../lib/supabase.js';
import { ErrorMsg, copyText } from '../ui.jsx';
import { calendarToken, newCalendarToken, calendarUrl } from './api.js';
import { Notifications } from './parts.jsx';

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
    if (!window.confirm('The old link will stop working. You need to add the new one to your calendar. Continue?')) return;
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
        <p class="muted">Want a new password? Ask your manager and you will get a link where you choose a new one.</p>
        {isAdminRole(me.profile.role) && <a class="btn btn--block" href="/admin">Go to the admin dashboard</a>}
      </section>

      <Notifications />

      <section class="st-card">
        <h3>Your jobs in your phone's calendar</h3>
        <p class="muted">Your jobs show up in your phone's calendar and update automatically. The customer's phone number and the price are not shown there.</p>
        <ErrorMsg error={error} />
        {token && (
          <div class="st-actions st-actions--stack">
            <a class="btn" href={webcal}>{ios ? 'Add to iPhone calendar' : 'Add to calendar'}</a>
            <a class="btn btn--ghost" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener">Add to Google Calendar</a>
            <button class="btn btn--ghost" type="button" onClick={async () => setCopied(await copyText(url))}>{copied ? 'The link is copied' : 'Copy the link'}</button>
            <button class="st-link" type="button" onClick={renew}>Create a new link (if someone else has yours)</button>
          </div>
        )}
      </section>

      <section class="st-card">
        <h3>The app on your home screen</h3>
        {ios ? (
          <ol class="auth-steps">
            <li>Open tostadflytt.se/app in Safari.</li>
            <li>Tap the share button (the square with an arrow pointing up).</li>
            <li>Choose <strong>Add to Home Screen</strong>.</li>
          </ol>
        ) : (
          <ol class="auth-steps">
            <li>Open tostadflytt.se/app in Chrome.</li>
            <li>Tap the menu with three dots in the top right corner.</li>
            <li>Choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.</li>
          </ol>
        )}
        <p class="muted">You stay logged in on your phone until you log out.</p>
      </section>

      <button class="btn btn--ghost btn--block" type="button" onClick={signOut}>Log out</button>
    </div>
  );
}
