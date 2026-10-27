// Mejlen till kunder (svenska), sökande (svenska) och personal (engelska). Rena funktioner som
// returnerar ämne, HTML och text, så att de går att testa utan nätverk.
const SITE = 'https://tostadflytt.se';
const GREEN = '#14532d';

const SERVICE = {
  flytt: 'flytt',
  flyttstadning: 'flyttstädning',
  paket: 'flytt och flyttstädning',
  hemstadning: 'hemstädning',
  storstadning: 'storstädning',
  fonsterputs: 'fönsterputs',
  kontor: 'städning',
  pianoflytt: 'pianoflytt',
  annat: 'uppdrag',
};
export const serviceName = (s) => SERVICE[s] ?? 'uppdrag';

export const escape = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] ?? '';
const hello = (name) => (firstName(name) ? `Hej ${firstName(name)}!` : 'Hej!');
const kr = (n) => `${Math.round(Number(n) || 0).toLocaleString('sv-SE').replace(/ /g, ' ')} kr`;
const svDate = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const dayText = (date) => svDate.format(new Date(`${date}T12:00:00Z`));

/**
 * Bygger ett mejl av stycken. Ett stycke är text, { button: [text, url] }, { list: [...] } eller { images: [url] }.
 * Returnerar html och en textversion.
 */
export function layout({ preheader, blocks, company, lang = 'sv' }) {
  const sign = lang === 'sv' ? 'Vänliga hälsningar' : 'Best regards';
  const footer = `${company.name} · ${company.phone} · ${company.email} · tostadflytt.se`;
  const htmlBlocks = blocks
    .map((b) => {
      if (typeof b === 'string') return `<p style="margin:0 0 16px">${escape(b).replace(/\n/g, '<br>')}</p>`;
      if (b.button)
        return `<p style="margin:24px 0"><a href="${escape(b.button[1])}" style="background:${GREEN};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;display:inline-block">${escape(b.button[0])}</a></p>`;
      if (b.list) return `<ul style="margin:0 0 16px;padding-left:20px">${b.list.map((x) => `<li style="margin:0 0 6px">${escape(x)}</li>`).join('')}</ul>`;
      if (b.images)
        return `<p style="margin:0 0 16px">${b.images.map((u) => `<a href="${escape(u)}"><img src="${escape(u)}" alt="" width="160" style="width:160px;height:120px;object-fit:cover;border-radius:8px;margin:0 6px 6px 0;border:0"></a>`).join('')}</p>`;
      return '';
    })
    .join('');
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#1c2b22;font-size:16px;line-height:1.5">
<span style="display:none;max-height:0;overflow:hidden">${escape(preheader ?? '')}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px">
<tr><td style="font-size:20px;font-weight:700;color:${GREEN};padding-bottom:18px">${escape(company.name)}</td></tr>
<tr><td>${htmlBlocks}<p style="margin:24px 0 0">${sign}<br>${escape(company.name)}</p></td></tr>
</table>
<p style="font-size:12px;color:#5b6b61;margin:16px 0 0">${escape(footer)}</p>
</td></tr></table></body></html>`;
  const text = [
    ...blocks.map((b) => {
      if (typeof b === 'string') return b;
      if (b.button) return `${b.button[0]}: ${b.button[1]}`;
      if (b.list) return b.list.map((x) => `- ${x}`).join('\n');
      if (b.images) return b.images.join('\n');
      return '';
    }),
    `${sign}\n${company.name}\n${company.phone}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { html, text };
}

const mail = (subject, opts) => ({ subject, ...layout(opts) });

/** Bekräftelse när ett jobb är bokat. */
export function bookingMail({ customer, job, date, time, repeatWeeks, portalUrl, company }) {
  const address = [job.street, job.city].filter(Boolean).join(', ');
  const blocks = [
    hello(customer.name),
    `Tack för din bokning! Här är det vi har bokat in:`,
    {
      list: [
        `${serviceName(job.service)[0].toUpperCase()}${serviceName(job.service).slice(1)}`,
        `${dayText(date)} kl ${time}`,
        ...(address ? [address] : []),
        ...(job.to_street ? [`Till: ${[job.to_street, job.to_city].filter(Boolean).join(', ')}`] : []),
        ...(repeatWeeks ? [repeatWeeks === 1 ? 'Varje vecka' : `Var ${repeatWeeks}:e vecka`] : []),
      ],
    },
    'Behöver du ändra något? Svara på det här mejlet eller ring oss.',
  ];
  if (portalUrl) blocks.push({ button: ['Se din bokning på Mina sidor', portalUrl] });
  return mail(`Bokningsbekräftelse: ${serviceName(job.service)} ${date}`, { preheader: `${dayText(date)} kl ${time}`, blocks, company });
}

