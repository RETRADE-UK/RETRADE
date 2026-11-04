-- Guarded source-evidence repair. Private payload and snapshots stay outside Git.
-- Required setting app.retrade_verified_payload: owner UUID, nine table hashes,
-- and reviewed changes with table/insert/after. No schema changes are required.
-- Before execution: durable backup, source-leg conservation, offline browser
-- replay, and all dated listing controls reconciled. Reject snapshot drift.
DO $repair$
DECLARE
 p jsonb := current_setting('app.retrade_verified_payload')::jsonb;
 owner_id uuid := (p->>'owner')::uuid;
 tbl text; actual_hash text; change jsonb; a jsonb; affected integer;
BEGIN
 LOCK TABLE public.items,public.expenses,public.item_parts,public.item_returns,
 public.cash_ledger,public.accounts,public.trips,public.user_settings,
 public.account_adjustments IN SHARE ROW EXCLUSIVE MODE;
 FOREACH tbl IN ARRAY ARRAY['items','expenses','item_parts','item_returns','cash_ledger','accounts','trips','user_settings','account_adjustments'] LOOP
  EXECUTE format('select md5(string_agg(to_jsonb(x)::text,''|'' order by coalesce(to_jsonb(x)->>''id'',to_jsonb(x)->>''user_id''))) from public.%I x where user_id=$1',tbl) INTO actual_hash USING owner_id;
  IF actual_hash IS DISTINCT FROM p->'guards'->>tbl THEN RAISE EXCEPTION 'Snapshot changed: %',tbl; END IF;
 END LOOP;
 FOR change IN SELECT value FROM jsonb_array_elements(p->'changes') LOOP
  a:=change->'after';tbl:=change->>'table';
  IF (a->>'user_id')::uuid IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'Owner mismatch'; END IF;
  IF tbl='items' AND NOT (change->>'insert')::boolean THEN
   UPDATE public.items SET refresh_history=a->'refresh_history',listing_fee=(a->>'listing_fee')::numeric,
     state=a->>'state',notes=a->>'notes'
   WHERE id=a->>'id' AND user_id=owner_id;
  ELSIF tbl='items' AND (change->>'insert')::boolean THEN
   INSERT INTO public.items(id,gid,item,month,notes,parts,state,source,postage,user_id,category,location,date_listed,cost_price,sale_price,is_returned,listing_fee,sd_rate_idx,postage_mode,promo_percent,sale_platform,sd_buyer_pays,shipping_cost,packaging_cost,account_settled,default_platform,partner_agreed_amount,refresh_history)
   SELECT x.id,x.gid,x.item,x.month,x.notes,x.parts,x.state,x.source,x.postage,x.user_id,x.category,x.location,x.date_listed,x.cost_price,x.sale_price,x.is_returned,x.listing_fee,x.sd_rate_idx,x.postage_mode,x.promo_percent,x.sale_platform,x.sd_buyer_pays,x.shipping_cost,x.packaging_cost,x.account_settled,x.default_platform,x.partner_agreed_amount,x.refresh_history
   FROM jsonb_populate_record(NULL::public.items,a) x;
  ELSIF tbl='expenses' AND NOT (change->>'insert')::boolean THEN
   UPDATE public.expenses SET amount=(a->>'amount')::numeric WHERE id=a->>'id' AND user_id=owner_id;
  ELSIF tbl='expenses' AND (change->>'insert')::boolean THEN
   INSERT INTO public.expenses(id,user_id,date,description,amount,category,sourcing_run_id)
   VALUES(a->>'id',owner_id,(a->>'date')::date,a->>'description',(a->>'amount')::numeric,a->>'category',(a->>'sourcing_run_id')::uuid);
  ELSE RAISE EXCEPTION 'Unexpected mutation type: %',tbl;
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Expected one affected row for %',tbl; END IF;
 END LOOP;
END;
$repair$;
-- Read back independently; compare every changed/unaffected business field,
-- expected revisions, source events, all daily fee controls and reporting totals.
-- Rollback uses a fresh guarded reverse payload; never replay a stale snapshot.
