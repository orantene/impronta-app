-- History placeholder (2026-10-07). This version was applied to production by
-- hand on 2026-10-02 and recorded in schema_migrations, but its file never
-- reached the repo, which made `supabase db push` refuse for everyone
-- ("Remote migration versions not found in local migrations directory").
--
-- The same SQL lives in 20261231341000_commission_context_order_backed.sql
-- (identical function body; that file adds BEGIN/COMMIT and a self-check).
-- That file is the source of truth and runs on fresh databases, so this
-- placeholder is intentionally a no-op.
SELECT 1;
