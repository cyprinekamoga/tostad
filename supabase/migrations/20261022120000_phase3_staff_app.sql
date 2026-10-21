-- Fas 3: personalens app. Checklista och status på jobben, foton, stämpling, ledighet,
-- passbyten och kalenderlänk. Personalen läser jobben via funktionen my_jobs, som bara
-- visar deras egna jobb och aldrig pris eller interna anteckningar.

alter table public.jobs
  add column checklist jsonb not null default '[]'::jsonb
    check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 60),
  add column on_way_at timestamptz,
  add column done_at timestamptz,
  add column done_by uuid references public.profiles (id) on delete set null;
create index jobs_done_by_idx on public.jobs (done_by);

-- Hemlig nyckel i kalenderlänken. Kan bytas om länken har spridits.
alter table public.profiles add column calendar_token uuid not null default gen_random_uuid() unique;

-- Behörighetshjälp
create function private.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active);
$$;

create function private.on_job(p_job uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.job_staff s join public.profiles p on p.id = s.profile_id
    where s.job_id = p_job and s.profile_id = (select auth.uid()) and p.active
  );
$$;

-- Sökvägen i fotolagringen börjar med jobbets id: <jobb>/<fil>.
create function private.on_job_path(p_name text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return private.on_job(split_part(p_name, '/', 1)::uuid);
exception when others then
  return false;
end;
$$;

revoke execute on function private.is_staff(), private.on_job(uuid), private.on_job_path(text) from public, anon;
grant execute on function private.is_staff(), private.on_job(uuid), private.on_job_path(text) to authenticated;

-- Foton från jobben
create table public.job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  path text not null unique check (char_length(path) <= 300),
  kind text not null default 'efter' check (kind in ('fore', 'efter', 'skada')),
  taken_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index job_photos_job_idx on public.job_photos (job_id);
create index job_photos_taken_by_idx on public.job_photos (taken_by);

-- Stämpling. Tiderna sätts av databasen, inte av telefonen.
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  start_lat double precision check (start_lat between -90 and 90),
  start_lng double precision check (start_lng between -180 and 180),
  end_lat double precision check (end_lat between -90 and 90),
  end_lng double precision check (end_lng between -180 and 180),
  note text check (char_length(note) <= 500),
  edited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint time_entries_order check (ended_at is null or ended_at > started_at)
);
create unique index time_entries_open_idx on public.time_entries (profile_id) where ended_at is null;
create index time_entries_profile_idx on public.time_entries (profile_id, started_at);
create index time_entries_job_idx on public.time_entries (job_id);
create index time_entries_edited_by_idx on public.time_entries (edited_by);

-- Ledighet, sjukdom och dagar då någon inte kan jobba.
create table public.absences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('ledighet', 'sjuk', 'kan_inte')),
  starts_on date not null,
  ends_on date not null,
  note text check (char_length(note) <= 500),
  status text not null default 'begard' check (status in ('begard', 'godkand', 'nekad')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint absences_dates check (ends_on >= starts_on and ends_on - starts_on <= 366)
);
create index absences_profile_idx on public.absences (profile_id, starts_on);
create index absences_decided_by_idx on public.absences (decided_by);

-- Personal kan bara skapa egna. Ledighet behöver godkännas; sjukdom och "kan inte" gäller direkt.
create function public.absences_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    new.profile_id := (select auth.uid());
    new.status := case when new.kind = 'ledighet' then 'begard' else 'godkand' end;
    new.decided_by := null;
    new.decided_at := null;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.decided_by := (select auth.uid());
    new.decided_at := now();
  end if;
  return new;
end;
$$;
create trigger absences_guard before insert or update on public.absences
  for each row execute function public.absences_guard();

