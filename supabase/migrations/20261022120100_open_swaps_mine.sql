-- Lediga pass visar också pass personen själv har tagit och som väntar på godkännande.
create or replace function public.open_swaps() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'job_id', j.id, 'service', j.service, 'starts_at', j.starts_at, 'ends_at', j.ends_at,
      'city', j.city, 'from_name', p.full_name, 'note', r.note, 'status', r.status,
      'mine', r.to_profile = (select auth.uid())) order by j.starts_at), '[]'::jsonb)
  from public.swap_requests r
  join public.jobs j on j.id = r.job_id
  join public.profiles p on p.id = r.from_profile
  where private.is_staff()
    and j.starts_at > now()
    and r.from_profile <> (select auth.uid())
    and (
      (r.status = 'oppen' and not exists (select 1 from public.job_staff s where s.job_id = j.id and s.profile_id = (select auth.uid())))
      or (r.status = 'vantar' and r.to_profile = (select auth.uid()))
    );
$$;
