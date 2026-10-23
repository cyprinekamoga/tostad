// Inställningar för offerter och fakturor: bankgiro, momsnummer, betalningsvillkor och texter.
import { useEffect, useState } from 'preact/hooks';
import { ErrorMsg } from '../ui.jsx';
import { loadSettings, saveSettings, nextInvoiceNumber, setInvoiceStart } from './docs.js';

export default function Settings() {
  const [form, setForm] = useState(null);
  const [next, setNext] = useState('');
  const [nextSaved, setNextSaved] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => setForm({ ...s, bankgiro: s.bankgiro ?? '', invoice_note: s.invoice_note ?? '' }));
    nextInvoiceNumber().then((n) => { setNext(String(n ?? '')); setNextSaved(String(n ?? '')); });
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.currentTarget.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const bg = form.bankgiro.replace(/\s/g, '');
      const formatted = /^\d{7,8}$/.test(bg) ? `${bg.slice(0, -4)}-${bg.slice(-4)}` : bg;
      await saveSettings({
        bankgiro: formatted || null,
        vat_nr: form.vat_nr.trim(),
        payment_days: Number(form.payment_days),
        quote_days: Number(form.quote_days),
        invoice_note: form.invoice_note.trim() || null,
        late_interest: form.late_interest.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      });
      if (next && next !== nextSaved) {
        await setInvoiceStart(next);
        setNextSaved(next);
      }
      setForm({ ...form, bankgiro: formatted });
      setInfo('The settings are saved.');
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  if (!form) return <p class="muted">Loading …</p>;
  return (
    <>
      <div class="cp-head">
        <h2>Settings</h2>
      </div>
      <form class="cp-panel form-grid" onSubmit={submit} style="max-width:720px">
        <h3 class="cp-subhead">Invoices and quotes</h3>
        <div class="form-2">
          <div class="field">
            <label for="s-bg">Bankgiro</label>
            <input id="s-bg" type="text" inputmode="numeric" placeholder="1234-5678" value={form.bankgiro} onInput={set('bankgiro')} />
            <small class="muted">Ask the bank to turn on OCR checks so payments are matched to the right invoice.</small>
          </div>
          <div class="field">
            <label for="s-vat">VAT number</label>
            <input id="s-vat" type="text" maxLength={20} value={form.vat_nr} onInput={set('vat_nr')} />
          </div>
        </div>
        <div class="form-3">
          <div class="field">
            <label for="s-days">Payment terms (days)</label>
            <input id="s-days" type="number" min={0} max={60} value={form.payment_days} onInput={set('payment_days')} />
          </div>
          <div class="field">
            <label for="s-qdays">Quote valid for (days)</label>
            <input id="s-qdays" type="number" min={1} max={180} value={form.quote_days} onInput={set('quote_days')} />
          </div>
          <div class="field">
            <label for="s-next">Next invoice number</label>
            <input id="s-next" type="number" min={1} value={next} onInput={(e) => setNext(e.currentTarget.value)} />
          </div>
        </div>
        <small class="muted">Have you invoiced in another system before? Continue the numbering from there. The number can only be changed before the first invoice is sent from here.</small>
        <div class="form-2">
          <div class="field">
            <label for="s-email">Email on the invoice</label>
            <input id="s-email" type="email" value={form.email} onInput={set('email')} />
          </div>
          <div class="field">
            <label for="s-phone">Phone on the invoice</label>
            <input id="s-phone" type="tel" value={form.phone} onInput={set('phone')} />
          </div>
        </div>
        <div class="field">
          <label for="s-late">Late payment interest text (Swedish, shown on invoices)</label>
          <input id="s-late" type="text" maxLength={500} value={form.late_interest} onInput={set('late_interest')} />
        </div>
        <div class="field">
          <label for="s-note">Extra text on invoices (Swedish, optional)</label>
          <textarea id="s-note" rows={2} maxLength={1000} value={form.invoice_note} onInput={set('invoice_note')} />
        </div>
        <p class="muted">No reminder fee is charged. Company registration number, address and F-tax come from the company details.</p>
        <ErrorMsg error={error} />
        {info && <p class="msg msg--ok">{info}</p>}
        <div class="cp-actions">
          <button class="btn" type="submit" disabled={busy}>{busy ? 'Saving …' : 'Save'}</button>
        </div>
      </form>
    </>
  );
}
