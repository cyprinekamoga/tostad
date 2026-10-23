# tostadflytt.se

Ny webbplats för **TO Städ & Flytt**, flytt och städ i Stockholms län.
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

## Bekräfta innan lansering

Webbplatsen lovar saker som kunderna efterfrågar mest. Allt samlas i två filer. Ändra där så uppdateras alla sidor.

**`src/config/site.js`**

| Värde | Nu | Vad det betyder |
|---|---|---|
| `whatsappHref` | 072 222 88 00 | Numret måste ha WhatsApp |
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

**`src/lib/pricing.js`** innehåller alla priser och tidsantaganden för det fasta flyttpriset.

- Privatpriser är vad kunden betalar **efter RUT, inkl. moms** (flytt 595/695/945 kr/h vardag, 795/895/1 145 helg, flyttstädning 45 kr/kvm, fönster 64/99 kr).
- Hemstädning 125 kr/h och storstädning 160 kr/h efter RUT (= 250 och 320 kr/h före RUT, som på nuvarande sida).
- `HOME_SIZES` styr hur många arbetstimmar en flytt antas ta per bostadsstorlek. Justera efter er erfarenhet, eftersom det fasta priset bygger på dem.

Kör `npm test` efter ändringar. Testerna visar direkt om något räknas fel.

Låt också någon gå igenom `src/pages/villkor.astro` och `src/pages/integritetspolicy.astro`.

## Sidor

| Adress | Innehåll |
|---|---|
| `/` | Startsida med berättelse, kalkylator, exempel på sms, klickbart kök, fotorapport och garantier |
| `/flyttstadning`, `/flyttfirma`, `/flytt-och-flyttstadning`, `/hemstadning`, `/storstadning`, `/fonsterputs`, `/kontorsstadning`, `/packhjalp`, `/pianoflytt` | Tjänstesidor (data i `src/data/services.js`) |
| `/priser` | Kalkylator och full prislista |
| `/boka` | Bokning i fyra steg (Netlify Forms) |
| `/garantier`, `/skadeanmalan` | Garantier och skadeanmälan med bilder |
| `/flyttchecklista` | Interaktiv checklista med datum och kalenderfil |
| `/rut-avdrag` | Guide och räknare för rutavdrag |
| `/omraden`, `/omraden/<ort>` | Områdessidor för alla kommuner i Stockholms, Uppsala och Södermanlands län (data och postnummer i `src/data/areas.js`) |
| `/en` | Engelsk sida |
| `/om-oss`, `/kontakt`, `/villkor`, `/integritetspolicy`, `/bildkallor` | Övrigt |

## Administration och personal

