// SMS: påminnelser kvällen före till kunderna via 46elks. Personalen ser sina jobb i appen. Inställningar, förhandsgranskning och logg.
import { useEffect, useState } from 'preact/hooks';
import { supabase, callFunction, formatDateTime } from '../../lib/supabase.js';
import { ErrorMsg } from '../ui.jsx';
import { loadSettings, saveSettings } from './docs.js';

const KIND = { kvall_kund: 'Evening before', kvall_personal: 'Staff', pa_vag: 'On the way', bokning: 'Booking', test: 'Test' };
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

// Tecken som ryms i ett vanligt SMS (GSM-7). Andra tecken, t.ex. emoji, gör SMS:et dyrare.
const GSM = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà]*$/;
/** Antal SMS-delar en text blir. */
export function smsParts(text) {
  const gsm = GSM.test(text);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

export default function Sms() {
  const sb = supabase();
  const [form, setForm] = useState(null);
  const [preview, setPreview] = useState(null);
  const [log, setLog] = useState(null);
  const [testPhone, setTestPhone] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const loadPreview = () =>
    callFunction('sms', { action: 'preview' })
      .then(setPreview)
      .catch((e) => setError(e.message));
  const loadLog = () =>
    sb.from('sms_log').select('*').order('created_at', { ascending: false }).limit(50).then(({ data }) => setLog(data ?? []));

  useEffect(() => {
    loadSettings().then(setForm);
    loadPreview();
    loadLog();
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.currentTarget.type === 'checkbox' ? e.currentTarget.checked : e.currentTarget.value });

  async function save(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!/^[A-Za-z0-9]{3,11}$/.test(form.sms_sender)) return setError('The sender name must be 3 to 11 letters or digits, without spaces or å, ä, ö.');
    setBusy(true);
    try {
      await saveSettings({
        sms_enabled: form.sms_enabled,
        sms_hour: Number(form.sms_hour),
        sms_sender: form.sms_sender,
        sms_company_customers: form.sms_company_customers,
        sms_customer_text: form.sms_customer_text.trim(),
        sms_onway_enabled: form.sms_onway_enabled,
        sms_onway_text: form.sms_onway_text.trim(),
        sms_booking_text: form.sms_booking_text.trim(),
      });
      setInfo('Saved.');
      await loadPreview();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function run(action, body = {}) {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const r = await callFunction('sms', { action, ...body });
      setInfo(action === 'test' ? 'The test SMS is sent.' : `${r.sent} SMS sent${r.failed ? `, ${r.failed} failed` : ''}.`);
      await Promise.all([loadPreview(), loadLog()]);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  if (!form) return <p class="muted">Loading …</p>;
  const toSend = (preview?.messages ?? []).filter((m) => !m.skip && !m.sent);

  return (
    <>
      <div class="cp-head">
        <h2>SMS</h2>
      </div>
      <p class="muted">
        The evening before each job, customers get a reminder with the time, address and who is coming, and each person in the team gets one SMS with all their jobs
        for tomorrow. Cancelled jobs are skipped, and nobody gets the same reminder twice.
      </p>
      <ErrorMsg error={error} />
      {info && <p class="msg msg--ok" role="status">{info}</p>}

      {preview && !preview.connected && (
        <section class="cp-panel" style="margin-bottom:16px">
          <h3 class="cp-subhead">Connect 46elks</h3>
          <ol>
            <li>Create an account at <a href="https://46elks.se" target="_blank" rel="noopener">46elks.se</a> and add credit (about 0.50 kr per SMS).</li>
            <li>Copy the <strong>API username</strong> and <strong>API password</strong> from the 46elks dashboard.</li>
            <li>
              In Supabase, open the project, then <strong>Edge Functions → Secrets</strong>, and add <code>ELKS_API_USERNAME</code> and <code>ELKS_API_PASSWORD</code> with
              those values.
            </li>
            <li>Come back here, send a test SMS to your own phone, then turn the reminders on.</li>
          </ol>
        </section>
      )}

      <form class="cp-panel form-grid" onSubmit={save} style="max-width:760px;margin-bottom:16px">
        <h3 class="cp-subhead">Settings</h3>
        <label class="cp-check">
          <input type="checkbox" checked={form.sms_enabled} onChange={set('sms_enabled')} /> Send reminders automatically the evening before
        </label>
        <div class="form-3">
          <div class="field">
            <label for="sms-hour">Send at</label>
            <select id="sms-hour" value={form.sms_hour} onChange={set('sms_hour')}>
              {[16, 17, 18, 19, 20, 21].map((h) => <option value={h}>{h}:00</option>)}
            </select>
          </div>
          <div class="field">
            <label for="sms-sender">Sender name</label>
            <input id="sms-sender" type="text" maxLength={11} value={form.sms_sender} onInput={set('sms_sender')} />
            <small class="hint">3 to 11 letters or digits</small>
          </div>
        </div>
        <label class="cp-check">
          <input type="checkbox" checked={form.sms_company_customers} onChange={set('sms_company_customers')} /> Also send to company customers (for example Spic and Span)
        </label>
        <div class="field">
          <label for="sms-customer">Text to customers (Swedish)</label>
          <textarea id="sms-customer" rows={4} maxLength={600} value={form.sms_customer_text} onInput={set('sms_customer_text')} />
          <small class="hint">
            {'{namn}'} first name, {'{tjanst}'} service, {'{datum}'} date (30/10), {'{tid}'} time, {'{adress}'} address, {'{team}'} who is coming, {'{telefon}'} your phone.
          </small>
        </div>
        <h3 class="cp-subhead">Booking confirmation</h3>
        <div class="field">
          <label for="sms-booking">Text for the booking SMS (Swedish)</label>
          <textarea id="sms-booking" rows={3} maxLength={600} value={form.sms_booking_text} onInput={set('sms_booking_text')} />
          <small class="hint">
            Sent from the job with "Send booking confirmation by SMS", where you can change it first. {'{namn}'} first name, {'{tjanst}'} service, {'{datum}'} weekday and date (fredag 30/10), {'{tid}'} time, {'{adress}'} address, {'{telefon}'} your phone.
          </small>
        </div>
        <h3 class="cp-subhead">On the way</h3>
        <label class="cp-check">
          <input type="checkbox" checked={form.sms_onway_enabled} onChange={set('sms_onway_enabled')} /> Staff can send an SMS to the customer when they tap "We are on our way"
        </label>
        <div class="field">
          <label for="sms-onway">Text when on the way (Swedish)</label>
          <textarea id="sms-onway" rows={3} maxLength={600} value={form.sms_onway_text} onInput={set('sms_onway_text')} />
          <small class="hint">
            {'{namn}'} first name, {'{team}'} who is coming, {'{adress}'} address, {'{minuter}'} minutes until they arrive (staff choose), {'{tjanst}'} service, {'{telefon}'} your phone.
          </small>
        </div>
        <div class="cp-actions">
          <button class="btn" type="submit" disabled={busy}>Save</button>
        </div>
      </form>

      <section class="cp-panel" style="margin-bottom:16px">
        <h3 class="cp-subhead">Tomorrow{preview ? `, ${dayFmt.format(new Date(`${preview.date}T12:00:00Z`))}` : ''}</h3>
        {!preview ? (
          <p class="muted">Loading …</p>
        ) : preview.messages.length === 0 ? (
          <p class="muted">No planned jobs tomorrow.</p>
        ) : (
          <ul class="cp-list">
            {preview.messages.map((m) => (
              <li class="cp-row cp-row--static">
                <span class="cp-row-top">
                  <strong>{KIND[m.kind]}: {m.who}</strong>
                  <span>{m.skip ? 'Not sent' : m.sent ? 'Sent' : m.phone}</span>
                </span>
                {m.skip ? <p class="muted">{m.skip}</p> : <p style="white-space:pre-line">{m.body}</p>}
                {!m.skip && <small class="muted">{smsParts(m.body)} SMS</small>}
              </li>
            ))}
          </ul>
        )}
        <div class="cp-actions" style="margin-top:12px">
          <button class="btn btn--sm" type="button" disabled={busy || !preview?.connected || toSend.length === 0} onClick={() => window.confirm(`Send ${toSend.length} SMS now?`) && run('send_now')}>
            Send tomorrow's SMS now ({toSend.length})
          </button>
        </div>
        {preview?.connected && !preview.enabled && <p class="muted">Automatic sending is off. Turn it on in the settings above.</p>}
      </section>

      <section class="cp-panel" style="margin-bottom:16px">
        <h3 class="cp-subhead">Test</h3>
        <div class="cp-actions">
          <input type="tel" placeholder="Your mobile number" aria-label="Mobile number for the test" value={testPhone} onInput={(e) => setTestPhone(e.currentTarget.value)} style="max-width:220px" />
          <button class="btn btn--ghost btn--sm" type="button" disabled={busy || !preview?.connected} onClick={() => run('test', { phone: testPhone || undefined })}>Send a test SMS</button>
        </div>
      </section>

      <section class="cp-panel">
        <h3 class="cp-subhead">Sent</h3>
        {!log ? (
          <p class="muted">Loading …</p>
        ) : log.length === 0 ? (
          <p class="muted">No SMS sent yet.</p>
        ) : (
          <ul class="cp-list">
            {log.map((r) => (
              <li class="cp-row cp-row--static">
                <span class="cp-row-top">
                  <strong>{KIND[r.kind]} · {r.phone}</strong>
                  <span>{formatDateTime(r.created_at)}</span>
                </span>
                <p style="white-space:pre-line">{r.body}</p>
                {r.status === 'fel' && <small class="msg msg--error">Failed: {r.error}</small>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
