-- Fas 4: offerter och fakturor. Löpnummer utan luckor, OCR, RUT med krypterade personnummer,
-- och skickade fakturor som aldrig kan ändras eller tas bort (rättas med kreditfaktura).

-- Företagsuppgifter på fakturor och offerter. En enda rad.
create table public.company_settings (
  id int primary key default 1 check (id = 1),
  bankgiro text check (bankgiro ~ '^\d{3,4}-\d{4}$'),
  vat_nr text not null default 'SE559470339801' check (char_length(vat_nr) <= 20),
  payment_days int not null default 10 check (payment_days between 0 and 60),
  quote_days int not null default 30 check (quote_days between 1 and 180),
  invoice_note text check (char_length(invoice_note) <= 1000),
  late_interest text not null default 'Vid försenad betalning debiteras dröjsmålsränta enligt räntelagen.' check (char_length(late_interest) <= 500),
  email text not null default 'info@tostadflytt.se' check (char_length(email) <= 254),
  phone text not null default '072 222 88 00' check (char_length(phone) <= 40),
  updated_at timestamptz not null default now()
);
insert into public.company_settings (id) values (1);

-- Löpnummer. Nästa nummer är value + 1.
create table public.counters (
  name text primary key,
  value bigint not null
);
insert into public.counters (name, value) values ('faktura', 1000), ('offert', 1000);

create function private.next_number(p_name text) returns bigint
language sql security definer set search_path = ''
as $$
  update public.counters set value = value + 1 where name = p_name returning value;
$$;

create function private.luhn(p_digits text) returns int
language plpgsql immutable set search_path = ''
as $$
declare
  total int := 0;
  d int;
  dbl boolean := true;
begin
  for i in reverse char_length(p_digits)..1 loop
    d := substr(p_digits, i, 1)::int;
    if dbl then
      d := d * 2;
      if d > 9 then d := d - 9; end if;
    end if;
    total := total + d;
    dbl := not dbl;
  end loop;
  return (10 - total % 10) % 10;
end;
$$;

-- OCR: fakturanummer, längdsiffra och kontrollsiffra.
create function private.ocr(p_number bigint) returns text
language sql immutable set search_path = ''
as $$
  select b || l || private.luhn(b || l)::text
  from (select p_number::text as b, ((char_length(p_number::text) + 2) % 10)::text as l) x;
$$;

-- Summor på en offert eller faktura. Samma uträkning som src/lib/money.js.
create function private.doc_totals(p_lines jsonb, p_persons int) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  l jsonb;
  net numeric := 0;
  vat numeric := 0;
  labour numeric := 0;
  ln numeric;
  lv numeric;
  total numeric;
  rut numeric := 0;
  before numeric;
  topay numeric;
  persons int := greatest(0, least(2, coalesce(p_persons, 0)));
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 100 then
    raise exception 'Ogiltiga rader';
  end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(l) <> 'object' or char_length(coalesce(l ->> 'text', '')) > 300
       or char_length(coalesce(l ->> 'unit', '')) > 20
       or (l ->> 'qty')::numeric not between -100000 and 100000
       or (l ->> 'price')::numeric not between -10000000 and 10000000
       or coalesce((l ->> 'vat')::numeric, 25) not in (0, 6, 12, 25) then
      raise exception 'Ogiltiga rader';
    end if;
    ln := round((l ->> 'qty')::numeric * (l ->> 'price')::numeric, 2);
    lv := round(ln * coalesce((l ->> 'vat')::numeric, 25) / 100, 2);
    net := net + ln;
    vat := vat + lv;
    if coalesce((l ->> 'rut')::boolean, false) then
      labour := labour + ln + lv;
    end if;
  end loop;
  total := net + vat;
  if persons > 0 then
    rut := sign(labour) * least(floor(abs(labour) * 0.5), 75000 * persons);
  end if;
  before := total - rut;
  topay := round(before);
  return jsonb_build_object('net', net, 'vat', vat, 'total', total, 'labour', labour, 'rut', rut, 'rounding', topay - before, 'to_pay', topay);
