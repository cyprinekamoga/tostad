-- Tidrapport i stället för stämpling: personalen skriver själv hur många timmar de jobbade och
-- kan rapportera för kollegorna som var med, var och en med egna timmar.

-- Stämplingen (time_entries, clock_in, clock_out) används inte längre. Tabellen är tom och lämnas kvar
-- orörd; funktionerna stängs av.
revoke execute on function public.clock_in(uuid, double precision, double precision),
  public.clock_out(double precision, double precision, text) from public, anon, authenticated;

create table public.work_hours (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  work_date date not null,
  hours numeric(4, 2) not null check (hours > 0 and hours <= 16 and hours * 4 = floor(hours * 4)),
  note text check (char_length(note) <= 500),
  reported_by uuid references public.profiles (id) on delete set null,
  edited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index work_hours_profile_idx on public.work_hours (profile_id, work_date);
create index work_hours_job_idx on public.work_hours (job_id);
create index work_hours_reported_by_idx on public.work_hours (reported_by);
create index work_hours_edited_by_idx on public.work_hours (edited_by);
-- En rad per person och jobb, så att två som rapporterar samma jobb inte räknas dubbelt.
create unique index work_hours_job_once_idx on public.work_hours (profile_id, job_id) where job_id is not null;

create trigger work_hours_log after insert or update or delete on public.work_hours
  for each row execute function public.log_change();

alter table public.work_hours enable row level security;
revoke all on public.work_hours from anon;

create policy "Administratör hanterar timmar" on public.work_hours
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Personal ser egna och rapporterade timmar" on public.work_hours
  for select to authenticated using (profile_id = (select auth.uid()) or reported_by = (select auth.uid()));
create policy "Personal tar bort egna nya timmar" on public.work_hours
  for delete to authenticated using (
    (profile_id = (select auth.uid()) or reported_by = (select auth.uid()))
    and edited_by is null
    and work_date >= (now() at time zone 'Europe/Stockholm')::date - 31
  );

-- Aktiva kollegor att välja bland i tidrapporten.
create function public.colleagues()
returns table (id uuid, full_name text, color text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name, p.color from public.profiles p
   where p.active and private.is_staff()
   order by p.full_name;
$$;

-- Rapportera timmar för sig själv och kollegor. p_team: [{"id": uuid, "hours": 3.5}, ...]
create function public.report_hours(p_date date, p_hours numeric, p_job uuid default null, p_note text default null, p_team jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  local_today date := (now() at time zone 'Europe/Stockholm')::date;
  clean_note text := left(nullif(trim(p_note), ''), 500);
  member jsonb;
  other uuid;
  other_hours numeric;
  existing public.work_hours;
  saved int := 0;
  skipped text[] := '{}';
begin
  if not private.is_staff() then
    raise exception 'Please log in';
  end if;
  if p_date is null or p_date > local_today then
    raise exception 'You cannot report hours for a future date';
  end if;
  if p_date < local_today - 31 then
    raise exception 'Hours older than a month must be added by an admin';
  end if;
  if p_hours is null or p_hours <= 0 or p_hours > 16 or p_hours * 4 <> floor(p_hours * 4) then
    raise exception 'Hours must be between 0.25 and 16, in quarter hours';
  end if;
  if p_job is not null and not private.on_job(p_job) then
    raise exception 'You are not booked on this job';
  end if;
  if jsonb_typeof(coalesce(p_team, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_team, '[]'::jsonb)) > 12 then
    raise exception 'Too many colleagues';
  end if;

  -- Egna timmar. Finns en rad för jobbet redan (även om en kollega skrev den) ersätts den.
  if p_job is not null then
    select * into existing from public.work_hours where profile_id = me and job_id = p_job;
  end if;
  if existing.id is not null then
    if existing.edited_by is not null then
      raise exception 'An admin has already corrected your hours for this job. Ask them to change it';
    end if;
    update public.work_hours
       set hours = p_hours, work_date = p_date, note = clean_note, reported_by = me, updated_at = now()
     where id = existing.id;
  else
    insert into public.work_hours (profile_id, job_id, work_date, hours, note, reported_by)
    values (me, p_job, p_date, p_hours, clean_note, me);
  end if;

  for member in select * from jsonb_array_elements(coalesce(p_team, '[]'::jsonb)) loop
    other := (member ->> 'id')::uuid;
    other_hours := coalesce((member ->> 'hours')::numeric, p_hours);
    continue when other = me;
    if not exists (select 1 from public.profiles where id = other and active) then
      raise exception 'Unknown colleague';
    end if;
    if other_hours <= 0 or other_hours > 16 or other_hours * 4 <> floor(other_hours * 4) then
      raise exception 'Hours must be between 0.25 and 16, in quarter hours';
    end if;
    existing := null;
    if p_job is not null then
      select * into existing from public.work_hours where profile_id = other and job_id = p_job;
    end if;
    if existing.id is not null then
      -- Kollegan har redan rapporterat själv, eller en administratör har rättat: rör inte.
      if existing.reported_by is distinct from me or existing.edited_by is not null then
        skipped := skipped || (select full_name from public.profiles where id = other);
        continue;
      end if;
      update public.work_hours
         set hours = other_hours, work_date = p_date, note = clean_note, updated_at = now()
       where id = existing.id;
    else
      insert into public.work_hours (profile_id, job_id, work_date, hours, note, reported_by)
      values (other, p_job, p_date, other_hours, clean_note, me);
    end if;
    saved := saved + 1;
  end loop;

  return jsonb_build_object('colleagues', saved, 'skipped', to_jsonb(skipped));
exception when unique_violation then
  raise exception 'Someone reported the same job at the same time. Try again';
end;
$$;

-- Mina timmar med jobbets namn, vem som rapporterade och vilka kollegor som var med.
create function public.my_hours(p_from date, p_to date)
returns table (
  id uuid, work_date date, hours numeric, note text, job_id uuid, job_label text,
  reported_by uuid, reporter_name text, edited boolean, team jsonb
)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.work_date, e.hours, e.note, e.job_id,
         coalesce(c.name, j.title, j.service),
         e.reported_by, r.full_name, e.edited_by is not null,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'hours', o.hours) order by p.full_name)
             from public.work_hours o join public.profiles p on p.id = o.profile_id
            where e.job_id is not null and o.job_id = e.job_id and o.profile_id <> e.profile_id
         ), '[]'::jsonb)
    from public.work_hours e
    left join public.jobs j on j.id = e.job_id
    left join public.customers c on c.id = j.customer_id
    left join public.profiles r on r.id = e.reported_by
   where e.profile_id = (select auth.uid()) and e.work_date between p_from and p_to
   order by e.work_date desc, e.created_at desc;
$$;

revoke execute on function public.colleagues(), public.report_hours(date, numeric, uuid, text, jsonb), public.my_hours(date, date) from public, anon;
grant execute on function public.colleagues(), public.report_hours(date, numeric, uuid, text, jsonb), public.my_hours(date, date) to authenticated;
