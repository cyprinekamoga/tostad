// Sök fakturor på OCR-nummer, fakturanummer, belopp eller köparens namn, mejl och telefon.
// Mellanslag och bindestreck i OCR-numret ignoreras, så det går att klistra in från kontoutdraget.

const digitsOf = (v) => String(v ?? '').replace(/\D/g, '');

/** Hur väl fakturan matchar: 3 = exakt OCR eller nummer, 2 = belopp, 1 = del av text, 0 = ingen träff. */
export function invoiceMatch(inv, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return 1;
  const digits = digitsOf(q);
  const onlyDigits = digits && /^[\d\s\-.,:kr]+$/i.test(q);
  if (onlyDigits) {
    if (inv.ocr && inv.ocr === digits) return 3;
    if (inv.number != null && String(inv.number) === digits) return 3;
    const amount = Number(q.replace(/[\skr]/gi, '').replace(',', '.'));
    if (amount && [inv.to_pay, inv.paid_amount, inv.rut].some((v) => v != null && Math.round(Number(v)) === Math.round(amount))) return 2;
    if (digits.length >= 4 && inv.ocr?.includes(digits)) return 1;
    if (digits.length >= 4 && digitsOf(inv.buyer?.phone).includes(digits)) return 1;
    return 0;
  }
  const b = inv.buyer ?? {};
  return [b.name, b.email, b.phone, b.org_nr, inv.your_ref].some((v) => String(v ?? '').toLowerCase().includes(q)) ? 1 : 0;
}

/** Fakturorna som matchar, bästa träffen först. */
export function searchInvoices(list, query) {
  if (!String(query ?? '').trim()) return list;
  return list
    .map((inv) => ({ inv, score: invoiceMatch(inv, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.inv);
}

/** Bara siffrorna i en sökning, om den ser ut som ett OCR-nummer. */
export const ocrQuery = (query) => {
  const d = digitsOf(query);
  return d.length >= 5 && /^[\d\s-]+$/.test(String(query).trim()) ? d : null;
};

/** OCR i grupper om fyra, lättare att jämföra med kontoutdraget. */
export const formatOcr = (ocr) => String(ocr ?? '').replace(/(\d{4})(?=\d)/g, '$1 ');
