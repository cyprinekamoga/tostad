-- Pushnotiser till personalens telefoner (Web Push). Ändringar i schemat läggs i en kö av databasen,
-- och ett schema varje minut ber funktionen push skicka när det har varit lugnt i 20 sekunder.
-- Då blir "ta bort och lägg till samma person" i planeringen ingen notis alls.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  device text check (char_length(device) <= 200),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
-- Var och en ser sina egna enheter. Allt annat sköts av funktionen push.
create policy "Egna enheter" on public.push_subscriptions for select to authenticated using (profile_id = (select auth.uid()));

create table public.push_queue (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid,
  kind text not null check (kind in ('ny', 'borttagen', 'andrad', 'avbokad')),
  actor uuid,
  service text,
  starts_at timestamptz,
  city text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index push_queue_unsent_idx on public.push_queue (created_at) where sent_at is null;
alter table public.push_queue enable row level security;
revoke all on public.push_queue from anon, authenticated;

-- Köar en händelse, bara för jobb som inte har börjat.
create function private.push_enqueue(p_profile uuid, p_job public.jobs, p_kind text) returns void
language sql security definer set search_path = ''
as $$
  insert into public.push_queue (profile_id, job_id, kind, actor, service, starts_at, city)
  select p_profile, p_job.id, p_kind, (select auth.uid()), p_job.service, p_job.starts_at, p_job.city
  where p_job.starts_at > now();
$$;

create function private.push_job_staff() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  j public.jobs;
begin
  if tg_op = 'INSERT' then
    select * into j from public.jobs where id = new.job_id;
    if j.status = 'planerad' then perform private.push_enqueue(new.profile_id, j, 'ny'); end if;
    return new;
  end if;
  select * into j from public.jobs where id = old.job_id;
  -- Är jobbet borta håller borttagningen av jobbet själv reda på notisen.
  if found and j.status = 'planerad' then perform private.push_enqueue(old.profile_id, j, 'borttagen'); end if;
  return old;
end;
$$;
create trigger job_staff_push after insert or delete on public.job_staff for each row execute function private.push_job_staff();

create function private.push_jobs() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  s record;
begin
  if tg_op = 'DELETE' then
    if old.status = 'planerad' then
      for s in select profile_id from public.job_staff where job_id = old.id loop
        perform private.push_enqueue(s.profile_id, old, 'avbokad');
      end loop;
    end if;
    return old;
  end if;
  if new.status = 'avbokad' and old.status = 'planerad' then
    for s in select profile_id from public.job_staff where job_id = new.id loop
      perform private.push_enqueue(s.profile_id, old, 'avbokad');
    end loop;
  elsif new.status = 'planerad' and (new.starts_at, new.ends_at, new.street, new.city) is distinct from (old.starts_at, old.ends_at, old.street, old.city) then
    for s in select profile_id from public.job_staff where job_id = new.id loop
      perform private.push_enqueue(s.profile_id, new, 'andrad');
    end loop;
  end if;
  return new;
end;
$$;
create trigger jobs_push_update after update on public.jobs for each row execute function private.push_jobs();
create trigger jobs_push_delete before delete on public.jobs for each row execute function private.push_jobs();

revoke execute on function private.push_enqueue(uuid, public.jobs, text), private.push_job_staff(), private.push_jobs() from public, anon, authenticated;

-- VAPID-nycklarna skapas av funktionen push första gången och sparas i Vault. Bara funktionen kommer åt dem.
create function public.push_keys_get() returns text
language sql stable security definer set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_keys';
$$;
create function public.push_keys_set(p_keys text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from vault.secrets where name = 'push_vapid_keys') then
    raise exception 'The keys already exist';
  end if;
  perform vault.create_secret(p_keys, 'push_vapid_keys', 'VAPID-nycklar för pushnotiser');
end;
$$;
revoke execute on function public.push_keys_get(), public.push_keys_set(text) from public, anon, authenticated;
grant execute on function public.push_keys_get(), public.push_keys_set(text) to service_role;

-- Varje minut: anropa funktionen bara när kön har varit stilla i 20 sekunder (eller väntat i 3 minuter).
create function private.push_tick() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.push_queue where sent_at is null)
     and ((select max(created_at) from public.push_queue where sent_at is null) < now() - interval '20 seconds'
          or (select min(created_at) from public.push_queue where sent_at is null) < now() - interval '3 minutes') then
    perform net.http_post(
      url := 'https://jrvmqilzegerihdjswzc.supabase.co/functions/v1/push',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sms_cron_token')),
      body := '{"action":"run"}'::jsonb,
      timeout_milliseconds := 30000
    );
  end if;
end;
$$;
revoke execute on function private.push_tick() from public, anon, authenticated;

select cron.schedule('push-varje-minut', '* * * * *', $$ select private.push_tick(); $$);
