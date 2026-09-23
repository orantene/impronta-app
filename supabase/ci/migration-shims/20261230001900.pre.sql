-- 20261230001900_reserve_set_skip_empty_capacity proves its fix against real
-- rows before it commits:
--     SELECT id INTO v_tenant FROM public.agencies …
--     IF v_tenant IS NULL THEN RAISE EXCEPTION 'no tenant to prove against —
--       refusing to apply an unproven change';
--     SELECT id INTO v_talent FROM public.talent_profiles ORDER BY created_at LIMIT 1;
--     IF v_talent IS NULL THEN RAISE EXCEPTION 'no talent profile to prove a
--       holds-only set against';
-- A database built only from migrations has neither, so from scratch it aborts
-- with the second message. The assertion is right — an unproven reservation
-- change is exactly what this project should refuse to ship — and it is inside
-- the migration's transaction, so only a pre-shim can answer it.
--
-- THE MINIMUM THE PROOF NEEDS, AND NOT ONE ROW MORE
--   * one agency — every column except slug and display_name has a default
--   * one talent_profile — every column except profile_code has a default
--   * one auth.users row, which the proof reads as the actor
-- Nothing else: no roster link, no capacity pool, no membership. The proof
-- reserves a hold for a talent under a tenant and then deletes it again.
--
-- IT ONLY FIRES ON AN EMPTY DATABASE. Each insert is guarded on the table
-- being empty, so on production — and on any database that has already been
-- seeded — this shim does nothing and the migration proves itself against the
-- real rows, exactly as it did when it was pushed.
--
-- THE ROWS ARE LEFT IN PLACE, and that is a deliberate call. They are DATA,
-- not schema — a schema-only dump of this database is identical with or
-- without them — and three later migrations (20261230010100,
-- 20261231000700 and the reserve/booking proofs that follow) run the same kind
-- of proof and need the same rows. Deleting and re-inserting between each one
-- would leave holds and operation rows dangling on a half-removed profile.
-- Anything that needs a clean roster seeds over them afterwards
-- (supabase/seed_demo_profiles.sql).
DO $$
DECLARE
  v_user uuid := '00000000-0000-4000-8000-0000000c1a01';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users) THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email,
                            encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at)
    VALUES (v_user, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated',
            'ci-proof@migration-shim.invalid', '', now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
            now(), now())
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.agencies) THEN
    INSERT INTO public.agencies (slug, display_name)
    VALUES ('ci-proof-tenant', 'CI proof tenant');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.talent_profiles) THEN
    INSERT INTO public.talent_profiles (profile_code)
    VALUES ('CI-PROOF-0001');
  END IF;
END $$;
