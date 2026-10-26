-- Påminnelseavgift (högst 60 kr enligt lagen om ersättning för inkassokostnader). Läggs på en gång per faktura,
-- vid första påminnelsen, och bara på fakturor utställda efter att avgiften slogs på (då står den i fakturans villkor).
alter table public.company_settings
  add column reminder_fee numeric(6, 2) not null default 0 check (reminder_fee between 0 and 60),
  add column reminder_fee_from date;

alter table public.invoices
  add column reminder_fee numeric(6, 2) not null default 0 check (reminder_fee between 0 and 60),
  add column reminder_fee_at date;

create or replace function public.invoices_guard()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  free text[] := array['status', 'paid_at', 'paid_amount', 'reminder_count', 'last_reminder_at', 'reminder_fee', 'reminder_fee_at', 'rut_status', 'rut_applied_at', 'rut_paid_at', 'rut_paid_amount', 'rut_note', 'internal_note', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'utkast' or old.number is not null then
      raise exception 'A sent invoice cannot be removed. Make a credit note.';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(current_setting('app.finalizing', true), '') <> 'on' then
      new.status := 'utkast';
      new.number := null;
      new.ocr := null;
      new.kind := 'faktura';
      new.credit_of := null;
    end if;
    return new;
  end if;
  if coalesce(current_setting('app.finalizing', true), '') = 'on' then
    return new;
  end if;
  new.token := old.token;
  if old.status = 'utkast' then
    if new.status <> 'utkast' or new.number is not null or new.ocr is not null then
      raise exception 'Use Send to give the invoice a number';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'A sent invoice cannot be changed. Make a credit note.';
  end if;
  if new.status = 'utkast' or (old.status = 'krediterad' and new.status <> 'krediterad') or (new.status = 'krediterad' and old.status <> 'krediterad') then
    raise exception 'Invalid status';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

-- Avgiften sätts av databasen när första påminnelsen registreras, oavsett om den skickas för hand eller automatiskt.
create function private.invoice_reminder_fee() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  s record;
begin
  if new.reminder_count > old.reminder_count and old.reminder_fee = 0 and new.kind = 'faktura' and new.status = 'skickad' then
    select reminder_fee, reminder_fee_from into s from public.company_settings where id = 1;
    if s.reminder_fee > 0 and s.reminder_fee_from is not null and new.issue_date >= s.reminder_fee_from then
      new.reminder_fee := s.reminder_fee;
      new.reminder_fee_at := (now() at time zone 'Europe/Stockholm')::date;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.invoice_reminder_fee() from public, anon, authenticated;
create trigger invoices_reminder_fee before update on public.invoices for each row execute function private.invoice_reminder_fee();

-- Slås på med 60 kr från och med i dag. Villkoret på fakturan nämner avgiften.
update public.company_settings set reminder_fee = 60, reminder_fee_from = (now() at time zone 'Europe/Stockholm')::date where id = 1;
update public.company_settings set late_interest = 'Vid försenad betalning debiteras dröjsmålsränta enligt räntelagen och en påminnelseavgift på 60 kr.'
where id = 1 and late_interest = 'Vid försenad betalning debiteras dröjsmålsränta enligt räntelagen.';
