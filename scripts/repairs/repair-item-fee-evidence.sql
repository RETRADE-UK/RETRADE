-- Bounded existing-item receipt/fee correction; private data supplied transaction-locally.
DO $item_evidence$
DECLARE
 p jsonb := nullif(current_setting('retrade.item_evidence_repairs',true),'')::jsonb;
 patch jsonb;
 current_row public.items%ROWTYPE;
 updated_row public.items%ROWTYPE;
 owner_id uuid;
 n integer;
BEGIN
 IF p IS NULL OR jsonb_typeof(p->'changes') IS DISTINCT FROM 'array' OR coalesce(jsonb_array_length(p->'changes'),0) NOT BETWEEN 1 AND 250
 THEN RAISE EXCEPTION 'A bounded item evidence payload is required'; END IF;
 owner_id := (p->>'owner_id')::uuid;
 IF (SELECT count(*) FROM jsonb_array_elements(p->'changes')) <> (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p->'changes') x)
 THEN RAISE EXCEPTION 'Duplicate repair target'; END IF;
 FOR patch IN SELECT value FROM jsonb_array_elements(p->'changes') LOOP
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(patch->'changes') k WHERE NOT k=ANY(ARRAY['refresh_history','sale_platform','sale_price','default_platform','postage','shipping_cost','sold_on_platform','resale_postage','resale_packaging_cost','gid','notes','resale_sale_price','resale_shipping_cost']))
  THEN RAISE EXCEPTION 'Unexpected item field in evidence repair'; END IF;
  SELECT * INTO current_row FROM public.items WHERE id=patch->>'id' AND user_id=owner_id FOR UPDATE;
  IF NOT FOUND OR current_row.revision IS DISTINCT FROM (patch->>'revision')::bigint
  THEN RAISE EXCEPTION 'Item changed since backup: %',patch->>'id'; END IF;
  SELECT * INTO updated_row FROM jsonb_populate_record(NULL::public.items,to_jsonb(current_row)||(patch->'changes'));
  UPDATE public.items SET refresh_history=updated_row.refresh_history,sale_platform=updated_row.sale_platform,sale_price=updated_row.sale_price,default_platform=updated_row.default_platform,postage=updated_row.postage,shipping_cost=updated_row.shipping_cost,sold_on_platform=updated_row.sold_on_platform,resale_postage=updated_row.resale_postage,resale_packaging_cost=updated_row.resale_packaging_cost,gid=updated_row.gid,notes=updated_row.notes,resale_sale_price=updated_row.resale_sale_price,resale_shipping_cost=updated_row.resale_shipping_cost,client_base_revision=revision
  WHERE id=current_row.id AND user_id=owner_id AND revision=current_row.revision;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Concurrent item evidence repair conflict'; END IF;
 END LOOP;
END
$item_evidence$;
