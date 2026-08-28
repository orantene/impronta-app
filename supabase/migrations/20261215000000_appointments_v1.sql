-- Appointments v1 — resource profiles, booking hours, firm-hold exclusion.
--
-- WHY
-- ---
-- Business workspaces (salon / clinic / barbershop) book STAFF and CHAIRS, not
-- people-directory talent. Every live calendar primitive already keys on
-- talent_profile_id, so those resources ride the talent machinery as
-- profile_kind='resource': user_id NULL, hidden from every public surface,
-- creatable only on workspace_type='business' (enforced in app, PR-5).
--
-- The same migration lights the TIME dimension:
--   * talent_booking_hours — weekly windows + tz + buffers (slots computed,
--     never stored).
--   * btree_gist exclusion on talent_holds so two firm holds cannot overlap
--     (SQLSTATE 23P01). The constraint cannot see expires_at, so expired firm
--     holds MUST be deleted: a BEFORE INSERT lazy reap + a 5-min cron
--     (expire-calendar-holds, same PR). Shipping the constraint without the
--     reaper deadlocks slots.
--
-- Leakage predicates are release blockers. This file:
--   * skips resource rows in ensure_talent_in_platform_hub
--   * forces talent_compute_publicly_listed false for resources
--   * rebuilds talent_discover_index with is_starter_seed AND profile_kind
--     (the 20261111100000 rebuild dropped is_starter_seed; restore it)
--   * refuses claim_talent_profile on resource rows
--
-- App-side mirrors live in resource-profile-leakage.static.test.ts.

BEGIN;

-- ─── 1. profile_kind ────────────────────────────────────────────────────────

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS profile_kind text NOT NULL DEFAULT 'person';

ALTER TABLE public.talent_profiles
  DROP CONSTRAINT IF EXISTS talent_profiles_profile_kind_check;

ALTER TABLE public.talent_profiles
  ADD CONSTRAINT talent_profiles_profile_kind_check
  CHECK (profile_kind IN ('person', 'resource'));

COMMENT ON COLUMN public.talent_profiles.profile_kind IS
  'person = a real talent (directory / discover / /t/ pages). resource = a bookable staff/chair on a business workspace; hidden from every public surface; user_id stays NULL.';

CREATE INDEX IF NOT EXISTS idx_talent_profiles_resource
  ON public.talent_profiles (id)
  WHERE profile_kind = 'resource';

-- ─── 2. Hub auto-enroll skips resources (mirrors is_starter_seed) ───────────

CREATE OR REPLACE FUNCTION public.ensure_talent_in_platform_hub()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  hub_id uuid;
begin
  begin
    if new.deleted_at is not null then
      return new;
    end if;
    if new.workflow_status not in ('approved', 'published') then
      return new;
    end if;
    -- Onboarding template content belongs to its own workspace storefront,
    -- not the platform-wide directory.
    if coalesce(new.is_starter_seed, false) then
      return new;
    end if;
    -- Resource profiles (staff/chairs) are never people in the hub directory.
    if coalesce(new.profile_kind, 'person') = 'resource' then
      return new;
    end if;

    select a.id into hub_id
    from public.agencies a
    where a.kind = 'hub'
      and a.plan_tier = 'network'
      and a.status = 'active'
    order by a.created_at asc
    limit 1;

    if hub_id is null then
      return new;
    end if;

    if not exists (
      select 1
      from public.agency_talent_roster r
      where r.tenant_id = hub_id
        and r.talent_profile_id = new.id
        and r.status in ('pending', 'active', 'inactive')
    ) then
      insert into public.agency_talent_roster
        (tenant_id, talent_profile_id, source_type, status,
         agency_visibility, talent_site_hidden, is_primary)
      values
        (hub_id, new.id, 'platform_assigned', 'active',
         'site_visible', false, false);
    end if;
  exception when others then
    null;
  end;

  return new;
end;
$function$;

-- ─── 3. Public-listing predicate never lists resources ──────────────────────

