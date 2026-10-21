-- TUL-1442: "how you work with people" (one question at onboarding that presets the hub settings).
--
-- HELD in _pending_pm. Additive and idempotent: one new table, nothing existing changes.
-- The app degrades without it (the question still shows; saving answers "unavailable").
--
--   workspace_hub_defaults   one row per workspace: the chosen work model (the same five
--                            values as workspace_talent_terms.work_model) and the preset it
--                            set up (who gets requests, who sees the chat, price shown, split,
--                            safety officer) as plain columns, so Settings can show and edit them.
--
-- Writes go through the service role after the app checks the workspace team role; there is NO
-- write policy for users. Reads are for the workspace's own staff.
--
-- Rollback (only if nothing depends on it yet):
--   DROP TABLE IF EXISTS public.workspace_hub_defaults;

BEGIN;

CREATE TABLE IF NOT EXISTS public.workspace_hub_defaults (
  tenant_id        uuid        PRIMARY KEY REFERENCES public.agencies(id) ON DELETE CASCADE,
  work_model       text        NOT NULL CHECK (work_model IN (
                                 'coordinator_agency','open_network','team_studio',
                                 'rental_studio','friends_collective')),
  requests_go_to   text        NOT NULL CHECK (requests_go_to IN ('workspace','talent')),
  chat_seen_by     text        NOT NULL CHECK (chat_seen_by IN ('workspace','talent')),
  price_shown      text        NOT NULL CHECK (price_shown IN ('talent_price','talent_plus_margin','workspace_price')),
  split_kind       text        NOT NULL CHECK (split_kind IN ('percent','margin','all','rent')),
  split_bps        integer     NULL CHECK (split_bps IS NULL OR (split_bps >= 0 AND split_bps <= 9000)),
  safety_officer   boolean     NOT NULL DEFAULT false,
  chosen_by        uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  chosen_at        timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_hub_defaults_split_bps_shape CHECK (
    (split_kind IN ('percent','margin') AND split_bps IS NOT NULL) OR
    (split_kind IN ('all','rent') AND split_bps IS NULL))
);

ALTER TABLE public.workspace_hub_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_hub_defaults_staff_read ON public.workspace_hub_defaults;
CREATE POLICY workspace_hub_defaults_staff_read ON public.workspace_hub_defaults
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

COMMIT;