/** Fotorapporten samma kväll som jobbet blev klart. */
export function photoReportMail({ customer, job, date, photos, portalUrl, company }) {
  const blocks = [
    hello(customer.name),
    `Nu är vi klara med ${serviceName(job.service)}${job.street ? ` på ${job.street}` : ''} ${dayText(date)}. Här är bilderna som vårt team tog när vi var klara.`,
    { images: photos.slice(0, 6) },
  ];
  if (portalUrl) blocks.push({ button: ['Se alla bilder på Mina sidor', portalUrl] });
  else if (photos.length > 6) blocks.push(`Fler bilder finns hos oss. Hör av dig så skickar vi dem.`);
  blocks.push('Bilderna kan vara bra att ha till besiktningen. Är något inte som det ska? Hör av dig inom en vecka så kommer vi tillbaka och åtgärdar det.');
  return mail(`Fotorapport: ${serviceName(job.service)}${job.street ? ` ${job.street}` : ''}`, { preheader: 'Bilder från ditt uppdrag', blocks, company });
}

/** Be om ett omdöme på Google när fakturan är betald. */
export function reviewMail({ name, reviewUrl, company }) {
  return mail('Tack! Vill du hjälpa oss med ett omdöme?', {
    preheader: 'Det tar en minut och betyder mycket för oss',
    blocks: [
      hello(name),
      'Tack för att du valde TO Städ & Flytt, och tack för din betalning.',
      'Vi är ett litet företag och de flesta nya kunder hittar oss på Google. Om du var nöjd blir vi väldigt glada för ett omdöme. Det tar en minut.',
      { button: ['Skriv ett omdöme på Google', reviewUrl] },
      'Var du inte nöjd? Svara på det här mejlet och berätta, så gör vi vad vi kan för att rätta till det.',
    ],
    company,
  });
}

/** Offert med länk. */
export function quoteMail({ doc, url, company }) {
  return mail(`Offert ${doc.number} från ${company.name}`, {
    preheader: `${kr(doc.to_pay)}${doc.valid_until ? `, gäller till ${doc.valid_until}` : ''}`,
    blocks: [
      hello(doc.buyer?.name),
      `Här är vår offert ${doc.number} på ${kr(doc.to_pay)}${doc.rut > 0 ? ' efter rutavdrag' : ''}. Du kan läsa den, spara den som PDF och acceptera direkt via knappen.`,
      { button: ['Läs och acceptera offerten', url] },
      ...(doc.valid_until ? [`Offerten gäller till ${doc.valid_until}.`] : []),
      'Hör av dig om du har frågor.',
    ],
    company,
  });
}

