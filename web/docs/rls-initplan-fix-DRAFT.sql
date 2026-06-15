-- =====================================================================
-- DRAFT ONLY — DO NOT AUTO-APPLY. NOT a migration.
-- Location is web/docs/ (NOT supabase/migrations/) on purpose: this file
-- must never be picked up by `npm run db:push` / the drift gate.
-- RLS rewrites are security-sensitive; ship in reviewed, table-by-table
-- batches with the verification steps below — never as one blind apply.
-- =====================================================================
--
-- WHAT THIS FIXES
-- ---------------
-- Supabase performance advisor rule `auth_rls_initplan`. A policy that
-- writes a bare `auth.uid()` / `auth.jwt()` / `auth.role()` in its USING
-- (qual) or WITH CHECK expression re-evaluates that function ONCE PER ROW
-- scanned. Wrapping the call in a scalar subquery — `(select auth.uid())`
-- — lets Postgres treat it as an InitPlan: the auth call runs ONCE per
-- statement and the constant is reused for every row. On large tables
-- (media_assets, inquiry_messages, talent_profile_taxonomy, …) this is the
-- difference between N auth lookups and 1.
--
-- WHY IT IS SEMANTICALLY IDENTICAL (i.e. SAFE)
-- --------------------------------------------
--   * `auth.uid()`, `auth.jwt()`, `auth.role()` are STABLE within a
--     statement — they read the request JWT, which does not change mid
--     query. `(select auth.uid())` returns the exact same scalar; only the
--     evaluation count changes, never the value or the row set a policy
--     admits/denies.
--   * This is the canonical fix Supabase itself recommends for this lint
--     (https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select).
--   * We wrap ONLY the bare auth.* calls. Wrapper SECURITY-DEFINER helpers
--     already present in some policies (is_agency_staff(), is_staff_of_tenant(),
--     talent_is_site_visible_anywhere(), …) are intentionally LEFT ALONE —
--     they are functions, already evaluated once, and are NOT what the lint
--     flags. Touching them would change nothing and widen blast radius.
--   * Every DROP/CREATE below preserves the policy's exact name, command
--     (SELECT/INSERT/UPDATE/ALL), role list, and full boolean logic. The
--     only token-level change is `auth.uid()` -> `(select auth.uid())`
--     (and the jwt/role equivalents).
--
-- SCOPE / FULL COUNT
-- ------------------
--   * 169 flagged policies across 93 distinct tables in schema `public`.
--     This number was reproduced directly from pg_policies and matches the
--     advisor's `auth_rls_initplan` count exactly:
--
--       SELECT count(*) FROM pg_policies
--       WHERE schemaname = 'public'
--         AND (
--           (qual       ~ 'auth\.(uid|jwt|role)\(\)' AND qual       !~ 'select\s+auth\.(uid|jwt|role)\(\)')
--           OR
--           (with_check ~ 'auth\.(uid|jwt|role)\(\)' AND with_check !~ 'select\s+auth\.(uid|jwt|role)\(\)')
--         );
--       -- => 169
--
--   * Below are 10 REPRESENTATIVE rewrites covering every pattern in the
--     flagged set: bare `col = auth.uid()` equality, INSERT WITH CHECK,
--     combined USING + WITH CHECK on UPDATE, and the nested-EXISTS subquery
--     shapes (the bulk of the 169). The remaining ~159 follow the identical
--     mechanical transform; generate them per-table with the query in the
--     ROLLOUT section rather than hand-listing all 169 here.
--
-- ROLLOUT (recommended — one reviewed batch PER TABLE)
-- ----------------------------------------------------
--   1. Pick a table. List its flagged policies + their full definitions:
--
--        SELECT policyname, cmd, roles, qual, with_check
--        FROM pg_policies
--        WHERE schemaname='public' AND tablename = '<table>'
--          AND (
--            (qual       ~ 'auth\.(uid|jwt|role)\(\)' AND qual       !~ 'select\s+auth\.(uid|jwt|role)\(\)')
--            OR
--            (with_check ~ 'auth\.(uid|jwt|role)\(\)' AND with_check !~ 'select\s+auth\.(uid|jwt|role)\(\)')
--          );
--
--   2. For each, write DROP POLICY + CREATE POLICY copying qual/with_check
--      VERBATIM, replacing only bare `auth.uid()`/`auth.jwt()`/`auth.role()`
--      with `(select auth.<fn>())`. Keep cmd, roles, name identical.
--   3. Wrap a table's policies in a single transaction (BEGIN; … COMMIT;)
--      so the table is never momentarily unprotected between DROP and CREATE.
--   4. Apply to a Supabase BRANCH or staging first, not prod directly.
--   5. Re-run the count query scoped to that table — expect 0 flagged.
--   6. Re-run the advisor (get_advisors performance) — confirm the
--      auth_rls_initplan entries for that table are gone and no `0 policies`
--      / `rls_disabled` warning appeared.
--   7. Move to the next table. Batch per-table keeps each PR reviewable and
--      each rollback trivial (re-create the old policy text from git).
--
-- WHAT TO TEST AFTER EACH BATCH (behavior must be unchanged)
-- ---------------------------------------------------------
--   * As an ANON user: public talent pages still render (media_assets /
--     talent_profile_taxonomy public-visibility paths), and nothing private
--     leaks.
--   * As a TALENT user: can read/update only own talent_profiles, own media,
--     own taxonomy; cannot see another talent's private rows.
--   * As a CLIENT user: can read/insert own inquiries + inquiry_messages
--     (private thread), see own client_reviews, cannot read others'.
--   * As a COORDINATOR / agency staff: inquiry_offers + media staff paths
--     still work for in-tenant rows, still blocked cross-tenant.
--   * Booking money paths: booking_transactions payer/receiver reads still
--     scoped to the right user.
--   * Run the app's existing RLS / messaging integration tests + a prod
--     smoke (`cd web && npm run deploy:smoke`) after the batch lands.
--   * EXPLAIN a representative query before/after on a hot table to confirm
--     the per-row `auth.uid()` InitPlan collapses to one evaluation.
--
-- ROLLBACK: each policy's pre-change text is in git history / the query in
-- step 1 above; re-CREATE the original to revert. The change is reversible
-- and carries no data migration.
-- =====================================================================


