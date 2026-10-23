-- Kantfunktionerna kör som service_role. Triggrar som räknar summor (docs_compute) anropar
-- private.doc_totals, så utan detta gick det inte att acceptera eller tacka nej till en offert.
grant usage on schema private to service_role;
