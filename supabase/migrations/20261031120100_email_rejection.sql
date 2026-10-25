-- Avslagsmejl till sökande loggas som 'avslag'.
alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check check (kind in ('bokning','fotorapport','recension','paminnelse','offert','faktura','ansokan','avslag','portallank','losenord','test'));
