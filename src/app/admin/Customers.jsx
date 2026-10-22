// Kundregistret: sök, lägg till, ändra och ta bort kunder.
import { useEffect, useState } from 'preact/hooks';
import { supabase, formatDateTime } from '../../lib/supabase.js';
import { Modal, ErrorMsg, copyText, Phone, Email } from '../ui.jsx';

const EMPTY = { kind: 'private', name: '', email: '', phone: '', street: '', postal_code: '', city: '', org_nr: '', notes: '' };

export default function Customers() {
  const sb = supabase();
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    const { data, error: e } = await sb.from('customers').select('*').order('name').limit(1000);
    if (e) return setError('Kunde inte hämta kunderna.');
    setRows(data);
    const wanted = window.location.hash.slice(1);
    const hit = wanted && data.find((c) => c.id === wanted);
    if (hit) setEditing(hit);
  }

  useEffect(() => {
    load();
  }, []);

  const q = search.trim().toLowerCase();
  const shown = (rows ?? []).filter((c) => !q || [c.name, c.email, c.phone, c.city, c.street, c.org_nr].some((v) => v?.toLowerCase().includes(q)));

  return (
    <>
      <div class="cp-head">
        <h2>Kunder</h2>
        <button class="btn btn--sm" type="button" onClick={() => setEditing({ ...EMPTY })}>Ny kund</button>
      </div>
      <ErrorMsg error={error} />
      <div class="cp-panel">
        <label class="visually-hidden" for="cust-search">Sök kund</label>
        <input id="cust-search" type="search" placeholder="Sök på namn, telefon, mejl eller ort" value={search} onInput={(e) => setSearch(e.currentTarget.value)} />
        {rows === null && <p class="muted">Laddar …</p>}
        {rows?.length === 0 && <p class="cp-empty">Inga kunder ännu. Skapa en här eller från ett ärende i inkorgen.</p>}
        {shown.length > 0 && (
          <div class="cp-scroll">
            <table class="cp-table">
              <thead>
                <tr>
                  <th>Namn</th>
                  <th>Telefon</th>
                  <th>Mejl</th>
                  <th>Ort</th>
                  <th><span class="visually-hidden">Åtgärder</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr>
                    <td>
                      <strong>{c.name}</strong> {c.kind === 'company' && <span class="badge badge--muted">Företag</span>}
                    </td>
                    <td><Phone value={c.phone} /></td>
                    <td><Email value={c.email} /></td>
                    <td>{c.city}</td>
                    <td>
                      <div class="cp-actions">
                        <button class="btn btn--ghost btn--sm" type="button" onClick={() => setEditing(c)}>Öppna</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows?.length > 0 && shown.length === 0 && <p class="cp-empty">Ingen kund matchar sökningen.</p>}
      </div>
      <Modal open={!!editing} label="Kund" onClose={() => { setEditing(null); window.history.replaceState(null, '', window.location.pathname); }}>
        {editing && <CustomerForm customer={editing} onDone={() => { setEditing(null); window.history.replaceState(null, '', window.location.pathname); load(); }} />}
      </Modal>
    </>
  );
}

