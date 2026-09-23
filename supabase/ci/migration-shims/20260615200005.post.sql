-- Puts back the five policies 20260615200005.pre.sql recorded and dropped, in
-- the form 20261028000000 / 20261032000000 had left them — the form production
-- ends on. See the .pre.sql header for the ordering story.
DO $$
DECLARE r record;
BEGIN
  IF to_regclass('ci_shim.saved_policies') IS NULL THEN RETURN; END IF;

  FOR r IN SELECT * FROM ci_shim.saved_policies WHERE shim = '20260615200005' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s %s %s',
      r.policyname, r.schemaname, r.tablename,
      CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      r.cmd,
      r.roles,
      CASE WHEN r.qual      IS NOT NULL THEN 'USING (' || r.qual || ')'      ELSE '' END,
      CASE WHEN r.withcheck IS NOT NULL THEN 'WITH CHECK (' || r.withcheck || ')' ELSE '' END
    );
  END LOOP;

  DELETE FROM ci_shim.saved_policies WHERE shim = '20260615200005';

  -- Leave no CI-only object behind once the last shim has used it.
  IF NOT EXISTS (SELECT 1 FROM ci_shim.saved_policies) THEN
    DROP TABLE ci_shim.saved_policies;
    DROP SCHEMA IF EXISTS ci_shim;
  END IF;
END $$;
