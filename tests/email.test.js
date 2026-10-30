import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingMail, photoReportMail, reviewMail, quoteMail, invoiceMail, applicantMail, portalLinkMail, passwordMail, newSubmissionMail, escape, urls } from '../supabase/functions/email/templates.js';

const company = { name: 'TO Städ & Flytt', phone: '072 222 88 00', email: 'info@tostadflytt.se', bankgiro: '123-4567' };

test('text från kunder escapas i HTML', () => {
  assert.equal(escape('<script>"x"&'), '&lt;script&gt;&quot;x&quot;&amp;');
  const m = bookingMail({ customer: { name: '<b>Sara</b> Lind' }, job: { service: 'hemstadning', street: 'Gata <1>' }, date: '2026-11-02', time: '09:00', company });
  assert.doesNotMatch(m.html, /<b>Sara/);
  assert.match(m.html, /&lt;b&gt;Sara&lt;\/b&gt;!/);
});

test('bokningsbekräftelse med serie och länk till Mina sidor', () => {
  const m = bookingMail({ customer: { name: 'Sara Lind' }, job: { service: 'hemstadning', street: 'Kungsgatan 12', city: 'Eskilstuna' }, date: '2026-11-02', time: '09:00', repeatWeeks: 2, portalUrl: urls.portal('abc'), company });
  assert.equal(m.subject, 'Bokningsbekräftelse: hemstädning 2026-11-02');
  assert.match(m.text, /^Hej Sara!/);
  assert.match(m.text, /måndag 2 november kl 09:00/);
  assert.match(m.text, /- Var 2:e vecka/);
  assert.match(m.text, /https:\/\/tostadflytt\.se\/kund\?k=abc/);
  assert.match(m.html, /lang="sv"/);
});

test('fotorapport visar högst sex bilder', () => {
  const photos = Array.from({ length: 8 }, (_, i) => `https://x/${i}.jpg`);
  const m = photoReportMail({ customer: { name: 'Bo' }, job: { service: 'flyttstadning', street: 'Ågatan 3' }, date: '2026-10-30', photos, portalUrl: null, company });
  assert.equal((m.html.match(/<img /g) ?? []).length, 6);
  assert.match(m.text, /Fler bilder finns hos oss/);
});

test('faktura, påminnelse och kreditfaktura', () => {
  const doc = { number: 1005, kind: 'faktura', buyer: { name: 'Eva Ek' }, to_pay: 2450, rut: 1200, due_date: '2026-11-10', ocr: '100574' };
  const inv = invoiceMail({ doc, url: urls.doc('t1'), company });
  assert.equal(inv.subject, 'Faktura 1005 från TO Städ & Flytt');
  assert.match(inv.text, /Att betala: 2 450 kr/);
  assert.match(inv.text, /OCR-nummer: 100574/);
  assert.match(inv.text, /Rutavdraget är redan avdraget/);
  const rem = invoiceMail({ doc, url: urls.doc('t1'), reminder: true, company });
  assert.equal(rem.subject, 'Påminnelse: faktura 1005 från TO Städ & Flytt');
  assert.match(rem.text, /som förföll 2026-11-10/);
  const credit = invoiceMail({ doc: { ...doc, kind: 'kredit', to_pay: -2450 }, url: urls.doc('t2'), company });
  assert.match(credit.text, /kreditfaktura 1005 på 2 450 kr/);
});

test('offert, omdöme, sökande, portallänk och lösenord', () => {
  assert.match(quoteMail({ doc: { number: 21, buyer: { name: 'Ali' }, to_pay: 3000, rut: 0, valid_until: '2026-11-30' }, url: urls.doc('q'), company }).text, /gäller till 2026-11-30/);
  assert.match(reviewMail({ name: 'Ali', reviewUrl: 'https://g.page/r/x', company }).text, /Skriv ett omdöme på Google: https:\/\/g\.page\/r\/x/);
  assert.match(applicantMail({ name: 'Nina', title: 'Städare', company }).text, /till tjänsten Städare/);
  assert.match(portalLinkMail({ name: 'Nina', url: urls.portal('p'), company }).text, /Öppna Mina sidor: https:\/\/tostadflytt\.se\/kund\?k=p/);
  const pw = passwordMail({ name: 'John', url: urls.activate('h+1', 'recovery'), company });
  assert.match(pw.html, /lang="en"/);
  assert.match(pw.text, /^Hi John!/);
  assert.match(pw.text, /aktivera\?th=h%2B1&typ=recovery/);
});

test('avslag till sökande', async () => {
  const { rejectionMail } = await import('../supabase/functions/email/templates.js');
  const m = rejectionMail({ name: 'Nina Berg', title: 'Städare', company });
  assert.equal(m.subject, 'Angående din ansökan till Städare');
  assert.match(m.text, /^Hej Nina!/);
  assert.match(m.text, /valt att gå vidare med andra kandidater/);
  assert.match(m.text, /lycka till/);
});

test('påminnelse med påminnelseavgift', () => {
  const doc = { number: 1005, kind: 'faktura', buyer: { name: 'Eva Ek' }, to_pay: 2450, rut: 0, due_date: '2026-11-10', ocr: '100574', reminder_fee: 60 };
  const m = invoiceMail({ doc, url: urls.doc('t1'), reminder: true, company });
  assert.match(m.text, /Påminnelseavgift: 60 kr/);
  assert.match(m.text, /Att betala: 2 510 kr/);
  assert.doesNotMatch(invoiceMail({ doc: { ...doc, reminder_fee: 0 }, url: urls.doc('t1'), reminder: true, company }).text, /Påminnelseavgift/);
});

test('svar till kunden från Mina sidor', async () => {
  const { replyMail } = await import('../supabase/functions/email/templates.js');
  const m = replyMail({ name: 'Eva Ek', body: 'Hej Eva, vi kan komma kl 10 i stället.\nMvh Cyprine', url: urls.portal('k1'), company });
  assert.equal(m.subject, 'Svar från TO Städ & Flytt');
  assert.match(m.text, /^Hej Eva!/);
  assert.match(m.text, /vi kan komma kl 10/);
  assert.match(m.html, /kl 10 i stället\.<br>Mvh Cyprine/);
  assert.match(m.text, /Läs och svara på Mina sidor: https:\/\/tostadflytt\.se\/kund\?k=k1/);
  assert.match(replyMail({ name: 'Bo', body: 'x', url: null, company }).text, /Du kan svara på det här mejlet/);
});

test('mejl till företaget om en ny bokning', () => {
  const sub = { id: 'abc', kind: 'bokning', data: { namn: 'Anna <b>', tjanst: 'hemstadning', datum: '2026-11-12', pris: '1700', telefon: '0701234567', ovrigt: 'Katt hemma' } };
  const m = newSubmissionMail({ sub, url: urls.inbox(sub.id), company });
  assert.equal(m.subject, 'New booking: Anna <b>, Home cleaning 2026-11-12');
  assert.match(m.text, /Price from the calculator: 1.700 kr/);
  assert.match(m.text, /Katt hemma/);
  assert.match(m.text, /https:\/\/tostadflytt\.se\/admin\/inkorg#abc/);
  assert.ok(m.html.includes('Anna &lt;b&gt;'));
});