-- Passbyten: någon erbjuder ett pass, en kollega tar det, en administratör godkänner.
create table public.swap_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  from_profile uuid not null references public.profiles (id) on delete cascade,
  to_profile uuid references public.profiles (id) on delete set null,
  note text check (char_length(note) <= 500),
  status text not null default 'oppen' check (status in ('oppen', 'vantar', 'godkand', 'nekad', 'aterkallad')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index swap_requests_active_idx on public.swap_requests (job_id, from_profile) where status in ('oppen', 'vantar');
create index swap_requests_from_idx on public.swap_requests (from_profile);
create index swap_requests_to_idx on public.swap_requests (to_profile);
create index swap_requests_decided_by_idx on public.swap_requests (decided_by);

create trigger time_entries_log after insert or update or delete on public.time_entries
  for each row execute function public.log_change();
create trigger absences_log after insert or update or delete on public.absences
  for each row execute function public.log_change();
create trigger swap_requests_log after insert or update or delete on public.swap_requests
  for each row execute function public.log_change();

-- Behörigheter
alter table public.job_photos enable row level security;
alter table public.time_entries enable row level security;
alter table public.absences enable row level security;
alter table public.swap_requests enable row level security;
revoke all on public.job_photos, public.time_entries, public.absences, public.swap_requests from anon;
revoke execute on function public.absences_guard() from public, anon, authenticated;

create policy "Administratör hanterar foton" on public.job_photos
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Personal ser foton på sina jobb" on public.job_photos
  for select to authenticated using (private.on_job(job_id));
create policy "Personal lägger till foton på sina jobb" on public.job_photos
  for insert to authenticated
  with check (private.on_job(job_id) and taken_by = (select auth.uid()) and split_part(path, '/', 1) = job_id::text);
create policy "Personal tar bort egna nya foton" on public.job_photos
  for delete to authenticated using (taken_by = (select auth.uid()) and created_at > now() - interval '1 day');

create policy "Administratör hanterar tider" on public.time_entries
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Personal ser egna tider" on public.time_entries
  for select to authenticated using (profile_id = (select auth.uid()));

create policy "Administratör hanterar frånvaro" on public.absences
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Personal ser egen frånvaro" on public.absences
  for select to authenticated using (profile_id = (select auth.uid()));
create policy "Personal anmäler egen frånvaro" on public.absences
  for insert to authenticated with check (profile_id = (select auth.uid()) and (select private.is_staff()));
create policy "Personal tar bort egen frånvaro" on public.absences
  for delete to authenticated using (profile_id = (select auth.uid()) and (status = 'begard' or kind <> 'ledighet'));

create policy "Administratör hanterar passbyten" on public.swap_requests
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Personal ser egna passbyten" on public.swap_requests
  for select to authenticated using (from_profile = (select auth.uid()) or to_profile = (select auth.uid()));

-- Fotolagring: privat. Personal når bara mappen för jobb de är bokade på.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

create policy "Administratör läser jobbfoton" on storage.objects
  for select to authenticated using (bucket_id = 'job-photos' and (select private.is_admin()));
create policy "Administratör tar bort jobbfoton" on storage.objects
  for delete to authenticated using (bucket_id = 'job-photos' and (select private.is_admin()));
create policy "Personal läser foton på sina jobb" on storage.objects
  for select to authenticated using (bucket_id = 'job-photos' and private.on_job_path(name));
create policy "Personal laddar upp foton på sina jobb" on storage.objects
  for insert to authenticated with check (bucket_id = 'job-photos' and private.on_job_path(name));
create policy "Personal tar bort egna jobbfoton" on storage.objects
  for delete to authenticated using (bucket_id = 'job-photos' and owner_id = (select auth.uid())::text and private.on_job_path(name));

-- Personalens jobb som JSON. Adress visas från en vecka före jobbet till dagen efter, kundens
-- telefon från två dagar före. Pris och interna anteckningar visas aldrig.
create function public.my_jobs(p_from date, p_to date, p_job uuid default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  result jsonb;
begin
  if not private.is_staff() then
    raise exception 'Logga in';
  end if;
  if p_job is null and (p_to < p_from or p_to - p_from > 62) then
    raise exception 'För lång period';
  end if;
  select coalesce(jsonb_agg(x order by x.starts_at), '[]'::jsonb) into result
  from (
    select
      j.id, j.service, j.title, j.status, j.starts_at, j.ends_at, j.city, j.to_city, j.lat, j.lng,
      j.staff_note, j.checklist, j.on_way_at, j.done_at, j.series_id,
      case when now() between j.starts_at - interval '7 days' and j.ends_at + interval '1 day' then j.street end as street,
      case when now() between j.starts_at - interval '7 days' and j.ends_at + interval '1 day' then j.postal_code end as postal_code,
      case when now() between j.starts_at - interval '7 days' and j.ends_at + interval '1 day' then j.to_street end as to_street,
      case when now() between j.starts_at - interval '7 days' and j.ends_at + interval '1 day' then j.to_postal_code end as to_postal_code,
      c.name as customer_name,
      case when now() between j.starts_at - interval '2 days' and j.ends_at + interval '1 day' then c.phone end as customer_phone,
      (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'color', p.color, 'phone', p.phone) order by p.full_name)
         from public.job_staff s2 join public.profiles p on p.id = s2.profile_id where s2.job_id = j.id) as team,
      (select jsonb_build_object('id', r.id, 'status', r.status) from public.swap_requests r
         where r.job_id = j.id and r.from_profile = me and r.status in ('oppen', 'vantar') limit 1) as my_swap
    from public.jobs j
    join public.job_staff s on s.job_id = j.id and s.profile_id = me
    left join public.customers c on c.id = j.customer_id
    where (p_job is not null and j.id = p_job)
       or (p_job is null
           and j.starts_at >= (p_from::timestamp at time zone 'Europe/Stockholm')
           and j.starts_at < ((p_to + 1)::timestamp at time zone 'Europe/Stockholm'))
  ) x;
  return result;
