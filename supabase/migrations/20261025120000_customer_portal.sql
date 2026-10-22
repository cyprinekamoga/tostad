-- Kundportal: varje kund kan få en personlig, hemlig länk (/kund?k=...). Länken läses av
-- edge function portal, som bara visar kundens egna bokningar, offerter, fakturor och foton.
-- En ny nyckel gör att den gamla länken slutar fungera.
alter table public.customers
  add column portal_token uuid unique,
  add column portal_created_at timestamptz,
  add column portal_seen_at timestamptz;