end;
$$;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  number bigint unique,
  customer_id uuid references public.customers (id) on delete set null,
  submission_id uuid references public.submissions (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  status text not null default 'utkast' check (status in ('utkast', 'skickad', 'oppnad', 'accepterad', 'avbojd')),
  service text not null default 'annat' check (service in
    ('flytt', 'flyttstadning', 'paket', 'hemstadning', 'storstadning', 'fonsterputs', 'kontor', 'pianoflytt', 'annat')),
  buyer jsonb not null default '{}'::jsonb check (jsonb_typeof(buyer) = 'object'),
  street text check (char_length(street) <= 200),
  postal_code text check (char_length(postal_code) <= 10),
  city text check (char_length(city) <= 100),
  wanted_date date,
  lines jsonb not null default '[]'::jsonb,
  rut_persons int not null default 1 check (rut_persons between 0 and 2),
  net numeric(14, 2) not null default 0,
  vat numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  rut numeric(14, 2) not null default 0,
  rounding numeric(6, 2) not null default 0,
  to_pay numeric(14, 2) not null default 0,
  message text check (char_length(message) <= 3000),
  valid_until date,
  token uuid not null default gen_random_uuid() unique,
  sent_at timestamptz,
  opened_at timestamptz,
  decided_at timestamptz,
  decided_name text check (char_length(decided_name) <= 200),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quotes_customer_idx on public.quotes (customer_id);
create index quotes_submission_idx on public.quotes (submission_id);
create index quotes_job_idx on public.quotes (job_id);
create index quotes_created_by_idx on public.quotes (created_by);
create index quotes_status_idx on public.quotes (status, created_at desc);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number bigint unique,
  kind text not null default 'faktura' check (kind in ('faktura', 'kredit')),
  credit_of uuid references public.invoices (id) on delete restrict,
  customer_id uuid references public.customers (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  status text not null default 'utkast' check (status in ('utkast', 'skickad', 'betald', 'krediterad')),
  issue_date date,
  due_date date,
  delivery_date date,
  ocr text,
  buyer jsonb not null default '{}'::jsonb check (jsonb_typeof(buyer) = 'object'),
  your_ref text check (char_length(your_ref) <= 100),
  lines jsonb not null default '[]'::jsonb,
  rut_persons int not null default 0 check (rut_persons between 0 and 2),
  net numeric(14, 2) not null default 0,
  vat numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  rut numeric(14, 2) not null default 0,
  rounding numeric(6, 2) not null default 0,
  to_pay numeric(14, 2) not null default 0,
  message text check (char_length(message) <= 3000),
  token uuid not null default gen_random_uuid() unique,
  sent_at timestamptz,
  paid_at date,
  paid_amount numeric(14, 2),
  reminder_count int not null default 0,
  last_reminder_at timestamptz,
  rut_status text not null default 'ej_aktuell' check (rut_status in ('ej_aktuell', 'ej_ansokt', 'ansokt', 'utbetald', 'nekad')),
  internal_note text check (char_length(internal_note) <= 3000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoices_status_idx on public.invoices (status, due_date);
create index invoices_customer_idx on public.invoices (customer_id);
create index invoices_job_idx on public.invoices (job_id);
create index invoices_quote_idx on public.invoices (quote_id);
create index invoices_credit_of_idx on public.invoices (credit_of);
create index invoices_created_by_idx on public.invoices (created_by);

-- Köpare som delar på RUT-avdraget. Personnumret är krypterat med en nyckel i Supabase Vault.
create table public.rut_people (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 200),
  pnr_enc bytea not null,
  pnr_last4 text not null check (pnr_last4 ~ '^\d{4}$'),
  created_at timestamptz not null default now()
);
create index rut_people_invoice_idx on public.rut_people (invoice_id);

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'rut_pnr_key', 'Krypterar personnummer för RUT-avdrag');

create function private.pnr_key() returns text
language sql stable security definer set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'rut_pnr_key' limit 1;
$$;
revoke execute on function private.pnr_key() from public, anon, authenticated;

-- Räknar om summorna när ett utkast sparas.
create function public.docs_compute() returns trigger
language plpgsql set search_path = ''
as $$
declare
  t jsonb;
begin
  if tg_table_name = 'invoices' and tg_op = 'UPDATE' and old.status <> 'utkast' then
    return new;
  end if;
  if tg_table_name = 'quotes' and tg_op = 'UPDATE' and old.status = 'accepterad' then
    return new;
  end if;
  t := private.doc_totals(new.lines, new.rut_persons);
  new.net := (t ->> 'net')::numeric;
  new.vat := (t ->> 'vat')::numeric;
  new.total := (t ->> 'total')::numeric;
  new.rut := (t ->> 'rut')::numeric;
  new.rounding := (t ->> 'rounding')::numeric;
  new.to_pay := (t ->> 'to_pay')::numeric;
  new.updated_at := now();
  return new;
end;
$$;

create function public.quotes_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.number := private.next_number('offert');
    return new;
  end if;
  new.number := old.number;
  new.token := old.token;
  if old.status = 'accepterad' and (new.lines is distinct from old.lines or new.rut_persons is distinct from old.rut_persons) then
    raise exception 'En accepterad offert kan inte ändras';
  end if;
  return new;
end;
$$;

-- Skickade fakturor kan bara få betalning, påminnelser, RUT-status och interna anteckningar.
create function public.invoices_guard() returns trigger
language plpgsql set search_path = ''
as $$
declare
  free text[] := array['status', 'paid_at', 'paid_amount', 'reminder_count', 'last_reminder_at', 'rut_status', 'internal_note', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'utkast' or old.number is not null then
      raise exception 'En skickad faktura kan inte tas bort. Gör en kreditfaktura.';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(current_setting('app.finalizing', true), '') <> 'on' then
      new.status := 'utkast';
      new.number := null;
      new.ocr := null;
      new.kind := 'faktura';
      new.credit_of := null;
    end if;
    return new;
  end if;
  if coalesce(current_setting('app.finalizing', true), '') = 'on' then
    return new;
  end if;
  new.token := old.token;
  if old.status = 'utkast' then
    if new.status <> 'utkast' or new.number is not null or new.ocr is not null then
      raise exception 'Använd Skicka för att ge fakturan nummer';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'En skickad faktura kan inte ändras. Gör en kreditfaktura.';
  end if;
  if new.status = 'utkast' or (old.status = 'krediterad' and new.status <> 'krediterad') or (new.status = 'krediterad' and old.status <> 'krediterad') then
    raise exception 'Ogiltig status';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create function public.rut_people_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('app.finalizing', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if exists (select 1 from public.invoices where id = coalesce(new.invoice_id, old.invoice_id) and status <> 'utkast') then
    raise exception 'Fakturan är skickad och kan inte ändras';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger quotes_guard before insert or update on public.quotes for each row execute function public.quotes_guard();
create trigger quotes_compute before insert or update on public.quotes for each row execute function public.docs_compute();
create trigger invoices_guard before insert or update or delete on public.invoices for each row execute function public.invoices_guard();
create trigger invoices_compute before insert or update on public.invoices for each row execute function public.docs_compute();
create trigger rut_people_guard before insert or update or delete on public.rut_people for each row execute function public.rut_people_guard();
create trigger quotes_log after insert or update or delete on public.quotes for each row execute function public.log_change();
create trigger invoices_log after insert or update or delete on public.invoices for each row execute function public.log_change();
create trigger company_settings_touch before update on public.company_settings for each row execute function public.touch_updated_at();

-- Sparar köparna för RUT-avdraget på ett utkast. p_people: [{name, pnr}] med 12 siffror.
create function public.set_rut_people(p_invoice uuid, p_people jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  p jsonb;
  pnr text;
begin
  if not private.is_admin() then
    raise exception 'Bara administratörer';
  end if;
  if not exists (select 1 from public.invoices where id = p_invoice and status = 'utkast') then
    raise exception 'Fakturan är skickad och kan inte ändras';
  end if;
  if jsonb_typeof(p_people) <> 'array' or jsonb_array_length(p_people) > 2 then
    raise exception 'Högst två personer';
  end if;
  delete from public.rut_people where invoice_id = p_invoice;
  for p in select * from jsonb_array_elements(p_people) loop
    pnr := regexp_replace(coalesce(p ->> 'pnr', ''), '\D', '', 'g');
    if pnr !~ '^(19|20)\d{10}$' or private.luhn(substr(pnr, 3, 9)) <> substr(pnr, 12, 1)::int then
      raise exception 'Personnumret % är inte giltigt', coalesce(p ->> 'name', '');
    end if;
    if char_length(trim(coalesce(p ->> 'name', ''))) = 0 then
      raise exception 'Namn saknas';
    end if;
    insert into public.rut_people (invoice_id, name, pnr_enc, pnr_last4)
    values (p_invoice, left(trim(p ->> 'name'), 200), extensions.pgp_sym_encrypt(pnr, private.pnr_key()), right(pnr, 4));
  end loop;
end;
$$;

-- Visar ett personnummer i klartext. Varje visning loggas.
create function public.reveal_pnr(p_id uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  result text;
begin
  if not private.is_admin() then
    raise exception 'Bara administratörer';
  end if;
  select extensions.pgp_sym_decrypt(pnr_enc, private.pnr_key()) into result from public.rut_people where id = p_id;
  insert into public.audit_log (actor, action, entity, entity_id) values ((select auth.uid()), 'visa_personnummer', 'rut_people', p_id::text);
  return result;
end;
$$;

-- Ger fakturan nummer, OCR, datum och låser den.
create function private.finalize(p_id uuid) returns public.invoices
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.invoices;
  s public.company_settings;
  n bigint;
  today date := (now() at time zone 'Europe/Stockholm')::date;
begin
  select * into s from public.company_settings where id = 1;
  if s.bankgiro is null then
    raise exception 'Lägg in bankgironumret under Inställningar först';
  end if;
  select * into inv from public.invoices where id = p_id for update;
  if inv.id is null or inv.status <> 'utkast' then
    raise exception 'Fakturan är redan skickad';
  end if;
  if char_length(coalesce(inv.buyer ->> 'name', '')) = 0 then
    raise exception 'Köparens namn saknas';
  end if;
  if jsonb_array_length(inv.lines) = 0 then
    raise exception 'Fakturan saknar rader';
  end if;
  if inv.delivery_date is null then
    raise exception 'Ange när tjänsten utfördes';
  end if;
  if inv.rut <> 0 and (select count(*) from public.rut_people where invoice_id = p_id) <> inv.rut_persons then
    raise exception 'Fyll i namn och personnummer för RUT-avdraget';
  end if;
  perform set_config('app.finalizing', 'on', true);
  n := private.next_number('faktura');
  update public.invoices
     set number = n,
         ocr = private.ocr(n),
         status = 'skickad',
         issue_date = coalesce(issue_date, today),
         due_date = coalesce(due_date, coalesce(issue_date, today) + s.payment_days),
         sent_at = now(),
         rut_status = case when inv.rut <> 0 then 'ej_ansokt' else 'ej_aktuell' end,
         updated_at = now()
   where id = p_id
  returning * into inv;
  perform set_config('app.finalizing', 'off', true);
  return inv;
end;
$$;

create function public.finalize_invoice(p_id uuid) returns public.invoices
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Bara administratörer';
  end if;
  return private.finalize(p_id);
end;
$$;

-- Kreditfaktura: samma rader med minus, hänvisar till originalet. Originalet blir krediterat.
create function public.credit_invoice(p_id uuid, p_reason text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  o public.invoices;
  new_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Bara administratörer';
  end if;
  select * into o from public.invoices where id = p_id for update;
  if o.id is null or o.kind <> 'faktura' or o.status not in ('skickad', 'betald') then
    raise exception 'Bara skickade fakturor kan krediteras';
  end if;
  perform set_config('app.finalizing', 'on', true);
  insert into public.invoices (kind, credit_of, customer_id, job_id, quote_id, status, buyer, your_ref, delivery_date, rut_persons, lines, message)
  values ('kredit', o.id, o.customer_id, o.job_id, o.quote_id, 'utkast', o.buyer, o.your_ref, o.delivery_date, o.rut_persons,
          (select coalesce(jsonb_agg(l || jsonb_build_object('qty', -((l ->> 'qty')::numeric))), '[]'::jsonb) from jsonb_array_elements(o.lines) l),
          left(concat_ws(' ', 'Kreditering av faktura ' || o.number || '.', nullif(trim(p_reason), '')), 3000))
  returning id into new_id;
  insert into public.rut_people (invoice_id, name, pnr_enc, pnr_last4)
  select new_id, name, pnr_enc, pnr_last4 from public.rut_people where invoice_id = o.id;
  update public.invoices set status = 'krediterad', updated_at = now() where id = o.id;
  perform set_config('app.finalizing', 'off', true);
  perform private.finalize(new_id);
  return new_id;
end;
$$;

-- Startnummer för fakturor, om företaget redan har fakturerat i ett annat system.
create function public.set_invoice_start(p_next bigint) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Bara administratörer';
  end if;
  if exists (select 1 from public.invoices where number is not null) then
    raise exception 'Startnumret kan inte ändras när fakturor har skickats';
  end if;
  if p_next < 1 or p_next > 999999999 then
    raise exception 'Ogiltigt nummer';
  end if;
  update public.counters set value = p_next - 1 where name = 'faktura';
end;
$$;

create function public.next_invoice_number() returns bigint
language sql stable security definer set search_path = ''
as $$
  select value + 1 from public.counters where name = 'faktura' and private.is_admin();
$$;

-- Behörigheter: bara administratörer.
alter table public.company_settings enable row level security;
alter table public.counters enable row level security;
alter table public.quotes enable row level security;
alter table public.invoices enable row level security;
alter table public.rut_people enable row level security;
revoke all on public.company_settings, public.counters, public.quotes, public.invoices, public.rut_people from anon;
revoke all on public.counters from authenticated;
revoke insert, update, delete on public.rut_people from authenticated;
revoke execute on function public.docs_compute(), public.quotes_guard(), public.invoices_guard(), public.rut_people_guard() from public, anon, authenticated;
revoke execute on function private.next_number(text), private.finalize(uuid) from public, anon, authenticated;
revoke execute on function public.set_rut_people(uuid, jsonb), public.reveal_pnr(uuid), public.finalize_invoice(uuid),
  public.credit_invoice(uuid, text), public.set_invoice_start(bigint), public.next_invoice_number() from public, anon;
grant execute on function public.set_rut_people(uuid, jsonb), public.reveal_pnr(uuid), public.finalize_invoice(uuid),
  public.credit_invoice(uuid, text), public.set_invoice_start(bigint), public.next_invoice_number() to authenticated;

create policy "Administratör hanterar inställningar" on public.company_settings
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Administratör hanterar offerter" on public.quotes
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Administratör hanterar fakturor" on public.invoices
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Administratör ser RUT-köpare" on public.rut_people
  for select to authenticated using ((select private.is_admin()));
