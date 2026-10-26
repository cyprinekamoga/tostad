-- "Vi är på väg": personalen trycker på knappen i appen och väljer om kunden ska få ett SMS.
alter table public.company_settings
  add column sms_onway_enabled boolean not null default true,
  add column sms_onway_text text not null default 'Hej {namn}! {team} från TO Städ & Flytt är på väg till {adress} och är framme om ca {minuter} min. Frågor? Ring {telefon}'
    check (char_length(sms_onway_text) <= 600);

alter table public.sms_log drop constraint sms_log_kind_check;
alter table public.sms_log add constraint sms_log_kind_check check (kind in ('kvall_kund', 'kvall_personal', 'pa_vag', 'test'));
