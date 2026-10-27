-- SMS skickas bara för hand: inga påminnelser kvällen före, inget "på väg" från appen och ingen bokningsknapp.
-- Administratören skriver numret, väljer en mall och skickar. Mallarna går att ändra.
update public.company_settings set sms_enabled = false, sms_onway_enabled = false where id = 1;
select cron.unschedule('sms-kvallen-fore') where exists (select 1 from cron.job where jobname = 'sms-kvallen-fore');

alter table public.sms_log drop constraint sms_log_kind_check;
alter table public.sms_log add constraint sms_log_kind_check check (kind in ('kvall_kund', 'kvall_personal', 'pa_vag', 'bokning', 'manuell', 'test'));

create table public.sms_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  body text not null check (char_length(body) between 1 and 600),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.sms_templates enable row level security;
revoke all on public.sms_templates from anon;
create policy "Administratör hanterar SMS-mallar" on public.sms_templates
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

insert into public.sms_templates (name, body, sort) values
  ('Bokningsbekräftelse', 'Hej! Tack för din bokning hos TO Städ & Flytt. Vi kommer [dag] kl [tid] till [adress]. Frågor? Ring 072 222 88 00', 1),
  ('Påminnelse imorgon', 'Hej! Påminnelse: vi kommer imorgon kl [tid] till [adress]. Frågor? Ring 072 222 88 00 /TO Städ & Flytt', 2),
  ('Vi är på väg', 'Hej! Vi från TO Städ & Flytt är på väg och är framme om ca [minuter] min. Frågor? Ring 072 222 88 00', 3),
  ('Vi blir försenade', 'Hej! Vi från TO Städ & Flytt blir tyvärr ca [minuter] min försenade. Förlåt för det, vi kommer så snart vi kan.', 4),
  ('Ring oss', 'Hej! Vi har försökt nå dig angående din bokning hos TO Städ & Flytt. Ring oss gärna på 072 222 88 00.', 5),
  ('Betalningspåminnelse', 'Hej! Vi har inte fått betalt för faktura [nummer]. Fakturan finns i mejlet från oss. Frågor? Ring 072 222 88 00 /TO Städ & Flytt', 6);
