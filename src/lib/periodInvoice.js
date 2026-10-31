// En faktura för alla jobb hos en kund under en period (t.ex. en månad hos Spic and Span):
// en rad per jobb med de timmar personalen har rapporterat. Rena funktioner, så att de går att testa.
import { zoned } from './planner.js';

const SERVICE_SV = {
  flytt: 'Flytt',
  flyttstadning: 'Flyttstädning',
  paket: 'Flytt + flyttstädning',
  hemstadning: 'Hemstädning',
  storstadning: 'Storstädning',
  fonsterputs: 'Fönsterputs',
  kontor: 'Kontorsstädning',
  pianoflytt: 'Pianoflytt',
};
const RUT_SERVICES = ['hemstadning', 'storstadning', 'flyttstadning', 'fonsterputs', 'flytt', 'paket', 'pianoflytt'];
const round2 = (n) => Math.round(n * 100) / 100;
const quarter = (n) => Math.round(n * 4) / 4;

/** Jobb som redan finns på en faktura som inte är krediterad. */
export function invoicedJobIds(invoices) {
  const ids = new Set();
  for (const inv of invoices ?? []) {
    if (inv.status === 'krediterad' || inv.kind === 'kredit') continue;
    if (inv.job_id) ids.add(inv.job_id);
    for (const id of inv.job_ids ?? []) ids.add(id);
  }
  return ids;
}

/** Vilken text jobbet får på fakturan, t.ex. "Hemstädning 21/10, Storgatan 1". */
export function lineText(job) {
  const d = zoned(job.starts_at).date;
  const [, m, day] = d.split('-').map(Number);
  const place = job.street || job.city || job.title;
  return `${SERVICE_SV[job.service] ?? 'Uppdrag'} ${day}/${m}${place ? `, ${place}` : ''}`;
}

/**
 * Raderna för en period. jobs: [{ id, service, street, city, title, starts_at, ends_at, price, staff: [...], work_hours: [{ hours }] }].
 * rate: produkten med timpriset ({ id, price, vat, rut }) exklusive moms. Utan rapporterade timmar används jobbets
 * överenskomna pris, annars den planerade tiden gånger antalet bokade, och raden markeras så att ägaren ser det.
 */
export function periodLines(jobs, { rate, company }) {
  const sorted = [...jobs].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const lines = [];
  let noHours = 0;
  let hours = 0;
  for (const job of sorted) {
    const worked = round2((job.work_hours ?? []).reduce((s, w) => s + (Number(w.hours) || 0), 0));
    const text = lineText(job);
    if (worked > 0 || !Number(job.price)) {
      const planned = quarter(((Date.parse(job.ends_at) - Date.parse(job.starts_at)) / 3600000) * Math.max(1, (job.staff ?? []).length));
      const qty = worked > 0 ? worked : planned;
      if (!(worked > 0)) noHours++;
      hours = round2(hours + qty);
      lines.push({
        text,
        qty: String(qty),
        unit: 'tim',
        price: String(Number(rate?.price) || 0),
        vat: rate ? Number(rate.vat) : 25,
        rut: !company && !!rate?.rut,
        hourly: true,
        estimated: !(worked > 0),
        job_id: job.id,
      });
    } else {
      // Överenskommet pris är vad kunden betalar: inklusive moms och, för privatkunder med rut, efter rutavdrag.
      const rut = !company && RUT_SERVICES.includes(job.service);
      const gross = rut ? Number(job.price) * 2 : Number(job.price);
      lines.push({ text, qty: '1', unit: 'st', price: String(round2(gross / 1.25)), vat: 25, rut, hourly: false, estimated: false, job_id: job.id });
    }
  }
  return { lines, noHours, hours };
}

/** Timpriset: den produkt assistenten valde, annars den första produkten som säljs per timme. */
export function pickRate(products, productId) {
  return products.find((p) => p.id === productId) ?? products.find((p) => p.unit === 'tim') ?? null;
}