CREATE OR REPLACE FUNCTION public.talent_compute_publicly_listed(p_talent_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM talent_profiles tp
     WHERE tp.id = p_talent_profile_id
       AND tp.deleted_at IS NULL
       AND COALESCE(tp.is_test_account, false) = false
       AND COALESCE(tp.is_publicly_hidden, false) = false
       AND COALESCE(tp.profile_kind, 'person') = 'person'
       AND (
         EXISTS (
           SELECT 1
             FROM agency_talent_roster r
             JOIN agencies a ON a.id = r.tenant_id
            WHERE r.talent_profile_id = tp.id
              AND r.status = ANY (ARRAY['active'::text, 'pending'::text])
              AND a.status <> ALL (ARRAY['archived'::text, 'suspended'::text])
              AND r.agency_visibility = ANY (ARRAY['site_visible'::text, 'featured'::text])
         )
         OR (
           NOT EXISTS (
             SELECT 1
               FROM agency_talent_roster r0
              WHERE r0.talent_profile_id = tp.id
                AND r0.status = ANY (ARRAY['active'::text, 'pending'::text])
           )
           AND tp.workflow_status = ANY (
             ARRAY['approved'::profile_workflow_status, 'published'::profile_workflow_status]
           )
         )
       )
  );
$$;

DROP TRIGGER IF EXISTS talent_profiles_publicly_listed ON public.talent_profiles;
CREATE TRIGGER talent_profiles_publicly_listed
  AFTER UPDATE OF workflow_status, visibility, is_test_account, is_publicly_hidden, deleted_at, profile_kind
  ON public.talent_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_talent_profiles_publicly_listed();

-- ─── 4. Claim RPC refuses resource profiles ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_talent_profile(
  p_invitation_id uuid,
  p_email         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid         uuid := auth.uid();
  v_inv       record;
  v_profile   record;
  v_existing  uuid;
  v_roster    record;
  v_plan      text;
  v_exclusive boolean := false;
  v_email_ok  boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_inv FROM public.talent_claim_invitations WHERE id = p_invitation_id;
  IF v_inv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  END IF;
  IF v_inv.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_revoked');
  END IF;
  IF v_inv.redeemed_at IS NOT NULL THEN
    IF v_inv.redeemed_by_user_id = uid THEN
      RETURN jsonb_build_object('ok', true, 'reason', 'already_redeemed_by_you',
        'talent_profile_id', v_inv.talent_profile_id, 'tenant_id', v_inv.tenant_id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_already_redeemed');
  END IF;
  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_expired');
  END IF;

  IF v_inv.invited_email IS NOT NULL THEN
    v_email_ok := lower(trim(coalesce(p_email, ''))) = lower(trim(v_inv.invited_email));
    IF NOT v_email_ok THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'email_mismatch');
    END IF;
  END IF;

  SELECT * INTO v_profile FROM public.talent_profiles WHERE id = v_inv.talent_profile_id;
  IF v_profile IS NULL OR v_profile.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_unavailable');
  END IF;

  -- Resource profiles are staff/chairs, not people. Never attach a login.
  IF coalesce(v_profile.profile_kind, 'person') = 'resource' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'resource_profile');
  END IF;

  IF v_profile.user_id = uid THEN
    UPDATE public.talent_claim_invitations
       SET redeemed_at = now(), redeemed_by_user_id = uid
     WHERE id = p_invitation_id;
    RETURN jsonb_build_object('ok', true, 'reason', 'already_yours',
      'talent_profile_id', v_profile.id, 'tenant_id', v_inv.tenant_id);
  END IF;

  IF v_profile.user_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_already_claimed');
  END IF;

  SELECT id INTO v_existing
  FROM public.talent_profiles
  WHERE user_id = uid AND deleted_at IS NULL
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'claimer_has_profile',
      'existing_profile_id', v_existing);
  END IF;

  UPDATE public.talent_profiles
     SET user_id = uid, claimed_at = now(), invitation_email = NULL
   WHERE id = v_profile.id;

  UPDATE public.talent_claim_invitations
     SET redeemed_at = now(), redeemed_by_user_id = uid
   WHERE id = p_invitation_id;

  SELECT * INTO v_roster
  FROM public.agency_talent_roster
  WHERE tenant_id = v_inv.tenant_id
    AND talent_profile_id = v_profile.id
    AND removed_at IS NULL
  LIMIT 1;

  SELECT plan_tier INTO v_plan FROM public.agencies WHERE id = v_inv.tenant_id;

  IF v_roster.id IS NOT NULL
     AND coalesce(v_plan, '') IN ('studio', 'agency', 'network', 'hub-network')
  THEN
    IF v_roster.exclusivity_status = 'auto_assigned' THEN
      UPDATE public.agency_talent_roster
         SET exclusivity_status = 'confirmed', exclusivity_confirmed_at = now()
       WHERE id = v_roster.id;
    ELSIF v_roster.exclusivity_confirmed_at IS NULL THEN
      UPDATE public.agency_talent_roster
         SET exclusivity_confirmed_at = now()
       WHERE id = v_roster.id;
    END IF;
    v_exclusive := coalesce(v_roster.is_primary, false);
  END IF;

  INSERT INTO public.talent_workflow_events (talent_profile_id, tenant_id, event_type, payload, actor_user_id)
  VALUES (v_profile.id, v_inv.tenant_id, 'claim.accepted',
          jsonb_build_object('invitation_id', p_invitation_id, 'exclusive_confirmed', v_exclusive), uid);

  RETURN jsonb_build_object(
    'ok', true, 'reason', 'claimed',
    'talent_profile_id', v_profile.id,
    'tenant_id', v_inv.tenant_id,
    'exclusive_confirmed', v_exclusive,
    'plan_tier', v_plan);
