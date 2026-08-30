-- P3 — per-relationship commission rung.
-- booking_override > relationship_override > tenant_override > plan_tier > platform_default
-- Does NOT change workspace_commission_overrides PK.
-- Does NOT add offering_request to hub-sourced channels.

CREATE TABLE public.workspace_talent_commission_overrides (
  tenant_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_profile_id uuid NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  platform_take_bps int NULL,
  platform_take_floor_cents int NULL,
  workspace_take_bps int NULL,
  requested_platform_take_bps int NULL,
  requested_platform_take_floor_cents int NULL,
  requested_workspace_take_bps int NULL,
  requested_note text NULL,
  requested_at timestamptz NULL,
  requested_by_user_id uuid NULL REFERENCES public.profiles(id),
  request_status text NULL,
  reviewed_at timestamptz NULL,
  reviewed_by_user_id uuid NULL REFERENCES public.profiles(id),
  review_note text NULL,
  override_note text NOT NULL DEFAULT '',
  set_by_user_id uuid NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, talent_profile_id),
  CONSTRAINT workspace_talent_commission_overrides_bps_range
    CHECK (platform_take_bps IS NULL OR (platform_take_bps >= 0 AND platform_take_bps <= 5000)),
  CONSTRAINT workspace_talent_commission_overrides_ws_bps_range
    CHECK (workspace_take_bps IS NULL OR (workspace_take_bps >= 0 AND workspace_take_bps <= 10000)),
  CONSTRAINT workspace_talent_commission_overrides_request_status
    CHECK (request_status IS NULL OR request_status IN ('open', 'approved', 'denied', 'withdrawn'))
);

COMMENT ON TABLE public.workspace_talent_commission_overrides IS
  'Per-workspace-talent commission rates. Fairness lever for own-page bookings while the workspace stays seller of record.';

ALTER TABLE public.workspace_talent_commission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_talent_commission_overrides_read
  ON public.workspace_talent_commission_overrides
  FOR SELECT USING (
    public.is_platform_admin()
    OR public.is_staff_of_tenant(tenant_id)
  );

CREATE POLICY workspace_talent_commission_overrides_write
  ON public.workspace_talent_commission_overrides
  FOR ALL USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY workspace_talent_commission_overrides_request_insert
  ON public.workspace_talent_commission_overrides
  FOR INSERT WITH CHECK (
    public.is_staff_of_tenant(tenant_id)
    AND platform_take_bps IS NULL
    AND platform_take_floor_cents IS NULL
    AND workspace_take_bps IS NULL
    AND requested_platform_take_bps IS NOT NULL
    AND (request_status IS NULL OR request_status = 'open')
  );

CREATE POLICY workspace_talent_commission_overrides_request_update
  ON public.workspace_talent_commission_overrides
  FOR UPDATE USING (
    public.is_staff_of_tenant(tenant_id)
    AND request_status = 'open'
  ) WITH CHECK (
    public.is_staff_of_tenant(tenant_id)
    AND (request_status IS NULL OR request_status IN ('open', 'withdrawn'))
  );

ALTER TABLE public.booking_commission_snapshot
  DROP CONSTRAINT IF EXISTS booking_commission_snapshot_resolved_from_check;

ALTER TABLE public.booking_commission_snapshot
  ADD CONSTRAINT booking_commission_snapshot_resolved_from_check
  CHECK (resolved_from IN (
    'platform_default',
    'plan_tier',
    'tenant_override',
    'relationship_override',
    'booking_override'
  ));
