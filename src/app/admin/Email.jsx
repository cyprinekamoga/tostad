// Mejl: automatiska mejl via Resend. Inställningar, vad som väntar på att skickas, test och logg.
import { useEffect, useState } from 'preact/hooks';
import { supabase, callFunction, formatDateTime } from '../../lib/supabase.js';
import { ErrorMsg } from '../ui.jsx';
import { loadSettings, saveSettings } from './docs.js';

const KIND = {
  bokning: 'Booking confirmation',
  fotorapport: 'Photo report',
  recension: 'Review request',
  paminnelse: 'Payment reminder',
  offert: 'Quote',
  faktura: 'Invoice',
  ansokan: 'Application',
  ny_bokning: 'New booking to you',
  portallank: 'Mina sidor link',
  losenord: 'New password',
  test: 'Test',
};

const TYPES = [
  ['email_booking_confirm', 'Booking confirmation', 'When you create a job for a private customer. A recurring job gets one email for the whole series.'],
  ['email_photo_report', 'Photo report', 'At 19:00 the day a job is marked done, with the photos the staff took (not damage photos).'],
  ['email_review', 'Review request on Google', 'When an invoice to a private customer is marked paid. At most once a year per customer.'],
  ['email_reminders', 'Payment reminders', 'When an invoice is overdue. At most two reminders, no fee.'],
  ['email_applicant', 'Reply to job applicants', 'Right after someone applies on /jobb.'],
];

