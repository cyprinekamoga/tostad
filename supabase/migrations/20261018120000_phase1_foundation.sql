-- Fas 1: personal, kunder, inkorg och ändringslogg.
-- Allt är stängt som standard (row level security). Administratörer måste ha loggat in
-- med tvåstegsverifiering (aal2) för att se kunddata. Webbformulären skriver via edge
-- functionen submit-form, aldrig direkt från webbläsaren.

create type public.staff_role as enum ('owner', 'admin', 'employee');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.staff_role not null default 'employee',
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text not null check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 40),
  color text not null default '#1f8a4c' check (color ~ '^#[0-9a-fA-F]{6}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sant bara för aktiv ägare eller administratör som loggat in med tvåstegsverifiering.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
     and exists (
       select 1 from public.profiles p
       where p.id = (select auth.uid()) and p.active and p.role in ('owner', 'admin')
     );
$$;

-- Högst tre administratörer (ägaren inräknad), en ägare, och ägarkontot kan inte
-- ändras eller tas bort inifrån appen. Edge functions (service role) har auth.uid() null.
create function public.guard_profiles() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  admins int;
begin
  if tg_op in ('INSERT', 'UPDATE') and new.role in ('owner', 'admin') and new.active then
    select count(*) into admins from public.profiles
      where role in ('owner', 'admin') and active and id <> new.id;
    if admins >= 3 then
      raise exception 'Högst tre administratörer';
    end if;
  end if;
  if tg_op = 'INSERT' and new.role = 'owner' and exists (select 1 from public.profiles where role = 'owner') then
    raise exception 'Det finns redan en ägare';
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null then
    if old.role = 'owner' and (new.role <> 'owner' or not new.active) then
      raise exception 'Ägarkontot kan inte ändras här';
    end if;
    if new.role = 'owner' and old.role <> 'owner' then
      raise exception 'Det kan bara finnas en ägare';
    end if;
  end if;
  if tg_op = 'DELETE' and old.role = 'owner' and auth.uid() is not null then
    raise exception 'Ägarkontot kan inte tas bort';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return coalesce(new, old);
end;
$$;

create trigger profiles_guard
  before insert or update or delete on public.profiles
  for each row execute function public.guard_profiles();

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'private' check (kind in ('private', 'company')),
  name text not null check (char_length(name) between 1 and 200),
  email text check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 40),
  street text check (char_length(street) <= 200),
  postal_code text check (char_length(postal_code) <= 10),
  city text check (char_length(city) <= 100),
  org_nr text check (char_length(org_nr) <= 20),
  notes text check (char_length(notes) <= 5000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_name_idx on public.customers (lower(name));

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('bokning', 'kontakt', 'skadeanmalan')),
  status text not null default 'ny' check (status in ('ny', 'hanterad', 'arkiverad')),
  name text check (char_length(name) <= 200),
  email text check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 40),
  data jsonb not null default '{}'::jsonb,
  files text[] not null default '{}',
  note text check (char_length(note) <= 5000),
  customer_id uuid references public.customers (id) on delete set null,
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index submissions_status_idx on public.submissions (status, created_at desc);
create index submissions_customer_idx on public.submissions (customer_id);
create index submissions_handled_by_idx on public.submissions (handled_by);
create index customers_created_by_idx on public.customers (created_by);

-- Vem som hanterade ett ärende och när fylls i automatiskt.
create function public.submission_status() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'ny' then
      new.handled_by := null;
      new.handled_at := null;
    else
      new.handled_by := coalesce(old.handled_by, (select auth.uid()));
      new.handled_at := coalesce(old.handled_at, now());
    end if;
  end if;
  return new;
end;
$$;

create trigger submissions_status
  before update on public.submissions
  for each row execute function public.submission_status();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger customers_touch
  before update on public.customers
  for each row execute function public.touch_updated_at();

-- Ändringslogg: vem, vad och vilka fält, utan att kopiera personuppgifterna.
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  changed text[]
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

create function public.log_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  cols text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into cols
      from jsonb_each(to_jsonb(new)) n
      where n.value is distinct from (to_jsonb(old) -> n.key) and n.key <> 'updated_at';
    if cols is null then
      return new;
    end if;
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, changed)
  values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    (case when tg_op = 'DELETE' then old.id else new.id end)::text,
    cols
  );
  return coalesce(new, old);
end;
$$;

create trigger profiles_log after insert or update or delete on public.profiles
  for each row execute function public.log_change();
create trigger customers_log after insert or update or delete on public.customers
  for each row execute function public.log_change();
create trigger submissions_log after update or delete on public.submissions
  for each row execute function public.log_change();

-- Används bara av edge functions (service role).
create table public.form_rate (
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index form_rate_idx on public.form_rate (ip_hash, created_at);

create table public.bootstrap_tokens (
  token_hash text primary key,
  created_at timestamptz not null default now()
);

-- Behörigheter
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.submissions enable row level security;
alter table public.audit_log enable row level security;
alter table public.form_rate enable row level security;
alter table public.bootstrap_tokens enable row level security;

revoke all on public.profiles, public.customers, public.submissions, public.audit_log,
  public.form_rate, public.bootstrap_tokens from anon;
revoke all on public.form_rate, public.bootstrap_tokens from authenticated;
revoke insert, update, delete on public.audit_log from authenticated;
revoke execute on function public.guard_profiles(), public.log_change(),
  public.submission_status(), public.touch_updated_at() from public, anon, authenticated;

create policy "Egen profil eller administratör" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "Administratör ändrar profiler" on public.profiles
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Administratör hanterar kunder" on public.customers
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Administratör läser inkorgen" on public.submissions
  for select to authenticated using ((select public.is_admin()));
create policy "Administratör uppdaterar inkorgen" on public.submissions
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Administratör tar bort ur inkorgen" on public.submissions
  for delete to authenticated using ((select public.is_admin()));

create policy "Administratör läser loggen" on public.audit_log
  for select to authenticated using ((select public.is_admin()));

-- Bilagor från skadeanmälningar: privat lagring, bara administratörer kan läsa.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inbox', 'inbox', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);

create policy "Administratör läser bilagor" on storage.objects
  for select to authenticated
  using (bucket_id = 'inbox' and (select public.is_admin()));
create policy "Administratör tar bort bilagor" on storage.objects
  for delete to authenticated
  using (bucket_id = 'inbox' and (select public.is_admin()));
