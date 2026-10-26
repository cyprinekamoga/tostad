// Export till redovisningen: verifikationer för fakturor, kreditfakturor, inbetalningar och RUT från
// Skatteverket, som SIE 4-fil (importeras i Fortnox, Visma och andra) och som Excel-listor (CSV).
// Kontona följer BAS-kontoplanen. Redovisningskonsulten kan ändra kontona vid importen.

export const ACCOUNTS = {
  receivable: [1510, 'Kundfordringar'],
  rutReceivable: [1513, 'Kundfordringar - delad faktura'],
  bank: [1930, 'Företagskonto'],
  rounding: [3740, 'Öres- och kronutjämning'],
  reminderFee: [3930, 'Påminnelseavgifter'],
  sales: { 25: [3001, 'Försäljning tjänster 25 % moms'], 12: [3002, 'Försäljning tjänster 12 % moms'], 6: [3003, 'Försäljning tjänster 6 % moms'], 0: [3004, 'Försäljning tjänster momsfri'] },
  vat: { 25: [2611, 'Utgående moms 25 %'], 12: [2621, 'Utgående moms 12 %'], 6: [2631, 'Utgående moms 6 %'] },
};

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const round2 = (n) => (n < 0 ? -r2(-n) : r2(n));
const buyerName = (inv) => inv.buyer?.name ?? '';

/** Netto och moms per momssats från fakturans rader. Avrundningen på radnivå följer fakturan. */
export function vatBreakdown(lines = []) {
  const out = {};
  for (const l of lines) {
    const rate = Number(l.vat ?? 25);
    const net = round2(Number(l.qty || 0) * Number(l.price || 0));
    const vat = round2((net * rate) / 100);
    out[rate] ??= { net: 0, vat: 0 };
    out[rate].net = round2(out[rate].net + net);
    out[rate].vat = round2(out[rate].vat + vat);
  }
  return out;
}

const account = (pair) => pair[0];

/**
 * Verifikationer för en period. Varje verifikation: { date, text, rows: [{ account, amount }] } där
 * positivt belopp är debet och negativt kredit. Summan av raderna är alltid noll.
 */
