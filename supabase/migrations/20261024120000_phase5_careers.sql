-- Fas 5: lediga jobb och ansökningar. Publicerade annonser är öppna för alla att läsa.
-- Ansökningar kommer in via edge function apply och syns bara för administratörer.
-- CV:n ligger i en privat lagring. Nekade ansökningar tas bort efter 24 månader
-- (edge function housekeeping).

create table public.vacancies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 3 and 120),
  location text not null default 'Stockholm' check (char_length(location) <= 120),
  employment text not null default 'timanstallning' check (employment in ('heltid', 'deltid', 'timanstallning', 'visstid')),
  intro text check (char_length(intro) <= 500),
  description text not null default '' check (char_length(description) <= 8000),
  requirements text check (char_length(requirements) <= 4000),
  salary text check (char_length(salary) <= 200),
  start_text text check (char_length(start_text) <= 200),
  status text not null default 'utkast' check (status in ('utkast', 'publicerad', 'stangd')),
  published_at timestamptz,
  valid_through date,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vacancies_created_by_idx on public.vacancies (created_by);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid references public.vacancies (id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 40),
  letter text not null check (char_length(letter) <= 6000),
  experience text check (char_length(experience) <= 2000),
  licence boolean,
  start_date text check (char_length(start_date) <= 100),
  cv_path text check (char_length(cv_path) <= 300),
  cv_name text check (char_length(cv_name) <= 200),
  status text not null default 'ny' check (status in ('ny', 'intervju', 'anstalld', 'nej')),
  note text check (char_length(note) <= 4000),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index applications_vacancy_idx on public.applications (vacancy_id);
create index applications_status_idx on public.applications (status, created_at desc);
create index applications_decided_by_idx on public.applications (decided_by);

create function public.vacancies_touch() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status = 'publicerad' and (tg_op = 'INSERT' or old.status is distinct from 'publicerad') then
    new.published_at := now();
  end if;
  return new;
end;
$$;
create trigger vacancies_touch before insert or update on public.vacancies
  for each row execute function public.vacancies_touch();

-- När status ändras sparas vem och när (behövs för att ta bort nekade efter 24 månader).
create function public.applications_status() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.decided_at := case when new.status = 'ny' then null else now() end;
    new.decided_by := case when new.status = 'ny' then null else (select auth.uid()) end;
  end if;
  return new;
end;
$$;
create trigger applications_status before update on public.applications
  for each row execute function public.applications_status();

create trigger vacancies_log after insert or update or delete on public.vacancies
  for each row execute function public.log_change();
create trigger applications_log after update or delete on public.applications
  for each row execute function public.log_change();

alter table public.vacancies enable row level security;
alter table public.applications enable row level security;
revoke all on public.applications from anon;
revoke insert, update, delete on public.vacancies from anon;
revoke execute on function public.vacancies_touch(), public.applications_status() from public, anon, authenticated;

create policy "Alla ser publicerade annonser" on public.vacancies
  for select to anon, authenticated
  using (status = 'publicerad' and (valid_through is null or valid_through >= (now() at time zone 'Europe/Stockholm')::date));
create policy "Administratör hanterar annonser" on public.vacancies
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Administratör hanterar ansökningar" on public.applications
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cv', 'cv', false, 10485760, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'text/plain'
]);

create policy "Administratör läser CV" on storage.objects
  for select to authenticated using (bucket_id = 'cv' and (select private.is_admin()));
create policy "Administratör tar bort CV" on storage.objects
  for delete to authenticated using (bucket_id = 'cv' and (select private.is_admin()));
