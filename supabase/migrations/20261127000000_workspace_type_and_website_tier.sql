-- ============================================================================
-- Workspace TYPE axis + `website` plan tier — schema prep only (2026-08-20)
-- ============================================================================
--
-- Two independent product additions land here as pure schema. NOTHING reads
-- or writes any of this yet — later PRs wire the TS catalog, the plan
-- resolver, and the admin surfaces. This migration is deliberately
-- behaviour-neutral so it can ship ahead of the code.
--
--   (a) `agencies.workspace_type` — a new axis ORTHOGONAL to plan_tier.
--       plan_tier answers "how much capacity did they pay for"; workspace_type
--       answers "what kind of business is this". A `business` workspace on the
--       `agency` tier is legal; so is a `talent` workspace on `website`.
--
--   (b) `website` — a $12/mo roster-off tier for local businesses. Every
--       plan-key CHECK constraint in the billing spine has to accept it
--       BEFORE any code can write it, or the first upgrade 500s.
--
-- ─── Why the constraint names are spelled out literally ─────────────────────
-- All five CHECKs below were created INLINE on the column, so Postgres
-- auto-generated their names. They were read off pg_constraint on the live
-- project (pluhdapdnuiulvxmyspd) on 2026-08-20 rather than guessed --- note
-- that plan_tier_caps breaks the `<table>_<column>_check` pattern and is
-- actually `plan_tier_caps_plan_chk`. Dropping by the VERIFIED name and
-- re-adding under the SAME name keeps the names stable, so the next
-- migration that widens these can use the identical DROP/ADD pair.
--
-- Re-runnable: every statement is IF EXISTS / IF NOT EXISTS / ON CONFLICT.

BEGIN;

-- ─── (a) agencies.workspace_type ─────────────────────────────────────────────
-- Defaults to 'talent' so all existing workspaces keep exactly today's
-- behaviour. NOT NULL + DEFAULT is safe on any table size in modern Postgres
-- (no table rewrite --- the default is stored in the catalog).
--
-- NOTE: `ADD COLUMN IF NOT EXISTS` makes the WHOLE clause a no-op if the
-- column already exists, inline CHECK included. That is intentional here ---
-- on a re-run the column and its `agencies_workspace_type_check` constraint
-- are already in place from the first run.

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS workspace_type TEXT NOT NULL DEFAULT 'talent'
    CHECK (workspace_type IN ('talent', 'business'));

COMMENT ON COLUMN public.agencies.workspace_type IS
  'What KIND of workspace this is --- orthogonal to plan_tier, which only sets capacity. '
  '''talent'' (default, every workspace today) = roster-driven: an agency, studio, or salon '
  'that represents talent, so the roster, talent seats, and roster-backed inquiry routing are '
  'all live. '
  '''business'' = website-only local business (restaurant, gym, clinic). Roster surfaces are '
  'HIDDEN --- no roster tab, no talent seats, no roster-backed booking --- but the workspace is '
  'NOT read-only: it still gets the full site builder, and it can still book talent AS A CLIENT '
  'and take payments. Set independently of plan_tier; the ''website'' tier is the natural '
  'pairing but is not enforced in either direction.';

-- ─── (b) plan-key CHECKs: accept 'website' ──────────────────────────────────
-- Verified live definitions before this migration --- all five allowed exactly
-- ('free','studio','agency','network').

-- agencies.plan_tier
-- Created in 20260630120000_saas_agencies_plan_tier_seats.sql.
-- ALSO adds 'legacy': the TS catalog (web/src/lib/access/plan-catalog.ts,
-- PLAN_KEYS) has shipped a workspace-audience 'legacy' plan this constraint
-- has always rejected. Widening it here closes that latent write failure.
ALTER TABLE public.agencies
  DROP CONSTRAINT IF EXISTS agencies_plan_tier_check;
ALTER TABLE public.agencies
  ADD CONSTRAINT agencies_plan_tier_check
  CHECK (plan_tier IN ('free', 'website', 'studio', 'agency', 'network', 'legacy'));

