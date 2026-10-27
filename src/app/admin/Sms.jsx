// SMS för hand: skriv numret, välj en mall, fyll i det som saknas och skicka. Inga automatiska utskick.
// Mallarna går att lägga till, ändra och ta bort. Loggen visar allt som har skickats.
import { useEffect, useState } from 'preact/hooks';
import { supabase, callFunction, formatDateTime } from '../../lib/supabase.js';
import { ErrorMsg } from '../ui.jsx';
import { unfilled } from '../../../supabase/functions/sms/messages.js';

const KIND = { manuell: 'Sent by hand', kvall_kund: 'Evening before', kvall_personal: 'Staff', pa_vag: 'On the way', bokning: 'Booking', test: 'Test' };

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
  const [connected, setConnected] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [log, setLog] = useState(null);
  const [phone, setPhone] = useState('');
  const [picked, setPicked] = useState(null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const loadTemplates = () =>
    sb.from('sms_templates').select('*').order('sort').order('created_at').then(({ data }) => setTemplates(data ?? []));
  const loadLog = () =>
    sb.from('sms_log').select('*').order('created_at', { ascending: false }).limit(50).then(({ data }) => setLog(data ?? []));

  useEffect(() => {
    callFunction('sms', { action: 'status' }).then((r) => setConnected(r.connected), () => setConnected(false));
    loadTemplates();
    loadLog();
  }, []);

  function pick(t) {
    setPicked(t.id);
    setText(t.body);
    setInfo('');
  }

  const left = unfilled(text);
  const parts = text.trim() ? smsParts(text.trim()) : 0;

  async function send(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (left.length) return setError(`Fill in ${left.join(', ')} before you send.`);
    if (!window.confirm(`Send this SMS to ${phone}?`)) return;
    setBusy(true);
    try {
      const r = await callFunction('sms', { action: 'send', phone, body: text });
      setInfo(`The SMS is sent to ${r.phone}.`);
      setPhone('');
      setText('');
      setPicked(null);
      await loadLog();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function saveTemplate(e) {
    e.preventDefault();
    setError('');
    const values = { name: editing.name.trim(), body: editing.body.trim() };
    if (!values.name || !values.body) return setError('Write a name and a text for the template.');
    const q = editing.id
      ? sb.from('sms_templates').update(values).eq('id', editing.id)
      : sb.from('sms_templates').insert({ ...values, sort: (templates?.length ?? 0) + 1 });
    const { error: err } = await q;
    if (err) return setError('Could not save the template.');
    setEditing(null);
    await loadTemplates();
  }

  async function removeTemplate(t) {
    if (!window.confirm(`Delete the template "${t.name}"?`)) return;
    const { error: err } = await sb.from('sms_templates').delete().eq('id', t.id);
    if (err) return setError('Could not delete the template.');
    if (picked === t.id) setPicked(null);
    await loadTemplates();
  }

  return (
    <>
      <div class="cp-head">
        <h2>SMS</h2>
      </div>
      <p class="muted">
        SMS are only sent when you send them here. Write the number, choose a template, fill in what is in [brackets] and send. Each SMS costs about 0.50 kr.
      </p>
      <ErrorMsg error={error} />
      {info && <p class="msg msg--ok" role="status">{info}</p>}

      {connected === false && (
        <section class="cp-panel" style="margin-bottom:16px">
          <h3 class="cp-subhead">Connect 46elks</h3>
          <p>
            In Supabase, open the project, then <strong>Edge Functions → Secrets</strong>, and add <code>ELKS_API_USERNAME</code> and <code>ELKS_API_PASSWORD</code> from the
            46elks dashboard.
          </p>
        </section>
      )}

      <form class="cp-panel form-grid" onSubmit={send} style="max-width:760px;margin-bottom:16px">
        <h3 class="cp-subhead">Send an SMS</h3>
        <div class="field">
          <label for="sms-to">Mobile number</label>
          <input id="sms-to" type="tel" inputmode="tel" autocomplete="off" required placeholder="070 123 45 67" value={phone} onInput={(e) => setPhone(e.currentTarget.value)} style="max-width:260px" />
        </div>
        <div class="field">
          <span class="lbl">Template</span>
          {templates === null ? (
            <p class="muted">Loading …</p>
          ) : (
            <div class="cp-tabs sms-templates" role="group" aria-label="Templates">
              {templates.map((t) => (
                <button type="button" aria-pressed={picked === t.id} onClick={() => pick(t)}>
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div class="field">
          <label for="sms-text">Message</label>
          <textarea id="sms-text" rows={5} maxLength={600} required value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder="Choose a template or write your own message" />
          <small class="hint">
            {text.length} characters{parts ? `, ${parts} SMS` : ''}
            {left.length > 0 && <strong class="sms-left"> · Fill in {left.join(', ')}</strong>}
          </small>
        </div>
        <div class="cp-actions">
          <button class="btn" type="submit" disabled={busy || !connected || !phone.trim() || !text.trim() || left.length > 0}>
            {busy ? 'Sending …' : 'Send SMS'}
          </button>
        </div>
      </form>

      <section class="cp-panel" style="max-width:760px;margin-bottom:16px">
        <div class="cp-head" style="margin-bottom:8px">
          <h3 class="cp-subhead" style="margin:0">Templates</h3>
          <button class="btn btn--ghost btn--sm" type="button" onClick={() => setEditing({ name: '', body: '' })}>New template</button>
        </div>
        {editing && (
          <form class="form-grid sms-edit" onSubmit={saveTemplate}>
            <div class="field">
              <label for="tpl-name">Name</label>
              <input id="tpl-name" type="text" maxLength={60} required value={editing.name} onInput={(e) => setEditing({ ...editing, name: e.currentTarget.value })} />
            </div>
            <div class="field">
              <label for="tpl-body">Text (Swedish)</label>
              <textarea id="tpl-body" rows={4} maxLength={600} required value={editing.body} onInput={(e) => setEditing({ ...editing, body: e.currentTarget.value })} />
              <small class="hint">Put what changes each time in brackets, for example [tid] or [adress]. You must fill them in before sending.</small>
            </div>
            <div class="cp-actions">
              <button class="btn btn--sm" type="submit">Save template</button>
              <button class="btn btn--ghost btn--sm" type="button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        )}
        {templates?.length === 0 && <p class="muted">No templates yet.</p>}
        <ul class="cp-list">
          {(templates ?? []).map((t) => (
            <li class="cp-row cp-row--static">
              <span class="cp-row-top">
                <strong>{t.name}</strong>
                <span class="cp-actions" style="margin:0">
                  <button class="btn btn--ghost btn--sm" type="button" onClick={() => setEditing({ id: t.id, name: t.name, body: t.body })}>Edit</button>
                  <button class="btn btn--ghost btn--sm" type="button" onClick={() => removeTemplate(t)}>Delete</button>
                </span>
              </span>
              <p style="white-space:pre-line">{t.body}</p>
            </li>
          ))}
        </ul>
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
                  <strong>{KIND[r.kind] ?? r.kind} · {r.phone}</strong>
                  <span>{formatDateTime(r.created_at)}</span>
                </span>
                <p style="white-space:pre-line">{r.body}</p>
                {r.status === 'fel' && <small class="msg msg--error">Failed</small>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
