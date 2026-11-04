-- Vilka jobb en faktura gäller (job_ids) är intern bokföring och syns inte på fakturan. Det ska gå att
-- koppla jobben i efterhand även när fakturan redan är skickad, så att de inte faktureras två gånger.
create or replace function public.invoices_guard()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  free text[] := array['status', 'paid_at', 'paid_amount', 'reminder_count', 'last_reminder_at', 'reminder_fee', 'reminder_fee_at', 'rut_status', 'rut_applied_at', 'rut_paid_at', 'rut_paid_amount', 'rut_note', 'internal_note', 'job_ids', 'updated_at'];
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
