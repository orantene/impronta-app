-- `list_public_tables()` could never let the types-drift check reach zero.
--
-- The check compares this function's output against the relations declared in
-- database.types.ts. Both sides were wrong in opposite directions:
--
--   • This function returns VIEWs alongside BASE TABLEs, but the checker only
--     read the `Tables` block of the generated file. Views live under `Views`.
--     Result: three views reported missing forever.
--   • information_schema.tables does NOT list MATERIALIZED views, but
--     `supabase gen types` does emit them. Result: talent_discover_index
--     reported as "declared but not in live schema" forever.
--
-- A warn-only check whose warning can never reach zero is indistinguishable
-- from noise. Eight genuinely missing tables — customers, orders, order_lines
-- and the capacity pair among them — sat unnoticed behind those permanent
-- false positives across three merged PRs, because a human who has seen
-- "3 missing" every time correctly learns to ignore "8 missing".
--
-- The checker side is fixed in the same PR (it now reads Tables ∪ Views).
-- This side adds materialized views so the comparison can actually balance.
--
-- Read-only, SECURITY DEFINER, no grants changed.

CREATE OR REPLACE FUNCTION public.list_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'information_schema', 'pg_catalog', 'public'
AS $function$
BEGIN
  RETURN QUERY
    SELECT t.table_name::TEXT
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_type IN ('BASE TABLE', 'VIEW')
    UNION
    -- Materialized views are absent from information_schema.tables but ARE
    -- emitted by `supabase gen types`, so the two sides only balance if we
    -- add them here.
    SELECT m.matviewname::TEXT
    FROM pg_catalog.pg_matviews m
    WHERE m.schemaname = 'public'
    ORDER BY 1;
END;
$function$;
