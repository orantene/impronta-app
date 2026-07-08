-- STANDING reviews — P0 privacy hotfix: private_note column privilege.
--
-- private_note is the talent-only coaching channel. RLS gates ROWS, but Supabase
-- default table grants gave anon + authenticated SELECT on EVERY COLUMN, so any
-- holder of the public anon key could read private_note on published rows via
-- PostgREST (confirmed live). Fix: revoke blanket SELECT from anon/authenticated
-- and re-grant explicitly on every column EXCEPT private_note.
--
-- The app never selects private_note outside the owner Growth-notes loader,
-- which moves to a service-role read with an explicit ownership check in the
-- same release. All other app reads use explicit column lists, so nothing else
-- is affected. service_role grants are untouched.
--
-- NOTE (fail-closed by design): future ALTER TABLE ... ADD COLUMN on
-- talent_reviews will NOT be selectable by anon/authenticated until a
-- follow-up GRANT SELECT (new_column) is added. Grant deliberately.

BEGIN;

DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'talent_reviews'
     AND column_name <> 'private_note';

  REVOKE SELECT ON public.talent_reviews FROM anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.talent_reviews TO anon, authenticated', cols);
END $$;

COMMIT;
