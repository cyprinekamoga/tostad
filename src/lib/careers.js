// Lediga jobb: anställningsformer, annonstext till HTML och strukturerad data för Googles jobbsök.

export const EMPLOYMENT = { heltid: 'Heltid', deltid: 'Deltid', timanstallning: 'Timanställning', visstid: 'Visstid' };
const GOOGLE_TYPE = { heltid: ['FULL_TIME'], deltid: ['PART_TIME'], timanstallning: ['PART_TIME', 'PER_DIEM'], visstid: ['TEMPORARY'] };

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Annonstext till enkel HTML: tomrad ger nytt stycke, rader som börjar med "- " eller "* " blir en lista. */
export function textToHtml(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim());
      if (lines.every((l) => /^[-*•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${escape(l.replace(/^[-*•]\s+/, ''))}</li>`).join('')}</ul>`;
      return `<p>${lines.map(escape).join('<br>')}</p>`;
    })
    .join('');
}

/** Webbadressdel av en rubrik: "Städare till Solna!" blir "stadare-till-solna". */
export function slugify(title) {
  return String(title ?? '')
    .toLowerCase()
    .replace(/å|ä/g, 'a')
    .replace(/ö/g, 'o')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/** JobPosting enligt schema.org, så att annonsen kan visas i Googles jobbsök. */
export function jobPosting(v, { url, logo, site }) {
  const description = [v.intro && `<p>${escape(v.intro)}</p>`, textToHtml(v.description), v.requirements && `<h3>Vi söker dig som</h3>${textToHtml(v.requirements)}`, v.salary && `<p>Lön: ${escape(v.salary)}</p>`]
    .filter(Boolean)
    .join('');
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: v.title,
    description,
    datePosted: (v.published_at ?? v.created_at ?? '').slice(0, 10),
    ...(v.valid_through ? { validThrough: `${v.valid_through}T23:59:59+01:00` } : {}),
    employmentType: GOOGLE_TYPE[v.employment] ?? ['OTHER'],
    hiringOrganization: { '@type': 'Organization', name: site.legalName, sameAs: site.url, logo },
    jobLocation: {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: v.location || 'Stockholm', addressRegion: 'Stockholms län', addressCountry: 'SE' },
    },
    directApply: true,
    url,
  };
}
