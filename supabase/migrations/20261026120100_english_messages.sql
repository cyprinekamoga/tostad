-- Administrationen och personalappen är på engelska. Felmeddelanden från databasen visas där,
-- så de byts till engelska. Funktionerna skrivs om på plats; inget annat ändras.
do $$
declare
  pairs text[][] := array[
    ['Ogiltiga rader', 'Invalid lines'],
    ['Lägg in bankgironumret under Inställningar först', 'Add the bankgiro number under Settings first'],
    ['Fakturan är redan skickad', 'The invoice is already sent'],
    ['Köparens namn saknas', 'The buyer''s name is missing'],
    ['Fakturan saknar rader', 'The invoice has no lines'],
    ['Ange när tjänsten utfördes', 'Enter when the work was done'],
    ['Fyll i namn och personnummer för RUT-avdraget', 'Fill in name and personal identity number for the RUT deduction'],
    ['Hittar inte passbytet', 'Could not find the shift swap'],
    ['Bara administratörer', 'Admins only'],
    ['Bara skickade fakturor kan krediteras', 'Only sent invoices can be credited'],
    ['Passbytet väntar inte på beslut', 'The shift swap is not waiting for a decision'],
    ['Högst tre administratörer', 'At most three admins'],
    ['Det finns redan en ägare', 'There is already an owner'],
    ['Ägarkontot kan inte ändras här', 'The owner account cannot be changed here'],
    ['Det kan bara finnas en ägare', 'There can only be one owner'],
    ['Ägarkontot kan inte tas bort', 'The owner account cannot be deleted'],
    ['En skickad faktura kan inte tas bort. Gör en kreditfaktura.', 'A sent invoice cannot be removed. Make a credit note.'],
    ['Använd Skicka för att ge fakturan nummer', 'Use Send to give the invoice a number'],
    ['En skickad faktura kan inte ändras. Gör en kreditfaktura.', 'A sent invoice cannot be changed. Make a credit note.'],
    ['Ogiltig status', 'Invalid status'],
    ['Logga in', 'Please log in'],
    ['För lång period', 'The period is too long'],
    ['Du är inte bokad på jobbet', 'You are not booked on this job'],
    ['Passet har redan börjat', 'The shift has already started'],
    ['Passet är redan erbjudet', 'The shift is already offered'],
    ['En accepterad offert kan inte ändras', 'An accepted quote cannot be changed'],
    ['Fakturan är skickad och kan inte ändras', 'The invoice is sent and cannot be changed'],
    ['Startnumret kan inte ändras när fakturor har skickats', 'The start number cannot be changed after invoices have been sent'],
    ['Ogiltigt nummer', 'Invalid number'],
    ['Högst två personer', 'At most two people'],
    ['Personnumret för % är inte giltigt', 'The personal identity number for % is not valid'],
    ['Namn saknas', 'The name is missing'],
    ['Ogiltig checklista', 'Invalid checklist'],
    ['Okänd åtgärd', 'Unknown action'],
    ['Passet går inte att ta längre', 'The shift can no longer be taken']
  ];
  fn record;
  def text;
  i int;
begin
  for fn in
    select p.oid, pg_get_functiondef(p.oid) as body
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prokind = 'f'
       and p.proname in ('doc_totals', 'finalize', 'cancel_swap', 'credit_invoice', 'decide_swap', 'finalize_invoice',
                         'guard_profiles', 'invoices_guard', 'my_jobs', 'offer_swap', 'quotes_guard', 'reveal_pnr',
                         'rut_people_guard', 'set_invoice_start', 'set_rut_people', 'staff_job', 'take_swap')
  loop
    def := fn.body;
    for i in 1 .. array_length(pairs, 1) loop
      def := replace(def, 'raise exception ''' || replace(pairs[i][1], '''', '''''') || '''', 'raise exception ''' || replace(pairs[i][2], '''', '''''') || '''');
    end loop;
    if def <> fn.body then
      execute def;
    end if;
  end loop;
end;
$$;
