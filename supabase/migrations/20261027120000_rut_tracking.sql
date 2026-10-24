-- RUT-uppföljning: när ansökan gjordes hos Skatteverket, när och hur mycket som betalades ut,
-- och en anteckning. Fälten får ändras även när fakturan är skickad.
alter table public.invoices
  add column rut_applied_at date,
  add column rut_paid_at date,
  add column rut_paid_amount numeric(12, 2) check (rut_paid_amount is null or rut_paid_amount >= 0),
  add column rut_note text check (char_length(rut_note) <= 1000);

-- Snabb sökning på OCR-nummer, till exempel från en inbetalning på kontoutdraget.
create index invoices_ocr_idx on public.invoices (ocr) where ocr is not null;

create or replace function public.invoices_guard()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  free text[] := array['status', 'paid_at', 'paid_amount', 'reminder_count', 'last_reminder_at', 'rut_status', 'rut_applied_at', 'rut_paid_at', 'rut_paid_amount', 'rut_note', 'internal_note', 'updated_at'];
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
