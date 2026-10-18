-- Hjälpfunktionen för behörighet ska inte gå att anropa via det publika API:et.
-- Den flyttas till ett privat schema; policyerna pekar på funktionen och följer med.

create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.is_admin() set schema private;
revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

alter table public.form_rate add column id bigint generated always as identity primary key;
