// Offert, faktura eller kreditfaktura som ett utskriftsvänligt dokument (A4).
// Används både på kundens länk och som förhandsvisning i administrationen.
import { totals, formatMoney, formatKrWhole } from '../../lib/money.js';

const SERVICES = {
  flytt: 'Flytt',
  flyttstadning: 'Flyttstädning',
  paket: 'Flytt + flyttstädning',
  hemstadning: 'Hemstädning',
  storstadning: 'Storstädning',
  fonsterputs: 'Fönsterputs',
  kontor: 'Kontorsstädning',
  pianoflytt: 'Pianoflytt / tunga lyft',
  annat: 'Övrigt',
};
const TITLE = { offert: 'Offert', faktura: 'Faktura', kredit: 'Kreditfaktura' };
const dateFmt = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtDate = (d) => (d ? dateFmt.format(new Date(`${d}T12:00:00Z`)) : '');
const qtyFmt = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 });

export default function DocView({ type, company, doc, logo }) {
  const t = totals(doc.lines, doc.rut_persons);
  const company_ = doc.buyer?.company;
  const isQuote = type === 'offert';
  const buyer = doc.buyer ?? {};
  // Privatpersoner ser priser inklusive moms, företag exklusive.
  const shown = (l) => (company_ ? l.net : l.gross);

  return (
    <article class="doc-sheet">
      <header class="doc-head">
        <div class="doc-brand">
          {logo && <img src={logo} alt="" width="56" height="56" />}
          <div>
            <strong>{company.name}</strong>
            <span>{company.legalName}</span>
          </div>
        </div>
        <div class="doc-title">
          <h1>{TITLE[type]}</h1>
          <p>Nr {doc.number ?? 'utkast'}</p>
        </div>
      </header>

      <section class="doc-meta">
        <div>
          <h2>{isQuote ? 'Till' : 'Fakturamottagare'}</h2>
          <p>
            <strong>{buyer.name}</strong>
            {buyer.org_nr && <><br />Org.nr {buyer.org_nr}</>}
            {buyer.street && <><br />{buyer.street}</>}
            {(buyer.postal_code || buyer.city) && <><br />{[buyer.postal_code, buyer.city].filter(Boolean).join(' ')}</>}
          </p>
        </div>
        <dl>
          {isQuote ? (
            <>
              <dt>Datum</dt><dd>{fmtDate(doc.sent_at?.slice(0, 10)) || fmtDate(new Date().toISOString().slice(0, 10))}</dd>
              {doc.valid_until && <><dt>Giltig till</dt><dd>{fmtDate(doc.valid_until)}</dd></>}
              {doc.wanted_date && <><dt>Önskat datum</dt><dd>{fmtDate(doc.wanted_date)}</dd></>}
              {doc.street && <><dt>Adress för jobbet</dt><dd>{[doc.street, [doc.postal_code, doc.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</dd></>}
            </>
          ) : (
            <>
              <dt>Fakturadatum</dt><dd>{fmtDate(doc.issue_date)}</dd>
              {type === 'faktura' && <><dt>Förfallodag</dt><dd><strong>{fmtDate(doc.due_date)}</strong></dd></>}
              <dt>Utfört</dt><dd>{fmtDate(doc.delivery_date)}</dd>
              {doc.your_ref && <><dt>Er referens</dt><dd>{doc.your_ref}</dd></>}
              {doc.credit_of_number && <><dt>Krediterar faktura</dt><dd>{doc.credit_of_number}</dd></>}
            </>
          )}
        </dl>
      </section>

      {doc.message && <p class="doc-message">{doc.message}</p>}

      <table class="doc-lines">
        <thead>
          <tr>
            <th>Beskrivning</th>
            <th class="num">Antal</th>
            <th class="num">À-pris</th>
            <th class="num">Moms</th>
            <th class="num">Belopp</th>
          </tr>
        </thead>
        <tbody>
          {t.rows.map((l) => (
            <tr>
              <td>
                {l.text}
                {l.rut && t.rut !== 0 && <small> (arbetskostnad, RUT)</small>}
              </td>
              <td class="num">{qtyFmt.format(l.qty)} {l.unit}</td>
              <td class="num">{formatMoney(company_ ? l.price : l.price * (1 + (l.vat ?? 25) / 100))}</td>
              <td class="num">{l.vat ?? 25} %</td>
              <td class="num">{formatMoney(shown(l))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section class="doc-sum">
        <dl>
          <dt>Summa exklusive moms</dt><dd>{formatMoney(t.net)}</dd>
          <dt>Moms 25 %</dt><dd>{formatMoney(t.vat)}</dd>
          <dt>Summa inklusive moms</dt><dd>{formatMoney(t.total)}</dd>
          {t.rut !== 0 && (
            <>
              <dt>Preliminär skattereduktion (RUT)</dt><dd>{formatMoney(-t.rut)}</dd>
            </>
          )}
          {t.rounding !== 0 && <><dt>Öresavrundning</dt><dd>{formatMoney(t.rounding)}</dd></>}
          <dt class="doc-total">{isQuote ? 'Att betala' : type === 'kredit' ? 'Att återbetala' : 'Att betala'}</dt>
          <dd class="doc-total">{formatKrWhole(Math.abs(t.toPay))}</dd>
        </dl>
        {t.rut !== 0 && (
          <p class="doc-rut">
            {isQuote
              ? `Priset gäller efter RUT-avdrag. Arbetskostnaden är ${formatMoney(t.labour)} och avdraget ${formatMoney(t.rut)}. Avdraget förutsätter att du har utrymme för RUT hos Skatteverket.`
              : `Arbetskostnad ${formatMoney(t.labour)}. Vi ansöker om skattereduktionen hos Skatteverket${doc.rut_names?.length ? ` för ${doc.rut_names.join(' och ')}` : ''}. Om Skatteverket inte godkänner hela avdraget behöver mellanskillnaden betalas.`}
          </p>
        )}
      </section>

      {type === 'faktura' && (
        <section class="doc-pay">
          <div><span>Bankgiro</span><strong>{company.bankgiro ?? 'saknas'}</strong></div>
          <div><span>OCR-nummer</span><strong>{doc.ocr ?? 'tilldelas när fakturan skickas'}</strong></div>
          <div><span>Belopp</span><strong>{formatKrWhole(t.toPay)}</strong></div>
          <div><span>Förfallodag</span><strong>{fmtDate(doc.due_date)}</strong></div>
        </section>
      )}
      {type === 'faktura' && doc.status === 'betald' && <p class="doc-paid">Betald {fmtDate(doc.paid_at)}. Tack!</p>}

      {!isQuote && company.invoiceNote && <p class="doc-note">{company.invoiceNote}</p>}
      {type === 'faktura' && company.lateInterest && <p class="doc-note">{company.lateInterest}</p>}
      {isQuote && <p class="doc-note">Fast pris utan avgifter på plats. Vi har ansvarsförsäkring hos Trygg-Hansa.</p>}

      <footer class="doc-foot">
        <span>{company.legalName}</span>
        <span>{company.street}, {company.postalCode} {company.city}</span>
        <span>Org.nr {company.orgNr} · Momsreg.nr {company.vatNr}</span>
        <span>Godkänd för F-skatt</span>
        <span>{company.phone} · {company.email} · {company.web}</span>
      </footer>
    </article>
  );
}

export { SERVICES as DOC_SERVICES };
