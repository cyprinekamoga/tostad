// Kontroll efter bygget: SEO-taggar, rubriker, alt-texter, strukturerad data och interna länkar.
// Kör: node scripts/check-site.mjs (efter npm run build)
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Sidor vars innehåll och rubrik hämtas när sidan öppnas (annonser som ändras utan ombyggnad).
const CLIENT_RENDERED = new Set(['jobb/annons.html']);

const dist = new URL('../dist/', import.meta.url).pathname;
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? (f !== '_astro' && walk(p)) : f.endsWith('.html') && files.push(p); });
walk(dist);

const problems = [];
const titles = new Map();
const descs = new Map();
const resolve = (href) => {
  const path = href.split('#')[0].split('?')[0];
  if (path === '/' || path === '') return 'index.html';
  const clean = path.replace(/^\//, '').replace(/\/$/, '');
  if (existsSync(join(dist, clean)) && statSync(join(dist, clean)).isFile()) return clean;
  return `${clean}.html`;
};

for (const f of files) {
  const rel = relative(dist, f);
  const html = readFileSync(f, 'utf8');
  const get = (re) => (html.match(re) || [])[1];
  const title = get(/<title>([^<]*)<\/title>/);
  const desc = get(/<meta name="description" content="([^"]*)"/);
  const canonical = get(/<link rel="canonical" href="([^"]*)"/);
  const robots = get(/<meta name="robots" content="([^"]*)"/) || '';
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  const noindex = robots.includes('noindex');
  if (!title) problems.push(`${rel}: saknar <title>`);
  else {
    const t = title.replace(/&amp;/g, '&');
    if (t.length > 65 && !noindex) problems.push(`${rel}: lång title (${t.length}) ${t}`);
    if (!noindex) titles.set(t, [...(titles.get(t) || []), rel]);
  }
  if (!desc) problems.push(`${rel}: saknar meta description`);
  else {
    if ((desc.length < 110 || desc.length > 165) && !noindex) problems.push(`${rel}: description ${desc.length} tecken`);
    if (!noindex) descs.set(desc, [...(descs.get(desc) || []), rel]);
  }
  if (!canonical && !noindex) problems.push(`${rel}: saknar canonical`);
  // Sidor som inte indexeras kan få sin rubrik från skriptet (till exempel /dokument).
  if (h1s > 1 || (h1s === 0 && !noindex && !CLIENT_RENDERED.has(rel))) problems.push(`${rel}: ${h1s} st h1`);
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\salt(=|\s|>|\/)/.test(m[0])) problems.push(`${rel}: img utan alt ${m[0].slice(0, 80)}`);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { problems.push(`${rel}: ogiltig JSON-LD ${e.message}`); }
  }
  for (const m of html.matchAll(/href="(\/[^"]*)"/g)) {
    const href = m[1].replace(/&amp;/g, '&');
    if (href.startsWith('/_astro/') || /\.(png|ico|webmanifest|xml|txt|jpg|webp|avif|woff2)$/.test(href.split('?')[0])) {
      if (!existsSync(join(dist, href.split('?')[0]))) problems.push(`${rel}: saknad fil ${href}`);
      continue;
    }
    if (!existsSync(join(dist, resolve(href)))) problems.push(`${rel}: trasig länk ${href}`);
    const id = href.split('#')[1];
    if (id && resolve(href) === rel && !html.includes(`id="${id}"`)) problems.push(`${rel}: ankare saknas #${id}`);
  }
}
for (const [t, where] of titles) if (where.length > 1) problems.push(`Dubblerad title "${t}": ${where.join(', ')}`);
for (const [d, where] of descs) if (where.length > 1) problems.push(`Dubblerad description: ${where.join(', ')}`);

const sitemap = readFileSync(join(dist, 'sitemap-0.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const l of locs) if (/\.html$|\/tack$|404/.test(l)) problems.push(`Sitemap innehåller ${l}`);

console.log(`${files.length} sidor kontrollerade, ${locs.length} adresser i sitemap.`);
console.log(problems.length ? problems.join('\n') : 'Inga problem hittades.');
process.exitCode = problems.length ? 1 : 0;
