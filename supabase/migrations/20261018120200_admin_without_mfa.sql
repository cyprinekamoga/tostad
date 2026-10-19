-- Tvåstegsverifiering används inte. Aktiv ägare eller administratör räcker för behörighet.

create or replace function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active and p.role in ('owner','admin'));
$$;