end;
$$;

-- Ändringar personalen får göra på sina jobb.
create function public.staff_job(p_job uuid, p_action text, p_checklist jsonb default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  item jsonb;
begin
  if not private.on_job(p_job) then
    raise exception 'Du är inte bokad på jobbet';
  end if;
  if p_action = 'on_way' then
    update public.jobs set on_way_at = now() where id = p_job;
  elsif p_action = 'done' then
    update public.jobs set status = 'klar', done_at = now(), done_by = (select auth.uid()) where id = p_job and status <> 'avbokad';
  elsif p_action = 'undone' then
    update public.jobs set status = 'planerad', done_at = null, done_by = null where id = p_job and status = 'klar';
  elsif p_action = 'checklist' then
    if p_checklist is null or jsonb_typeof(p_checklist) <> 'array' or jsonb_array_length(p_checklist) > 60 then
      raise exception 'Ogiltig checklista';
    end if;
    for item in select * from jsonb_array_elements(p_checklist) loop
      if jsonb_typeof(item) <> 'object' or jsonb_typeof(item -> 'label') <> 'string'
         or char_length(item ->> 'label') > 200 or jsonb_typeof(coalesce(item -> 'done', 'false'::jsonb)) <> 'boolean' then
        raise exception 'Ogiltig checklista';
      end if;
    end loop;
    update public.jobs set checklist = (
      select coalesce(jsonb_agg(jsonb_build_object('label', e ->> 'label', 'done', coalesce((e ->> 'done')::boolean, false))), '[]'::jsonb)
      from jsonb_array_elements(p_checklist) e
    ) where id = p_job;
  else
    raise exception 'Okänd åtgärd';
  end if;
end;
$$;

create function public.clock_in(p_job uuid default null, p_lat double precision default null, p_lng double precision default null)
returns public.time_entries
language plpgsql security definer set search_path = ''
as $$
declare
  entry public.time_entries;
begin
  if not private.is_staff() then
    raise exception 'Logga in';
  end if;
  if p_job is not null and not private.on_job(p_job) then
    raise exception 'Du är inte bokad på jobbet';
  end if;
  insert into public.time_entries (profile_id, job_id, started_at, start_lat, start_lng)
  values ((select auth.uid()), p_job, now(), p_lat, p_lng)
  returning * into entry;
  return entry;
exception when unique_violation then
  raise exception 'Du är redan instämplad';
end;
$$;

create function public.clock_out(p_lat double precision default null, p_lng double precision default null, p_note text default null)
returns public.time_entries
language plpgsql security definer set search_path = ''
as $$
declare
  entry public.time_entries;
begin
  update public.time_entries
     set ended_at = greatest(now(), started_at + interval '1 second'), end_lat = p_lat, end_lng = p_lng,
         note = coalesce(left(nullif(trim(p_note), ''), 500), note)
   where profile_id = (select auth.uid()) and ended_at is null
  returning * into entry;
  if entry.id is null then
    raise exception 'Du är inte instämplad';
  end if;
  return entry;
end;
$$;

create function public.new_calendar_token() returns uuid
language sql security definer set search_path = ''
as $$
  update public.profiles set calendar_token = gen_random_uuid() where id = (select auth.uid()) returning calendar_token;
$$;

-- Passbyten
create function public.offer_swap(p_job uuid, p_note text default null) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.on_job(p_job) then
    raise exception 'Du är inte bokad på jobbet';
  end if;
  if not exists (select 1 from public.jobs where id = p_job and starts_at > now() and status = 'planerad') then
    raise exception 'Passet har redan börjat';
  end if;
  insert into public.swap_requests (job_id, from_profile, note) values (p_job, (select auth.uid()), left(nullif(trim(p_note), ''), 500));
exception when unique_violation then
  raise exception 'Passet är redan erbjudet';
end;
$$;

create function public.open_swaps() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'job_id', j.id, 'service', j.service, 'starts_at', j.starts_at, 'ends_at', j.ends_at,
      'city', j.city, 'from_name', p.full_name, 'note', r.note) order by j.starts_at), '[]'::jsonb)
  from public.swap_requests r
  join public.jobs j on j.id = r.job_id
  join public.profiles p on p.id = r.from_profile
  where private.is_staff()
    and r.status = 'oppen'
    and r.from_profile <> (select auth.uid())
    and j.starts_at > now()
    and not exists (select 1 from public.job_staff s where s.job_id = j.id and s.profile_id = (select auth.uid()));
