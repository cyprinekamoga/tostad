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
    if (e) return setError('Could not load the customers.');
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
        <h2>Customers</h2>
        <button class="btn btn--sm" type="button" onClick={() => setEditing({ ...EMPTY })}>New customer</button>
      </div>
      <ErrorMsg error={error} />
      <div class="cp-panel">
        <label class="visually-hidden" for="cust-search">Search customer</label>
        <input id="cust-search" type="search" placeholder="Search by name, phone, email or city" value={search} onInput={(e) => setSearch(e.currentTarget.value)} />
        {rows === null && <p class="muted">Loading …</p>}
        {rows?.length === 0 && <p class="cp-empty">No customers yet. Create one here or from an item in the inbox.</p>}
        {shown.length > 0 && (
          <div class="cp-scroll">
            <table class="cp-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>City</th>
                  <th><span class="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr>
                    <td>
                      <strong>{c.name}</strong> {c.kind === 'company' && <span class="badge badge--muted">Company</span>}
                    </td>
                    <td><Phone value={c.phone} /></td>
                    <td><Email value={c.email} /></td>
                    <td>{c.city}</td>
                    <td>
                      <div class="cp-actions">
                        <button class="btn btn--ghost btn--sm" type="button" onClick={() => setEditing(c)}>Open</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows?.length > 0 && shown.length === 0 && <p class="cp-empty">No customer matches the search.</p>}
      </div>
      <Modal open={!!editing} label="Customer" onClose={() => { setEditing(null); window.history.replaceState(null, '', window.location.pathname); }}>
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
    if (saveError) return setError('Could not save. Check the fields.');
    onDone();
  }

  async function remove() {
    if (!window.confirm(`Remove ${customer.name} from the customer register?`)) return;
    setBusy(true);
    const { error: removeError } = await sb.from('customers').delete().eq('id', customer.id);
    setBusy(false);
    if (removeError) return setError('Could not remove the customer.');
    onDone();
  }

  return (
    <form onSubmit={save}>
      <h3>{isNew ? 'New customer' : customer.name}</h3>
      {!isNew && <p class="muted">Created {formatDateTime(customer.created_at)}</p>}
      <div class="cp-tabs" role="group" aria-label="Customer type">
        <button type="button" aria-pressed={form.kind === 'private'} onClick={() => setForm({ ...form, kind: 'private' })}>Private person</button>
        <button type="button" aria-pressed={form.kind === 'company'} onClick={() => setForm({ ...form, kind: 'company' })}>Company</button>
      </div>
      <div class="field">
        <label for="c-name">{form.kind === 'company' ? 'Company name' : 'Name'}</label>
        <input id="c-name" type="text" required maxLength={200} value={form.name} onInput={set('name')} />
      </div>
      <div class="form-2">
        <div class="field">
          <label for="c-phone">Phone</label>
          <input id="c-phone" type="tel" maxLength={40} value={form.phone} onInput={set('phone')} />
        </div>
        <div class="field">
          <label for="c-email">Email</label>
          <input id="c-email" type="email" maxLength={254} value={form.email} onInput={set('email')} />
        </div>
      </div>
      <div class="field">
        <label for="c-street">Address</label>
        <input id="c-street" type="text" maxLength={200} value={form.street} onInput={set('street')} />
      </div>
      <div class="form-2">
        <div class="field">
          <label for="c-zip">Postcode</label>
          <input id="c-zip" type="text" inputmode="numeric" maxLength={10} value={form.postal_code} onInput={set('postal_code')} />
        </div>
        <div class="field">
          <label for="c-city">City</label>
          <input id="c-city" type="text" maxLength={100} value={form.city} onInput={set('city')} />
        </div>
      </div>
      {form.kind === 'company' && (
        <div class="field">
          <label for="c-org">Company registration number</label>
          <input id="c-org" type="text" maxLength={20} value={form.org_nr} onInput={set('org_nr')} />
        </div>
      )}
      <div class="field">
        <label for="c-notes">Notes</label>
        <textarea id="c-notes" maxLength={5000} value={form.notes} onInput={set('notes')} />
      </div>
      {!isNew && <PortalBox customer={customer} />}
      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit" disabled={busy}>{busy ? 'Saving …' : 'Save'}</button>
        <button class="btn btn--ghost" type="button" onClick={onDone}>Cancel</button>
        {!isNew && <button class="btn btn--danger" type="button" disabled={busy} onClick={remove}>Remove</button>}
      </div>
    </form>
  );
}

// Kundportalen: personlig länk som kunden får via SMS eller mejl. En ny länk gör den gamla ogiltig.
// Texten till kunden är på svenska.
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
    if (token && next && !window.confirm('The old link will stop working. Create a new one?')) return;
    if (!next && !window.confirm('Turn off the customer\'s link? The customer cannot open their page until you create a new link.')) return;
    setError('');
    const value = next ? crypto.randomUUID() : null;
    const { error: e } = await sb.from('customers').update({ portal_token: value, portal_created_at: next ? new Date().toISOString() : null, portal_off: !next }).eq('id', customer.id);
    if (e) return setError('Could not save the link.');
    setToken(value);
    setCopied(false);
  }

  return (
    <fieldset class="cp-fieldset">
      <legend>Customer portal (Mina sidor)</legend>
      {!token ? (
        <>
          <p class="muted" style="margin:0">The customer can see their bookings, photo reports, quotes and invoices and send messages. Create a personal link and send it to the customer.</p>
          <div><button class="btn btn--sm" type="button" onClick={() => setNew(true)}>Create link</button></div>
        </>
      ) : (
        <>
          <div class="cp-link-box">{url}</div>
          <small class="muted">
            {customer.portal_seen_at ? `Last opened ${formatDateTime(customer.portal_seen_at)}` : 'Not opened yet'}
          </small>
          <div class="cp-actions">
            <button class="btn btn--sm" type="button" onClick={async () => setCopied(await copyText(text))}>{copied ? 'The text is copied' : 'Copy text with link'}</button>
            {phone && <a class="btn btn--ghost btn--sm" href={`sms:${phone}?body=${encodeURIComponent(text)}`}>Send as SMS</a>}
            {customer.email && <a class="btn btn--ghost btn--sm" href={`mailto:${customer.email}?subject=${encodeURIComponent('Dina sidor hos TO Städ & Flytt')}&body=${encodeURIComponent(text)}`}>Send as email</a>}
            <a class="btn btn--ghost btn--sm" href={url} target="_blank" rel="noopener">Open</a>
          </div>
          <div class="cp-actions">
            <button class="st-link" type="button" onClick={() => setNew(true)}>Create new link</button>
            <button class="st-link" type="button" onClick={() => setNew(false)}>Turn off</button>
          </div>
        </>
      )}
      <ErrorMsg error={error} />
    </fieldset>
  );
}