/** Faktura, kreditfaktura eller påminnelse med länk. */
export function invoiceMail({ doc, url, reminder = false, company }) {
  const fee = Number(doc.reminder_fee) || 0;
  if (reminder)
    return mail(`Påminnelse: faktura ${doc.number} från ${company.name}`, {
      preheader: `${kr(Number(doc.to_pay) + fee)}, förföll ${doc.due_date}`,
      blocks: [
        hello(doc.buyer?.name),
        `Vi har inte fått betalt för faktura ${doc.number} på ${kr(doc.to_pay)}, som förföll ${doc.due_date}. Har du redan betalat kan du bortse från det här mejlet.`,
        {
          list: [
            `Bankgiro: ${company.bankgiro ?? 'se fakturan'}`,
            `OCR-nummer: ${doc.ocr}`,
            ...(fee ? [`Fakturabelopp: ${kr(doc.to_pay)}`, `Påminnelseavgift: ${kr(fee)}`] : []),
            `Att betala: ${kr(Number(doc.to_pay) + fee)}`,
          ],
        },
        { button: ['Visa fakturan', url] },
        'Har du frågor om fakturan? Svara på det här mejlet.',
      ],
      company,
    });
  if (doc.kind === 'kredit')
    return mail(`Kreditfaktura ${doc.number} från ${company.name}`, {
      preheader: `Kreditfaktura på ${kr(Math.abs(doc.to_pay))}`,
      blocks: [hello(doc.buyer?.name), `Här är kreditfaktura ${doc.number} på ${kr(Math.abs(doc.to_pay))}.`, { button: ['Visa kreditfakturan', url] }],
      company,
    });
  return mail(`Faktura ${doc.number} från ${company.name}`, {
    preheader: `${kr(doc.to_pay)}, förfaller ${doc.due_date}`,
    blocks: [
      hello(doc.buyer?.name),
      `Tack för att du anlitade ${company.name}! Här är faktura ${doc.number}.`,
      { list: [`Att betala: ${kr(doc.to_pay)}`, `Förfallodag: ${doc.due_date}`, `Bankgiro: ${company.bankgiro ?? 'se fakturan'}`, `OCR-nummer: ${doc.ocr}`] },
      { button: ['Visa fakturan', url] },
      ...(doc.rut > 0 ? ['Rutavdraget är redan avdraget. Vi ansöker om det hos Skatteverket när fakturan är betald.'] : []),
    ],
    company,
  });
}

/** Bekräftelse till den som söker jobb. */
export function applicantMail({ name, title, company }) {
  return mail('Tack för din ansökan', {
    preheader: 'Vi har fått din ansökan',
    blocks: [
      hello(name),
      `Tack för din ansökan${title ? ` till tjänsten ${title}` : ''}! Vi har fått den och läser alla ansökningar. Om vi går vidare hör vi av oss via telefon eller mejl.`,
      'Vill du ändra något i ansökan eller dra tillbaka den? Svara på det här mejlet.',
    ],
    company,
  });
}

/** Svar till den som inte fick jobbet. */
export function rejectionMail({ name, title, company }) {
  return mail(`Angående din ansökan${title ? ` till ${title}` : ''}`, {
    preheader: 'Tack för ditt intresse för TO Städ & Flytt',
    blocks: [
      hello(name),
      `Tack för att du sökte${title ? ` tjänsten ${title}` : ' jobb'} hos oss och för tiden du lade på din ansökan.`,
      'Vi har nu gått igenom ansökningarna och har tyvärr valt att gå vidare med andra kandidater den här gången.',
      'Du är välkommen att söka igen när vi har nya tjänster ute på tostadflytt.se/jobb. Vi önskar dig lycka till framöver!',
    ],
    company,
  });
}

/** Länk till Mina sidor när kunden ber om den själv. */
export function portalLinkMail({ name, url, company }) {
  return mail('Din länk till Mina sidor', {
    preheader: 'Bokningar, fotorapporter, offerter och fakturor',
    blocks: [
      hello(name),
      'Här är din personliga länk till Mina sidor. Där ser du dina bokningar, fotorapporter, offerter och fakturor.',
      { button: ['Öppna Mina sidor', url] },
      'Länken är bara till dig, så dela den inte. Bad du inte om den här länken kan du bortse från mejlet.',
    ],
    company,
  });
}

/** Nytt lösenord för personal och administratörer (engelska, som appen). */
export function passwordMail({ name, url, company }) {
  return mail(`Choose a new password for ${company.name}`, {
    lang: 'en',
    preheader: 'The link works for one hour',
    blocks: [
      firstName(name) ? `Hi ${firstName(name)}!` : 'Hi!',
      'Someone asked for a new password for your account. Open the link and choose a new password. The link works for one hour.',
      { button: ['Choose a new password', url] },
      'If you did not ask for this, you can ignore this email. Your password stays the same.',
    ],
    company,
  });
}

export const urls = {
  portal: (token) => `${SITE}/kund?k=${token}`,
  doc: (token) => `${SITE}/dokument?t=${token}`,
  activate: (hash, type) => `${SITE}/app/aktivera?th=${encodeURIComponent(hash)}&typ=${type}`,
};