export default function Email() {
  const sb = supabase();
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState(null);
  const [log, setLog] = useState(null);
  const [testTo, setTestTo] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const loadStatus = () => callFunction('email', { action: 'status' }).then(setStatus).catch((e) => setError(e.message));
  const loadLog = () => sb.from('email_log').select('*').order('created_at', { ascending: false }).limit(50).then(({ data }) => setLog(data ?? []));

  useEffect(() => {
    loadSettings().then((s) => setForm({ ...s, google_review_url: s.google_review_url ?? '' }));
    loadStatus();
    loadLog();
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.currentTarget.type === 'checkbox' ? e.currentTarget.checked : e.currentTarget.value });

  async function save(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    const review = form.google_review_url.trim();
    if (review && !/^https:\/\//.test(review)) return setError('The Google review link must start with https://');
    if (form.email_review && !review) return setError('Add the Google review link, or turn off review requests.');
    setBusy(true);
    try {
      await saveSettings({
        email_enabled: form.email_enabled,
        email_from: form.email_from.trim(),
        email_booking_confirm: form.email_booking_confirm,
        email_photo_report: form.email_photo_report,
        email_review: form.email_review,
        google_review_url: review || null,
        email_reminders: form.email_reminders,
        reminder_days: Number(form.reminder_days),
        email_applicant: form.email_applicant,
      });
      setInfo(form.email_enabled ? 'Saved. Emails go out automatically from now on.' : 'Saved.');
      await loadStatus();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function test() {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await callFunction('email', { action: 'test', to: testTo || undefined });
      setInfo('The test email is sent. Check the inbox, and the spam folder.');
      await loadLog();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  if (!form) return <p class="muted">Loading …</p>;
  const waiting = status?.waiting ?? [];

  return (
    <>
      <div class="cp-head">
        <h2>Email</h2>
      </div>
      <p class="muted">
        Emails to customers are in Swedish and come from your company address. Customers can reply, and the reply goes to {form.email}. Automatic emails are only sent
        for what happens after you turn email on, so old customers get nothing.
      </p>
      <ErrorMsg error={error} />
      {info && <p class="msg msg--ok" role="status">{info}</p>}

      {status && !status.connected && (
        <section class="cp-panel" style="margin-bottom:16px">
          <h3 class="cp-subhead">Connect Resend</h3>
          <ol>
            <li>Create a free account at <a href="https://resend.com/signup" target="_blank" rel="noopener">resend.com</a> (3 000 emails a month are free).</li>
            <li>Under <strong>Domains</strong>, add <code>tostadflytt.se</code> and choose the region <strong>Ireland (eu-west-1)</strong>.</li>
            <li>
              Resend shows 3 or 4 DNS records (MX, TXT for SPF, TXT for DKIM). Add them at <strong>one.com</strong> under DNS settings for tostadflytt.se, exactly as Resend
              shows them, and press Verify in Resend. Your existing email keeps working; the records are for a separate send address.
            </li>
            <li>Under <strong>API Keys</strong>, create a key with "Sending access".</li>
            <li>In Supabase, open <strong>Edge Functions → Secrets</strong> and add <code>RESEND_API_KEY</code> with the key.</li>
            <li>Come back here, send a test email to yourself, then turn email on.</li>
          </ol>
        </section>
      )}

      <form class="cp-panel form-grid" onSubmit={save} style="max-width:760px;margin-bottom:16px">
        <h3 class="cp-subhead">Settings</h3>
        <label class="cp-check">
          <input type="checkbox" checked={form.email_enabled} onChange={set('email_enabled')} disabled={!status?.connected && !form.email_enabled} /> Send emails
          {!status?.connected && !form.email_enabled && <span class="muted"> (connect Resend first)</span>}
        </label>
        <div class="field">
          <label for="em-from">Send from</label>
          <input id="em-from" type="email" value={form.email_from} onInput={set('email_from')} style="max-width:320px" />
          <small class="hint">Must be an address on the domain you verified in Resend.</small>
        </div>
        <fieldset class="cp-fieldset">
          <legend>Automatic emails</legend>
          {TYPES.map(([key, label, hint]) => (
            <label class="cp-check">
              <input type="checkbox" checked={form[key]} onChange={set(key)} /> <span><strong>{label}</strong><br /><small class="muted">{hint}</small></span>
            </label>
          ))}
        </fieldset>
        <div class="form-2">
          <div class="field">
            <label for="em-review">Google review link</label>
            <input id="em-review" type="url" placeholder="https://g.page/r/..." value={form.google_review_url} onInput={set('google_review_url')} />
            <small class="hint">In Google Business Profile: "Ask for reviews", copy the link.</small>
          </div>
          <div class="field">
            <label for="em-days">Remind after</label>
            <select id="em-days" value={form.reminder_days} onChange={set('reminder_days')}>
              {[3, 5, 7, 10, 14].map((d) => <option value={d}>{d} days</option>)}
            </select>
            <small class="hint">Days after the due date, and again the same number of days later.</small>
          </div>
        </div>
        <p class="muted" style="margin:0">Quotes and invoices are emailed when you press "Email it" after sending them. Customers and staff can also ask for their own link or a new password.</p>
        <div class="cp-actions">
          <button class="btn" type="submit" disabled={busy}>Save</button>
        </div>
      </form>

      {form.email_enabled && (
        <section class="cp-panel" style="margin-bottom:16px">
          <h3 class="cp-subhead">Waiting to be sent</h3>
          {!status ? (
            <p class="muted">Loading …</p>
          ) : waiting.length === 0 ? (
            <p class="muted">Nothing is waiting. Emails are checked every hour.</p>
          ) : (
            <ul class="cp-list">
              {waiting.map((w) => (
                <li class="cp-row cp-row--static">
                  <span class="cp-row-top">
                    <strong>{w.kind}: {w.who}</strong>
                    <span>{w.skip ? 'Not sent' : 'Next hour'}</span>
                  </span>
                  <p>{w.subject}{w.to ? ` · ${w.to}` : ''}</p>
                  {w.skip && <small class="muted">{w.skip}</small>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section class="cp-panel" style="margin-bottom:16px">
        <h3 class="cp-subhead">Test</h3>
        <div class="cp-actions">
          <input type="email" placeholder="Your email address" aria-label="Email address for the test" value={testTo} onInput={(e) => setTestTo(e.currentTarget.value)} style="max-width:260px" />
          <button class="btn btn--ghost btn--sm" type="button" disabled={busy || !status?.connected} onClick={test}>Send a test email</button>
        </div>
      </section>

      <section class="cp-panel">
        <h3 class="cp-subhead">Sent</h3>
        {!log ? (
          <p class="muted">Loading …</p>
        ) : log.length === 0 ? (
          <p class="muted">No emails sent yet.</p>
        ) : (
          <ul class="cp-list">
            {log.map((r) => (
              <li class="cp-row cp-row--static">
                <span class="cp-row-top">
                  <strong>{KIND[r.kind] ?? r.kind} · {r.to_email}</strong>
                  <span>{formatDateTime(r.created_at)}</span>
                </span>
                <p>{r.subject}</p>
                {r.status === 'fel' && <small class="msg msg--error">Failed: {r.error}</small>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
