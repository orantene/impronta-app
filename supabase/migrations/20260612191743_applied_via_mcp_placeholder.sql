-- Placeholder for migration 20260612191743, which was applied to the remote database
-- directly (MCP execute_sql + manual schema_migrations row) during the
-- May-June 2026 multi-agent period, without a file landing on main. The
-- schema it created is LIVE in prod. This no-op file exists so the Supabase
-- CLI's local/remote history comparison passes and 'db push' runs again.
-- Do NOT put schema statements here. See
-- web/docs/money-program-execution-plan-2026-07-22.md (Phase 0).
select 1;