-- ---------------------------------------------------------------------
-- SAMPLE 1 — user_prefs (simple self-equality; SELECT/INSERT/UPDATE)
-- Pattern: bare `auth.uid() = user_id`. The most common flagged shape.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "user_prefs_self_select" ON public.user_prefs;
CREATE POLICY "user_prefs_self_select" ON public.user_prefs
  FOR SELECT TO public
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_prefs_self_insert" ON public.user_prefs;
CREATE POLICY "user_prefs_self_insert" ON public.user_prefs
  FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_prefs_self_update" ON public.user_prefs;
CREATE POLICY "user_prefs_self_update" ON public.user_prefs
  FOR UPDATE TO public
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------
-- SAMPLE 2 — talent_profiles (self-equality + a wrapper fn left intact)
-- Note: is_agency_staff() is NOT wrapped — it is a function, not flagged.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "talent_select_own" ON public.talent_profiles;
CREATE POLICY "talent_select_own" ON public.talent_profiles
  FOR SELECT TO public
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "talent_insert_self" ON public.talent_profiles;
CREATE POLICY "talent_insert_self" ON public.talent_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "talent_update_own" ON public.talent_profiles;
CREATE POLICY "talent_update_own" ON public.talent_profiles
  FOR UPDATE TO public
  USING ((user_id = (select auth.uid())) OR is_agency_staff())
  WITH CHECK ((user_id = (select auth.uid())) OR is_agency_staff());