END;
$$;

-- Belt: a raw UPDATE cannot attach a login to a resource row either.
CREATE OR REPLACE FUNCTION public.talent_profiles_refuse_resource_claim()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.profile_kind = 'resource' AND NEW.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'RESOURCE_PROFILE_NOT_CLAIMABLE'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS talent_profiles_refuse_resource_claim ON public.talent_profiles;
CREATE TRIGGER talent_profiles_refuse_resource_claim
  BEFORE INSERT OR UPDATE OF user_id, profile_kind
  ON public.talent_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.talent_profiles_refuse_resource_claim();

-- ─── 5. Discover matview: restore starter-seed + add profile_kind ───────────

DROP MATERIALIZED VIEW IF EXISTS public.talent_discover_index CASCADE;

CREATE MATERIALIZED VIEW public.talent_discover_index AS
WITH live_roster AS (
  SELECT r.talent_profile_id,
         r.tenant_id,
         r.is_primary,
         r.added_at,
         a.display_name,
         a.plan_tier
    FROM agency_talent_roster r
    JOIN agencies a ON a.id = r.tenant_id
   WHERE r.status = ANY (ARRAY['active'::text, 'pending'::text])
     AND a.status <> ALL (ARRAY['archived'::text, 'suspended'::text])
), primary_roster AS (
  SELECT DISTINCT ON (r.talent_profile_id) r.talent_profile_id,
    r.tenant_id AS agency_tenant_id,
    r.display_name AS agency_name,
    r.plan_tier AS agency_plan_tier,
    r.is_primary = true AND (r.plan_tier = ANY (ARRAY['studio'::text, 'agency'::text, 'network'::text, 'hub-network'::text])) AS is_exclusive
   FROM live_roster r
  ORDER BY r.talent_profile_id, r.is_primary DESC, r.added_at
), primary_category AS (
  SELECT DISTINCT ON (tpt.talent_profile_id) tpt.talent_profile_id,
    tt.name_i18n ->> 'en'::text AS category_label,
    tt.slug AS category_slug
   FROM talent_profile_taxonomy tpt
     JOIN taxonomy_terms tt ON tt.id = tpt.taxonomy_term_id
  WHERE tpt.relationship_type = 'primary_role'::text AND tt.kind = 'talent_type'::taxonomy_kind
  ORDER BY tpt.talent_profile_id, tpt.created_at
), trust_counts AS (
  SELECT b.talent_profile_id,
    count(*)::integer AS verified_badge_count
   FROM talent_profile_trust_badges b
  WHERE b.status = 'verified'::text AND b.scope = 'platform'::text AND (b.expires_at IS NULL OR b.expires_at > now())
  GROUP BY b.talent_profile_id
)
SELECT tp.id,
    tp.display_name,
    tp.first_name,
    tp.last_name,
    tp.profile_code,
    tp.home_country_text,
    tp.home_city_text,
    tp.residence_city_id,
    tp.workflow_status,
    pr.agency_tenant_id,
    pr.agency_name,
    pr.agency_plan_tier,
    COALESCE(pr.is_exclusive, false) AS is_exclusive,
    pc.category_label,
    pc.category_slug,
    avail.next_available_date,
    avail.available_days_in_next_30,
    avail.availability_dots_14d,
    CASE
        WHEN COALESCE(tc.verified_badge_count, 0) >= 3 THEN 'gold'::text
        WHEN COALESCE(tc.verified_badge_count, 0) = 2 THEN 'silver'::text
        WHEN COALESCE(tc.verified_badge_count, 0) = 1 THEN 'verified'::text
        ELSE 'basic'::text
    END AS trust_tier,
    tp.rating_avg,
    tp.rating_count,
    tp.would_book_again_pct,
    now() AS index_refreshed_at
   FROM talent_profiles tp
     LEFT JOIN primary_roster pr ON pr.talent_profile_id = tp.id
     LEFT JOIN primary_category pc ON pc.talent_profile_id = tp.id
     LEFT JOIN trust_counts tc ON tc.talent_profile_id = tp.id
     LEFT JOIN LATERAL compute_talent_availability_snapshot(tp.id) avail(next_available_date, available_days_in_next_30, availability_dots_14d) ON true
  WHERE tp.is_discoverable = true
    AND tp.is_publicly_listed = true
    AND (tp.workflow_status = ANY (ARRAY['approved'::profile_workflow_status, 'published'::profile_workflow_status]))
    AND tp.is_test_account = false
    AND COALESCE(tp.is_starter_seed, false) = false
    AND COALESCE(tp.profile_kind, 'person') = 'person'
    AND (
      pr.talent_profile_id IS NOT NULL
      OR NOT EXISTS (
        SELECT 1 FROM agency_talent_roster r0
         WHERE r0.talent_profile_id = tp.id
           AND r0.status = ANY (ARRAY['active'::text, 'pending'::text])
      )
    )
    AND (
      pr.agency_tenant_id IS NULL
      OR EXISTS (
        SELECT 1 FROM agencies a2
         WHERE a2.id = pr.agency_tenant_id
           AND a2.discover_exposure_enabled = true
      )
    );

