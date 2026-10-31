-- En faktura kan gälla många jobb (t.ex. en månad hos Spic and Span). job_ids håller reda på vilka,
-- så att samma jobb inte faktureras två gånger.
alter table public.invoices add column job_ids uuid[] not null default '{}';
create index invoices_job_ids_idx on public.invoices using gin (job_ids);

-- När personalen rapporterar timmar på ett jobb som har börjat blir jobbet klart i planeringen.
create function private.work_hours_job_done() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.job_id is not null then
    update public.jobs
       set status = 'klar', done_at = coalesce(done_at, now()), done_by = coalesce(done_by, new.reported_by, new.profile_id)
     where id = new.job_id and status = 'planerad' and starts_at <= now();
  end if;
  return new;
end;
$$;
revoke execute on function private.work_hours_job_done() from public, anon, authenticated;
create trigger work_hours_job_done after insert or update of job_id, hours on public.work_hours
  for each row execute function private.work_hours_job_done();

-- Jobb som redan har rapporterade timmar men fortfarande står som planerade.
update public.jobs j
   set status = 'klar', done_at = coalesce(j.done_at, now())
 where j.status = 'planerad' and j.starts_at <= now()
   and exists (select 1 from public.work_hours w where w.job_id = j.id);
