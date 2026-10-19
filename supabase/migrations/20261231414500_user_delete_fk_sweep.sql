-- TUL-1020: "Database error deleting user" in the Supabase dashboard.
--
-- Deleting auth.users cascades to public.profiles. A single-column FK that is still
-- NO ACTION blocks that delete. 20261231299900_account_deletion_requests.sql re-pointed the
-- known ones; one was missed: public.builder_catalog_structure.updated_by -> auth.users(id)
-- (created in 20261027000001, no ON DELETE action), so any admin who ever edited the catalog
-- structure cannot be deleted. Audited on staging and production 2026-10-18: this is the ONLY
-- nullable NO ACTION / RESTRICT FK to auth.users or profiles in public.
--
-- Deliberately explicit, NOT a catalog-wide sweep: a sweep would also null audit and money
-- columns (created_by, actor, payout/receiver refs) and silently erase who did what. The
-- catalog-wide review is a separate post-launch card with the FK list written out.
-- APPLIED to staging and production 2026-10-18 (as a one-row sweep with the same effect).
-- Idempotent.

DO $$
DECLARE
  con text;
BEGIN
  SELECT c.conname INTO con
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  WHERE c.contype = 'f'
    AND c.conrelid = 'public.builder_catalog_structure'::regclass
    AND a.attname = 'updated_by'
    AND array_length(c.conkey, 1) = 1
    AND c.confdeltype IN ('a', 'r');
  IF con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.builder_catalog_structure DROP CONSTRAINT %I', con);
    EXECUTE format(
      'ALTER TABLE public.builder_catalog_structure ADD CONSTRAINT %I FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL',
      con
    );
  END IF;
END;
$$;
