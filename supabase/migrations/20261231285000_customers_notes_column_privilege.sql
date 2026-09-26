-- A6 / defect #16 — customers.notes must not be readable by customer self-select.
--
-- Pattern mirrors 20261110070000_reviews_private_note_privilege.sql:
-- RLS gates ROWS; column privileges gate COLUMNS. customers_self_select lets a
-- signed-in customer read their own row, and the default table GRANT gave them
-- every column including `notes` (staff-private). Revoke blanket SELECT from
-- authenticated and re-grant every column EXCEPT notes.
--
-- Staff / talent loaders that need notes already use the service role
-- (e.g. lib/projects/projects-reader.ts). service_role grants are untouched.
--
-- Fail-closed: future ADD COLUMN on customers is not selectable by
-- authenticated until an explicit GRANT SELECT (new_column) is added.

BEGIN;

DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'customers'
     AND column_name <> 'notes';

  IF cols IS NULL OR cols = '' THEN
    RAISE EXCEPTION 'customers column list empty — refusing to revoke SELECT';
  END IF;

  REVOKE SELECT ON public.customers FROM authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.customers TO authenticated', cols);
END $$;

COMMENT ON COLUMN public.customers.notes IS
  'Staff/talent private notes. Not granted to authenticated SELECT (A6); '
  'customer self-read must never return this column. Read via service role.';

COMMIT;
