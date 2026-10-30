-- Guarded owner-transfer reclassification and standalone cost correction.
-- Keep private before/after snapshots and exact bank evidence outside Git.
-- Set retrade.verified_owner_split transaction-locally. Trial with ROLLBACK.
-- The superseded contribution is retained at zero; no records are deleted.
DO $verified_owner_split$
DECLARE
 p jsonb:=nullif(current_setting('retrade.verified_owner_split',true),'')::jsonb;
 owner_id uuid; d jsonb; oldrow jsonb; a jsonb; tab text; allowed text[];
 assignments text; n integer; draw_reduction numeric; contribution_reduction numeric;
BEGIN
 IF p IS NULL OR jsonb_typeof(p->'changes') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p->'changes') NOT BETWEEN 3 AND 8
 OR length(coalesce(p->>'evidence',''))<20 THEN RAISE EXCEPTION 'Verified bounded payload required'; END IF;
 owner_id:=(p->>'owner_id')::uuid;
 IF owner_id IS NULL THEN RAISE EXCEPTION 'Owner required'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p->'changes')) <>
 (SELECT count(DISTINCT (x->>'table')||':'||(x->>'id')) FROM jsonb_array_elements(p->'changes') x)
 THEN RAISE EXCEPTION 'Duplicate target'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(p->'changes') LOOP
  tab:=d->>'table';
  IF tab NOT IN ('cash_ledger','accounts','items') THEN RAISE EXCEPTION 'Unexpected target'; END IF;
  allowed:=CASE tab WHEN 'cash_ledger' THEN ARRAY['date','amount','description']
   WHEN 'accounts' THEN ARRAY['notes']
   WHEN 'items' THEN ARRAY['cost_price','gross_profit','notes'] END;
  IF jsonb_typeof(d->'patch') IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(d->'patch') k WHERE NOT k=ANY(allowed))
  THEN RAISE EXCEPTION 'Unexpected patch'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id::text=$1 AND t.user_id=$2 FOR UPDATE',tab)
   INTO oldrow USING d->>'id',owner_id;
  IF oldrow IS NULL OR md5(oldrow::text) IS DISTINCT FROM d->>'expected'
  THEN RAISE EXCEPTION 'Changed since backup: % %',tab,d->>'id'; END IF;
  a:=oldrow||(d->'patch');
  IF tab='cash_ledger' THEN
   IF (a->>'amount')::numeric<0 THEN RAISE EXCEPTION 'Negative cash amount'; END IF;
   IF d->>'id'=p->>'draw_id' THEN
    IF oldrow->>'type'<>'owner_draw' THEN RAISE EXCEPTION 'Expected owner drawing'; END IF;
    draw_reduction:=(oldrow->>'amount')::numeric-(a->>'amount')::numeric;
   ELSIF d->>'id'=p->>'contribution_id' THEN
    IF oldrow->>'type'<>'owner_contribution' OR (a->>'amount')::numeric<>0
    THEN RAISE EXCEPTION 'Expected contribution void'; END IF;
    contribution_reduction:=(oldrow->>'amount')::numeric;
   ELSIF oldrow->>'type'<>'partner_settlement' OR a->'amount' IS DISTINCT FROM oldrow->'amount'
   THEN RAISE EXCEPTION 'Only settlement mirror date/description may change'; END IF;
  END IF;
  IF tab='items' AND ((a->>'cost_price')::numeric<0 OR oldrow->>'account_id' IS NOT NULL)
  THEN RAISE EXCEPTION 'Standalone acquisition correction required'; END IF;
  SELECT string_agg(format('%I=r.%I',k,k),',') INTO assignments FROM jsonb_object_keys(d->'patch') k;
  IF tab='items' THEN assignments:=assignments||',client_base_revision=t.revision'; END IF;
  EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) r WHERE t.id=r.id AND t.user_id=$2',tab,assignments,tab)
   USING a,owner_id;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Incomplete correction'; END IF;
 END LOOP;
 IF draw_reduction IS NULL OR contribution_reduction IS NULL OR draw_reduction<=0
 OR draw_reduction IS DISTINCT FROM contribution_reduction
 THEN RAISE EXCEPTION 'Reclassification must preserve combined cash'; END IF;
END
$verified_owner_split$;
