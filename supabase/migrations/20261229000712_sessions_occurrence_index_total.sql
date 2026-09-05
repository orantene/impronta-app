-- The session upsert has never inserted a row, and it is this index.
--
-- `sessions_series_occurrence_uniq` was created PARTIAL:
--
--   CREATE UNIQUE INDEX sessions_series_occurrence_uniq
--     ON public.sessions (series_id, starts_at) WHERE (series_id IS NOT NULL)
--
-- Postgres will not match a partial unique index for `ON CONFLICT` unless the
-- statement ALSO names the predicate. PostgREST emits a bare
-- `ON CONFLICT (series_id, starts_at)` from `on_conflict=series_id,starts_at`
-- and offers no way to attach a WHERE clause, so every insert through
-- `createSessionWithPools` was rejected at PLANNING time with
--
--   42P10  there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- Planning happens before any row is examined, so this failed for EVERY call,
-- not merely for occurrences of a series. Measured against production through
-- the real supabase-js client, with a deliberately invalid tenant_id so the row
-- could never land: the error came back 42P10, never the foreign-key violation
-- it would have reached had the statement planned. Zero rows written, verified
-- by count afterwards.
--
-- Nobody saw it because production holds ZERO sessions and ZERO series: there
-- is no data whose absence looks like a bug, and every unit test passes because
-- `tsx --test` never reaches a database.
--
--
-- WHY TOTAL RATHER THAN NAMING THE PREDICATE
-- ══════════════════════════════════════════
-- The predicate cannot be named through PostgREST at all, so that option does
-- not exist for this caller. The remaining question was whether dropping the
-- WHERE clause changes behaviour for standalone sessions, whose `series_id` is
-- NULL. It does not, and this was proven rather than reasoned: Postgres indexes
-- are NULLS DISTINCT by default, so two standalone sessions at the same instant
-- do not conflict under a total index any more than they did under the partial
-- one. Duplicate standalone sessions were undetected before this migration and
-- are undetected after it. That is unchanged scope, deliberately: whether a
-- venue may hold two sessions at one instant is a product question (two rooms
-- is a legitimate yes), and it is not settled by an index rename.
--
-- What DOES change is that the materialiser's idempotency now works. The unique
-- index on (series_id, starts_at) is what makes a re-run skip an occurrence it
-- already created instead of duplicating it, and until now the statement that
-- relies on it could not be planned.

BEGIN;

DROP INDEX IF EXISTS public.sessions_series_occurrence_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_series_occurrence_uniq
  ON public.sessions (series_id, starts_at);

COMMENT ON INDEX public.sessions_series_occurrence_uniq IS
  'Total, NOT partial. A partial unique index cannot be matched by the bare ON CONFLICT (cols) that PostgREST emits, which made every session insert fail 42P10 at planning. NULLS DISTINCT means standalone sessions (series_id NULL) never conflicted under the old predicate either, so this is behaviour-preserving.';

COMMIT;
