
do $donation_import$
declare
 p jsonb := nullif(current_setting('retrade.donation_import', true), '')::jsonb;
 owner_id uuid;
 account_id text;
 expected_account jsonb;
 current_row jsonb;
 row_count integer;
begin
 if p is null or jsonb_array_length(p->'items') < 1 or jsonb_array_length(p->'items') > 25 then
  raise exception 'A bounded verified donation payload is required';
 end if;
 expected_account := p->'before'->'accounts'->0;
 owner_id := (expected_account->>'user_id')::uuid;
 account_id := expected_account->>'id';
 select to_jsonb(a) into current_row from public.accounts a
 where a.id=account_id and a.user_id=owner_id for update;
 if current_row is distinct from expected_account then
  raise exception 'Account changed since backup';
 end if;
 if exists (
  select 1 from jsonb_array_elements(p->'items') x
  where (x->>'user_id')::uuid is distinct from owner_id
   or x->>'account_id' is distinct from account_id
   or (x->>'cost_price')::numeric <> 0
   or (x->>'partner_agreed_amount')::numeric <> 0
   or (x->>'account_paid_amount')::numeric <> 0
   or x->>'arrangement_model_override' <> 'fixed_cost'
   or x->>'state' <> 'sold'
   or (x->>'date_sold')::date < date '2026-04-01'
 ) then raise exception 'Only verified zero-cost sold donations are permitted'; end if;
 if (select count(*) from jsonb_array_elements(p->'items')) <>
    (select count(distinct x->>'id') from jsonb_array_elements(p->'items') x) then
  raise exception 'Duplicate proposed item ID';
 end if;
 if exists (
  select 1 from public.items i join jsonb_array_elements(p->'items') x
  on i.id=x->>'id' or (i.user_id=owner_id and i.gid=x->>'gid')
 ) then raise exception 'An item ID or display ID already exists'; end if;
 select to_jsonb(c) into current_row from public.cash_ledger c
 where c.id=p->'cash_delete'->>'id' and c.user_id=owner_id for update;
 if current_row is distinct from p->'cash_delete' then
  raise exception 'Prior personal receipt changed since backup';
 end if;
 select to_jsonb(c) into current_row from public.cash_ledger c
 where c.id=p->'cash_update'->'before'->>'id' and c.user_id=owner_id for update;
 if current_row is distinct from p->'cash_update'->'before' then
  raise exception 'Withdrawal changed since backup';
 end if;
 if p->'cash_update'->'before'->'amount' is distinct from p->'cash_update'->'after'->'amount'
 or p->'cash_update'->'before'->'date' is distinct from p->'cash_update'->'after'->'date' then
  raise exception 'The historical withdrawal amount/date must be preserved';
 end if;
 insert into public.items (
  id,gid,month,item,user_id,category,location,source,state,cost_price,sale_price,
  postage,shipping_cost,packaging_cost,promo_percent,listing_fee,resale_listing_fee,
  date_sold,date_sourced,date_listed,sale_platform,sold_on_platform,default_platform,
  account_id,account_item_type,arrangement_model_override,account_split_percent,
  partner_agreed_amount,account_paid_amount,account_settled,parts,refresh_history,gross_profit,notes
 )
 select r.id,r.gid,r.month,r.item,r.user_id,r.category,r.location,r.source,r.state,
  r.cost_price,r.sale_price,r.postage,r.shipping_cost,r.packaging_cost,r.promo_percent,
  r.listing_fee,r.resale_listing_fee,r.date_sold,r.date_sourced,r.date_listed,
  r.sale_platform,r.sold_on_platform,r.default_platform,r.account_id,r.account_item_type,
  r.arrangement_model_override,r.account_split_percent,r.partner_agreed_amount,
  r.account_paid_amount,r.account_settled,r.parts,r.refresh_history,r.gross_profit,r.notes
 from jsonb_populate_recordset(null::public.items,p->'items') r;
 get diagnostics row_count = row_count;
 if row_count <> jsonb_array_length(p->'items') then raise exception 'Incomplete insertion'; end if;
 update public.accounts a set account_type=p->'account_after'->>'account_type',
  arrangement_model=p->'account_after'->>'arrangement_model',
  default_split_percent=(p->'account_after'->>'default_split_percent')::numeric,
  notes=p->'account_after'->>'notes'
 where a.id=account_id and a.user_id=owner_id;
 delete from public.cash_ledger c where c.id=p->'cash_delete'->>'id' and c.user_id=owner_id;
 update public.cash_ledger c set description=p->'cash_update'->'after'->>'description'
 where c.id=p->'cash_update'->'before'->>'id' and c.user_id=owner_id;
end
$donation_import$;
