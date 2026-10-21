-- Fas 2: jobb i planeringen, vem som jobbar på dem och återkommande jobb.
-- Bara administratörer ser och ändrar jobben. Personalens egen åtkomst kommer i fas 3.

-- En serie är ett återkommande jobb, till exempel hemstädning varannan vecka.
-- Varje tillfälle är ett eget jobb som kan flyttas eller ändras för sig.
create table public.job_series (
  id uuid primary key default gen_random_uuid(),
  interval_weeks int not null check (interval_weeks between 1 and 8),
  until date not null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index job_series_created_by_idx on public.job_series (created_by);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete set null,
  submission_id uuid unique references public.submissions (id) on delete set null,
  series_id uuid references public.job_series (id) on delete set null,
  service text not null check (service in
    ('flytt', 'flyttstadning', 'paket', 'hemstadning', 'storstadning', 'fonsterputs', 'kontor', 'pianoflytt', 'annat')),
  title text check (char_length(title) <= 200),
  status text not null default 'planerad' check (status in ('planerad', 'klar', 'avbokad')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  street text check (char_length(street) <= 200),
  postal_code text check (char_length(postal_code) <= 10),
  city text check (char_length(city) <= 100),
  to_street text check (char_length(to_street) <= 200),
  to_postal_code text check (char_length(to_postal_code) <= 10),
  to_city text check (char_length(to_city) <= 100),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  price integer check (price between 0 and 10000000),
  staff_note text check (char_length(staff_note) <= 5000),
  internal_note text check (char_length(internal_note) <= 5000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_time_check check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours')
);
create index jobs_starts_at_idx on public.jobs (starts_at);
create index jobs_customer_idx on public.jobs (customer_id);
create index jobs_series_idx on public.jobs (series_id, starts_at);
create index jobs_created_by_idx on public.jobs (created_by);

create table public.job_staff (
  job_id uuid not null references public.jobs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (job_id, profile_id)
);
create index job_staff_profile_idx on public.job_staff (profile_id);

create trigger jobs_touch
  before update on public.jobs
  for each row execute function public.touch_updated_at();
create trigger jobs_log after insert or update or delete on public.jobs
  for each row execute function public.log_change();

alter table public.job_series enable row level security;
alter table public.jobs enable row level security;
alter table public.job_staff enable row level security;

revoke all on public.job_series, public.jobs, public.job_staff from anon;

create policy "Administratör hanterar serier" on public.job_series
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Administratör hanterar jobb" on public.jobs
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Administratör hanterar bemanning" on public.job_staff
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