-- ---------------------------------------------------------------------
-- SAMPLE 3 — client_reviews (INSERT WITH CHECK + combined UPDATE)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "client_reviews_author_insert" ON public.client_reviews;
CREATE POLICY "client_reviews_author_insert" ON public.client_reviews
  FOR INSERT TO public
  WITH CHECK (author_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "client_reviews_author_update" ON public.client_reviews;
CREATE POLICY "client_reviews_author_update" ON public.client_reviews
  FOR UPDATE TO public
  USING (author_user_id = (select auth.uid()))
  WITH CHECK (author_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "client_reviews_subject_select" ON public.client_reviews;
CREATE POLICY "client_reviews_subject_select" ON public.client_reviews
  FOR SELECT TO public
  USING ((client_user_id = (select auth.uid())) AND (status = 'published'::text));


-- ---------------------------------------------------------------------
-- SAMPLE 4 — inquiries (INSERT WITH CHECK with OR, SELECT, nested EXISTS)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "inquiries_insert_client" ON public.inquiries;
CREATE POLICY "inquiries_insert_client" ON public.inquiries
  FOR INSERT TO public
  WITH CHECK ((client_user_id = (select auth.uid())) OR (client_user_id IS NULL));

DROP POLICY IF EXISTS "inquiries_select_own" ON public.inquiries;
CREATE POLICY "inquiries_select_own" ON public.inquiries
  FOR SELECT TO public
  USING (client_user_id = (select auth.uid()));

-- auth.uid() inside a correlated EXISTS still re-evaluates per outer row;
-- wrapping it in a subselect collapses it to one InitPlan evaluation.
DROP POLICY IF EXISTS "inquiries_select_talent_participant" ON public.inquiries;
CREATE POLICY "inquiries_select_talent_participant" ON public.inquiries
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1
    FROM (inquiry_participants p
      JOIN talent_profiles tp ON ((tp.id = p.talent_profile_id)))
    WHERE ((p.inquiry_id = inquiries.id)
      AND (p.role = 'talent'::inquiry_participant_role)
      AND (tp.user_id = (select auth.uid())))
  ));


-- ---------------------------------------------------------------------
-- SAMPLE 5 — inquiry_messages: private-thread SELECT (nested EXISTS x2)
-- High-traffic messaging hot path. Two auth.uid() refs, both wrapped.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "inquiry_messages_private_select_participant_v2" ON public.inquiry_messages;
CREATE POLICY "inquiry_messages_private_select_participant_v2" ON public.inquiry_messages
  FOR SELECT TO public
  USING (
    (thread_type = 'private'::inquiry_thread_type)
    AND (
      EXISTS (
        SELECT 1
        FROM inquiry_participants p
        WHERE ((p.inquiry_id = inquiry_messages.inquiry_id)
          AND (p.user_id = (select auth.uid()))
          AND (p.role = ANY (ARRAY['client'::inquiry_participant_role, 'coordinator'::inquiry_participant_role]))
          AND (p.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status])))
      )
      OR EXISTS (
        SELECT 1
        FROM inquiries i
        WHERE ((i.id = inquiry_messages.inquiry_id)
          AND (i.client_user_id = (select auth.uid())))
      )
    )
  );


-- ---------------------------------------------------------------------
-- SAMPLE 6 — inquiry_messages: private-thread INSERT WITH CHECK
-- Direct sender check + nested EXISTS x2. Three auth.uid() refs wrapped.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "inquiry_messages_private_insert_participant_v2" ON public.inquiry_messages;
CREATE POLICY "inquiry_messages_private_insert_participant_v2" ON public.inquiry_messages
  FOR INSERT TO public
  WITH CHECK (
    (thread_type = 'private'::inquiry_thread_type)
    AND (sender_user_id = (select auth.uid()))
    AND (
      EXISTS (
        SELECT 1
        FROM inquiry_participants p
        WHERE ((p.inquiry_id = inquiry_messages.inquiry_id)
          AND (p.user_id = (select auth.uid()))
          AND (p.role = ANY (ARRAY['client'::inquiry_participant_role, 'coordinator'::inquiry_participant_role]))
          AND (p.status = ANY (ARRAY['invited'::inquiry_participant_status, 'active'::inquiry_participant_status])))
      )
      OR EXISTS (
        SELECT 1
        FROM inquiries i
        WHERE ((i.id = inquiry_messages.inquiry_id)
          AND (i.client_user_id = (select auth.uid())))
      )
    )
  );