-- workspace_subscriptions.plan_key
-- Created in 20260901160000_stripe_billing.sql.
ALTER TABLE public.workspace_subscriptions
  DROP CONSTRAINT IF EXISTS workspace_subscriptions_plan_key_check;
ALTER TABLE public.workspace_subscriptions
  ADD CONSTRAINT workspace_subscriptions_plan_key_check
  CHECK (plan_key IN ('free', 'website', 'studio', 'agency', 'network'));

-- workspace_plan_overrides.base_plan_tier + .override_plan_tier
-- Created in 20260924000000_workspace_plan_overrides.sql. Both columns need
-- the widening --- an override records the tier it came FROM and the tier it
-- grants, and a `website` workspace can be on either side of that pair.
ALTER TABLE public.workspace_plan_overrides
  DROP CONSTRAINT IF EXISTS workspace_plan_overrides_base_plan_tier_check;
ALTER TABLE public.workspace_plan_overrides
  ADD CONSTRAINT workspace_plan_overrides_base_plan_tier_check
  CHECK (base_plan_tier IN ('free', 'website', 'studio', 'agency', 'network'));

ALTER TABLE public.workspace_plan_overrides
  DROP CONSTRAINT IF EXISTS workspace_plan_overrides_override_plan_tier_check;
ALTER TABLE public.workspace_plan_overrides
  ADD CONSTRAINT workspace_plan_overrides_override_plan_tier_check
  CHECK (override_plan_tier IN ('free', 'website', 'studio', 'agency', 'network'));

-- plan_tier_caps.plan_tier
-- Created in 20260907140000_plan_tier_archive.sql. Non-standard name ---
-- `_plan_chk`, not `_plan_tier_check`. MUST be widened before the seed row
-- below, which is why it is last in this group.
ALTER TABLE public.plan_tier_caps
  DROP CONSTRAINT IF EXISTS plan_tier_caps_plan_chk;
ALTER TABLE public.plan_tier_caps
  ADD CONSTRAINT plan_tier_caps_plan_chk
  CHECK (plan_tier IN ('free', 'website', 'studio', 'agency', 'network'));

-- ─── (c) plan_tier_caps seed row for 'website' ──────────────────────────────
-- Caps encode the tier's product shape:
--   talent_seats 0          -- roster-off is the DEFINING trait of this tier
--   team_seats   2          -- an owner + one helper; between free (1) and studio (3)
--   custom_domain TRUE      -- the whole $12 pitch is "your own domain"
--   embed_widgets FALSE     -- roster/booking widgets are meaningless without a roster
--   api_access FALSE        -- agency+ only
--   exclusivity_eligible FALSE -- exclusivity is a TALENT-representation concept
--   inquiry_throughput 50   -- matches studio. This tier exists to RECEIVE enquiries
--                              from a public site, so the free tier's 5 would break
--                              the product; it is not the axis this tier is sold on.
--
-- plan_tier is the PK, so ON CONFLICT (plan_tier) makes the seed re-runnable
-- and lets a later migration correct these numbers by re-running the insert.
--
-- Studio's talent_seats stays at 25 --- the 50->15 roster-cap revision is a
-- separate PR and is deliberately NOT touched here.

INSERT INTO public.plan_tier_caps (
  plan_tier,
  talent_seats,
  team_seats,
  inquiry_throughput,
  custom_domain,
  embed_widgets,
  api_access,
  exclusivity_eligible,
  description
) VALUES (
  'website',
  0,
  2,
  50,
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  'Website $12/mo — full site + custom domain for local businesses. No talent roster.'
)
ON CONFLICT (plan_tier) DO UPDATE SET
  talent_seats         = EXCLUDED.talent_seats,
  team_seats           = EXCLUDED.team_seats,
  inquiry_throughput   = EXCLUDED.inquiry_throughput,
  custom_domain        = EXCLUDED.custom_domain,
  embed_widgets        = EXCLUDED.embed_widgets,
  api_access           = EXCLUDED.api_access,
  exclusivity_eligible = EXCLUDED.exclusivity_eligible,
  description          = EXCLUDED.description;

COMMIT;
