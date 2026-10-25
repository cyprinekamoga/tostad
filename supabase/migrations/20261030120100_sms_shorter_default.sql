-- Kortare påminnelse så att den ryms i ett SMS (160 tecken).
alter table public.company_settings alter column sms_customer_text set default 'Hej {namn}! Påminnelse: {tjanst} imorgon {datum} kl {tid}, {adress}. {team} kommer. Frågor? Ring {telefon} /TO Städ & Flytt';
update public.company_settings set sms_customer_text = 'Hej {namn}! Påminnelse: {tjanst} imorgon {datum} kl {tid}, {adress}. {team} kommer. Frågor? Ring {telefon} /TO Städ & Flytt'
where sms_customer_text = 'Hej {namn}! Påminnelse om {tjanst} imorgon {datum} kl {tid}, {adress}. Vi som kommer: {team}. Frågor? Ring {telefon}. /TO Städ & Flytt';