CREATE UNIQUE INDEX talent_discover_index_id_uniq
  ON public.talent_discover_index (id);
CREATE INDEX talent_discover_index_country
  ON public.talent_discover_index (home_country_text);
CREATE INDEX talent_discover_index_trust_tier
  ON public.talent_discover_index (trust_tier);
CREATE INDEX talent_discover_index_category
  ON public.talent_discover_index (category_slug);
CREATE INDEX talent_discover_index_agency
  ON public.talent_discover_index (agency_tenant_id);

GRANT SELECT ON public.talent_discover_index TO anon, authenticated;
GRANT ALL ON public.talent_discover_index TO service_role;

COMMENT ON MATERIALIZED VIEW public.talent_discover_index IS
  'Denormalized Discover catalog row per discoverable talent. Excludes is_test_account, dead-workspace-only rosters, starter seeds, and profile_kind=resource. Honours agencies.discover_exposure_enabled and talent_profiles.is_publicly_listed.';

-- ─── 6. talent_booking_hours ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.talent_booking_hours (
  talent_profile_id UUID PRIMARY KEY
    REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL
    REFERENCES public.agencies(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  weekly JSONB NOT NULL DEFAULT '{}'::jsonb,
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  slot_minutes INTEGER NOT NULL DEFAULT 30
    CHECK (slot_minutes > 0 AND slot_minutes <= 480),
  buffer_before_min INTEGER NOT NULL DEFAULT 0
    CHECK (buffer_before_min >= 0 AND buffer_before_min <= 240),
  buffer_after_min INTEGER NOT NULL DEFAULT 0
    CHECK (buffer_after_min >= 0 AND buffer_after_min <= 240),
  min_notice_min INTEGER NOT NULL DEFAULT 120
    CHECK (min_notice_min >= 0),
  horizon_days INTEGER NOT NULL DEFAULT 60
    CHECK (horizon_days > 0 AND horizon_days <= 365),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.talent_booking_hours IS
  'Per-talent (or resource) weekly hours + tz + buffers. Slots are computed, never stored.';

CREATE INDEX IF NOT EXISTS idx_talent_booking_hours_tenant
  ON public.talent_booking_hours (tenant_id);

ALTER TABLE public.talent_booking_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_booking_hours_select_self ON public.talent_booking_hours;
CREATE POLICY talent_booking_hours_select_self ON public.talent_booking_hours
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_profile_id AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS talent_booking_hours_write_self ON public.talent_booking_hours;
CREATE POLICY talent_booking_hours_write_self ON public.talent_booking_hours
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_profile_id AND tp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_profile_id AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS talent_booking_hours_staff ON public.talent_booking_hours;
CREATE POLICY talent_booking_hours_staff ON public.talent_booking_hours
  FOR ALL TO authenticated
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

CREATE OR REPLACE FUNCTION public.talent_booking_hours_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS talent_booking_hours_touch ON public.talent_booking_hours;
CREATE TRIGGER talent_booking_hours_touch
  BEFORE UPDATE ON public.talent_booking_hours
  FOR EACH ROW
  EXECUTE FUNCTION public.talent_booking_hours_touch();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talent_booking_hours TO authenticated;
GRANT ALL ON public.talent_booking_hours TO service_role;

-- ─── 7. Firm-hold exclusion + reaper ────────────────────────────────────────
-- Constraint cannot see expires_at, so expired firm holds must be deleted
-- before insert (lazy) and on a 5-min cron (expire-calendar-holds).

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Reaper index: cron DELETE WHERE expires_at < now().
CREATE INDEX IF NOT EXISTS idx_talent_holds_expires_at
  ON public.talent_holds (expires_at)
  WHERE expires_at IS NOT NULL;

-- Unique inquiry_id so convert enrichment can upsert the talent_bookings
-- mirror idempotently (PR-4). Zero writers today, so no collision.
CREATE UNIQUE INDEX IF NOT EXISTS talent_bookings_inquiry_id_uniq
  ON public.talent_bookings (inquiry_id)
  WHERE inquiry_id IS NOT NULL;

-- Lazy reap: drop expired holds for this talent before a new insert so the
-- gist constraint cannot deadlock a slot behind a lapsed firm hold.
CREATE OR REPLACE FUNCTION public.talent_holds_reap_expired()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.talent_holds
   WHERE talent_profile_id = NEW.talent_profile_id
     AND expires_at IS NOT NULL
     AND expires_at < now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS talent_holds_reap_expired_bi ON public.talent_holds;
CREATE TRIGGER talent_holds_reap_expired_bi
  BEFORE INSERT ON public.talent_holds
  FOR EACH ROW
  EXECUTE FUNCTION public.talent_holds_reap_expired();

-- Drop expired rows now so ADD CONSTRAINT is not blocked by ghosts.
DELETE FROM public.talent_holds
 WHERE expires_at IS NOT NULL
   AND expires_at < now();

ALTER TABLE public.talent_holds
  DROP CONSTRAINT IF EXISTS talent_holds_firm_no_overlap;

ALTER TABLE public.talent_holds
  ADD CONSTRAINT talent_holds_firm_no_overlap
  EXCLUDE USING gist (
    talent_profile_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (hold_strength = 'firm');

COMMIT;
