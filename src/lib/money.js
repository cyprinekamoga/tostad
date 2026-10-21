// Belopp på offerter och fakturor: moms, RUT-avdrag, öresavrundning och OCR-nummer.
// Databasen räknar på samma sätt (private.doc_totals) när en offert eller faktura sparas.

export const RUT_SHARE = 0.5;
export const RUT_CAP = 75000; // kronor per person och år

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round2 = (n) => (n < 0 ? -r2(-n) : r2(n));

/**
 * Rader: [{ text, qty, unit, price (exkl. moms per enhet), vat (procent), rut (arbetskostnad) }].
 * rutPersons: antal personer som delar på RUT-avdraget (0 = inget avdrag).
 */
export function totals(lines = [], rutPersons = 0) {
  let net = 0;
  let vat = 0;
  let labour = 0;
  const rows = lines.map((l) => {
    const lineNet = round2(Number(l.qty || 0) * Number(l.price || 0));
    const lineVat = round2((lineNet * Number(l.vat ?? 25)) / 100);
    net += lineNet;
    vat += lineVat;
    if (l.rut) labour += lineNet + lineVat;
    return { ...l, net: lineNet, vatAmount: lineVat, gross: round2(lineNet + lineVat) };
  });
  net = round2(net);
  vat = round2(vat);
  const total = round2(net + vat);
  labour = round2(labour);
  const persons = Math.max(0, Math.min(2, Number(rutPersons) || 0));
  // Skattereduktionen är halva arbetskostnaden inklusive moms, avrundad nedåt till hela kronor.
  const sign = labour < 0 ? -1 : 1;
  const rut = persons ? sign * Math.min(Math.floor(Math.abs(labour) * RUT_SHARE), RUT_CAP * persons) : 0;
  const before = round2(total - rut);
  // Avrundning till hela kronor, halva kronor bort från noll (som i databasen).
  const toPay = Math.sign(before) * Math.round(Math.abs(before));
  return { rows, net, vat, total, labour, rut, rounding: round2(toPay - before), toPay };
}

/** Luhn (modulus 10), samma kontrollsiffra som i personnummer och OCR. */
export function luhnDigit(digits) {
  let sum = 0;
  let double = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return String((10 - (sum % 10)) % 10);
}

/** OCR med längdsiffra och kontrollsiffra, så som Bankgirot kontrollerar dem. */
export function ocrFor(invoiceNumber) {
  const base = String(invoiceNumber).replace(/\D/g, '');
  const length = String((base.length + 2) % 10);
  return base + length + luhnDigit(base + length);
}

export function validOcr(ocr) {
  const s = String(ocr);
  return /^\d{3,25}$/.test(s) && luhnDigit(s.slice(0, -1)) === s.slice(-1) && Number(s.at(-2)) === s.length % 10;
}

/** Personnummer: ÅÅÅÅMMDDNNNN eller ÅÅMMDD-NNNN. Returnerar 12 siffror eller null. */
export function normalizePnr(value) {
  const d = String(value ?? '').replace(/[\s-+]/g, '');
  let full;
  if (/^\d{12}$/.test(d)) full = d;
  else if (/^\d{10}$/.test(d)) {
    const yy = Number(d.slice(0, 2));
    const now = new Date().getFullYear() % 100;
    full = (yy > now ? '19' : '20') + d;
  } else return null;
  return luhnDigit(full.slice(2, 11)) === full[11] ? full : null;
}

export const maskPnr = (last4) => `ÅÅÅÅMMDD-${last4 ? `**${String(last4).slice(-2)}` : '****'}`;

const kr = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const krWhole = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
export const formatMoney = (n) => `${kr.format(Number(n || 0))} kr`;
export const formatKrWhole = (n) => `${krWhole.format(Math.round(Number(n || 0)))} kr`;

/** Pris inklusive moms till pris exklusive, för formulär där man skriver in vad kunden betalar. */
export const exVat = (gross, vat = 25) => round2(Number(gross || 0) / (1 + Number(vat) / 100));
export const incVat = (net, vat = 25) => round2(Number(net || 0) * (1 + Number(vat) / 100));
