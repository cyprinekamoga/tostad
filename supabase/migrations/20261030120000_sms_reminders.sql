-- SMS kvällen före (46elks): inställningar, logg och ett schemalagt anrop varje timme.
-- Funktionen sms skickar bara när klockan i Sverige har passerat sändtiden, och loggen
-- gör att samma påminnelse aldrig skickas två gånger.

alter table public.company_settings
  add column sms_enabled boolean not null default false,
  add column sms_hour int not null default 18 check (sms_hour between 8 and 21),
  add column sms_company_customers boolean not null default false,
  add column sms_sender text not null default 'TOStadFlytt' check (sms_sender ~ '^[A-Za-z0-9]{3,11}$'),
  add column sms_customer_text text not null default 'Hej {namn}! Påminnelse: {tjanst} imorgon {datum} kl {tid}, {adress}. {team} kommer. Frågor? Ring {telefon} /TO Städ & Flytt'
    check (char_length(sms_customer_text) <= 600),
  add column sms_staff_text text not null default 'Hi {namn}! Your jobs tomorrow, {datum}:
{jobb}
Details in the app: tostadflytt.se/app'
    check (char_length(sms_staff_text) <= 600);

create table public.sms_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('kvall_kund', 'kvall_personal', 'test')),
  ref_date date not null,
  job_id uuid references public.jobs (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  profile_id uuid references public.profiles (id) on delete set null,
  phone text not null check (char_length(phone) <= 20),
  body text not null check (char_length(body) <= 1600),
  status text not null check (status in ('skickat', 'fel')),
  provider_id text,
  parts int,
  error text check (char_length(error) <= 500),
  created_at timestamptz not null default now()
);
-- En påminnelse per jobb och kund, och ett SMS per person och dag till personalen.
create unique index sms_log_once_idx on public.sms_log (kind, ref_date, phone, coalesce(job_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'skickat' and kind <> 'test';
create index sms_log_created_idx on public.sms_log (created_at desc);
create index sms_log_job_idx on public.sms_log (job_id);
create index sms_log_customer_idx on public.sms_log (customer_id);
create index sms_log_profile_idx on public.sms_log (profile_id);

alter table public.sms_log enable row level security;
revoke all on public.sms_log from anon;
create policy "Administratör läser SMS-loggen" on public.sms_log
  for select to authenticated using ((select private.is_admin()));

-- Nyckel för det schemalagda anropet. Ligger i Vault och kontrolleras av funktionen.
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'sms_cron_token', 'Nyckel för det schemalagda SMS-anropet');

create function public.check_cron_token(p_token text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'sms_cron_token' and decrypted_secret = p_token);
$$;
revoke execute on function public.check_cron_token(text) from public, anon, authenticated;
grant execute on function public.check_cron_token(text) to service_role;

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Varje timme: funktionen avgör själv om det är dags (svensk tid, sommar och vinter).
select cron.schedule(
  'sms-kvallen-fore',
  '2 * * * *',
  $$
  select net.http_post(
    url := 'https://jrvmqilzegerihdjswzc.supabase.co/functions/v1/sms',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sms_cron_token')),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
