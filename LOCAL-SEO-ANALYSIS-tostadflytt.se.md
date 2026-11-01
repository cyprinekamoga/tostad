# Local SEO analysis: tostadflytt.se

Date: 1 November 2026. Based on the live site (homepage, 5 service and contact pages, all 43 area pages, sitemap and JSON-LD) and two web searches for outside listings.

## Local SEO score: 47/100

| Dimension | Weight | Score | Main reason |
|---|---|---|---|
| Google Business Profile signals | 25 | 11 | Profile is linked, but no opening hours, no rating and no photos from the profile are shown on the site |
| Reviews and reputation | 20 | 8 | Good review process, but no rating or review count anywhere on the site or in the schema |
| Local on-page SEO | 20 | 12 | Strong service pages and titles, but 43 area pages that are about 78 % the same |
| NAP consistency and citations | 15 | 6 | Site and schema agree, but Eniro shows a different address; few listings found |
| Local schema | 10 | 7 | Good LocalBusiness/MovingCompany block, missing coordinates, opening hours and rating |
| Local links and authority | 10 | 3 | Trygg-Hansa and Bohag 2010 are mentioned; no local press, associations or "best of" lists found |

**Business type:** service area business with a registered address (Hasselgatan 58, Upplands Väsby). Customers do not visit the address.

**Industry:** home services (moving and cleaning). Schema type is `MovingCompany`, which fits the moving side. Schema.org has no cleaning subtype, so cleaning is covered by the `Service` blocks on each service page, which is the right approach.

## What already works

- Every service has its own page (flyttstädning, flyttfirma, hemstädning, storstädning, fönsterputs, kontorsstädning, packhjälp, pianoflytt, flytt + flyttstädning). This is the strongest local organic factor.
- Titles name the service and the city, for example "Flyttstädning i Stockholm med fast pris och besiktningsgaranti".
- Name, phone and address are in the footer on every page, the phone is a `tel:` link, and they match the schema exactly.
- The schema has the legal name, organisation number, email, logo, image, price range, payment methods, languages and a full `areaServed` list.
- Each area page has its own `Service` block with `areaServed` set to that town.
- Customers are asked for a Google review after every paid job, without any screening first. That is allowed and is the right way to do it.

## GBP checklist

| Signal | Status |
|---|---|
| Link to the Google profile (place ID) | Present in `sameAs` and `hasMap`. **Check that the link really opens your profile**: open it on your phone. |
| Opening hours on the site | Missing everywhere. Being open at search time is a top-5 map ranking factor, and Google compares the hours on the site with the profile. |
| Primary category | Cannot be seen from the site. Should be "Flyttfirma" (Moving company) with "Städfirma" (Cleaning service), "Flyttstädning" (Move-out cleaning service, if offered in your language), "Fönsterputsare" (Window cleaning service) and "Hemstädning" (House cleaning service) as extra categories. |
| Address shown on the profile | If Hasselgatan 58 is a home address where customers are not received, Google's rules say to hide it and set a service area instead. Keep the address on the website and in the schema either way. |
| Photos and posts | No sign on the site. Add real job photos (before/after, team, van) to the profile every month. |
| Google questions and answers | Being phased out by Google. Your FAQ sections on the site already cover this. |

## Reviews snapshot

- Rating and review count: **not shown anywhere on the site**, and there is no `aggregateRating` in the schema. The site says "Se våra omdömen på Google" without a number.
- Review requests: sent by email automatically after each paid job (once a year per customer), so new reviews should come in steadily.
- Owner replies: the site promises "Vi svarar öppet på alla omdömen". Keep doing this within a day or two.
- Other platforms: no profile found on Reco.se, Trustpilot or Hitta.se. Swedish customers check Reco.se a lot for moving and cleaning firms.

## NAP consistency

| Source | Name | Address | Phone |
|---|---|---|---|
| Website footer | TO Städ & Flytt | Hasselgatan 58, 194 37 Upplands Väsby | 072 222 88 00 |
| Schema (JSON-LD) | TO Städ & Flytt (legal: TO Städ och Flytt AB) | Hasselgatan 58, 194 37 Upplands Väsby | +46722228800 |
| Eniro (web search) | To Städ och Flytt AB | **Vårvägen 1C, Eskilstuna** | not visible |

**The Eniro address is different.** If the company used to be at Vårvägen 1C, update Eniro (and Hitta.se, Allabolag, Ratsit, which take their data from the same registers) to the current address. If Vårvägen 1C is still the registered address at Bolagsverket, decide which address is the real one and use it everywhere, including the Google profile.

## Citations

