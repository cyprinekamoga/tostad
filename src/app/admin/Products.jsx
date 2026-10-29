// Produkter och tjänster som går att välja när en offert eller faktura skrivs. Priset anges exklusive moms.
import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../../lib/supabase.js';
import { formatMoney, incVat } from '../../lib/money.js';
import { ErrorMsg, Modal } from '../ui.jsx';

const UNITS = { st: 'pieces (st)', tim: 'hours (tim)', kvm: 'm² (kvm)', km: 'km' };
const EMPTY = { code: '', name: '', unit: 'tim', price: '', vat: 25, rut: false, active: true };
const num = (v) => Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));

export default function Products() {
  const sb = supabase();
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showHidden, setShowHidden] = useState(false);
  const [error, setError] = useState('');

  const load = () =>
    sb
      .from('products')
      .select('*')
      .order('name')
      .then(({ data, error: e }) => (e ? setError('Could not load the products.') : setRows(data ?? [])));

  useEffect(() => {
    load();
  }, []);

  async function save(e) {
    e.preventDefault();
    setError('');
    const price = num(editing.price);
    if (!editing.name.trim()) return setError('Write a name.');
    if (!Number.isFinite(price) || price < 0) return setError('Write a price, for example 249 or 595,20.');
    const values = { code: editing.code.trim() || null, name: editing.name.trim(), unit: editing.unit, price, vat: Number(editing.vat), rut: editing.rut, active: editing.active };
    const { error: err } = editing.id ? await sb.from('products').update(values).eq('id', editing.id) : await sb.from('products').insert(values);
    if (err) return setError('Could not save the product.');
    setEditing(null);
    load();
  }

  async function remove(p) {
    if (!window.confirm(`Delete "${p.name}"? Invoices already made are not changed.`)) return;
    const { error: err } = await sb.from('products').delete().eq('id', p.id);
    if (err) return setError('Could not delete the product.');
    load();
  }

  const shown = (rows ?? []).filter((p) => showHidden || p.active);
  const set = (key) => (e) => setEditing({ ...editing, [key]: e.currentTarget.type === 'checkbox' ? e.currentTarget.checked : e.currentTarget.value });

  return (
    <>
      <div class="cp-head">
        <h2>Products</h2>
        <button class="btn btn--sm" type="button" onClick={() => setEditing({ ...EMPTY })}>New product</button>
      </div>
      <p class="muted">Choose these with "Add a product" when you write an invoice or a quote. The line can still be changed on the invoice.</p>
      <ErrorMsg error={error} />
      <label class="cp-check" style="margin-bottom:12px">
        <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.currentTarget.checked)} /> Show hidden products
      </label>
      <div class="cp-panel">
        {rows === null && <p class="muted">Loading …</p>}
        {rows && shown.length === 0 && <p class="cp-empty">No products yet.</p>}
        <ul class="cp-list">
          {shown.map((p) => (
            <li class={`cp-row cp-row--static${p.active ? '' : ' is-muted'}`}>
              <span class="cp-row-top">
                <strong>
                  {p.name}
                  {p.code && <small class="muted"> · {p.code}</small>}
                </strong>
                <span>
                  {p.rut && <span class="badge">RUT</span>} {!p.active && <span class="badge badge--muted">Hidden</span>}
                </span>
              </span>
              <p>
                {formatMoney(p.price)} excl. VAT per {p.unit} · {formatMoney(incVat(Number(p.price), p.vat))} incl. {p.vat} % VAT
              </p>
              <span class="cp-actions">
                <button class="btn btn--ghost btn--sm" type="button" onClick={() => setEditing({ ...p, code: p.code ?? '', price: String(p.price).replace('.', ',') })}>Edit</button>
                <button class="btn btn--ghost btn--sm" type="button" onClick={() => remove(p)}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Modal open={!!editing} label="Product" onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={save}>
            <h3>{editing.id ? 'Edit product' : 'New product'}</h3>
            <div class="form-2">
              <div class="field">
                <label for="p-name">Name (shown on the invoice)</label>
                <input id="p-name" type="text" required maxLength={300} value={editing.name} onInput={set('name')} />
              </div>
              <div class="field">
                <label for="p-code">Product code (optional)</label>
                <input id="p-code" type="text" maxLength={20} value={editing.code} onInput={set('code')} />
              </div>
            </div>
            <div class="form-3">
              <div class="field">
                <label for="p-price">Price excl. VAT (kr)</label>
                <input id="p-price" type="text" inputmode="decimal" required value={editing.price} onInput={set('price')} />
              </div>
              <div class="field">
                <label for="p-unit">Per</label>
                <select id="p-unit" value={editing.unit} onChange={set('unit')}>
                  {Object.entries(UNITS).map(([k, v]) => <option value={k}>{v}</option>)}
                </select>
              </div>
              <div class="field">
                <label for="p-vat">VAT</label>
                <select id="p-vat" value={editing.vat} onChange={set('vat')}>
                  {[25, 12, 6, 0].map((v) => <option value={v}>{v} %</option>)}
                </select>
              </div>
            </div>
            <label class="cp-check">
              <input type="checkbox" checked={editing.rut} onChange={set('rut')} /> Labour that gives RUT deduction (for private customers)
            </label>
            <label class="cp-check">
              <input type="checkbox" checked={editing.active} onChange={set('active')} /> Show in the list when writing invoices
            </label>
            <ErrorMsg error={error} />
            <div class="cp-actions">
              <button class="btn" type="submit">Save</button>
              <button class="btn btn--ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
