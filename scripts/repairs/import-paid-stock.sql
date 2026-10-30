-- Bounded fixed-cost stock import. Supply retrade.paid_stock_import as a transaction-local JSON payload.
-- Keep private payloads and pre/post backups outside Git. Run first with ROLLBACK.
DO $paid_stock$
DECLARE
 p jsonb := nullif(current_setting('retrade.paid_stock_import',true),'')::jsonb;
 owner_id uuid;
 account_id text;
 current_row jsonb;
 n integer;
 ret jsonb;
 new_return_id bigint;
 old_token text;
BEGIN
 IF p IS NULL OR jsonb_typeof(p->'items') IS DISTINCT FROM 'array' OR coalesce(jsonb_array_length(p->'items'),0) NOT BETWEEN 1 AND 25 THEN
  RAISE EXCEPTION 'A bounded verified paid-stock payload is required';
 END IF;
 owner_id := (p->'before_account'->>'user_id')::uuid;
 account_id := p->'before_account'->>'id';
 SELECT to_jsonb(a) INTO current_row FROM public.accounts a WHERE a.id=account_id AND a.user_id=owner_id FOR UPDATE;
 IF current_row IS DISTINCT FROM p->'before_account' THEN RAISE EXCEPTION 'Account changed since backup'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'items') x
  WHERE (x->>'user_id')::uuid IS DISTINCT FROM owner_id OR x->>'account_id' IS DISTINCT FROM account_id
  OR x->>'arrangement_model_override' IS DISTINCT FROM 'fixed_cost' OR x->>'account_item_type' IS DISTINCT FROM 'supplier'
  OR (x->>'account_settled')::boolean IS DISTINCT FROM true
  OR (x->>'cost_price')::numeric IS NULL OR (x->>'cost_price')::numeric < 0
  OR (x->>'cost_price')::numeric IS DISTINCT FROM (x->>'partner_agreed_amount')::numeric
  OR (x->>'cost_price')::numeric IS DISTINCT FROM (x->>'account_paid_amount')::numeric)
 THEN RAISE EXCEPTION 'Invalid fixed-cost stock allocation'; END IF;
 IF (SELECT sum((x->>'cost_price')::numeric) FROM jsonb_array_elements(p->'items') x) IS DISTINCT FROM (p->>'cost_total')::numeric
 OR (p->'payment'->>'partnerAmount')::numeric IS DISTINCT FROM (p->>'cost_total')::numeric
 THEN RAISE EXCEPTION 'Acquisition allocation does not equal payment'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p->'items')) <> (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p->'items') x)
 THEN RAISE EXCEPTION 'Duplicate proposed item ID'; END IF;
 IF EXISTS(SELECT 1 FROM public.items i JOIN jsonb_array_elements(p->'items') x ON i.id=x->>'id' OR (i.user_id=owner_id AND i.gid=x->>'gid'))
 THEN RAISE EXCEPTION 'An item ID or display ID already exists'; END IF;
 INSERT INTO public.items (id,gid,month,item,category,location,source,user_id,state,cost_price,postage,shipping_cost,packaging_cost,promo_percent,listing_fee,resale_listing_fee,account_id,account_item_type,account_split_percent,account_settled,arrangement_model_override,parts,notes,sale_price,date_sold,sale_platform,sold_on_platform,default_platform,refresh_history,partner_agreed_amount,account_paid_amount,date_sourced,date_listed,resale_sale_price,resale_postage,resale_date_sold,resale_platform,resale_shipping_cost,resale_promo_percent,resale_packaging_cost,is_returned)
 SELECT r.id,r.gid,r.month,r.item,r.category,r.location,r.source,r.user_id,r.state,r.cost_price,r.postage,r.shipping_cost,r.packaging_cost,r.promo_percent,r.listing_fee,r.resale_listing_fee,r.account_id,r.account_item_type,r.account_split_percent,r.account_settled,r.arrangement_model_override,r.parts,r.notes,r.sale_price,r.date_sold,r.sale_platform,r.sold_on_platform,r.default_platform,r.refresh_history,r.partner_agreed_amount,r.account_paid_amount,r.date_sourced,r.date_listed,r.resale_sale_price,r.resale_postage,r.resale_date_sold,r.resale_platform,r.resale_shipping_cost,r.resale_promo_percent,r.resale_packaging_cost,r.is_returned FROM jsonb_populate_recordset(NULL::public.items,p->'items') r;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>jsonb_array_length(p->'items') THEN RAISE EXCEPTION 'Incomplete stock insertion'; END IF;
 FOR ret IN SELECT value FROM jsonb_array_elements(p->'returns') LOOP
  IF (ret->>'user_id')::uuid IS DISTINCT FROM owner_id OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'items') x WHERE x->>'id'=ret->>'item_id')
  THEN RAISE EXCEPTION 'Return ownership mismatch'; END IF;
  INSERT INTO public.item_returns (item_id,user_id,sale_no,type,logged_at,refund_amount,return_postage,date_sold_at_return,sale_price_at_return,postage_at_return,platform_at_return,promo_percent_at_return,shipping_cost_at_return,packaging_cost_at_return,listing_fee_at_return,notes)
  SELECT r.item_id,r.user_id,r.sale_no,r.type,r.logged_at,r.refund_amount,r.return_postage,r.date_sold_at_return,r.sale_price_at_return,r.postage_at_return,r.platform_at_return,r.promo_percent_at_return,r.shipping_cost_at_return,r.packaging_cost_at_return,r.listing_fee_at_return,r.notes FROM jsonb_populate_record(NULL::public.item_returns,ret) r
  RETURNING id INTO new_return_id;
  old_token := '"returnId": ' || (ret->>'id');
  IF NOT EXISTS(SELECT 1 FROM public.items i WHERE i.id=ret->>'item_id' AND position(old_token IN (i.refresh_history #>> '{}'))>0)
  THEN RAISE EXCEPTION 'Refund evidence reference missing'; END IF;
  UPDATE public.items SET refresh_history=to_jsonb(replace(refresh_history #>> '{}',old_token,'"returnId": '||new_return_id::text)),
   client_base_revision=revision WHERE id=ret->>'item_id' AND user_id=owner_id;
 END LOOP;
 UPDATE public.accounts a SET notes=p->'account_after'->>'notes',account_type=p->'account_after'->>'account_type',
  arrangement_model=p->'account_after'->>'arrangement_model',default_split_percent=(p->'account_after'->>'default_split_percent')::numeric
 WHERE a.id=account_id AND a.user_id=owner_id;
END
$paid_stock$;
