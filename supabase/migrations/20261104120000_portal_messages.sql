-- Meddelanden mellan kunden och oss på Mina sidor. Kunden skriver via funktionen portal (som också lägger
-- ett ärende i inkorgen), och administratören svarar från inkorgen. Svaret syns på Mina sidor och mejlas.
create table public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  submission_id uuid references public.submissions (id) on delete set null,
  from_customer boolean not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index portal_messages_customer_idx on public.portal_messages (customer_id, created_at);
create index portal_messages_submission_idx on public.portal_messages (submission_id);
create index portal_messages_created_by_idx on public.portal_messages (created_by);
alter table public.portal_messages enable row level security;
revoke all on public.portal_messages from anon;
create policy "Administratör läser meddelanden" on public.portal_messages
  for select to authenticated using ((select private.is_admin()));

alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check check (kind in ('bokning','fotorapport','recension','paminnelse','offert','faktura','ansokan','avslag','portallank','losenord','svar','test'));
