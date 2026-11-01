# SEO audit: tostadflytt.se

Date: 1 November 2026. All 67 pages in the sitemap were crawled. The homepage was tested with Lighthouse 12.6 (mobile and desktop), and the technical setup (robots.txt, redirects, headers, sitemap, structured data) was checked on the live site. The local SEO analysis from the same day is in `../LOCAL-SEO-ANALYSIS-tostadflytt.se.md`.

## SEO health score: 81/100

| Category | Weight | Score |
|---|---|---|
| Technical SEO | 22 % | 92 |
| Content quality | 23 % | 62 |
| On-page SEO | 20 % | 85 |
| Schema / structured data | 10 % | 88 |
| Performance (Core Web Vitals) | 10 % | 97 |
| AI search readiness | 10 % | 70 |
| Images | 5 % | 85 |

**Business type:** local service business (moving and cleaning) that comes to the customer, based in Eskilstuna and working across Stockholms, Uppsala and Södermanlands län.

The technical foundation is very strong. The score is held back almost entirely by content: 43 town pages that are mostly the same text, and too little proof of who is behind the company and what work it has done.

### Top 5 issues

1. **43 town pages share about 78 % of their text** (High). With the town name blanked out, only 13 to 24 % of each page is unique. This is the pattern Google calls doorway pages.
2. **No people, history or real job photos** (High). The about page has no names, no founding year and no team photo, and most images are stock photos (23 credited on /bildkallor). Google's quality raters look for exactly this kind of first-hand experience.
3. **Few reviews and outside mentions** (High). No rating is shown, and the company is barely listed outside Google and Eniro, which limits both map rankings and AI answers.
4. **Low-contrast text on the homepage** (Medium). The faded "story" steps use grey text with a 2.3 to 2.8 contrast ratio; readable text needs at least 4.5. This fails accessibility rules and makes the text hard to read in sunlight.
5. **12 titles are slightly too long** (Low). They are 61 to 65 characters, so Google may cut off the end, often the brand name.

### Top 5 quick wins

1. Make the faded story text on the homepage darker (one CSS change).
2. Shorten the 12 long titles to 60 characters or less.
3. Add the names and a photo of the people behind the company to the about page.
4. Replace stock photos on the 3 main service pages with real photos from your jobs.
5. Add `lastmod` dates to the sitemap so Google sees which pages changed.

## Technical SEO: 92

**Works well**
- All 67 sitemap pages return 200, with one canonical each that points to itself.
- HTTPS with HSTS (one year), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`.
- `www`, trailing slashes and uppercase URLs all 301 to one clean address. Unknown pages return a real 404.
- robots.txt allows everything public and blocks the admin, staff app, customer pages, document links and the thank-you page. The sitemap is listed.
- `lang="sv"` on every Swedish page; `hreflang` sv/en/x-default between the homepage and /en.
- Pages are static HTML (Astro), so nothing depends on JavaScript to be indexed.

**Findings**
- No `Content-Security-Policy` header (Low). Add one in `netlify.toml`, starting in report-only mode.
- The sitemap has no `lastmod` dates (Low).
- No `llms.txt` (Low, optional). Google ignores it, some AI tools read it.
- Plain `http://` redirects could not be tested from here, because only HTTPS traffic is allowed out of this environment. Netlify forces HTTPS by default.

## Content quality: 62

**Works well**
- Service pages are long and specific (median 946 words per page): fixed prices, what is included and not included, checklists, guarantees, RUT explained, FAQs.
- Strong trust facts: organisation number, F-skatt, RUT approval, liability insurance through Trygg-Hansa, Bohag 2010 terms, eight written guarantees.
- No duplicate titles or meta descriptions on any page.

**Findings**
- **Town pages (High).** 43 pages of about 600 words each, 76 to 87 % identical apart from the town name. The unique parts (neighbourhoods, housing types, one tip) are good but too short. Fix: real local content for the 8 to 12 towns that bring the most jobs, and merge the rest into one page per county.
- **Experience and expertise (High).** No founder or team names, no founding year, no "jobs done" figures, no case examples with real photos. Add a short team section with names and photos, the year you started, and 2 or 3 real before/after examples.
- **Stock imagery (Medium).** Real photos from your own jobs build trust and can rank in image search; stock photos do neither.

## On-page SEO: 85

**Works well**
- Exactly one H1 on every page; service H1s now name Stockholm and town pages name the town.
- Every page has a unique title and a meta description between 70 and 160 characters.
- Every page links to every service and every town through the menu and footer, so nothing is more than one click from the homepage.

**Findings**
- 12 titles are 61 to 65 characters: /, /en, /flytt-och-flyttstadning, /flyttstadning, /hemstadning, /jobb, /kontakt, /kontorsstadning, /omraden, /omraden/sigtuna and others (Low).
- The footer links to all 43 towns from all 67 pages (2,881 footer links in total). This is acceptable, but linking from each town to its 3 or 4 neighbouring towns and the right service pages would pass more relevance (Low).

## Schema / structured data: 88

**Works well**
- Valid JSON-LD on every page, with no parse errors.
- `LocalBusiness` + `MovingCompany` with legal name, organisation number, address, coordinates, opening hours (every day 8 to 22), phone, email, logo, price range and a full `areaServed` list.
- `Service` (52 pages), `BreadcrumbList` (65), `FAQPage` (55), `HowTo` (1), `WebSite` and `WebPage`.

**Findings**
- No `aggregateRating` or `Review` (Medium, later). Add these only once reviews are collected and shown on the site itself.
- `FAQPage` rich results are now only shown for government and health sites, so they won't appear in Google. The markup is harmless and still helps AI tools, so keep it.
- `sameAs` has only the Google profile. Add Facebook, Instagram, Reco and Eniro links once those profiles are up to date (Low).

## Performance: 97

Lighthouse 12.6 on the homepage (lab data; there is too little traffic yet for Google's real-user field data):

| | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| Mobile | 99 | 96 | 96 | 100 | 1.8 s | 0 | 20 ms |
| Desktop | 100 | 96 | 100 | 100 | 0.4 s | 0 | 0 ms |

The homepage HTML is 20 KB compressed and responds in about 0.3 s. Small items only: about 1,250 DOM elements, and the logo is served at a slightly low resolution for high-density screens.

## Images: 85

- 443 images across the site, all with width and height set (no layout shift) and lazy loading below the fold.
- All images have an `alt` attribute. The empty ones are the logo next to the company name and decorative pictures on service cards with headings, which is correct.
- Most photos are stock images (see Content quality).

## AI search readiness: 70

**Works well**
- robots.txt lets every crawler in, including GPTBot, ClaudeBot and PerplexityBot.
- Answer-first content: prices, what is included and FAQs in plain HTML text.
- Clear company facts in schema (organisation number, address, area, hours).

**Findings**
- AI assistants take most local recommendations from third-party sources (Reco, Eniro, Hitta, Bing, Reddit, "best of" lists). Almost none of these mention the company yet (High; see the local report).
- No `llms.txt` (Low).
- Run `/seo geo https://tostadflytt.se` for a full AI visibility check.

## What this audit could not measure

- Real-user Core Web Vitals (CrUX), Search Console indexing, clicks and queries: no Google API access was set up, and Google's PageSpeed API had used up its daily quota, so the numbers above are lab results.
- Backlinks and domain authority (needs Ahrefs, Semrush, Moz or Bing Webmaster Tools).
- Where the pages rank for which searches.
