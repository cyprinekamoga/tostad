// Personal: lägg till, skicka inloggningslänk, ändra uppgifter, roll och stäng av.
import { useEffect, useState } from 'preact/hooks';
import { supabase, callFunction } from '../../lib/supabase.js';
import { Modal, ErrorMsg, Phone, Email, copyText } from '../ui.jsx';

const ROLE = { owner: 'Ägare', admin: 'Administratör', employee: 'Personal' };
const ORDER = { owner: 0, admin: 1, employee: 2 };
// Tydligt olika färger för personalen. En ny person får den första som ingen annan har.
const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#ca8a04', '#4b5563', '#0d9488'];

export default function Staff({ me }) {
  const sb = supabase();
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [link, setLink] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [pwFor, setPwFor] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const isOwner = me.profile.role === 'owner';

  async function load() {
    const { data, error: e } = await sb.from('profiles').select('*');
    if (e) return setError('Kunde inte hämta personalen.');
    setRows(data.sort((a, b) => Number(b.active) - Number(a.active) || ORDER[a.role] - ORDER[b.role] || a.full_name.localeCompare(b.full_name, 'sv')));
  }

  useEffect(() => {
    load();
    // Från rekryteringen: öppna formuläret med den anställdas uppgifter.
    const q = new URLSearchParams(window.location.search);
    if (q.get('ny')) {
      setAdding({ full_name: q.get('namn') ?? '', email: q.get('epost') ?? '', phone: q.get('tel') ?? '' });
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const admins = (rows ?? []).filter((p) => p.active && p.role !== 'employee').length;
  const canManage = (p) => p.role === 'employee' || isOwner;

  async function act(person, body, after) {
    setBusyId(person.id);
    setError('');
    try {
      const result = await callFunction('staff-admin', { ...body, user_id: person.id });
      after?.(result);
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusyId('');
  }

  return (
    <>
      <div class="cp-head">
        <h2>Personal</h2>
        <button class="btn btn--sm" type="button" onClick={() => setAdding(true)}>Lägg till person</button>
      </div>
      <ErrorMsg error={error} />
      <div class="cp-panel">
        {rows === null && <p class="muted">Laddar …</p>}
        {rows?.length > 0 && (
          <div class="cp-scroll">
            <table class="cp-table">
              <thead>
                <tr>
                  <th>Namn</th>
                  <th>Roll</th>
                  <th>Telefon</th>
                  <th>Mejl</th>
                  <th><span class="visually-hidden">Åtgärder</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr style={p.active ? undefined : 'opacity:.6'}>
                    <td>
                      <span class="dot" style={`background:${p.color}`} /> <strong>{p.full_name}</strong>
                      {!p.active && <span class="badge badge--muted">Avstängd</span>}
                    </td>
                    <td>{ROLE[p.role]}</td>
                    <td><Phone value={p.phone} /></td>
                    <td><Email value={p.email} /></td>
                    <td>
                      {canManage(p) && (
                        <div class="cp-actions">
                          {p.active && (
                            <button class="btn btn--ghost btn--sm" type="button" disabled={busyId === p.id} onClick={() => act(p, { action: 'link' }, (r) => setLink({ person: p, url: r.link }))}>
                              Inloggningslänk
                            </button>
                          )}
                          {p.active && <button class="btn btn--ghost btn--sm" type="button" onClick={() => setPwFor(p)}>Nytt lösenord</button>}
                          <button class="btn btn--ghost btn--sm" type="button" onClick={() => setEditing(p)}>Ändra</button>
                          {isOwner && p.role !== 'owner' && p.active && (
                            <button
                              class="btn btn--ghost btn--sm"
                              type="button"
                              disabled={busyId === p.id || (p.role === 'employee' && admins >= 3)}
                              title={p.role === 'employee' && admins >= 3 ? 'Högst tre administratörer' : undefined}
                              onClick={() => act(p, { action: 'set_role', role: p.role === 'admin' ? 'employee' : 'admin' })}
                            >
                              {p.role === 'admin' ? 'Gör till personal' : 'Gör till administratör'}
                            </button>
                          )}
                          {p.role !== 'owner' && p.id !== me.profile.id && (
                            <button
                              class={p.active ? 'btn btn--danger btn--sm' : 'btn btn--ghost btn--sm'}
                              type="button"
                              disabled={busyId === p.id}
                              onClick={() => {
                                if (p.active && !window.confirm(`Stänga av ${p.full_name}? Personen kan inte logga in förrän kontot aktiveras igen.`)) return;
                                act(p, { action: 'set_active', active: !p.active });
                              }}
                            >
                              {p.active ? 'Stäng av' : 'Aktivera'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p class="muted" style="margin:14px 0 0">
          Administratörer: {admins} av 3. Bara ägaren kan lägga till administratörer.
        </p>
      </div>

      <Modal open={adding} label="Lägg till person" onClose={() => setAdding(false)}>
        <AddForm
          prefill={typeof adding === 'object' ? adding : null}
          usedColors={(rows ?? []).filter((p) => p.active).map((p) => p.color.toLowerCase())}
          canAddAdmin={isOwner && admins < 3}
          onCancel={() => setAdding(false)}
          onCreated={(person, url, password) => {
            setAdding(false);
            if (password) setCredentials({ person, password, isNew: true });
            else setLink({ person, url, isNew: true });
            load();
          }}
        />
      </Modal>
      <Modal open={!!editing} label="Ändra uppgifter" onClose={() => setEditing(null)}>
        {editing && <EditForm person={editing} canDelete={isOwner && editing.role !== 'owner'} onDone={() => { setEditing(null); load(); }} />}
      </Modal>
      <Modal open={!!pwFor} label="Nytt lösenord" onClose={() => setPwFor(null)}>
        {pwFor && <PasswordForm person={pwFor} onCancel={() => setPwFor(null)} onSaved={(password) => { const person = pwFor; setPwFor(null); setCredentials({ person, password, isNew: false }); }} />}
      </Modal>
      <Modal open={!!credentials} label="Inloggningsuppgifter" onClose={() => setCredentials(null)}>
        {credentials && <CredentialsBox {...credentials} onClose={() => setCredentials(null)} />}
      </Modal>
      <Modal open={!!link} label="Inloggningslänk" onClose={() => setLink(null)}>
        {link && <LinkBox {...link} onClose={() => setLink(null)} />}
      </Modal>
    </>
  );
}

function AddForm({ prefill, usedColors, canAddAdmin, onCancel, onCreated }) {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', role: 'employee', color: COLORS.find((c) => !usedColors.includes(c)) ?? COLORS[0], ...(prefill ?? {}) });
  const [usePassword, setUsePassword] = useState(true);
  const [password, setPassword] = useState(makePassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.currentTarget.value });

  async function submit(e) {
    e.preventDefault();
    if (usePassword && password.length < 10) return setError('Lösenordet behöver minst 10 tecken.');
    setBusy(true);
    setError('');
    try {
      const result = await callFunction('staff-admin', { action: 'invite', ...form, password: usePassword ? password : undefined });
      onCreated({ ...form, id: result.user_id }, result.link, usePassword ? password : null);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit}>
      <h3>Lägg till person</h3>
      <div class="field">
        <label for="s-name">Namn</label>
        <input id="s-name" type="text" required maxLength={120} value={form.full_name} onInput={set('full_name')} />
      </div>
      <div class="form-2">
        <div class="field">
          <label for="s-email">Mejl (används för inloggning)</label>
          <input id="s-email" type="email" required maxLength={254} value={form.email} onInput={set('email')} />
        </div>
        <div class="field">
          <label for="s-phone">Mobilnummer</label>
          <input id="s-phone" type="tel" maxLength={40} value={form.phone} onInput={set('phone')} />
        </div>
      </div>
      <div class="form-2">
        <div class="field">
          <label for="s-role">Roll</label>
          <select id="s-role" value={form.role} onChange={set('role')}>
            <option value="employee">Personal</option>
            {canAddAdmin && <option value="admin">Administratör</option>}
          </select>
        </div>
        <div class="field">
          <label for="s-color">Färg i schemat</label>
          <input id="s-color" type="color" value={form.color} onInput={set('color')} style="min-height:48px;padding:4px" />
        </div>
      </div>
      <fieldset class="cp-fieldset">
        <legend>Inloggning</legend>
        <label class="cp-check"><input type="radio" name="pwmode" checked={usePassword} onChange={() => setUsePassword(true)} /> Jag väljer lösenordet</label>
        <label class="cp-check"><input type="radio" name="pwmode" checked={!usePassword} onChange={() => setUsePassword(false)} /> Skicka en länk så väljer personen själv</label>
        {usePassword && <PasswordField value={password} onChange={setPassword} id="s-pw" />}
      </fieldset>
      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit" disabled={busy}>{busy ? 'Skapar …' : usePassword ? 'Skapa konto' : 'Skapa och få länk'}</button>
        <button class="btn btn--ghost" type="button" onClick={onCancel}>Avbryt</button>
      </div>
    </form>
  );
}

function EditForm({ person, canDelete, onDone }) {
  const sb = supabase();
  const [form, setForm] = useState({ full_name: person.full_name, phone: person.phone ?? '', color: person.color });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.currentTarget.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const { error: saveError } = await sb.from('profiles').update({ full_name: form.full_name.trim(), phone: form.phone.trim() || null, color: form.color }).eq('id', person.id);
    setBusy(false);
    if (saveError) return setError('Kunde inte spara.');
    onDone();
  }

  async function remove() {
    if (!window.confirm(`Ta bort ${person.full_name} helt? Kontot och profilen raderas och kan inte återställas.`)) return;
    setBusy(true);
    try {
      await callFunction('staff-admin', { action: 'delete', user_id: person.id });
      onDone();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <h3>Ändra uppgifter</h3>
      <div class="field">
        <label for="e-name">Namn</label>
        <input id="e-name" type="text" required maxLength={120} value={form.full_name} onInput={set('full_name')} />
      </div>
      <div class="form-2">
        <div class="field">
          <label for="e-phone">Mobilnummer</label>
          <input id="e-phone" type="tel" maxLength={40} value={form.phone} onInput={set('phone')} />
        </div>
        <div class="field">
          <label for="e-color">Färg i schemat</label>
          <input id="e-color" type="color" value={form.color} onInput={set('color')} style="min-height:48px;padding:4px" />
        </div>
      </div>
      <p class="muted">Mejladressen används för inloggning och kan inte ändras här.</p>
      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit" disabled={busy}>Spara</button>
        <button class="btn btn--ghost" type="button" onClick={onDone}>Avbryt</button>
        {canDelete && <button class="btn btn--danger" type="button" disabled={busy} onClick={remove}>Ta bort kontot</button>}
      </div>
    </form>
  );
}

function LinkBox({ person, url, isNew, onClose }) {
  const [copied, setCopied] = useState(false);
  const text = isNew
    ? `Hej ${person.full_name.split(' ')[0]}! Här är din länk till TO Städ & Flytt. Öppna den och välj ett lösenord: ${url}`
    : `Hej ${person.full_name.split(' ')[0]}! Här är en ny inloggningslänk till TO Städ & Flytt: ${url}`;
  const phone = (person.phone ?? '').replace(/[^\d+]/g, '');
  return (
    <div class="cp-modal-body">
      <h3>{isNew ? `${person.full_name} är tillagd` : 'Ny inloggningslänk'}</h3>
      <p>Skicka länken till {person.full_name}. Den gäller i en timme och kan bara användas en gång.</p>
      <div class="cp-link-box">{url}</div>
      <div class="cp-actions">
        <button class="btn btn--sm" type="button" onClick={async () => setCopied(await copyText(url))}>{copied ? 'Kopierad' : 'Kopiera länken'}</button>
        {phone && <a class="btn btn--ghost btn--sm" href={`sms:${phone}?body=${encodeURIComponent(text)}`}>Skicka som SMS</a>}
        {person.email && (
          <a class="btn btn--ghost btn--sm" href={`mailto:${person.email}?subject=${encodeURIComponent('Din inloggning till TO Städ & Flytt')}&body=${encodeURIComponent(text)}`}>
            Skicka som mejl
          </a>
        )}
      </div>
      <button class="btn btn--ghost" type="button" onClick={onClose}>Klar</button>
    </div>
  );
}

// Lättläst förslag på lösenord: tre ord och två siffror, till exempel "SolHavSkog47".
const WORDS = ['Sol', 'Hav', 'Skog', 'Berg', 'Moln', 'Regn', 'Vind', 'Sten', 'Sand', 'Gran', 'Ek', 'Lind', 'Rosa', 'Gul', 'Bla', 'Gron', 'Vit', 'Mild', 'Snabb', 'Stark', 'Lugn', 'Glad', 'Varm', 'Klar', 'Hus', 'Bil', 'Buss', 'Tag', 'Bat', 'Kopp', 'Lampa', 'Stol', 'Bord', 'Dorr', 'Kudde', 'Mops', 'Kvast', 'Hink', 'Svamp', 'Trasa'];
export function makePassword() {
  const r = new Uint32Array(5);
  crypto.getRandomValues(r);
  let p = '';
  do {
    p = [0, 1, 2].map((i) => WORDS[r[i] % WORDS.length]).join('') + String(r[3] % 90 + 10);
    if (p.length < 10) r[2] = (r[2] + 7) >>> 0;
  } while (p.length < 10);
  return p;
}

function PasswordField({ value, onChange, id }) {
  return (
    <div class="field">
      <label for={id}>Lösenord (minst 10 tecken)</label>
      <div class="pw-row">
        <input id={id} type="text" autocomplete="off" spellcheck={false} minLength={10} maxLength={72} required value={value} onInput={(e) => onChange(e.currentTarget.value)} />
        <button class="btn btn--ghost btn--sm" type="button" onClick={() => onChange(makePassword())}>Nytt förslag</button>
      </div>
    </div>
  );
}

function PasswordForm({ person, onCancel, onSaved }) {
  const [password, setPassword] = useState(makePassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    if (password.length < 10) return setError('Lösenordet behöver minst 10 tecken.');
    setBusy(true);
    setError('');
    try {
      await callFunction('staff-admin', { action: 'set_password', user_id: person.id, password });
      onSaved(password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <h3>Nytt lösenord för {person.full_name}</h3>
      <p class="muted">Det gamla lösenordet slutar fungera direkt. Vill personen hellre välja själv kan du skicka en inloggningslänk i stället.</p>
      <PasswordField value={password} onChange={setPassword} id="np-pw" />
      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit" disabled={busy}>{busy ? 'Sparar …' : 'Spara lösenordet'}</button>
        <button class="btn btn--ghost" type="button" onClick={onCancel}>Avbryt</button>
      </div>
    </form>
  );
}

// Visar e-post och lösenord en gång, med text att skicka till personen.
function CredentialsBox({ person, password, isNew, onClose }) {
  const [copied, setCopied] = useState(false);
  const login = `${window.location.origin}/logga-in`;
  const text = `Hej ${person.full_name.split(' ')[0]}! ${isNew ? 'Här är din inloggning till TO Städ & Flytt' : 'Här är ditt nya lösenord till TO Städ & Flytt'}.\n\nLogga in här: ${login}\nE-post: ${person.email}\nLösenord: ${password}\n\nVill du byta lösenord, säg till så skickar jag en länk.`;
  const phone = (person.phone ?? '').replace(/[^\d+]/g, '');
  return (
    <div class="cp-modal-body">
      <h3>{isNew ? `${person.full_name} är tillagd` : 'Lösenordet är bytt'}</h3>
      <p>Skicka uppgifterna till {person.full_name}. Lösenordet visas bara nu, så spara eller skicka det innan du stänger.</p>
      <dl class="cp-dl cp-creds">
        <dt>Logga in på</dt><dd>{login}</dd>
        <dt>E-post</dt><dd>{person.email}</dd>
        <dt>Lösenord</dt><dd><code>{password}</code></dd>
      </dl>
      <div class="cp-actions">
        <button class="btn btn--sm" type="button" onClick={async () => setCopied(await copyText(text))}>{copied ? 'Kopierat' : 'Kopiera uppgifterna'}</button>
        {phone && <a class="btn btn--ghost btn--sm" href={`sms:${phone}?body=${encodeURIComponent(text)}`}>Skicka som SMS</a>}
        {person.email && <a class="btn btn--ghost btn--sm" href={`mailto:${person.email}?subject=${encodeURIComponent('Din inloggning till TO Städ & Flytt')}&body=${encodeURIComponent(text)}`}>Skicka som mejl</a>}
      </div>
      <button class="btn btn--ghost" type="button" onClick={onClose}>Klar</button>
    </div>
  );
}
