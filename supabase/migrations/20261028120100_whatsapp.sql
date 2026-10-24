-- WhatsApp: meddelanden till företagsnumret. Personalens och administratörernas meddelanden läses
-- direkt av jobbassistenten; kunders meddelanden sparas och läses först när en administratör väljer det.
-- Sparas i 6 månader (gallras av housekeeping).
create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null unique,
  phone text not null,
  name text,
  direction text not null check (direction in ('in', 'out')),
  kind text not null default 'text',
  body text check (char_length(body) <= 20000),
  profile_id uuid references public.profiles (id) on delete set null,
  draft_id uuid references public.assistant_drafts (id) on delete set null,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
create index whatsapp_messages_phone_idx on public.whatsapp_messages (phone, created_at desc);
create index whatsapp_messages_created_idx on public.whatsapp_messages (created_at desc);
create index whatsapp_messages_profile_idx on public.whatsapp_messages (profile_id);
create index whatsapp_messages_draft_idx on public.whatsapp_messages (draft_id);

alter table public.whatsapp_messages enable row level security;
revoke all on public.whatsapp_messages from anon;
create policy "Administratör hanterar WhatsApp" on public.whatsapp_messages
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
