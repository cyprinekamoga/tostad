-- Jobbassistenten: texter som klistras in eller kommer via WhatsApp, och vad assistenten föreslog.
-- Inget ändras i planeringen förrän en administratör har godkänt förslagen.
create table public.assistant_drafts (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'paste' check (source in ('paste', 'whatsapp')),
  sender_phone text,
  from_profile uuid references public.profiles (id) on delete set null,
  input text not null check (char_length(input) <= 20000),
  result jsonb,
  status text not null default 'ny' check (status in ('ny', 'klar', 'avvisad')),
  created_by uuid references public.profiles (id) on delete set null,
  applied_by uuid references public.profiles (id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create index assistant_drafts_status_idx on public.assistant_drafts (status, created_at desc);
create index assistant_drafts_from_idx on public.assistant_drafts (from_profile);
create index assistant_drafts_created_by_idx on public.assistant_drafts (created_by);
create index assistant_drafts_applied_by_idx on public.assistant_drafts (applied_by);

alter table public.assistant_drafts enable row level security;
revoke all on public.assistant_drafts from anon;
create policy "Administratör hanterar assistentens utkast" on public.assistant_drafts
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Jobbassistenten lägger uppföljningar i inkorgen.
create policy "Administratör lägger till i inkorgen" on public.submissions
  for insert to authenticated with check ((select private.is_admin()));
