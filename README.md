# tostadflytt.se

Ny webbplats för **TO Städ & Flytt** – flytt och städ i Stockholms län.
Byggd med [Astro](https://astro.build) som statisk HTML: snabb, lätt för Google att läsa och billig att drifta.

## Kom igång

```bash
npm install
npm run dev       # utvecklingsserver på http://localhost:4321
npm test          # testar prislogiken (kalkylatorn)
npm run build     # bygger till dist/
node scripts/check-site.mjs   # kontrollerar titlar, beskrivningar, h1, länkar och strukturerad data
```

Kräver Node 22.12 eller senare.

## Innan lansering – BEKRÄFTA

Webbplatsen lovar saker som kunderna efterfrågar mest. Allt samlas i två filer – ändra där så uppdateras alla sidor.

**`src/config/site.js`**

| Värde | Nu | Vad det betyder |
|---|---|---|
| `whatsappHref` | 072-222 88 00 | Numret måste ha WhatsApp |
| `address` | Hasselgatan 58, Upplands Väsby | Visas i sidfot och strukturerad data |
| `responseTime` | inom 24 timmar | Utlovad svarstid |
| `inspectionGuaranteeDays` | 14 | Besiktningsgaranti efter flyttstädning |
| `inspectionFixHours` | 48 | Hur snabbt anmärkningar åtgärdas |
| `damageResponseHours` | 48 | Svar på skadeanmälan |
| `lateCancelHours` | 48 | Fri avbokning / vi bjuder på första timmen om vi ställer in |
| `packageDiscount` | 10 % | Rabatt på flyttstädning i paket med flytt |
| `recurringDiscount` | 10 % | Rabatt på regelbunden hemstädning |
| `invoiceDays` | 10 | Betalningsvillkor |
| `reviews.recoUrl`, `googleReviewUrl` | tomma | Lägg in länkarna när profilerna finns |
| `social` | tomma | Ikonerna visas när länkarna fylls i |

**`src/lib/pricing.js`** – alla priser och tidsantaganden för det fasta flyttpriset.

- Privatpriser är vad kunden betalar **efter RUT, inkl. moms** (flytt 595/695/945 kr/h vardag, 795/895/1 145 helg, flyttstädning 45 kr/kvm, fönster 64/99 kr).
- Hemstädning 125 kr/h och storstädning 160 kr/h efter RUT (= 250 och 320 kr/h före RUT, som på nuvarande sida).
- `HOME_SIZES` styr hur många arbetstimmar en flytt antas ta per bostadsstorlek. Justera efter er erfarenhet – det fasta priset bygger på dem.

Kör `npm test` efter ändringar – testerna visar direkt om något räknas fel.

Låt också någon gå igenom `src/pages/villkor.astro` och `src/pages/integritetspolicy.astro`.

## Sidor

| Adress | Innehåll |
|---|---|
| `/` | Startsida med berättelse, kalkylator, SMS-demo, klickbart kök, fotorapport, garantier |
| `/flyttstadning`, `/flyttfirma`, `/flytt-och-flyttstadning`, `/hemstadning`, `/storstadning`, `/fonsterputs`, `/kontorsstadning`, `/packhjalp`, `/pianoflytt` | Tjänstesidor (data i `src/data/services.js`) |
| `/priser` | Kalkylator och full prislista |
| `/boka` | Bokning i fyra steg (Netlify Forms) |
| `/garantier`, `/skadeanmalan` | Garantier och skadeanmälan med bilder |
| `/flyttchecklista` | Interaktiv checklista med datum och kalenderfil |
| `/rut-avdrag` | Guide och RUT-räknare |
| `/omraden`, `/omraden/<ort>` | Områdessidor (data i `src/data/areas.js`) |
| `/en` | Engelsk sida |
| `/om-oss`, `/kontakt`, `/villkor`, `/integritetspolicy`, `/bildkallor` | Övrigt |

## Publicera (Netlify)

1. Koppla repot till Netlify – `netlify.toml` innehåller byggkommando, cache och omdirigeringar.
2. Lägg till `tostadflytt.se` och `www.tostadflytt.se` som domäner. **www pekar i dag på en gammal webbplats som visar "Site not found"** – det försvinner när www pekar hit.
3. Formulären (bokning, kontakt, skadeanmälan) fungerar direkt via Netlify Forms. Slå på e-postnotiser under *Forms → Notifications*.
4. Gamla adresser (`/kalkylator`, `/copy-of-hem`) omdirigeras med 301 så att Google-rankingen följer med.
5. Lägg in `https://tostadflytt.se/sitemap-index.xml` i Google Search Console.

## SEO

- Varje sida är färdig HTML med egen `<title>`, beskrivning, canonical och Open Graph-bild.
- Strukturerad data: `LocalBusiness`/`MovingCompany`, `Service` med pris, `FAQPage`, `BreadcrumbList`, `HowTo`.
- Adresser utan å/ä/ö (`/flyttstadning`, `/fonsterputs`) och sitemap byggs automatiskt.
- Typsnittet Inter ligger på egen server (ingen Google Fonts-koppling) och bilderna levereras som AVIF/WebP i rätt storlek.

## Bilder

Alla foton är fria att använda (främst CC0 via Openverse). Fotograf och licens för varje bild står på `/bildkallor` och i `src/data/image-credits.json`.
Byt gärna ut mot egna bilder på personal och bilar när ni har dem – riktiga bilder bygger mest förtroende.
