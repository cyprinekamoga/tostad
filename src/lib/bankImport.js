// Inbetalningar från banken: BgMax-filen från Bankgirot eller ett kontoutdrag som CSV/text från internetbanken.
// Varje inbetalning matchas mot obetalda fakturor, i första hand på OCR-nummer och i andra hand på belopp.

const digitsOf = (v) => String(v ?? '').replace(/\D/g, '');
const toDate = (yyyymmdd) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

/** Är det en BgMax-fil? Första posten börjar med 01BGMAX. */
export const isBgMax = (text) => /^﻿?01BGMAX/.test(String(text).trimStart());

/**
 * BgMax (Bankgirot). Betalningsposter (20, 21) samlas per insättning; insättningsposten (15) ger datumet.
 * Belopp står i öre. Avdrag (21) blir negativa belopp.
 */
export function parseBgMax(text) {
  const out = [];
  let section = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/^﻿/, '');
    const tk = line.slice(0, 2);
    if (tk === '20' || tk === '21') {
      const reference = line.slice(12, 37).trim();
      const amount = Number(line.slice(37, 55)) / 100;
      section.push({ date: null, amount: tk === '21' ? -amount : amount, reference, ocr: digitsOf(reference), name: '', text: line.trim() });
    } else if (tk === '26' && section.length) {
      section[section.length - 1].name = line.slice(2, 37).trim();
    } else if (tk === '15') {
      const date = toDate(line.slice(37, 45));
      for (const p of section) p.date = date;
      out.push(...section);
      section = [];
    }
  }
  out.push(...section);
  return out.filter((p) => p.amount);
}

// Ett belopp som 1 250,00 eller 1250.00 eller -1.250,50. Tusentalsavgränsare är mellanslag eller punkt.
const AMOUNT = /^-?\d{1,3}(?:[  .]\d{3})*(?:,\d{1,2})?$|^-?\d+(?:[.,]\d{1,2})?$/;
function amountOf(cell) {
  const c = cell.trim().replace(/\s*(kr|sek)$/i, '');
  if (!AMOUNT.test(c)) return null;
  const n = Number(c.replace(/[  ]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function dateOf(cell) {
  const m = cell.trim().match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function splitRow(line) {
  const sep = [';', '\t', ','].find((s) => line.includes(s)) ?? ';';
  const cells = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === sep && !quoted) {
      cells.push(cur);
      cur = '';
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/**
 * Kontoutdrag från internetbanken (CSV eller kopierad text). Varje rad med ett datum och ett positivt belopp
 * blir en inbetalning; övriga celler är text där OCR-numret kan finnas. Saldokolumnen hoppas över genom att
 * det första beloppet efter texten används.
 */
export function parseStatement(text) {
  const out = [];
  for (const line of String(text).replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = splitRow(line);
    const date = cells.map(dateOf).find(Boolean);
    if (!date) continue;
    // Belopp har decimaler (1 250,00). Bara om ingen cell har det räknas heltal, så att ett OCR-nummer inte tas för ett belopp.
    const numeric = cells.map((c, i) => ({ i, c, n: dateOf(c) ? null : amountOf(c) })).filter((x) => x.n !== null);
    const decimal = numeric.filter((x) => /[.,]\d{1,2}(\s*(kr|sek))?$/i.test(x.c.trim()));
    const amounts = decimal.length ? decimal : numeric.filter((x) => digitsOf(x.c).length <= 6);
    if (!amounts.length) continue;
    const amount = amounts[0].n;
    if (!(amount > 0)) continue;
    const words = cells.filter((c, i) => !dateOf(c) && !amounts.some((a) => a.i === i)).join(' ').trim();
    out.push({ date, amount, reference: words, ocr: null, name: '', text: line.trim() });
  }
  return out;
}

/** Läser filen eller texten, vilket format det än är. */
export const parsePayments = (text) => (isBgMax(text) ? parseBgMax(text) : parseStatement(text));

const owed = (inv) => Math.round((Number(inv.to_pay) + Number(inv.reminder_fee || 0)) * 100) / 100;

/**
 * Matchar inbetalningar mot obetalda fakturor. Svarar en rad per inbetalning:
 * { payment, invoice, how: 'ocr' | 'amount' | null, note, pick } där pick är förvald bock.
 * En faktura matchas högst en gång.
 */
export function matchPayments(payments, invoices) {
  const open = invoices.filter((i) => i.kind === 'faktura' && i.status === 'skickad' && i.ocr);
  const byOcr = new Map(open.map((i) => [i.ocr, i]));
  const used = new Set();
  const rows = payments.map((payment) => {
    // OCR: exakt referens från BgMax, annars en sifferföljd i texten som är ett av våra OCR-nummer.
    const candidates = payment.ocr ? [payment.ocr] : (payment.reference.match(/\d[\d -]{3,}\d/g) ?? []).map(digitsOf);
    const hit = candidates.map((c) => byOcr.get(c)).find((i) => i && !used.has(i.id));
    if (hit) {
      used.add(hit.id);
      const diff = Math.round((payment.amount - owed(hit)) * 100) / 100;
      const note = diff === 0 ? '' : diff < 0 ? `${-diff} kr too little` : `${diff} kr too much`;
      return { payment, invoice: hit, how: 'ocr', note, pick: diff >= 0 };
    }
    return { payment, invoice: null, how: null, note: '', pick: false };
  });
  // Belopp: bara när exakt en obetald faktura har just det beloppet och ingen annan inbetalning tar den.
  for (const row of rows) {
    if (row.invoice) continue;
    const same = open.filter((i) => !used.has(i.id) && owed(i) === Math.round(row.payment.amount * 100) / 100);
    if (same.length === 1) {
      used.add(same[0].id);
      Object.assign(row, { invoice: same[0], how: 'amount', note: 'Same amount, no OCR. Check the name.', pick: false });
    }
  }
  return rows;
}
