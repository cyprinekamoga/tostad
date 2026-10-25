import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingMail, photoReportMail, reviewMail, quoteMail, invoiceMail, applicantMail, portalLinkMail, passwordMail, escape, urls } from '../supabase/functions/email/templates.js';

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
