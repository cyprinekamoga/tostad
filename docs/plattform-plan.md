# TO Städ & Flytt platform plan

Planner, employee app, quotes and invoices, careers page and customer portal, built into tostadflytt.se.
Status: approved. **Phase 1 is live** (see section 10). Phases 2 to 6 are next.

## 1. What you approved

**Core**
- Admin dashboard with a calendar planner: who works when, on which job.
- Employee dashboard (phone app): my jobs, times, tasks.
- Invoicing like faktura.nu.
- Careers page: open vacancies, personal letter and CV upload, applications in the admin dashboard.
- You plus 1 or 2 more admins.

**Extras**
- Planning: web bookings become jobs, availability / leave / shift swaps, clock in and out with hours report, map and route of the day.
- Customers: automatic SMS (evening before and "on our way"), photo report from the phone, Google review request, customer portal.
- Money: quotes the customer accepts online, OCR numbers on invoices, payment reminders and a money overview.
- Accounting: your accountant handles the books, so the system makes an export for them.

## 2. How it fits together

| Part | Choice | Why |
|---|---|---|
| Public website | Same Astro site on Netlify | Marketing pages stay static and fast. |
| App pages | `/admin`, `/app` (staff), `/kund` (customers), `/jobb` (careers) on the same domain | One site, one login system, no app store. |
| Database, login, files | Supabase, new project in **Stockholm (eu-north-1)** | Postgres with row level security, built in login, private file storage, daily backups on Pro. Data stays in Sweden. |
| Server logic | Netlify Functions (Astro server routes) | Sending SMS and email, making PDFs, invoice numbering. |
| Timed jobs | Netlify Scheduled Functions | Evening SMS, payment reminders, review requests, deleting old applications. |
| SMS | 46elks (Swedish SMS API) | Sender name "TOStadFlytt", pay per SMS, no monthly fee. |
| Email | Resend | Free up to 3 000 emails per month. Needs SPF and DKIM records at one.com because your DMARC policy is `p=reject`; without them customers' mail servers would reject our emails. |
| Maps | OpenStreetMap with Leaflet, routes open in Google Maps | Free. Addresses are turned into map points once and saved. |
| Staff app | Installable web app (PWA) | Works on iPhone and Android from the home screen. Notifications by SMS or email, push where the phone supports it. |

## 3. Who sees what

| Role | How they log in | Can see and do |
|---|---|---|
| Owner and admins (max 3) | Email and password | Everything: planner, customers, quotes, invoices, applications, settings. Only admins see personal identity numbers and CVs. |
| Employees | Login link or code by SMS or email, stays logged in on the phone | Only their own jobs, shifts, hours and requests. Customer address and phone only for jobs they are on, and only around the job date. |
| Customers | Login link by email | Only their own bookings, quotes, invoices and photo reports. |
| Applicants | No login | Send an application. |

Every change to invoices, quotes and payments is written to a log (who, what, when).

## 4. Screens

### Admin (`/admin`)
- **Overview:** today's jobs, staff on duty, new bookings, unpaid invoices, warnings.
- **Planner:** week view with one row per employee (like Planday), day view with hours, month view. Drag a job onto a person or a time. Recurring jobs (for example weekly home cleaning). Warnings for double bookings, leave, and the rest rules (11 hours per day, 36 hours per week).
- **Map:** the day's jobs on a map, each team's route with Google Maps links.
- **Inbox:** bookings, quote requests, contact messages and damage reports from the website. One click turns a booking into a job, with the price from the calculator.
- **Jobs:** list and detail: customer, addresses, service, fixed price, team, checklist, photos, hours, status.
- **Staff:** profiles, invite by email or phone, availability, leave requests, swap requests, hours report per month.
- **Customers:** private and company customers, history, notes.
- **Quotes:** build from the calculator or by hand, send link, see when it is opened and accepted.
- **Invoices:** create from a finished job, RUT split, OCR number, PDF, email, status (draft, sent, paid, overdue, credited), reminders, credit notes.
- **Money:** revenue per month, unpaid and overdue, RUT still to be paid by Skatteverket, export for the accountant.
- **Careers:** vacancies (create, publish, close) and applications (status, notes, CV download).
- **Settings:** company details, Bankgiro, invoice text, SMS texts, admins.