function CustomerForm({ customer, onDone }) {
  const sb = supabase();
  const [form, setForm] = useState({ ...EMPTY, ...Object.fromEntries(Object.entries(customer).map(([k, v]) => [k, v ?? ''])) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isNew = !customer.id;
  const set = (key) => (e) => setForm({ ...form, [key]: e.currentTarget.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = Object.fromEntries(Object.keys(EMPTY).map((k) => [k, form[k].trim() || null]));
    payload.kind = form.kind;
    payload.name = form.name.trim();
    const { error: saveError } = isNew ? await sb.from('customers').insert(payload) : await sb.from('customers').update(payload).eq('id', customer.id);
    setBusy(false);
    if (saveError) return setError('Kunde inte spara. Kontrollera fälten.');
    onDone();
  }

  async function remove() {
    if (!window.confirm(`Ta bort ${customer.name} ur kundregistret?`)) return;
    setBusy(true);
    const { error: removeError } = await sb.from('customers').delete().eq('id', customer.id);
    setBusy(false);
    if (removeError) return setError('Kunde inte ta bort kunden.');
    onDone();
  }

  return (
    <form onSubmit={save}>
      <h3>{isNew ? 'Ny kund' : customer.name}</h3>
      {!isNew && <p class="muted">Skapad {formatDateTime(customer.created_at)}</p>}
      <div class="cp-tabs" role="group" aria-label="Kundtyp">
        <button type="button" aria-pressed={form.kind === 'private'} onClick={() => setForm({ ...form, kind: 'private' })}>Privatperson</button>
        <button type="button" aria-pressed={form.kind === 'company'} onClick={() => setForm({ ...form, kind: 'company' })}>Företag</button>
      </div>
      <div class="field">
        <label for="c-name">{form.kind === 'company' ? 'Företagsnamn' : 'Namn'}</label>
        <input id="c-name" type="text" required maxLength={200} value={form.name} onInput={set('name')} />
      </div>
      <div class="form-2">
        <div class="field">
          <label for="c-phone">Telefon</label>
          <input id="c-phone" type="tel" maxLength={40} value={form.phone} onInput={set('phone')} />
        </div>
        <div class="field">
          <label for="c-email">Mejl</label>
          <input id="c-email" type="email" maxLength={254} value={form.email} onInput={set('email')} />
        </div>
      </div>
      <div class="field">
        <label for="c-street">Adress</label>
        <input id="c-street" type="text" maxLength={200} value={form.street} onInput={set('street')} />
      </div>
      <div class="form-2">
        <div class="field">
          <label for="c-zip">Postnummer</label>
          <input id="c-zip" type="text" inputmode="numeric" maxLength={10} value={form.postal_code} onInput={set('postal_code')} />
        </div>
        <div class="field">
          <label for="c-city">Ort</label>
          <input id="c-city" type="text" maxLength={100} value={form.city} onInput={set('city')} />
        </div>
      </div>
      {form.kind === 'company' && (
        <div class="field">
          <label for="c-org">Organisationsnummer</label>
          <input id="c-org" type="text" maxLength={20} value={form.org_nr} onInput={set('org_nr')} />
        </div>
      )}
      <div class="field">
        <label for="c-notes">Anteckningar</label>
        <textarea id="c-notes" maxLength={5000} value={form.notes} onInput={set('notes')} />
      </div>
      {!isNew && <PortalBox customer={customer} />}
      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit" disabled={busy}>{busy ? 'Sparar …' : 'Spara'}</button>
        <button class="btn btn--ghost" type="button" onClick={onDone}>Avbryt</button>
        {!isNew && <button class="btn btn--danger" type="button" disabled={busy} onClick={remove}>Ta bort</button>}
      </div>
    </form>
  );
}

// Kundportalen: personlig länk som kunden får via SMS eller mejl. En ny länk gör den gamla ogiltig.
function PortalBox({ customer }) {
  const sb = supabase();
  const [token, setToken] = useState(customer.portal_token ?? null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const url = token ? `${window.location.origin}/kund?k=${token}` : '';
  const first = (customer.name ?? '').split(' ')[0];
  const text = `Hej ${first}! Här är din personliga länk till Mina sidor hos TO Städ & Flytt. Där ser du dina bokningar, fotorapporter, offerter och fakturor:\n${url}\n\nSpara länken, den är bara till dig.\n\nVänliga hälsningar\nTO Städ & Flytt`;
  const phone = (customer.phone ?? '').replace(/[^\d+]/g, '');

  async function setNew(next) {
    if (token && next && !window.confirm('Den gamla länken slutar fungera. Skapa en ny?')) return;
    if (!next && !window.confirm('Stänga av kundens länk? Kunden kommer inte in på Mina sidor förrän du skapar en ny.')) return;
    setError('');
    const value = next ? crypto.randomUUID() : null;
    const { error: e } = await sb.from('customers').update({ portal_token: value, portal_created_at: next ? new Date().toISOString() : null }).eq('id', customer.id);
    if (e) return setError('Kunde inte spara länken.');
    setToken(value);
    setCopied(false);
  }

  return (
    <fieldset class="cp-fieldset">
      <legend>Mina sidor för kunden</legend>
      {!token ? (
        <>
          <p class="muted" style="margin:0">Kunden kan se sina bokningar, fotorapporter, offerter och fakturor och skicka meddelanden. Skapa en personlig länk och skicka den till kunden.</p>
          <div><button class="btn btn--sm" type="button" onClick={() => setNew(true)}>Skapa länk</button></div>
        </>
      ) : (
        <>
          <div class="cp-link-box">{url}</div>
          <small class="muted">
            {customer.portal_seen_at ? `Senast öppnad ${formatDateTime(customer.portal_seen_at)}` : 'Inte öppnad ännu'}
          </small>
          <div class="cp-actions">
            <button class="btn btn--sm" type="button" onClick={async () => setCopied(await copyText(text))}>{copied ? 'Texten är kopierad' : 'Kopiera text med länk'}</button>
            {phone && <a class="btn btn--ghost btn--sm" href={`sms:${phone}?body=${encodeURIComponent(text)}`}>Skicka som SMS</a>}
            {customer.email && <a class="btn btn--ghost btn--sm" href={`mailto:${customer.email}?subject=${encodeURIComponent('Dina sidor hos TO Städ & Flytt')}&body=${encodeURIComponent(text)}`}>Skicka som mejl</a>}
            <a class="btn btn--ghost btn--sm" href={url} target="_blank" rel="noopener">Öppna</a>
          </div>
          <div class="cp-actions">
            <button class="st-link" type="button" onClick={() => setNew(true)}>Skapa ny länk</button>
            <button class="st-link" type="button" onClick={() => setNew(false)}>Stäng av</button>
          </div>
        </>
      )}
      <ErrorMsg error={error} />
    </fieldset>
  );
}
