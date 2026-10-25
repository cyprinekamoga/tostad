// Personal: lägg till, skicka inloggningslänk, ändra uppgifter, roll och stäng av.
import { useEffect, useState } from 'preact/hooks';
import { supabase, callFunction } from '../../lib/supabase.js';
import { Modal, ErrorMsg, Phone, Email, copyText } from '../ui.jsx';

const ROLE = { owner: 'Owner', admin: 'Admin', employee: 'Staff' };
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
    if (e) return setError('Could not load the staff.');
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
        <h2>Staff</h2>
        <button class="btn btn--sm" type="button" onClick={() => setAdding(true)}>Add person</button>
      </div>
      <ErrorMsg error={error} />
      <div class="cp-panel">
        {rows === null && <p class="muted">Loading …</p>}
        {rows?.length > 0 && (
          <div class="cp-scroll">
            <table class="cp-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th><span class="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr style={p.active ? undefined : 'opacity:.6'}>
                    <td>
                      <span class="dot" style={`background:${p.color}`} /> <strong>{p.full_name}</strong>
                      {!p.active && <span class="badge badge--muted">Deactivated</span>}
                    </td>
                    <td>{ROLE[p.role]}</td>
                    <td><Phone value={p.phone} /></td>
                    <td><Email value={p.email} /></td>
                    <td>
                      {canManage(p) && (
                        <div class="cp-actions">
                          {p.active && (
                            <button class="btn btn--ghost btn--sm" type="button" disabled={busyId === p.id} onClick={() => act(p, { action: 'link' }, (r) => setLink({ person: p, url: r.link }))}>
                              Login link
                            </button>
                          )}
                          {p.active && <button class="btn btn--ghost btn--sm" type="button" onClick={() => setPwFor(p)}>New password</button>}
                          <button class="btn btn--ghost btn--sm" type="button" onClick={() => setEditing(p)}>Edit</button>
                          {isOwner && p.role !== 'owner' && p.active && (
                            <button
                              class="btn btn--ghost btn--sm"
                              type="button"
                              disabled={busyId === p.id || (p.role === 'employee' && admins >= 3)}
                              title={p.role === 'employee' && admins >= 3 ? 'At most three admins' : undefined}
                              onClick={() => act(p, { action: 'set_role', role: p.role === 'admin' ? 'employee' : 'admin' })}
                            >
                              {p.role === 'admin' ? 'Make staff' : 'Make admin'}
                            </button>
                          )}
                          {p.role !== 'owner' && p.id !== me.profile.id && (
                            <button
                              class={p.active ? 'btn btn--danger btn--sm' : 'btn btn--ghost btn--sm'}
                              type="button"
                              disabled={busyId === p.id}
                              onClick={() => {
                                if (p.active && !window.confirm(`Deactivate ${p.full_name}? They cannot log in until the account is activated again.`)) return;
                                act(p, { action: 'set_active', active: !p.active });
                              }}
                            >
                              {p.active ? 'Deactivate' : 'Activate'}
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
          Admins: {admins} of 3. Only the owner can add admins.
        </p>
      </div>

      <Modal open={adding} label="Add person" onClose={() => setAdding(false)}>
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
      <Modal open={!!editing} label="Edit details" onClose={() => setEditing(null)}>
        {editing && <EditForm person={editing} canDelete={isOwner && editing.role !== 'owner'} onDone={() => { setEditing(null); load(); }} />}
      </Modal>
      <Modal open={!!pwFor} label="New password" onClose={() => setPwFor(null)}>
        {pwFor && <PasswordForm person={pwFor} onCancel={() => setPwFor(null)} onSaved={(password) => { const person = pwFor; setPwFor(null); setCredentials({ person, password, isNew: false }); }} />}
      </Modal>
      <Modal open={!!credentials} label="Login details" onClose={() => setCredentials(null)}>
        {credentials && <CredentialsBox {...credentials} onClose={() => setCredentials(null)} />}
      </Modal>
      <Modal open={!!link} label="Login link" onClose={() => setLink(null)}>
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
    if (usePassword && password.length < 10) return setError('The password needs at least 10 characters.');
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
      <h3>Add person</h3>
      <div class="field">
        <label for="s-name">Name</label>
        <input id="s-name" type="text" required maxLength={120} value={form.full_name} onInput={set('full_name')} />
      </div>
      <div class="form-2">
        <div class="field">
          <label for="s-email">Email (used to log in)</label>
          <input id="s-email" type="email" required maxLength={254} value={form.email} onInput={set('email')} />
        </div>
        <div class="field">
          <label for="s-phone">Mobile number</label>
          <input id="s-phone" type="tel" maxLength={40} value={form.phone} onInput={set('phone')} />
        </div>
      </div>
      <div class="form-2">
        <div class="field">
          <label for="s-role">Role</label>
          <select id="s-role" value={form.role} onChange={set('role')}>
            <option value="employee">Staff</option>
            {canAddAdmin && <option value="admin">Admin</option>}
          </select>
        </div>
        <div class="field">
          <label for="s-color">Colour in the schedule</label>
          <input id="s-color" type="color" value={form.color} onInput={set('color')} style="min-height:48px;padding:4px" />
        </div>
      </div>
      <fieldset class="cp-fieldset">
        <legend>Login</legend>
        <label class="cp-check"><input type="radio" name="pwmode" checked={usePassword} onChange={() => setUsePassword(true)} /> I choose the password</label>
        <label class="cp-check"><input type="radio" name="pwmode" checked={!usePassword} onChange={() => setUsePassword(false)} /> Send a link so they choose it themselves</label>
        {usePassword && <PasswordField value={password} onChange={setPassword} id="s-pw" />}
      </fieldset>
      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit" disabled={busy}>{busy ? 'Creating …' : usePassword ? 'Create account' : 'Create and get link'}</button>
        <button class="btn btn--ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function EditForm({ person, canDelete, onDone }) {
  const sb = supabase();
  const [form, setForm] = useState({ full_name: person.full_name, email: person.email, phone: person.phone ?? '', color: person.color });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.currentTarget.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const { error: saveError } = await sb.from('profiles').update({ full_name: form.full_name.trim(), phone: form.phone.trim() || null, color: form.color }).eq('id', person.id);
    if (saveError) {
      setBusy(false);
      return setError('Could not save.');
    }
    // Inloggningsmejlet byts via servern, eftersom det också gäller själva kontot.
    if (form.email.trim().toLowerCase() !== person.email) {
      try {
        await callFunction('staff-admin', { action: 'set_email', user_id: person.id, email: form.email.trim() });
      } catch (err) {
        setBusy(false);
        return setError(err.message);
      }
    }
    setBusy(false);
    onDone();
  }

  async function remove() {
    if (!window.confirm(`Remove ${person.full_name} completely? The account and profile are deleted and cannot be restored.`)) return;
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
      <h3>Edit details</h3>
      <div class="field">
        <label for="e-name">Name</label>
        <input id="e-name" type="text" required maxLength={120} value={form.full_name} onInput={set('full_name')} />
      </div>
      <div class="field">
        <label for="e-email">Email (used to log in)</label>
        <input id="e-email" type="email" required maxLength={254} value={form.email} onInput={set('email')} />
      </div>
      <div class="form-2">
        <div class="field">
          <label for="e-phone">Mobile number</label>
          <input id="e-phone" type="tel" maxLength={40} value={form.phone} onInput={set('phone')} />
        </div>
        <div class="field">
          <label for="e-color">Colour in the schedule</label>
          <input id="e-color" type="color" value={form.color} onInput={set('color')} style="min-height:48px;padding:4px" />
        </div>
      </div>
      <p class="muted">Changing the email changes the login. Send the person a new login afterwards.</p>
      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit" disabled={busy}>Save</button>
        <button class="btn btn--ghost" type="button" onClick={onDone}>Cancel</button>
        {canDelete && <button class="btn btn--danger" type="button" disabled={busy} onClick={remove}>Delete the account</button>}
      </div>
    </form>
  );
}

function LinkBox({ person, url, isNew, onClose }) {
  const [copied, setCopied] = useState(false);
  const text = isNew
    ? `Hi ${person.full_name.split(' ')[0]}! Here is your link to TO Städ & Flytt. Open it and choose a password: ${url}`
    : `Hi ${person.full_name.split(' ')[0]}! Here is a new login link to TO Städ & Flytt: ${url}`;
  const phone = (person.phone ?? '').replace(/[^\d+]/g, '');
  return (
    <div class="cp-modal-body">
      <h3>{isNew ? `${person.full_name} is added` : 'New login link'}</h3>
      <p>Send the link to {person.full_name}. It is valid for one hour and can only be used once.</p>
      <div class="cp-link-box">{url}</div>
      <div class="cp-actions">
        <button class="btn btn--sm" type="button" onClick={async () => setCopied(await copyText(url))}>{copied ? 'Copied' : 'Copy the link'}</button>
        {phone && <a class="btn btn--ghost btn--sm" href={`sms:${phone}?body=${encodeURIComponent(text)}`}>Send as SMS</a>}
        {person.email && (
          <a class="btn btn--ghost btn--sm" href={`mailto:${person.email}?subject=${encodeURIComponent('Your login to TO Städ & Flytt')}&body=${encodeURIComponent(text)}`}>
            Send as email
          </a>
        )}
      </div>
      <button class="btn btn--ghost" type="button" onClick={onClose}>Done</button>
    </div>
  );
}

// Lättläst förslag på lösenord: tre ord och två siffror, till exempel "SunSeaTree47".
const WORDS = ['Sun', 'Sea', 'Tree', 'Hill', 'Cloud', 'Rain', 'Wind', 'Stone', 'Sand', 'Pine', 'Oak', 'Lime', 'Rose', 'Gold', 'Blue', 'Green', 'White', 'Mild', 'Quick', 'Strong', 'Calm', 'Happy', 'Warm', 'Clear', 'House', 'Car', 'Bus', 'Train', 'Boat', 'Cup', 'Lamp', 'Chair', 'Table', 'Door', 'Pillow', 'Mop', 'Broom', 'Bucket', 'Sponge', 'Cloth'];
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
      <label for={id}>Password (at least 10 characters)</label>
      <div class="pw-row">
        <input id={id} type="text" autocomplete="off" spellcheck={false} minLength={10} maxLength={72} required value={value} onInput={(e) => onChange(e.currentTarget.value)} />
        <button class="btn btn--ghost btn--sm" type="button" onClick={() => onChange(makePassword())}>New suggestion</button>
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
    if (password.length < 10) return setError('The password needs at least 10 characters.');
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
      <h3>New password for {person.full_name}</h3>
      <p class="muted">The old password stops working right away. If they would rather choose one themselves, send a login link instead.</p>
      <PasswordField value={password} onChange={setPassword} id="np-pw" />
      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit" disabled={busy}>{busy ? 'Saving …' : 'Save the password'}</button>
        <button class="btn btn--ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// Visar e-post och lösenord en gång, med text att skicka till personen.
function CredentialsBox({ person, password, isNew, onClose }) {
  const [copied, setCopied] = useState(false);
  const login = `${window.location.origin}/logga-in`;
  const text = `Hi ${person.full_name.split(' ')[0]}! ${isNew ? 'Here is your login to TO Städ & Flytt' : 'Here is your new password for TO Städ & Flytt'}.\n\nLog in here: ${login}\nEmail: ${person.email}\nPassword: ${password}\n\nIf you want to change your password, tell me and I will send you a link.`;
  const phone = (person.phone ?? '').replace(/[^\d+]/g, '');
  return (
    <div class="cp-modal-body">
      <h3>{isNew ? `${person.full_name} is added` : 'The password is changed'}</h3>
      <p>Send the details to {person.full_name}. The password is only shown now, so save or send it before you close this.</p>
      <dl class="cp-dl cp-creds">
        <dt>Log in at</dt><dd>{login}</dd>
        <dt>Email</dt><dd>{person.email}</dd>
        <dt>Password</dt><dd><code>{password}</code></dd>
      </dl>
      <div class="cp-actions">
        <button class="btn btn--sm" type="button" onClick={async () => setCopied(await copyText(text))}>{copied ? 'Copied' : 'Copy the details'}</button>
        {phone && <a class="btn btn--ghost btn--sm" href={`sms:${phone}?body=${encodeURIComponent(text)}`}>Send as SMS</a>}
        {person.email && <a class="btn btn--ghost btn--sm" href={`mailto:${person.email}?subject=${encodeURIComponent('Your login to TO Städ & Flytt')}&body=${encodeURIComponent(text)}`}>Send as email</a>}
      </div>
      <button class="btn btn--ghost" type="button" onClick={onClose}>Done</button>
    </div>
  );
}
