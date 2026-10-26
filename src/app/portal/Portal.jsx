// Kundportalen: kommande bokningar, att betala, offerter, tidigare jobb med fotorapport och
// meddelanden till oss. Kunden kommer hit med en personlig länk (/kund?k=...). Nyckeln sparas
// i webbläsaren och tas bort ur adressfältet.
import { useEffect, useState } from 'preact/hooks';
import { FUNCTIONS_URL, SUPABASE_KEY } from '../../config/supabase.js';
import { formatKrWhole } from '../../lib/money.js';
import { zoned, today } from '../../lib/planner.js';
import { site } from '../../config/site.js';

const STORE = 'tostad-kund';
const SERVICES = {
  flytt: 'Flytt',
  flyttstadning: 'Flyttstädning',
  paket: 'Flytt + flyttstädning',
  hemstadning: 'Hemstädning',
  storstadning: 'Storstädning',
  fonsterputs: 'Fönsterputs',
  kontor: 'Kontorsstädning',
  pianoflytt: 'Pianoflytt / tunga lyft',
  annat: 'Uppdrag',
};
const TOPICS = ['Fråga om en bokning', 'Ändra eller avboka', 'Ändra mina uppgifter', 'Fråga om en faktura', 'Annat'];
const dayFmt = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayName = (d) => {
  const s = dayFmt.format(new Date(`${d}T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const short = (d) => (d ? shortFmt.format(new Date(`${d.slice(0, 10)}T12:00:00Z`)) : '');
const place = (j, to = false) =>
  [to ? j.to_street : j.street, [to ? j.to_postal_code : j.postal_code, to ? j.to_city : j.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
const docLink = (token) => `/dokument?t=${token}`;

function readKey() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('k');
  try {
    if (fromUrl) localStorage.setItem(STORE, fromUrl);
    if (fromUrl) window.history.replaceState(null, '', window.location.pathname);
    return fromUrl || localStorage.getItem(STORE);
  } catch {
    return fromUrl;
  }
}

export default function Portal() {
  const [key] = useState(readKey);
  const [data, setData] = useState(undefined);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!key) return setData(null);
    fetch(`${FUNCTIONS_URL}/portal?k=${encodeURIComponent(key)}`, { headers: { apikey: SUPABASE_KEY } })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData, () => setData(null));
  }, []);

  function forget() {
    try {
      localStorage.removeItem(STORE);
    } catch {
      /* ignoreras */
    }
    window.location.assign('/');
  }

  function write(t) {
    setTopic(t);
    setSent(false);
    document.getElementById('meddelande')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function send(e) {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      const res = await fetch(`${FUNCTIONS_URL}/portal`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ k: key, topic, message }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Kunde inte skicka. Försök igen eller ring oss.');
      setSent(true);
      setMessage('');
    } catch (err) {
      setError(err.message);
    }
    setSending(false);
  }

  if (data === undefined) return <p class="kp-loading">Laddar …</p>;
  if (data === null)
    return (
      <section class="kp-card kp-welcome">
        <h1>Mina sidor</h1>
        <p>Här ser du dina bokningar, fotorapporter, offerter och fakturor. Du kommer in med den personliga länk som du har fått av oss i ett SMS eller mejl.</p>
        <AskForLink />
        <p>Du kan också ringa oss på <a href={site.phoneHref}>{site.phone}</a> eller mejla <a href={`mailto:${site.email}`}>{site.email}</a> så skickar vi en ny länk.</p>
        <a class="btn" href="/boka">Boka ett nytt uppdrag</a>
      </section>
    );

  const { customer, jobs, quotes, invoices, bankgiro } = data;
  const now = Date.now();
  const upcoming = jobs.filter((j) => j.status === 'planerad' && Date.parse(j.ends_at) > now).reverse();
  const done = jobs.filter((j) => j.status === 'klar');
  const toPay = invoices.filter((i) => i.kind === 'faktura' && i.status === 'skickad');
  const openQuotes = quotes.filter((q) => ['skickad', 'oppnad'].includes(q.status) && (!q.valid_until || q.valid_until >= today()));
  const first = customer.name.split(' ')[0];

  return (
    <div class="kp">
      <header class="kp-hello">
        <h1>Hej {customer.company ? customer.name : first}!</h1>
        <p>Här ser du allt som gäller dina uppdrag hos {site.name}.</p>
      </header>

      {openQuotes.length > 0 && (
        <section class="kp-section">
          <h2>Offerter att svara på</h2>
          {openQuotes.map((q) => (
            <a class="kp-card kp-row" href={docLink(q.token)}>
              <span>
                <strong>Offert {q.number}: {SERVICES[q.service]}</strong>
                <small>{formatKrWhole(q.to_pay)}{Number(q.rut) ? ' efter RUT' : ''}{q.valid_until ? ` · gäller till ${short(q.valid_until)}` : ''}</small>
              </span>
              <span class="kp-go">Läs och svara</span>
            </a>
          ))}
        </section>
      )}

      <section class="kp-section">
        <h2>Kommande</h2>
        {upcoming.length === 0 && <p class="kp-empty">Inga bokade uppdrag just nu. <a href="/boka">Boka här</a>.</p>}
        {upcoming.map((j) => {
          const z = zoned(j.starts_at);
          const onWayToday = j.on_way_at && zoned(j.on_way_at).date === today();
          return (
            <article class="kp-card kp-job">
              <div class="kp-date">
                <strong>{dayName(z.date)}</strong>
                <span>kl {z.time} till {zoned(j.ends_at).time}</span>
              </div>
              <p class="kp-service">{SERVICES[j.service]}{j.title ? `: ${j.title}` : ''}</p>
              {place(j) && <p>{place(j)}{j.to_street ? ` → ${place(j, true)}` : ''}</p>}
              {j.team.length > 0 && <p class="kp-muted">Ni får besök av {j.team.join(' och ')}.</p>}
              {onWayToday && <p class="kp-badge">Vi är på väg till dig nu</p>}
              <button class="kp-link" type="button" onClick={() => write('Ändra eller avboka')}>Ändra eller avboka</button>
            </article>
          );
        })}
        {upcoming.length > 0 && <p class="kp-muted kp-fine">Du kan boka om eller avboka utan kostnad fram till {site.promises.lateCancelHours} timmar före start.</p>}
      </section>

      {toPay.length > 0 && (
        <section class="kp-section">
          <h2>Att betala</h2>
          {toPay.map((i) => {
            const late = i.due_date && i.due_date < today();
            return (
              <article class={`kp-card kp-invoice${late ? ' is-late' : ''}`}>
                <div class="kp-row">
                  <span>
                    <strong>Faktura {i.number}</strong>
                    <small>{late ? 'Förföll' : 'Förfaller'} {short(i.due_date)}</small>
                  </span>
                  <strong class="kp-amount">{formatKrWhole(Number(i.to_pay) + Number(i.reminder_fee || 0))}</strong>
                </div>
                {Number(i.reminder_fee) > 0 && <small>Inklusive påminnelseavgift {formatKrWhole(i.reminder_fee)}</small>}
                {bankgiro && <p class="kp-pay">Bankgiro <strong>{bankgiro}</strong> · OCR <strong>{i.ocr}</strong></p>}
                <a class="kp-link" href={docLink(i.token)}>Visa fakturan (PDF)</a>
              </article>
            );
          })}
        </section>
      )}

      <section class="kp-section">
        <h2>Tidigare uppdrag</h2>
        {done.length === 0 && <p class="kp-empty">Här visas dina uppdrag och fotorapporter när de är klara.</p>}
        {done.map((j) => (
          <article class="kp-card kp-job">
            <div class="kp-date">
              <strong>{SERVICES[j.service]}</strong>
              <span>{short(j.done_at ?? j.starts_at)}</span>
            </div>
            {place(j) && <p class="kp-muted">{place(j)}</p>}
            {j.photos.length > 0 ? (
              <details class="kp-photos">
                <summary>Fotorapport ({j.photos.length} {j.photos.length === 1 ? "bild" : "bilder"})</summary>
                <div class="kp-grid">
                  {j.photos.map((p) => (
                    <a href={p.url} target="_blank" rel="noopener">
                      <img src={p.url} alt={p.kind === 'fore' ? 'Före' : p.kind === 'skada' ? 'Skada' : 'Efter'} loading="lazy" />
                      <span>{p.kind === 'fore' ? 'Före' : p.kind === 'skada' ? 'Skada' : 'Efter'}</span>
                    </a>
                  ))}
                </div>
              </details>
            ) : (
              <p class="kp-muted">Ingen fotorapport för det här uppdraget.</p>
            )}
            <div class="kp-actions">
              <a class="btn btn--ghost btn--sm" href={`/boka?tjanst=${j.service}`}>Boka igen</a>
              <a class="kp-link" href="/skadeanmalan">Anmäl en skada</a>
            </div>
          </article>
        ))}
      </section>

      {(invoices.length > toPay.length || quotes.length > openQuotes.length) && (
        <section class="kp-section">
          <details class="kp-card">
            <summary>Alla fakturor och offerter</summary>
            <ul class="kp-list">
              {invoices.map((i) => (
                <li>
                  <a href={docLink(i.token)}>{i.kind === 'kredit' ? 'Kreditfaktura' : 'Faktura'} {i.number}</a>
                  <span>{short(i.issue_date)} · {formatKrWhole(i.to_pay)} · {i.status === 'betald' ? 'betald' : i.status === 'krediterad' ? 'krediterad' : i.kind === 'kredit' ? 'kredit' : 'obetald'}</span>
                </li>
              ))}
              {quotes.map((q) => (
                <li>
                  <a href={docLink(q.token)}>Offert {q.number}</a>
                  <span>{SERVICES[q.service]} · {formatKrWhole(q.to_pay)} · {q.status === 'accepterad' ? 'accepterad' : q.status === 'avbojd' ? 'avböjd' : 'öppen'}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      <section class="kp-section">
        <h2>Mina uppgifter</h2>
        <div class="kp-card">
          <p><strong>{customer.name}</strong></p>
          {customer.phone && <p>{customer.phone}</p>}
          {customer.email && <p>{customer.email}</p>}
          {customer.street && <p>{[customer.street, [customer.postal_code, customer.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</p>}
          <button class="kp-link" type="button" onClick={() => write('Ändra mina uppgifter')}>Något som inte stämmer?</button>
        </div>
      </section>

      <section class="kp-section" id="meddelande">
        <h2>Skicka ett meddelande</h2>
        {sent ? (
          <p class="kp-card kp-ok" role="status">Tack! Vi har fått ditt meddelande och svarar {site.responseTime}.</p>
        ) : (
          <form class="kp-card form-grid" onSubmit={send}>
            <div class="field">
              <label for="kp-topic">Gäller</label>
              <select id="kp-topic" value={topic} onChange={(e) => setTopic(e.currentTarget.value)}>
                {TOPICS.map((t) => <option>{t}</option>)}
              </select>
            </div>
            <div class="field">
              <label for="kp-msg">Meddelande</label>
              <textarea id="kp-msg" rows={4} required minLength={3} maxLength={4000} value={message} onInput={(e) => setMessage(e.currentTarget.value)} />
            </div>
            {error && <p class="kp-error" role="alert">{error}</p>}
            <button class="btn" type="submit" disabled={sending}>{sending ? 'Skickar …' : 'Skicka'}</button>
          </form>
        )}
        <p class="kp-muted kp-fine">Bråttom? Ring <a href={site.phoneHref}>{site.phone}</a>.</p>
      </section>

      <footer class="kp-foot">
        <a class="btn" href="/boka">Boka ett nytt uppdrag</a>
        <button class="kp-link" type="button" onClick={forget}>Logga ut från den här enheten</button>
      </footer>
    </div>
  );
}

// Kunden ber om sin länk via mejl. Svaret är detsamma oavsett om adressen finns hos oss.
function AskForLink() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setState('');
    try {
      const res = await fetch(`${FUNCTIONS_URL}/email`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'portal_link', email: email.trim() }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setState(json.error || 'Något gick fel. Försök igen.');
      else setState(json.unavailable ? 'unavailable' : 'sent');
    } catch {
      setState('Något gick fel. Försök igen.');
    }
    setBusy(false);
  }

  if (state === 'unavailable') return <p>Har du ingen länk, eller fungerar den inte längre?</p>;
  if (state === 'sent')
    return <p class="kp-ok" role="status">Om adressen finns hos oss har vi skickat din personliga länk till den. Titta i inkorgen och i skräpposten.</p>;
  return (
    <form class="kp-ask" onSubmit={send}>
      <label for="kp-ask-email">Har du ingen länk? Skriv din e-postadress så mejlar vi den till dig.</label>
      <div>
        <input id="kp-ask-email" type="email" autocomplete="email" required value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
        <button class="btn" type="submit" disabled={busy}>{busy ? 'Skickar …' : 'Skicka länken'}</button>
      </div>
      {state && <p class="kp-error" role="alert">{state}</p>}
    </form>
  );
}