export function vouchers(invoices, from, to) {
  const inRange = (d) => d && d >= from && d <= to;
  const out = [];
  for (const inv of invoices) {
    if (inv.status === 'utkast' || !inv.number) continue;
    const label = `${inv.kind === 'kredit' ? 'Kreditfaktura' : 'Faktura'} ${inv.number}${buyerName(inv) ? ` ${buyerName(inv)}` : ''}`;
    if (inRange(inv.issue_date)) {
      const rows = [];
      const toPay = round2(inv.to_pay);
      const rut = round2(inv.rut ?? 0);
      if (toPay) rows.push({ account: account(ACCOUNTS.receivable), amount: toPay });
      if (rut) rows.push({ account: account(ACCOUNTS.rutReceivable), amount: rut });
      for (const [rate, sums] of Object.entries(vatBreakdown(inv.lines))) {
        const sales = ACCOUNTS.sales[rate] ?? ACCOUNTS.sales[25];
        if (sums.net) rows.push({ account: account(sales), amount: -sums.net });
        if (sums.vat) rows.push({ account: account(ACCOUNTS.vat[rate] ?? ACCOUNTS.vat[25]), amount: -sums.vat });
      }
      // Skillnaden mellan raderna och fakturans total (öresavrundning) bokas på 3740 så att verifikationen balanserar.
      const diff = round2(rows.reduce((s, r) => s + r.amount, 0));
      if (diff) rows.push({ account: account(ACCOUNTS.rounding), amount: -diff });
      out.push({ date: inv.issue_date, text: label, kind: 'faktura', rows });
    }
    // Påminnelseavgiften är momsfri och bokförs den dag den lades på.
    if (inRange(inv.reminder_fee_at) && Number(inv.reminder_fee)) {
      const amount = round2(inv.reminder_fee);
      out.push({ date: inv.reminder_fee_at, text: `Påminnelseavgift ${label}`, kind: 'avgift', rows: [{ account: account(ACCOUNTS.receivable), amount }, { account: account(ACCOUNTS.reminderFee), amount: -amount }] });
    }
    if (inRange(inv.paid_at) && Number(inv.paid_amount)) {
      const amount = round2(inv.paid_amount);
      out.push({ date: inv.paid_at, text: `Inbetalning ${label}`, kind: 'betalning', rows: [{ account: account(ACCOUNTS.bank), amount }, { account: account(ACCOUNTS.receivable), amount: -amount }] });
    }
    if (inRange(inv.rut_paid_at) && Number(inv.rut_paid_amount)) {
      const amount = round2(inv.rut_paid_amount);
      out.push({ date: inv.rut_paid_at, text: `RUT från Skatteverket ${label}`, kind: 'rut', rows: [{ account: account(ACCOUNTS.bank), amount }, { account: account(ACCOUNTS.rutReceivable), amount: -amount }] });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.text.localeCompare(b.text, 'sv'));
}

const allAccounts = () => {
  const list = [ACCOUNTS.receivable, ACCOUNTS.rutReceivable, ACCOUNTS.bank, ACCOUNTS.rounding, ACCOUNTS.reminderFee, ...Object.values(ACCOUNTS.sales), ...Object.values(ACCOUNTS.vat)];
  return new Map(list.map(([n, name]) => [n, name]));
};

const sieText = (s) => `"${String(s).replace(/\\/g, '').replace(/"/g, '\\"').slice(0, 100)}"`;
const sieDate = (d) => d.replace(/-/g, '');
const sieAmount = (n) => round2(n).toFixed(2);

/** SIE 4-fil som text. Kodas till PC8 (CP437) med encodeCp437 innan den sparas. */
export function sie(vouchersList, { company, from, to, generated }) {
  const names = allAccounts();
  const used = [...new Set(vouchersList.flatMap((v) => v.rows.map((r) => r.account)))].sort((a, b) => a - b);
  const year = from.slice(0, 4);
  const lines = [
    '#FLAGGA 0',
    '#FORMAT PC8',
    '#SIETYP 4',
    `#PROGRAM ${sieText('TO Stad och Flytt')} 1.0`,
    `#GEN ${sieDate(generated)}`,
    `#FNAMN ${sieText(company.legalName)}`,
    `#ORGNR ${company.orgNr}`,
    `#RAR 0 ${year}0101 ${year}1231`,
    `#KPTYP BAS2014`,
    ...used.map((n) => `#KONTO ${n} ${sieText(names.get(n) ?? '')}`),
    `#PROSA ${sieText(`Fakturor och betalningar ${from} till ${to}`)}`,
  ];
  vouchersList.forEach((v, i) => {
    lines.push(`#VER "A" ${i + 1} ${sieDate(v.date)} ${sieText(v.text)}`, '{');
    for (const r of v.rows) lines.push(`   #TRANS ${r.account} {} ${sieAmount(r.amount)}`);
    lines.push('}');
  });
  return `${lines.join('\r\n')}\r\n`;
}

// CP437 för de tecken som förekommer i svenska texter. Övriga tecken blir ?.
const CP437 = { Ç: 128, ü: 129, é: 130, â: 131, ä: 132, à: 133, å: 134, ç: 135, ê: 136, ë: 137, è: 138, ï: 139, î: 140, ì: 141, Ä: 142, Å: 143, É: 144, æ: 145, Æ: 146, ô: 147, ö: 148, ò: 149, û: 150, ù: 151, ÿ: 152, Ö: 153, Ü: 154, ø: 155, '£': 156, Ø: 157, á: 160, í: 161, ó: 162, ú: 163, ñ: 164, Ñ: 165, '§': 21 };
export function encodeCp437(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const code = c.charCodeAt(0);
    out[i] = code < 128 ? code : (CP437[c] ?? 63);
  }
  return out;
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const num = (n) => (n === null || n === undefined || n === '' ? '' : round2(n).toFixed(2).replace('.', ','));

/** Fakturalista för Excel (semikolon och decimalkomma, som svenska Excel vill ha). */
export function invoiceCsv(invoices, from, to, docUrl) {
  const head = ['Nummer', 'Typ', 'Fakturadatum', 'Förfallodag', 'Kund', 'Netto 25 %', 'Moms 25 %', 'Netto övrigt', 'Moms övrigt', 'Totalt', 'RUT', 'Öresavrundning', 'Att betala', 'Påminnelseavgift', 'OCR', 'Status', 'Betald', 'Betalt belopp', 'RUT-status', 'RUT utbetalt', 'Länk'];
  const rows = invoices
    .filter((i) => i.status !== 'utkast' && i.number && i.issue_date >= from && i.issue_date <= to)
    .sort((a, b) => a.number - b.number)
    .map((i) => {
      const b = vatBreakdown(i.lines);
      const other = Object.entries(b).filter(([rate]) => rate !== '25');
      return [
        i.number,
        i.kind === 'kredit' ? 'Kreditfaktura' : 'Faktura',
        i.issue_date,
        i.due_date ?? '',
        buyerName(i),
        num(b[25]?.net ?? 0),
        num(b[25]?.vat ?? 0),
        num(other.reduce((s, [, x]) => s + x.net, 0)),
        num(other.reduce((s, [, x]) => s + x.vat, 0)),
        num(i.total),
        num(i.rut ?? 0),
        num(i.rounding ?? 0),
        num(i.to_pay),
        num(i.reminder_fee ?? 0),
        i.ocr ?? '',
        { skickad: 'Obetald', betald: 'Betald', krediterad: 'Krediterad' }[i.status] ?? i.status,
        i.paid_at ?? '',
        num(i.paid_amount),
        { ej_aktuell: '', ej_ansokt: 'Ej ansökt', ansokt: 'Ansökt', utbetald: 'Utbetald', nekad: 'Nekad' }[i.rut_status] ?? '',
        i.rut_paid_at ?? '',
        i.token ? docUrl(i.token) : '',
      ].map(csvCell).join(';');
    });
  return `﻿${[head.map(csvCell).join(';'), ...rows].join('\r\n')}\r\n`;
}

/** Alla verifikationer som en lista för Excel, en rad per konto. */
export function voucherCsv(list) {
  const names = allAccounts();
  const head = ['Verifikation', 'Datum', 'Text', 'Konto', 'Kontonamn', 'Debet', 'Kredit'];
  const rows = [];
  list.forEach((v, i) => {
    for (const r of v.rows) rows.push([i + 1, v.date, v.text, r.account, names.get(r.account) ?? '', r.amount > 0 ? num(r.amount) : '', r.amount < 0 ? num(-r.amount) : ''].map(csvCell).join(';'));
  });
  return `﻿${[head.map(csvCell).join(';'), ...rows].join('\r\n')}\r\n`;
}