-- ---------------------------------------------------------------------
-- SAMPLE 7 — inquiry_messages: UPDATE (USING + WITH CHECK both flagged)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "inquiry_messages_update_own" ON public.inquiry_messages;
CREATE POLICY "inquiry_messages_update_own" ON public.inquiry_messages
  FOR UPDATE TO public
  USING ((sender_user_id = (select auth.uid())) AND (deleted_at IS NULL))
  WITH CHECK (sender_user_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- SAMPLE 8 — inquiry_offers: coordinator UPDATE (wrapper fn + EXISTS)
-- is_agency_staff() left as-is; only the inner auth.uid() is wrapped.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "inquiry_offers_coordinator_update" ON public.inquiry_offers;
CREATE POLICY "inquiry_offers_coordinator_update" ON public.inquiry_offers
  FOR UPDATE TO public
  USING (
    is_agency_staff()
    OR EXISTS (
      SELECT 1
      FROM inquiry_participants p
      WHERE ((p.inquiry_id = inquiry_offers.inquiry_id)
        AND (p.user_id = (select auth.uid()))
        AND (p.role = 'coordinator'::inquiry_participant_role)
        AND (p.status = 'active'::inquiry_participant_status))
    )
  )
  WITH CHECK (
    is_agency_staff()
    OR EXISTS (
      SELECT 1
      FROM inquiry_participants p
      WHERE ((p.inquiry_id = inquiry_offers.inquiry_id)
        AND (p.user_id = (select auth.uid()))
        AND (p.role = 'coordinator'::inquiry_participant_role)
        AND (p.status = 'active'::inquiry_participant_status))
    )
  );


-- ---------------------------------------------------------------------
-- SAMPLE 9 — media_assets: public read path (largest table, ALL/SELECT)
-- Multiple EXISTS branches; every bare auth.uid() wrapped, the public
-- visibility branch (no auth.uid) untouched. is_* wrappers — none here,
-- all checks are inline EXISTS, so each auth.uid() is wrapped.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "media_select" ON public.media_assets;
CREATE POLICY "media_select" ON public.media_assets
  FOR SELECT TO public
  USING (
    (deleted_at IS NULL)
    AND (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = (select auth.uid())) AND (p.app_role = 'super_admin'::app_role))
      )
      OR EXISTS (
        SELECT 1 FROM agency_memberships m
        WHERE ((m.profile_id = (select auth.uid()))
          AND (m.tenant_id = media_assets.tenant_id)
          AND (m.status = ANY (ARRAY['active'::text, 'pending_acceptance'::text])))
      )
      OR EXISTS (
        SELECT 1 FROM talent_profiles t
        WHERE ((t.id = media_assets.owner_talent_profile_id)
          AND (t.user_id = (select auth.uid())))
      )
      OR EXISTS (
        SELECT 1 FROM talent_profiles t
        WHERE ((t.id = media_assets.owner_talent_profile_id)
          AND (t.workflow_status = 'approved'::profile_workflow_status)
          AND (t.visibility = 'public'::visibility)
          AND (media_assets.approval_state = 'approved'::media_approval_state)
          AND (media_assets.variant_kind <> 'original'::media_variant_kind))
      )
    )
  );


-- ---------------------------------------------------------------------
-- SAMPLE 10 — talent_profile_taxonomy: public-visibility SELECT
-- (deeply nested; mixes a wrapper fn talent_is_site_visible_anywhere()
--  and is_staff_of_tenant() — both LEFT INTACT — with one bare auth.uid())
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "talent_taxonomy_select" ON public.talent_profile_taxonomy;
CREATE POLICY "talent_taxonomy_select" ON public.talent_profile_taxonomy
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1
    FROM talent_profiles t
    WHERE ((t.id = talent_profile_taxonomy.talent_profile_id)
      AND (t.deleted_at IS NULL)
      AND (
        ((t.is_publicly_hidden = false) AND talent_is_site_visible_anywhere(t.id))
        OR (t.user_id = (select auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM agency_talent_roster atr
          WHERE ((atr.talent_profile_id = t.id) AND is_staff_of_tenant(atr.tenant_id))
        )
      ))
  ));


-- =====================================================================
-- END OF SAMPLES. The remaining flagged policies (169 total, 93 tables)
-- follow the identical mechanical transform. Generate + review them
-- per-table using the ROLLOUT query above before applying.
-- =====================================================================
