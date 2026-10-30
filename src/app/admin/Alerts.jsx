// Besked till administratörerna när en bokning, ett meddelande eller en skadeanmälan kommer in via
// webbplatsen: mejl till företagets adress och pushnotis till den här telefonen.
import { useEffect, useState } from 'preact/hooks';
import { ErrorMsg } from '../ui.jsx';
import { loadSettings, saveSettings } from './docs.js';
import { pushState, turnOn, turnOff, sendTest } from '../staff/push.js';

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export default function Alerts() {
  const [form, setForm] = useState(null);
  const [phone, setPhone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    loadSettings().then((s) => setForm({ notify_new_email: s.notify_new_email, notify_email: s.notify_email ?? '', notify_new_push: s.notify_new_push, email: s.email, email_enabled: s.email_enabled }));
    pushState().then(setPhone).catch(() => setPhone('unsupported'));
  }, []);

  async function run(fn, done) {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn();
      if (done) setInfo(done);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  const save = (e) => {
    e.preventDefault();
    const address = form.notify_email.trim();
    if (address && !isEmail(address)) return setError('Write a valid email address, or leave it empty.');
    return run(() => saveSettings({ notify_new_email: form.notify_new_email, notify_email: address || null, notify_new_push: form.notify_new_push }), 'Saved.');
  };
  const phoneAction = (fn, done) => run(async () => {
    await fn();
    setPhone(await pushState());
  }, done);

  if (!form) return null;
  const set = (key) => (e) => setForm({ ...form, [key]: e.currentTarget.type === 'checkbox' ? e.currentTarget.checked : e.currentTarget.value });

  return (
    <section class="cp-panel form-grid" style="max-width:720px;margin-bottom:16px">
      <h3 class="cp-subhead">Notifications to you</h3>
      <p class="muted">When someone books, sends a message or reports damage on the website, you get an email and a notification on your phone right away.</p>
      <ErrorMsg error={error} />
      {info && <p class="msg msg--ok" role="status">{info}</p>}

      <form class="form-grid" onSubmit={save}>
        <label class="cp-check">
          <input type="checkbox" checked={form.notify_new_email} onChange={set('notify_new_email')} /> Email me
          {!form.email_enabled && <span class="muted"> (turn on email under Email first)</span>}
        </label>
        <div class="field">
          <label for="al-email">Send to</label>
          <input id="al-email" type="email" placeholder={form.email} value={form.notify_email} onInput={set('notify_email')} style="max-width:320px" />
          <small class="hint">Empty means {form.email}.</small>
        </div>
        <label class="cp-check">
          <input type="checkbox" checked={form.notify_new_push} onChange={set('notify_new_push')} /> Notification on the phones of all admins who turned it on
        </label>
        <div class="cp-actions">
          <button class="btn btn--sm" type="submit" disabled={busy}>Save</button>
        </div>
      </form>

      <fieldset class="cp-fieldset">
        <legend>This phone or computer</legend>
        {phone === null && <p class="muted">Checking …</p>}
        {phone === 'homescreen' && (
          <p class="msg">
            On iPhone, open tostadflytt.se/app in Safari, tap Share, then <strong>Add to Home Screen</strong>. Open the app from the Home Screen, go to Settings here and turn
            on notifications.
          </p>
        )}
        {phone === 'unsupported' && <p class="msg">This browser cannot show notifications. Use Chrome on Android, Chrome or Edge on a computer, or the app on your iPhone Home Screen.</p>}
        {phone === 'blocked' && <p class="msg">Notifications are blocked for tostadflytt.se. Allow them in the browser or phone settings, then reload this page.</p>}
        {phone === 'off' && (
          <button class="btn btn--sm" type="button" disabled={busy} onClick={() => phoneAction(turnOn, 'Notifications are on for this device. Send a test to check.')}>
            Turn on notifications here
          </button>
        )}
        {phone === 'on' && (
          <div class="cp-actions">
            <span class="msg msg--ok">Notifications are on for this device.</span>
            <button class="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => run(sendTest, 'A test notification is on its way.')}>
              Send a test
            </button>
            <button class="st-link" type="button" disabled={busy} onClick={() => phoneAction(turnOff, 'Notifications are off for this device.')}>
              Turn off here
            </button>
          </div>
        )}
      </fieldset>
    </section>
  );
}
