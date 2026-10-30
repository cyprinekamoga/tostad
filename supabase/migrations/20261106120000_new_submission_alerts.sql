-- Besked till administratörerna när något kommer in via webbplatsen (bokning, meddelande, skadeanmälan):
-- ett mejl till företagets adress och en pushnotis till administratörernas telefoner.
-- Formulärfunktionen ber funktionerna email och push om beskeden direkt efter att ärendet har sparats.

alter table public.company_settings
  add column notify_new_email boolean not null default true,
  add column notify_email text check (notify_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(notify_email) <= 254),
  add column notify_new_push boolean not null default true;

alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check check (kind in ('bokning','fotorapport','recension','paminnelse','offert','faktura','ansokan','avslag','portallank','losenord','svar','ny_bokning','test'));
