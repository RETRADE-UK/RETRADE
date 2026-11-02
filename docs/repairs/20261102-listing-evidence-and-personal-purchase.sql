-- Applied in production on 2 November 2026; validated against readback.
-- Listing evidence and personal-purchase reclassification, 2 November 2026.
-- Private values are supplied in app.retrade_repair_payload, never committed.
-- Payload: owner, guards (nine owner-table hashes), changes (reviewed field subsets).
-- Before execution: durable private snapshot; real-runtime before/after replay;
-- every source day and month reconciled; per-source-row penny conservation.
-- No sale values/dates, supplier payments, stock costs, or post-cutoff expenses change.
-- A retained zero expense records the personal purchase's move to owner drawings.
-- Subsequent runs abort on snapshot drift, preventing double application.
DO $repair$
DECLARE
 p jsonb := current_setting('app.retrade_repair_payload')::jsonb;
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
  IF (a->>'user_id')::uuid<>owner_id THEN RAISE EXCEPTION 'Owner mismatch'; END IF;
  IF tbl='items' AND NOT (change->>'insert')::boolean THEN
   UPDATE public.items SET refresh_history=a->'refresh_history',listing_fee=(a->>'listing_fee')::numeric,resale_listing_fee=(a->>'resale_listing_fee')::numeric WHERE id=a->>'id' AND user_id=owner_id;
  ELSIF tbl='item_returns' AND NOT (change->>'insert')::boolean THEN
   UPDATE public.item_returns SET listing_fee_at_return=(a->>'listing_fee_at_return')::numeric,listing_fee_at_relist=(a->>'listing_fee_at_relist')::numeric WHERE id=(a->>'id')::bigint AND user_id=owner_id;
  ELSIF tbl='expenses' AND NOT (change->>'insert')::boolean THEN
   UPDATE public.expenses SET amount=(a->>'amount')::numeric,description=a->>'description' WHERE id=a->>'id' AND user_id=owner_id;
  ELSIF tbl='expenses' AND (change->>'insert')::boolean THEN
   INSERT INTO public.expenses(id,user_id,date,description,amount,category,sourcing_run_id) VALUES(a->>'id',owner_id,(a->>'date')::date,a->>'description',(a->>'amount')::numeric,a->>'category',(a->>'sourcing_run_id')::uuid);
  ELSIF tbl='cash_ledger' AND (change->>'insert')::boolean THEN
   INSERT INTO public.cash_ledger(id,user_id,date,type,category,amount,direction,description,reconcile_anchor,created_at) VALUES(a->>'id',owner_id,(a->>'date')::date,a->>'type',a->>'category',(a->>'amount')::numeric,a->>'direction',a->>'description',(a->>'reconcile_anchor')::boolean,(a->>'created_at')::timestamptz);
  ELSE RAISE EXCEPTION 'Unexpected mutation type: %',tbl;
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Expected one affected row for %',tbl; END IF;
 END LOOP;
END;
$repair$;
-- Verify all changed and unaffected rows against the private proposed snapshot,
-- replay the actual readback with the production engine and recheck daily totals.
-- Missing identities and historic timing discrepancies remain explicit exceptions.

