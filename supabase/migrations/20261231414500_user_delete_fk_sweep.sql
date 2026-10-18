-- TUL-1020: "Database error deleting user" in the Supabase dashboard.
--
-- Deleting auth.users cascades to public.profiles. Any single-column FK to
-- either table that is still NO ACTION / RESTRICT makes that delete fail for
-- every user who ever touched the referencing row.
--
-- 20261231299900_account_deletion_requests.sql re-pointed the known ones
-- (inquiry_coordinators, inquiry_action_log, talent_bookings, talent_holds,
-- workspace_talent_commission_overrides, channel_connections, ...). One was
-- missed: public.builder_catalog_structure.updated_by -> auth.users(id), created
-- in 20261027000001 with no ON DELETE action, so any admin who ever edited the
-- catalog structure cannot be deleted.
--
-- Rather than patch only that name, this sweeps the catalog: every nullable,
-- non-primary-key, single-column FK from the public schema to auth.users or
-- public.profiles that is NO ACTION / RESTRICT becomes ON DELETE SET NULL.
-- History rows survive with a null actor. NOT NULL columns are never altered
-- here (that is a product decision); they are reported with a NOTICE.
-- Idempotent: after one run the sweep finds nothing.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid AS con_oid,
           c.conname,
           c.conrelid::regclass::text   AS tbl,
           c.confrelid::regclass::text  AS target,
           a.attname                    AS col,
           a.attnotnull                 AS not_null,
           (SELECT pg_get_constraintdef(c.oid)) AS def,
           EXISTS (
             SELECT 1 FROM pg_constraint pk
             WHERE pk.conrelid = c.conrelid AND pk.contype = 'p'
               AND a.attnum = ANY (pk.conkey)
           ) AS in_pk
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND array_length(c.conkey, 1) = 1
      AND c.confdeltype IN ('a', 'r')
      AND c.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
  LOOP
    IF r.not_null OR r.in_pk THEN
      RAISE NOTICE 'user-delete blocker left as is (NOT NULL or PK): %.% -> %', r.tbl, r.col, r.target;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(id) ON DELETE SET NULL',
      r.tbl, r.conname, r.col, r.target
    );
    RAISE NOTICE 'user-delete blocker fixed: %.% -> % now ON DELETE SET NULL', r.tbl, r.col, r.target;
  END LOOP;
END;
$$;
