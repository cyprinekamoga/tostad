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
3. **Bankgiro number** for invoices, and ask your bank to turn on OCR.
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
- Deleting enquiries that never became jobs after 12 months (privacy policy promise). Done by hand in the inbox until the scheduled cleanup is built.
- Password reset by email needs the Resend setup; until then an admin creates a new login link under Personal.