| Directory | Status |
|---|---|
| Google Business Profile | Linked from the site |
| Eniro | Found, wrong or old address |
| Hitta.se | Not found |
| Reco.se | Not found (strong for moving and cleaning in Sweden) |
| Bing Places | Unknown. Claim it: Bing feeds ChatGPT and Copilot |
| Apple Business Connect (Apple Maps) | Unknown. Claim it: iPhone users search in Apple Maps |
| Facebook / Instagram | Not linked in `sameAs` |
| Trade bodies | None linked. Sveriges Flyttfirmor or a Företagarna membership would help |

## Area pages (43 pages)

The site has a page per town under `/omraden/`. Each has about 600 words.

**Swap test result:** with the town name replaced by a placeholder, only about **22 % of the sentences on each page are unique** (lowest 13 % for Vingåker, highest 24 % for Stockholm). The rest is the same text on every page. The unique parts are good (named neighbourhoods such as Högsjö and Marmorbyn, a local tip, the town description), but there is too little of it.

Pages like this are what Google's spam rules call doorway pages. A cleaning company lost 80 % of its rankings in 2024 for the same pattern. This is the biggest risk on the site.

What to do, in order:

1. Pick the 8 to 12 towns where you actually get the most jobs (probably Upplands Väsby, Sollentuna, Stockholm, Solna, Sundbyberg, Täby, Järfälla, Sigtuna/Märsta, Uppsala, Eskilstuna).
2. Give each of those real local content: photos from jobs there, 2 or 3 reviews from customers in that town, the housing types (for example "mostly 1970s rental flats in Fyrklövern"), parking and lift tips, distance and typical price from the calculator, and the jobs done there this year.
3. For the remaining 30 or so towns, either write the same kind of content over time, or merge them into one page per region (Stockholms län, Uppsala län, Södermanland) and redirect the town URLs there.

## Schema: ready-to-use additions

Add to the existing `LocalBusiness`/`MovingCompany` block. Replace the coordinates with the exact pin from your Google profile (5 decimals), and the hours with your real hours.

```json
"geo": { "@type": "GeoCoordinates", "latitude": 59.51XXX, "longitude": 17.91XXX },
"openingHoursSpecification": [
  { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "opens": "07:00", "closes": "18:00" },
  { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Saturday"], "opens": "09:00", "closes": "15:00" }
],
"sameAs": [
  "https://www.google.com/maps/search/?api=1&query=TO%20St%C3%A4d%20%26%20Flytt&query_place_id=…",
  "https://www.facebook.com/…",
  "https://www.reco.se/…"
]
```

Only add `aggregateRating` if the rating is shown on the page itself and comes from reviews you collect on your own site. Google does not allow a self-written rating copied from Google reviews.

## Top 10 actions

| Priority | Action | Effort |
|---|---|---|
| Critical | Fix the Eniro address (and check Hitta.se, Allabolag, Ratsit) so every listing says the same as the site | 1 hour |
| Critical | Rewrite or merge the 43 area pages: real local content for the top 10 towns, merge or build out the rest | Several days |
| High | Put opening hours on the contact page and footer, and in the schema, matching the Google profile exactly | 30 min |
| High | Check the Google profile: correct place ID link, primary category "Flyttfirma", extra cleaning categories, service area, hidden address if it is a home | 1 hour |
| High | Show the Google rating and number of reviews on the homepage, with a link to read them | 1 hour |
| High | Claim Bing Places and Apple Business Connect with the same name, address, phone and hours | 1 hour |
| Medium | Create a Reco.se profile and ask some customers to review there too | 1 hour + ongoing |
| Medium | Add `geo` coordinates and `openingHoursSpecification` to the schema | 30 min |
| Medium | Put the city in the H1 of the service pages too (for example "Flyttstädning i Stockholm med fotorapport och besiktningsgaranti") | 30 min |
| Low | Join a trade body (Sveriges Flyttfirmor, Företagarna) and aim for local mentions: Väsby local news, sponsoring a local club, "bästa flyttfirma i Stockholm" lists | Ongoing |

## What this analysis could not check

- Where you rank in the map pack across Stockholm (geo-grid). Tools: Local Falcon, BrightLocal, or DataForSEO.
- Your Google profile itself: categories, hours, photos, insights, actual review count and rating. Only you can see these, in Google Business Profile.
- Backlinks and domain authority. Tools: Ahrefs, Semrush, Moz.
- A full citation audit. Eniro.se could not be opened from here, and only two searches were run. Tools: BrightLocal Citation Tracker, or a manual check of Hitta.se, Eniro, Reco, Allabolag and Ratsit.
- Whether the place ID in `sameAs` opens the right profile.

For how visible the company is in ChatGPT, Perplexity and Google's AI answers, run `/seo geo https://tostadflytt.se`.

Sources: [Eniro listing found in search](https://www.eniro.se/hj%c3%a4lp+med+flytt/företag/11), [Reco.se moving firms in Upplands Väsby](https://www.reco.se/kategori/flyttfirma/upplands-v%C3%A4sby/1)
