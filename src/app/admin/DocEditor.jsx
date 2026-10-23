// Formulär för en offert eller ett fakturautkast: köpare, rader, RUT och summor.
import { useMemo, useState } from 'preact/hooks';
import { ErrorMsg } from '../ui.jsx';
import { totals, exVat, incVat, formatMoney, formatKrWhole, normalizePnr, maskPnr } from '../../lib/money.js';
import { SERVICE_LABELS } from './jobs.js';
import { buyerFrom, RUT_SERVICES } from './docs.js';
import DocView from '../docs/DocView.jsx';

// Enheterna står på dokumentet som kunden får, därför på svenska (st = pieces, tim = hours, kvm = m²).
const UNITS = ['st', 'tim', 'kvm', 'km'];
const num = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const show = (n) => (n ? String(Math.round(n * 100) / 100).replace('.', ',') : '');

export default function DocEditor({ type, value, customers, company, onSave, onCancel }) {
  const isQuote = type === 'offert';
  const [form, setForm] = useState(() => ({ rut_persons: 0, lines: [], buyer: {}, ...value }));
  const [incl, setIncl] = useState(() => !value.buyer?.company);
  const [lines, setLines] = useState(() =>
    (value.lines?.length ? value.lines : [{ text: '', qty: 1, unit: 'st', price: 0, vat: 25, rut: false }]).map((l) => ({
      ...l,
      input: show(!value.buyer?.company ? incVat(l.price, l.vat ?? 25) : l.price),
    })),
  );
  const existing = value.rut_people ?? [];
  const [people, setPeople] = useState(() => [0, 1].map((i) => ({ name: existing[i]?.name ?? '', pnr: '', saved: existing[i] ?? null, edit: !existing[i] })));
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm({ ...form, [key]: e.currentTarget.value });
  const setBuyer = (key) => (e) => setForm({ ...form, buyer: { ...form.buyer, [key]: e.currentTarget.type === 'checkbox' ? e.currentTarget.checked : e.currentTarget.value } });

  const priced = lines.map(({ input, ...l }) => ({ ...l, qty: num(l.qty), vat: Number(l.vat ?? 25), price: incl ? exVat(num(input), l.vat ?? 25) : num(input) }));
  const t = totals(priced, form.rut_persons);

  const shownCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? customers.filter((c) => [c.name, c.email, c.phone, c.street].some((v) => v?.toLowerCase().includes(q))) : customers;
  }, [search, customers]);

  function pickCustomer(id) {
    const c = customers.find((x) => x.id === id);
    const buyer = buyerFrom(c);
    const next = { ...form, customer_id: id || null, buyer: c ? buyer : form.buyer };
    if (isQuote && c && !form.street) Object.assign(next, { street: c.street ?? '', postal_code: c.postal_code ?? '', city: c.city ?? '' });
    if (c?.kind === 'company') next.rut_persons = 0;
    setForm(next);
    if (c) switchIncl(c.kind !== 'company');
  }

  function switchIncl(nextIncl) {
    if (nextIncl === incl) return;
    setLines(lines.map((l, i) => ({ ...l, input: show(nextIncl ? incVat(priced[i].price, l.vat ?? 25) : priced[i].price) })));
    setIncl(nextIncl);
  }

  const setLine = (i, key) => (e) => {
    const v = e.currentTarget.type === 'checkbox' ? e.currentTarget.checked : e.currentTarget.value;
    setLines(lines.map((l, j) => (j === i ? { ...l, [key]: v } : l)));
  };
  const addLine = () => setLines([...lines, { text: '', qty: 1, unit: 'st', input: '', vat: 25, rut: RUT_SERVICES.includes(form.service) && !form.buyer?.company }]);
  const removeLine = (i) => setLines(lines.filter((_, j) => j !== i));
  const setPerson = (i, key) => (e) => setPeople(people.map((p, j) => (j === i ? { ...p, [key]: e.currentTarget.value } : p)));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.buyer?.name?.trim()) return setError('Write the buyer\'s name.');
    if (priced.some((l) => !String(l.text ?? '').trim())) return setError('Every line needs a description.');
    // RUT-köpare skickas bara för fakturor och bara om något har ändrats.
    let rutPeople;
    if (!isQuote) {
      const wanted = people.slice(0, form.rut_persons);
      const changed = wanted.some((p) => p.edit) || existing.length > form.rut_persons;
      if (t.rut !== 0 && changed) {
        rutPeople = [];
        for (const p of wanted) {
          if (!p.edit && p.saved) {
            setError('Enter the personal identity number again for every buyer when you change the RUT details.');
            return;
          }
          const pnr = normalizePnr(p.pnr);
          if (!p.name.trim()) return setError('Write the name of every person who gets the RUT deduction.');
          if (!pnr) return setError(`The personal identity number for ${p.name} is not valid.`);
          rutPeople.push({ name: p.name.trim(), pnr });
        }
      } else if (t.rut === 0 && existing.length) rutPeople = [];
    }
    setBusy(true);
    try {
      await onSave({ ...form, lines: priced.map(({ text, qty, unit, price, vat, rut }) => ({ text: text.trim(), qty, unit, price, vat, rut: !!rut })) }, rutPeople);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (preview)
    return (
      <div class="cp-modal-body">
        <div class="doc-preview">
          <DocView type={type} company={company} doc={{ ...form, lines: priced, number: value.number, rut_names: people.slice(0, form.rut_persons).map((p) => p.name).filter(Boolean) }} />
        </div>
        <button class="btn" type="button" onClick={() => setPreview(false)}>Back to the form</button>
      </div>
    );

  return (
    <form onSubmit={submit} class="doc-editor">
      <h3>{isQuote ? (value.id ? `Quote ${value.number}` : 'New quote') : value.id ? 'Invoice draft' : 'New invoice'}</h3>
      <p class="muted">The customer gets the document in Swedish, so write the line texts and the message in Swedish.</p>

      <fieldset class="cp-fieldset">
        <legend>Customer</legend>
        <input type="search" placeholder="Search the customer register" aria-label="Search customer" value={search} onInput={(e) => setSearch(e.currentTarget.value)} />
        <select aria-label="Customer" value={form.customer_id ?? ''} onChange={(e) => pickCustomer(e.currentTarget.value)}>
          <option value="">No customer in the register</option>
          {shownCustomers.slice(0, 200).map((c) => <option value={c.id}>{c.name}{c.street ? `, ${c.street}` : ''}</option>)}
        </select>
        <div class="form-2">
          <div class="field">
            <label for="b-name">Name</label>
            <input id="b-name" type="text" required maxLength={200} value={form.buyer.name ?? ''} onInput={setBuyer('name')} />
          </div>
          <div class="field">
            <label for="b-org">Company reg. no.</label>
            <input id="b-org" type="text" maxLength={20} value={form.buyer.org_nr ?? ''} onInput={setBuyer('org_nr')} />
          </div>
        </div>
        <div class="form-3">
          <div class="field">
            <label for="b-street">Address</label>
            <input id="b-street" type="text" maxLength={200} value={form.buyer.street ?? ''} onInput={setBuyer('street')} />
          </div>
          <div class="field">
            <label for="b-zip">Postcode</label>
            <input id="b-zip" type="text" maxLength={10} value={form.buyer.postal_code ?? ''} onInput={setBuyer('postal_code')} />
          </div>
          <div class="field">
            <label for="b-city">City</label>
            <input id="b-city" type="text" maxLength={100} value={form.buyer.city ?? ''} onInput={setBuyer('city')} />
          </div>
        </div>
        <div class="form-2">
          <div class="field">
            <label for="b-email">Email</label>
            <input id="b-email" type="email" maxLength={254} value={form.buyer.email ?? ''} onInput={setBuyer('email')} />
          </div>
          <div class="field">
            <label for="b-phone">Phone</label>
            <input id="b-phone" type="tel" maxLength={40} value={form.buyer.phone ?? ''} onInput={setBuyer('phone')} />
          </div>
        </div>
        <label class="cp-check">
          <input type="checkbox" checked={!!form.buyer.company} onChange={(e) => { setBuyer('company')(e); switchIncl(!e.currentTarget.checked); if (e.currentTarget.checked) setForm((f) => ({ ...f, rut_persons: 0, buyer: { ...f.buyer, company: true } })); }} />
          Company (prices shown excluding VAT, no RUT)
        </label>
      </fieldset>

      {isQuote ? (
        <div class="form-3">
          <div class="field">
            <label for="q-service">Service</label>
            <select id="q-service" value={form.service ?? 'annat'} onChange={set('service')}>
              {Object.entries(SERVICE_LABELS).map(([k, v]) => <option value={k}>{v}</option>)}
            </select>
          </div>
          <div class="field">
            <label for="q-date">Wanted date</label>
            <input id="q-date" type="date" value={form.wanted_date ?? ''} onInput={set('wanted_date')} />
          </div>
          <div class="field">
            <label for="q-valid">Valid until</label>
            <input id="q-valid" type="date" value={form.valid_until ?? ''} onInput={set('valid_until')} />
          </div>
        </div>
      ) : (
        <div class="form-3">
          <div class="field">
            <label for="i-done">Work done (date)</label>
            <input id="i-done" type="date" required value={form.delivery_date ?? ''} onInput={set('delivery_date')} />
          </div>
          <div class="field">
            <label for="i-ref">Their reference</label>
            <input id="i-ref" type="text" maxLength={100} value={form.your_ref ?? ''} onInput={set('your_ref')} />
          </div>
          <div class="field">
            <label for="i-due">Due date (optional)</label>
            <input id="i-due" type="date" value={form.due_date ?? ''} onInput={set('due_date')} />
          </div>
        </div>
      )}
      {isQuote && (
        <div class="form-3">
          <div class="field">
            <label for="q-street">Address of the job</label>
            <input id="q-street" type="text" maxLength={200} value={form.street ?? ''} onInput={set('street')} />
          </div>
          <div class="field">
            <label for="q-zip">Postcode</label>
            <input id="q-zip" type="text" maxLength={10} value={form.postal_code ?? ''} onInput={set('postal_code')} />
          </div>
          <div class="field">
            <label for="q-city">City</label>
            <input id="q-city" type="text" maxLength={100} value={form.city ?? ''} onInput={set('city')} />
          </div>
        </div>
      )}

      <fieldset class="cp-fieldset">
        <legend>Lines</legend>
        <div class="cp-tabs" role="group" aria-label="Prices">
          <button type="button" aria-pressed={incl} onClick={() => switchIncl(true)}>Prices incl. VAT</button>
          <button type="button" aria-pressed={!incl} onClick={() => switchIncl(false)}>Prices excl. VAT</button>
        </div>
        {lines.map((l, i) => (
          <div class="doc-line">
            <input class="doc-line-text" type="text" aria-label="Description" placeholder="Description (Swedish)" maxLength={300} value={l.text} onInput={setLine(i, 'text')} />
            <input type="text" inputmode="decimal" aria-label="Quantity" value={l.qty} onInput={setLine(i, 'qty')} />
            <select aria-label="Unit" value={l.unit} onChange={setLine(i, 'unit')}>{UNITS.map((u) => <option>{u}</option>)}</select>
            <input type="text" inputmode="decimal" aria-label={incl ? 'Unit price incl. VAT' : 'Unit price excl. VAT'} placeholder="Unit price" value={l.input} onInput={setLine(i, 'input')} />
            <select aria-label="VAT" value={l.vat ?? 25} onChange={setLine(i, 'vat')}>{[25, 12, 6, 0].map((v) => <option value={v}>{v} %</option>)}</select>
            <label class="cp-check doc-line-rut"><input type="checkbox" checked={!!l.rut} onChange={setLine(i, 'rut')} /> Labour (RUT)</label>
            <span class="doc-line-sum">{formatMoney(incl ? t.rows[i]?.gross : t.rows[i]?.net)}</span>
            <button class="st-link" type="button" aria-label="Remove the line" onClick={() => removeLine(i)}>Remove</button>
          </div>
        ))}
        <button class="btn btn--ghost btn--sm" type="button" onClick={addLine}>Add line</button>
      </fieldset>

      {!form.buyer.company && (
        <fieldset class="cp-fieldset">
          <legend>RUT deduction</legend>
          <select aria-label="RUT deduction" value={form.rut_persons} onChange={(e) => setForm({ ...form, rut_persons: Number(e.currentTarget.value) })}>
            <option value={0}>No RUT deduction</option>
            <option value={1}>RUT for one person</option>
            <option value={2}>RUT for two people (for example a couple who share)</option>
          </select>
          {!isQuote && form.rut_persons > 0 &&
            people.slice(0, form.rut_persons).map((p, i) => (
              <div class="form-2">
                <div class="field">
                  <label for={`rp-name${i}`}>Name of person {i + 1}</label>
                  <input id={`rp-name${i}`} type="text" maxLength={200} value={p.name} onInput={setPerson(i, 'name')} />
                </div>
                <div class="field">
                  <label for={`rp-pnr${i}`}>Personal identity number</label>
                  {p.edit ? (
                    <input id={`rp-pnr${i}`} type="text" inputmode="numeric" autocomplete="off" placeholder="ÅÅÅÅMMDD-NNNN" maxLength={13} value={p.pnr} onInput={setPerson(i, 'pnr')} />
                  ) : (
                    <span class="doc-pnr">
                      {maskPnr(p.saved?.pnr_last4)} (saved encrypted){' '}
                      <button class="st-link" type="button" onClick={() => setPeople(people.map((x, j) => (j === i ? { ...x, edit: true } : x)))}>Change</button>
                    </span>
                  )}
                </div>
              </div>
            ))}
          {!isQuote && form.rut_persons > 0 && <small class="muted">The personal identity number is saved encrypted and is never shown to the customer or the staff. It is needed to apply for RUT from Skatteverket.</small>}
        </fieldset>
      )}

      <div class="field">
        <label for="d-msg">Message to the customer (Swedish)</label>
        <textarea id="d-msg" rows={3} maxLength={3000} value={form.message ?? ''} onInput={set('message')} />
      </div>

      <dl class="doc-editor-sum">
        <dt>Total incl. VAT</dt><dd>{formatMoney(t.total)}</dd>
        {t.rut !== 0 && <><dt>RUT deduction</dt><dd>{formatMoney(-t.rut)}</dd></>}
        <dt><strong>The customer pays</strong></dt><dd><strong>{formatKrWhole(t.toPay)}</strong></dd>
      </dl>

      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit" disabled={busy}>{busy ? 'Saving …' : 'Save draft'}</button>
        <button class="btn btn--ghost" type="button" onClick={() => setPreview(true)}>Preview</button>
        <button class="btn btn--ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