### Employee app (`/app`)
- **Today and upcoming:** my jobs with time, address, map link, team mates, customer notes.
- **Job page:** checklist to tick off, take photos (sent to the customer's photo report), mark done.
- **Clock in and out** on the job, with location saved only at that moment.
- **My hours** per week and month.
- **Availability and leave:** mark when I can work, apply for leave, offer a shift for swap.
- **Calendar sync:** my shifts in the phone's own calendar.

### Customer portal (`/kund`)
- My bookings, quotes (accept with one click), invoices (PDF), photo reports.

### Careers (`/jobb`)
- List of open vacancies and one page per vacancy, marked up so it shows in Google's job search.
- Application form: name, contact details, personal letter, CV upload (PDF or Word, max 10 MB).
- Confirmation email to the applicant.

## 5. Automatic flows

1. **Booking to job:** a customer books on the website, the booking lands in the inbox, you turn it into a job and place it in the planner. The customer gets a confirmation.
2. **Evening before (18:00):** SMS to the customer with team names and start time. SMS to staff with tomorrow's jobs.
3. **On the day:** staff press "On our way", the customer gets an SMS.
4. **Job done:** staff tick the checklist and take photos. The customer gets the photo report by email the same evening.
5. **Invoice:** made from the job with RUT already split, OCR number, PDF by email, due in 10 days.
6. **Paid:** you mark it paid (later possible: import the bank's payment file). The customer then gets the Google review link.
7. **Overdue:** reminder email after the due date, and a second one later. Shown in the money overview.
8. **Quote:** you send a quote link, the customer accepts, it becomes a job in the inbox.
9. **Application:** applicant applies, you see it in Careers, you set a status. Rejected applications are deleted automatically after 24 months.

## 6. Rules built in

- **Invoices (mervärdesskattelagen):** unique serial numbers without gaps, issue date, both parties' names and addresses, what was done and when, amount per VAT rate, VAT, "Godkänd för F-skatt", org.nr and VAT number. A sent invoice can never be edited or deleted; it is corrected with a credit note that refers to it.
- **RUT:** labour cost, RUT amount and the buyer's personal identity number are stored per invoice. The number is encrypted and masked on screen. The accountant export includes what is needed for the RUT claim.
- **OCR:** each invoice gets an OCR number made from the invoice number, a length digit and a check digit (modulus 10), the format Bankgirot uses. Ask your bank to turn on OCR for your Bankgiro so payments are matched to the right invoice.
- **Archive:** invoice PDFs and data are kept for 7 years (bokföringslagen).
- **Working time:** warnings when a schedule breaks 11 hours of daily rest or 36 hours of weekly rest.
- **Applicants (GDPR):** only admins see CVs, links to files expire after a few minutes, rejected applications are deleted after 24 months.
- **Privacy policy:** updated to cover staff, applicants and customer portal. Login cookies are strictly necessary, so no cookie banner is needed.

## 7. Phases

Each phase goes live and is tested before the next one starts.

| Phase | What you get |
|---|---|
| 1. Foundation | Supabase project in Stockholm, login for admins and staff, staff and customer registers, inbox where website bookings, contact messages and damage reports arrive. |
| 2. Planner | Calendar (week, day, month), drag and drop, recurring jobs, conflict and rest rule warnings, map and route of the day. |
| 3. Employee app | My jobs, checklist, photos, done button, clock in and out, hours, availability, leave, swaps, calendar sync. |
| 4. Quotes and invoices | Quotes accepted online, invoices from jobs, numbering, OCR, RUT, PDF, email, credit notes, reminders, money overview, export for the accountant, hours report for payroll. |
| 5. Careers | `/jobb` with vacancies, Google job search markup, applications with letter and CV, applications in the dashboard, automatic deletion. |
| 6. Customer automation and portal | Automatic SMS, photo report email, Google review request, customer portal. |

## 8. Running costs (estimate)

| Item | Cost |
|---|---|
| Supabase Pro (recommended once real customer data is in it: backups, no pausing) | about 25 USD per month |
| SMS via 46elks | about 0.5 kr per SMS, 2 to 3 SMS per job |
| Email via Resend | free up to 3 000 per month |
| Netlify | current plan is enough to start |
| Maps | free |

For comparison: Planday alone is about 3 to 7 EUR per user per month, before invoicing and booking tools.

## 9. What I need from you

1. **Supabase:** OK to create a new project "tostadflytt" in Stockholm. The free plan allows 2 active projects and you already have 2, so either pause or delete the unused US project, or upgrade to Pro.
2. **Staff:** how many employees, and the names and emails of the 1 or 2 extra admins.
3. **Bankgiro number** for invoices, and ask your bank to turn on OCR. Enter it under Inställningar.
4. **SMS:** an account at 46elks (I'll guide you), and OK on the cost.
5. **Email:** an account at Resend, then I'll give you the DNS records to add at one.com.
6. **Reminder fee:** do you want to charge one? The law allows up to 60 kr, only if your terms say so before the job. Late interest is the reference rate plus 8 percentage points.
7. **Your accountant:** which export format they want (SIE file, Excel or PDFs).
8. **First vacancies** you want on the careers page.

## 10. Phase 1: what is live

- Supabase project `tostadflytt` (ref `jrvmqilzegerihdjswzc`) in Stockholm. Schema and rules in `supabase/migrations/`, server functions in `supabase/functions/`.
- `/logga-in`: email and password for everyone. Two step verification was removed at your request.
- `/admin`: overview, inbox (bookings, messages and damage reports from the website, with photos), customers, staff.
- `/app`: staff start page (schedule and jobs come in phase 3).
- Staff are added under Personal. The person gets a one time link (valid for 1 hour) to choose a password. Only the owner can add admins (max 3) and delete accounts.
- Website forms go to the inbox first and then to Netlify Forms as a backup copy.
- Tested end to end: activation, login, every admin page, staff invites, employee access limits, form submissions with photos.

**Still manual until later phases**
- (Done in phase 5: enquiries that never became jobs are deleted automatically after 12 months.)
- Password reset by email needs the Resend setup; until then an admin creates a new login link under Personal.


## 11. Phase 2: what is live

- `/admin/planering`: week view with one row per person and a row for jobs without staff, day view with a timeline from 06 to 22, month view. Drag a job to another person, day or time. On a phone, tap a job and change it in the form.
- Jobs have a customer, service, time, staff, address (and a destination address for moves), price, a note for staff and an internal note.
- Recurring jobs: every 1, 2, 3 or 4 weeks, up to one year ahead. Change or delete one visit, or this visit and all later ones.
- Warnings: double bookings, less than 11 hours of daily rest (a working day with short breaks may not span more than 13 hours), and less than 36 hours of rest in a week (Monday to Sunday). The job form also shows who is already busy at that time.
- Inbox: a booking becomes a job with one click. Service, date, start time, address, price and notes come from the booking, the customer is created or linked, and the booking is marked handled.
- `/admin/karta`: the day's jobs on an OpenStreetMap map, numbered per person in time order, with a Google Maps route from the office.
- Overview: today's jobs.
- Login is email and password only. Codes from an authenticator app registered earlier are removed at the next login.
- Tested end to end against the live database: 38 checks covering booking to job, drag and drop in week and day view, recurring changes, warnings, map, mobile and access rules.

**Comes in phase 3:** employees see their own jobs, leave and availability (shown in the planner), clock in and out.

## 12. Phase 3: what is live

**Employee app (`/app`), built for phones and installable on the home screen**
- Today: clock in and out, today's jobs with Navigate, Call customer and "On our way", and the coming week.
- Schedule: one week at a time with a day strip.
- Job page: address, team mates with call buttons, information from the office, checklist (a standard list per service unless the office writes its own), photos before, after and of damage, mark the job done.
- Hours: own clock entries per month with totals per week.
- Leave: apply for leave (needs approval), report sick or days you cannot work (apply directly), see and take shifts colleagues offer.
- Account: calendar link for the phone's calendar (iPhone, Google), instructions for the home screen, log out.

**Rules**
- Employees only reach their own jobs, through a database function. Prices and internal notes are never sent to them. The street address shows from a week before the job, the customer's phone from two days before, both until the day after.
- Clock times are set by the database, not the phone. Location is saved only at the moment of clocking, if the phone allows it.
- Only the office can change times, approve leave and approve shift swaps. Corrected times are marked for the employee.
- The calendar link has a secret key per person that the employee can replace. It shows no customer phone, price or internal notes.

**Admin**
- `/admin/ledighet`: approve or deny leave and swaps, upcoming absence, add absence for someone. Number of items waiting shows in the menu and on the overview.
- `/admin/tider`: hours per person and month, correct or add times, export to Excel (CSV) for payroll.
- Planner: absences show in the week view, and a job booked on an absence day gives a warning. The job form shows who is away, the checklist, and what staff did (on the way, done, photos).

Tested end to end against the live database with an admin and two employees on phones: 48 checks, including the access rules.

## 13. Phase 4: what is live

**Quotes (`/admin/offerter`)**
- New quote, or "Skapa offert" from a booking in the inbox (service, date, address and price are filled in).
- Lines with price including or excluding VAT, RUT per line, RUT for one or two people, live totals and a preview.
- Send: the quote gets a private link to copy, email or SMS. You see when the customer opened it.
- The customer reads the quote at `/dokument`, saves it as PDF, and accepts with their name or declines. An accepted quote becomes a booking in the inbox, ready to turn into a job.

**Invoices (`/admin/fakturor`)**
- From a job ("Skapa faktura" in the job form), from an accepted quote, or by hand.
- RUT: the buyer's name and personal identity number. The number is stored encrypted in the database, shown masked, never shown to customers or staff, and every time it is shown in full it is logged.
- Sending gives the invoice the next number without gaps, an OCR number (length and check digit, as Bankgirot checks), invoice date and due date (10 days by default). After that the invoice can never be changed or deleted; corrections are made with a credit note that refers to it.
- Mark as paid (date and amount), send a reminder (no fee), credit, and RUT status (not applied, applied, paid out, denied).
- Invoices show everything the VAT act requires: number, dates, both parties, what was done and when, amounts per VAT rate, VAT number and "Godkänd för F-skatt".

**Money (`/admin/ekonomi`)**: unpaid, overdue, paid this month, RUT waiting from Skatteverket, paid invoices to apply for RUT for (with the personal number on request), and month by month totals.

**Settings (`/admin/installningar`)**: bankgiro, VAT number, payment terms, quote validity, next invoice number (only before the first invoice), texts.

**Still manual until phase 6**: emails are sent from your own mail app or SMS with the prepared text. Automatic emails come with Resend.

**Tested**: the invoice rules were tested inside the live database in a transaction that was rolled back (nothing kept, no numbers used): sending, numbering, OCR, locks, encryption, credit notes. The screens were tested end to end in the browser on computer and phone.

## 14. Phase 5: what is live

**Public**
- `/jobb`: why work with us, open positions, and the application form (also for open applications when nothing is advertised). Linked from the footer.
- `/jobb/annons?a=...`: one page per ad with the full text, facts (employment, place, salary, start, last day) and the form. The page carries JobPosting data so Google can show it in job search.
- Application: name, email, phone, driving licence, start date, experience, personal letter and CV (PDF or Word, up to 10 MB). The server checks the file content, not just the name, and limits applications to 5 per hour per connection. Applicants see a thank you message.

**Admin (`/admin/rekrytering`)**
- Applications: new and interview, hired, no thanks. Letter, contact details, CV download through a link valid for one minute, status, notes, email, delete. "Lägg till som personal" opens the staff form with the person's details. A number in the menu shows new applications.
- Ads: write, publish, close. Published ads show on /jobb straight away. A blank line gives a new paragraph and lines starting with "-" become a list.

**Privacy**
- Only admins can read applications and CVs. CVs are in private storage in Stockholm.
- Clean up, as the privacy policy says: rejected applications and their CVs are deleted 24 months after the decision, and enquiries that never became jobs are deleted after 12 months (damage reports are kept). It runs automatically when an admin logs in.
- The privacy policy has a section for applicants.

Tested end to end on computer and phone: 26 checks, including access rules, file checks and the cleanup.

## 15. Customer portal: what is live

- `/kund`: "Mina sidor" for customers, built for phones. Shows quotes to answer, upcoming bookings (date, time, address, who is coming, "on our way" on the day), invoices to pay (bankgiro and OCR, PDF), earlier jobs with the photo report, book again, report damage, all invoices and quotes, the customer's details, and a message form that lands in the inbox linked to the customer.
- Login without email for now: each customer gets a personal secret link, created under Kunder (Mina sidor for the customer) and sent by SMS or email from your phone. The key is removed from the address bar and remembered on the device until "Logga ut". A new link makes the old one stop working; "Stäng av" turns the portal off for that customer. You see when the customer last opened it.
- The portal never shows job prices for staff, internal notes or other customers' data.
- When email is set up in phase 6, customers can also ask for a login link themselves.

Tested end to end with a customer on a phone: 20 checks, including old and guessed links.
