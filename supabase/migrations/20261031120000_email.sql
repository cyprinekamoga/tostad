-- Automatiska mejl via Resend: inställningar, logg och schemalagt anrop varje timme.
-- Inget skickas förrän mejl är påslaget, och automatiska utskick gäller bara det som händer
-- efter att mejl slogs på (email_enabled_at), så att gamla kunder inte får mejl i efterhand.

alter table public.company_settings
  add column email_enabled boolean not null default false,
  add column email_enabled_at timestamptz,
  add column email_from text not null default 'info@tostadflytt.se' check (email_from ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(email_from) <= 254),
  add column email_booking_confirm boolean not null default true,
  add column email_photo_report boolean not null default true,
  add column email_review boolean not null default true,
  add column google_review_url text check (google_review_url ~ '^https://' and char_length(google_review_url) <= 500),
  add column email_reminders boolean not null default true,
  add column reminder_days int not null default 7 check (reminder_days between 3 and 30),
  add column email_applicant boolean not null default true;

-- Tidpunkten då mejl slogs på sätts av databasen.
create function private.email_enabled_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.email_enabled and (tg_op = 'INSERT' or not old.email_enabled) then
    new.email_enabled_at := now();
  end if;
  return new;
end;
$$;
create trigger company_settings_email_enabled before insert or update of email_enabled on public.company_settings
  for each row execute function private.email_enabled_at();

-- Kundportalen kan stängas av för en kund. Då skapar självbetjäningen ingen ny länk.
alter table public.customers add column portal_off boolean not null default false;

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('bokning', 'fotorapport', 'recension', 'paminnelse', 'offert', 'faktura', 'ansokan', 'portallank', 'losenord', 'test')),
  ref_id uuid,
  customer_id uuid references public.customers (id) on delete set null,
  to_email text not null check (char_length(to_email) <= 254),
  subject text not null check (char_length(subject) <= 300),
  status text not null check (status in ('skickat', 'fel')),
  provider_id text,
  error text check (char_length(error) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index email_log_ref_idx on public.email_log (kind, ref_id);
create index email_log_created_idx on public.email_log (created_at desc);
create index email_log_customer_idx on public.email_log (customer_id);
create index email_log_created_by_idx on public.email_log (created_by);

alter table public.email_log enable row level security;
revoke all on public.email_log from anon;
create policy "Administratör läser mejlloggen" on public.email_log
  for select to authenticated using ((select private.is_admin()));

select cron.schedule(
  'mejl-varje-timme',
  '7 * * * *',
  $$
  select net.http_post(
    url := 'https://jrvmqilzegerihdjswzc.supabase.co/functions/v1/email',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sms_cron_token')),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
