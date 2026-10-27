-- Bokningsbekräftelse som SMS. Skickas av en administratör från jobbet, med en text som går att ändra innan.
alter table public.company_settings
  add column sms_booking_text text not null default 'Hej {namn}! Tack för din bokning hos TO Städ & Flytt: {tjanst} {datum} kl {tid}, {adress}. Frågor? Ring {telefon}'
    check (char_length(sms_booking_text) <= 600);

alter table public.sms_log drop constraint sms_log_kind_check;
alter table public.sms_log add constraint sms_log_kind_check check (kind in ('kvall_kund', 'kvall_personal', 'pa_vag', 'bokning', 'test'));