$$;

create function public.take_swap(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'Logga in';
  end if;
  update public.swap_requests r set status = 'vantar', to_profile = (select auth.uid())
   where r.id = p_id and r.status = 'oppen' and r.from_profile <> (select auth.uid())
     and exists (select 1 from public.jobs j where j.id = r.job_id and j.starts_at > now());
  if not found then
    raise exception 'Passet går inte att ta längre';
  end if;
end;
$$;

create function public.cancel_swap(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.swap_requests set status = 'aterkallad'
   where id = p_id and from_profile = (select auth.uid()) and status in ('oppen', 'vantar');
  if found then
    return;
  end if;
  update public.swap_requests set status = 'oppen', to_profile = null
   where id = p_id and to_profile = (select auth.uid()) and status = 'vantar';
  if not found then
    raise exception 'Hittar inte passbytet';
  end if;
end;
$$;

create function public.decide_swap(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r public.swap_requests;
begin
  if not private.is_admin() then
    raise exception 'Bara administratörer';
  end if;
  select * into r from public.swap_requests where id = p_id and status = 'vantar' for update;
  if r.id is null then
    raise exception 'Passbytet väntar inte på beslut';
  end if;
  if p_approve then
    delete from public.job_staff where job_id = r.job_id and profile_id = r.from_profile;
    insert into public.job_staff (job_id, profile_id) values (r.job_id, r.to_profile) on conflict do nothing;
  end if;
  update public.swap_requests
     set status = case when p_approve then 'godkand' else 'nekad' end, decided_by = (select auth.uid()), decided_at = now()
   where id = p_id;
end;
$$;

revoke execute on function public.my_jobs(date, date, uuid), public.staff_job(uuid, text, jsonb),
  public.clock_in(uuid, double precision, double precision), public.clock_out(double precision, double precision, text),
  public.new_calendar_token(), public.offer_swap(uuid, text), public.open_swaps(), public.take_swap(uuid),
  public.cancel_swap(uuid), public.decide_swap(uuid, boolean) from public, anon;
grant execute on function public.my_jobs(date, date, uuid), public.staff_job(uuid, text, jsonb),
  public.clock_in(uuid, double precision, double precision), public.clock_out(double precision, double precision, text),
  public.new_calendar_token(), public.offer_swap(uuid, text), public.open_swaps(), public.take_swap(uuid),
  public.cancel_swap(uuid), public.decide_swap(uuid, boolean) to authenticated;
