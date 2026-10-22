// Kundens sida för en offert eller faktura: läsa, spara som PDF, och svara på en offert.
import { useEffect, useState } from 'preact/hooks';
import { FUNCTIONS_URL, SUPABASE_KEY } from '../../config/supabase.js';
import DocView from './DocView.jsx';

const call = (init) => fetch(`${FUNCTIONS_URL}/document${init?.query ?? ''}`, { method: init?.method ?? 'GET', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: init?.body });

export default function DocumentPage({ logo }) {
  const token = new URLSearchParams(window.location.search).get('t') ?? '';
  const [data, setData] = useState(undefined);
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState('');

  async function load() {
    try {
      const res = await call({ query: `?t=${encodeURIComponent(token)}` });
      setData(res.ok ? await res.json() : null);
    } catch {
      setData(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function respond(action) {
    setError('');
    if (action === 'accept' && (!agree || name.trim().length < 2)) return setError('Skriv ditt namn och bocka i rutan för att acceptera.');
    if (action === 'decline' && !window.confirm('Vill du tacka nej till offerten?')) return;
    setBusy(true);
    try {
      const res = await call({ method: 'POST', body: JSON.stringify({ t: token, action, name }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Något gick fel. Försök igen eller ring oss.');
      setAnswer(json.status);
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  if (data === undefined) return <p class="doc-loading">Laddar …</p>;
  if (data === null)
    return (
      <div class="doc-missing">
        <h1>Länken fungerar inte</h1>
        <p>Dokumentet finns inte eller så är länken fel. Ring oss på 072 222 88 00 eller mejla info@tostadflytt.se.</p>
      </div>
    );

  const { type, company, doc } = data;
  const open = type === 'offert' && ['skickad', 'oppnad'].includes(doc.status) && !doc.expired;

  return (
    <>
      <div class="doc-bar no-print">
        <button class="btn btn--sm" type="button" onClick={() => window.print()}>Skriv ut eller spara som PDF</button>
        {type === 'faktura' && doc.status === 'skickad' && <span>Betala till bankgiro {company.bankgiro} med OCR {doc.ocr}.</span>}
      </div>
      <DocView type={type} company={company} doc={doc} logo={logo} />
      {type === 'offert' && (
        <section class="doc-answer no-print">
          {(answer === 'accepterad' || doc.status === 'accepterad') && (
            <p class="msg msg--ok">Tack! Offerten är accepterad{doc.decided_name ? ` av ${doc.decided_name}` : ''}. Vi hör av oss och bekräftar datum och tid.</p>
          )}
          {(answer === 'avbojd' || doc.status === 'avbojd') && <p class="msg">Du har tackat nej till offerten. Hör gärna av dig om du ändrar dig.</p>}
          {doc.expired && !['accepterad', 'avbojd'].includes(doc.status) && <p class="msg msg--error">Offerten har gått ut. Kontakta oss så skickar vi en ny.</p>}
          {open && (
            <form class="form-grid" onSubmit={(e) => { e.preventDefault(); respond('accept'); }}>
              <h2>Vill du boka?</h2>
              <div class="field">
                <label for="d-name">Ditt namn</label>
                <input id="d-name" type="text" autocomplete="name" maxLength={200} value={name} onInput={(e) => setName(e.currentTarget.value)} />
              </div>
              <label class="cp-check">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.currentTarget.checked)} />
                <span>Jag accepterar offerten och priset ovan.</span>
              </label>
              {error && <p class="msg msg--error" role="alert">{error}</p>}
              <div class="cp-actions">
                <button class="btn" type="submit" disabled={busy}>{busy ? 'Skickar …' : 'Acceptera offerten'}</button>
                <button class="btn btn--ghost" type="button" disabled={busy} onClick={() => respond('decline')}>Tacka nej</button>
              </div>
            </form>
          )}
        </section>
      )}
    </>
  );
}
