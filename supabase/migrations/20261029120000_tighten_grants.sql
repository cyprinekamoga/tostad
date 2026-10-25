-- Säkerhetsgenomgång: anon och authenticated behöver aldrig tömma tabeller, skapa triggers eller
-- främmande nycklar. API:t kan inte använda rättigheterna, men de ska inte finnas.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
