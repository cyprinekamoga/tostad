-- Produkter och tjänster att välja från när en offert eller faktura skrivs. Priset sparas exklusive moms.
create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text check (char_length(code) <= 20),
  name text not null check (char_length(name) between 1 and 300),
  unit text not null default 'st' check (unit in ('st', 'tim', 'kvm', 'km')),
  price numeric(12, 2) not null default 0 check (price between 0 and 10000000),
  vat int not null default 25 check (vat in (0, 6, 12, 25)),
  rut boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;
revoke all on public.products from anon;
create policy "Administratör hanterar produkter" on public.products
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
