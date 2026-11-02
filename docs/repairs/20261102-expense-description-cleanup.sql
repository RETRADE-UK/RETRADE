-- Applied in production on 2 November 2026: expense description cleanup only.
-- Private owner IDs, row hashes, before/after descriptions and verification data
-- are retained in the private reconciliation register, not this repository.
-- No expense, amount, date, category or sourcing link was added or removed.
-- Superseded zero controls remain as clearly named historical records.
-- This is the exact UPDATE/row-count-guard structure used, with the private
-- payload and owner/count values externalized as session settings.
-- Run only after a durable before snapshot and fresh hashes have been captured.
-- Required settings: retrade.expense_title_owner (uuid),
-- retrade.expense_title_expected_count (integer), retrade.expense_title_payload
-- (JSON array of {id, description, row_hash}; row_hash=md5(to_jsonb(expense)::text)).
DO $titles$
DECLARE
  expected_count integer := current_setting('retrade.expense_title_expected_count')::integer;
  affected integer;
BEGIN
  WITH changes AS (
    SELECT * FROM jsonb_to_recordset(current_setting('retrade.expense_title_payload')::jsonb)
    AS c(id text, description text, row_hash text)
  )
  UPDATE public.expenses e SET description=c.description
  FROM changes c
  WHERE e.user_id=current_setting('retrade.expense_title_owner')::uuid
    AND e.id=c.id AND md5(to_jsonb(e)::text)=c.row_hash;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>expected_count THEN
    RAISE EXCEPTION 'Snapshot changed: expected %, updated %; all changes rolled back',expected_count,affected;
  END IF;
END $titles$;
-- Verification performed with an independent post-write fetch: every expected
-- full row matched; count and all date/category/sourcing-run totals were equal.
-- Rollback: retain current hashes and reverse only approved description changes.
-- No runtime deployment or database migration is required by this record.