- **Logga in:** `https://tostadflytt.se/logga-in`. Alla loggar in med e-post och lösenord. Administratörer kommer till `/admin` och personal till `/app`.
- **Lägg till personal:** Administration, Personal, Lägg till person. Som standard väljer du lösenordet (ett förslag fylls i) och skickar inloggningen via SMS eller mejl. Lösenordet visas bara en gång. Vill personen välja själv, välj "Skicka en länk" (gäller i en timme).
- **Byta lösenord:** "Nytt lösenord" på raden under Personal sätter ett nytt direkt. "Inloggningslänk" ger en länk där personen väljer själv.
- **Menyn** till vänster döljs och visas med knappen uppe till vänster. På mobilen glider den in. I Planering finns Normal och Stor för större kalenderrutor. Båda valen sparas i webbläsaren.
- **Planering** (`/admin/planering`): vecka med en rad per person, dag med tidslinje och månad. Dra jobb mellan personer, dagar och klockslag. Återkommande jobb (varje, varannan, var tredje eller var fjärde vecka). Varningar för dubbelbokning, under 11 timmars dygnsvila och under 36 timmars veckovila. En bokning i inkorgen blir ett jobb med knappen *Skapa jobb*.
- **Karta** (`/admin/karta`): dagens jobb på kartan per person, i tidsordning, med en rutt i Google Maps som börjar på kontoret. Adresserna slås upp hos OpenStreetMap och sparas på jobbet.
- **Personalens app** (`/app`): byggd för mobilen och kan läggas på hemskärmen. Dagens jobb med adress, navigering och kundens telefon, jobbsida med checklista, foton före och efter, "Vi är på väg" och "Klart", tidrapport (man skriver själv sina timmar per jobb och väljer kollegorna man jobbade med; de får samma timmar om man inte ändrar för någon), mina timmar per månad, ledighet, sjukanmälan, dagar man inte kan jobba, passbyten och en kalenderlänk till telefonens kalender.
- **Ledighet** (`/admin/ledighet`): godkänn eller neka ledighet och passbyten, se kommande frånvaro och lägg in frånvaro åt någon. Frånvaron syns i planeringen.
- **Hours** (`/admin/tider`): rapporterade timmar per person och månad, vem som rapporterade, rätta timmar och exportera till Excel (CSV) för lönen. Rättade timmar kan personalen inte ändra.
- **Språk:** administrationen och personalappen är på engelska. Allt kunden ser (webbplatsen, Mina sidor, offerter, fakturor och texterna som skickas till kunden) är på svenska.
- **Offerter** (`/admin/offerter`) och **Fakturor** (`/admin/fakturor`): offerter som kunden accepterar via länk, fakturor med löpnummer, OCR, RUT (krypterade personnummer), kreditfakturor, betalningar och påminnelser. Kunden ser dokumentet på `/dokument?t=…` och kan spara det som PDF. Skickade fakturor kan aldrig ändras eller tas bort.
- **Ekonomi** (`/admin/ekonomi`) och **Inställningar** (`/admin/installningar`): obetalt, förfallet, RUT att ansöka om, bankgiro och betalningsvillkor.
- **Rekrytering** (`/admin/rekrytering`): annonser som visas på `/jobb` (med JobPosting för Googles jobbsök) och ansökningar med personligt brev och CV. Nekade ansökningar raderas efter 24 månader och förfrågningar som inte blev uppdrag efter 12 månader (edge function `housekeeping`, körs när en administratör loggar in).
- **Mina sidor för kunder** (`/kund`): kunden ser bokningar, fotorapporter, offerter och fakturor och kan skicka meddelanden. Kunden får en personlig länk som skapas under Kunder (edge function `portal`).
- **Inkorgen** (`/admin/inkorg`) samlar bokningar, kontaktmeddelanden och skadeanmälningar från webbplatsen. Netlify Forms får en reservkopia.
- Databasen ligger i Supabase (Stockholm). Tabeller och behörigheter finns i `supabase/migrations/`, serverfunktionerna i `supabase/functions/`.
- Planen för kommande faser finns i `docs/plattform-plan.md`.

## Publicera (Netlify)

1. Koppla repot till Netlify. `netlify.toml` innehåller byggkommando, cache och omdirigeringar.
2. Lägg till `tostadflytt.se` och `www.tostadflytt.se` som domäner. **www pekar i dag på en gammal webbplats som visar "Site not found"**. Det försvinner när www pekar hit.
3. Formulären (bokning, kontakt, skadeanmälan) fungerar direkt via Netlify Forms. Slå på mejlnotiser under *Forms → Notifications*.
4. Gamla adresser (`/kalkylator`, `/copy-of-hem`) omdirigeras med 301 så att rankingen i Google följer med.
5. Lägg in `https://tostadflytt.se/sitemap-index.xml` i Google Search Console.

## SEO

- Varje sida är färdig HTML med egen `<title>`, beskrivning, canonical och en egen bild för delning i sociala medier (Open Graph).
- Strukturerad data: `LocalBusiness`/`MovingCompany`, `Service` med pris, `FAQPage`, `BreadcrumbList`, `HowTo`.
- Adresser utan å/ä/ö (`/flyttstadning`, `/fonsterputs`) och sitemap byggs automatiskt.
- Typsnittet Inter ligger på egen server (ingen koppling till Google Fonts) och bilderna levereras som AVIF/WebP i rätt storlek.

## Bilder

Alla foton kommer från [Pexels](https://www.pexels.com) och används enligt Pexels License: fria för kommersiellt bruk utan krav på namngivning. Fotograf och länk för varje bild står ändå på `/bildkallor` och i `src/data/image-credits.json`.
Byt gärna ut dem mot egna bilder på personal och bilar när ni har dem. Riktiga bilder bygger mest förtroende.
