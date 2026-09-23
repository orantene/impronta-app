-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/ci/production-only-objects.sql
--
-- WHICH MIGRATION: none. That is the point.
--
-- WHY IT CANNOT APPLY FROM SCRATCH
--   These objects exist in the production database and NO file in
--   supabase/migrations/ creates them. They were applied by hand. The repo
--   already knows this and has it on the record:
--
--     docs/plans/qa-evidence/schema-drift/isolated-branch-repair.md
--     "Axis 2 — what production has and no migration creates …
--      58 objects applied by hand, with nothing to replay. …
--      cms_navigation_items.pin_in_menu and show_in_sticky_top_nav, …
--      five platform_settings theme columns, … the talent_type_field_groups
--      table, talent_profiles.subscription_template, … and
--      saas_marketing_signups.recovery_email_sent_at.
--      This repo cannot rebuild its own production schema. Filed as D-014."
--
--   This file is the CI half of closing D-014: it recreates that set so a
--   from-scratch replay reaches production's shape. It is NOT a migration and
--   is never applied to production, which already holds every object below.
--
-- WHAT PRODUCTION STATE IT REPRODUCES
--   Exactly the objects `web/src/lib/supabase/database.types.ts` records and
--   the migration history does not create. That file is generated FROM
--   production by `supabase gen types`, so it is the evidence for every column
--   name, type and nullability here, and its `Insert` section is the evidence
--   for which columns carry a DEFAULT. Each block below cites its evidence.
--
--   NOT RECOVERABLE from that evidence, and therefore INFERRED — stated here
--   rather than hidden, because a wrong guess would be a silent schema lie:
--     • the VALUE of a default, where `Insert` proves only that one exists.
--       Marked `-- inferred default` at each site. Every inferred value follows
--       the repo's own convention for the same shape (boolean flags default
--       false; array columns default '{}'; timestamps default now(); uuid
--       primary keys default gen_random_uuid()).
--     • column ORDINAL POSITION. The generator sorts columns alphabetically,
--       so the snapshot carries no ordering information. Positions below are
--       append order and are not claimed to match production.
--     • the BODY of _clamp_workspace_to_plan_limit(). Only its signature is
--       recoverable, so the body raises instead of inventing an answer.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── cms_navigation_items: two hand-applied menu flags ──────────────────────
-- Evidence: database.types.ts Row `pin_in_menu: boolean`,
-- `show_in_sticky_top_nav: boolean` (both NOT NULL), Insert `pin_in_menu?`,
-- `show_in_sticky_top_nav?` (both carry a default). Named verbatim in D-014.
ALTER TABLE public.cms_navigation_items
  ADD COLUMN IF NOT EXISTS pin_in_menu            boolean NOT NULL DEFAULT false, -- inferred default
  ADD COLUMN IF NOT EXISTS show_in_sticky_top_nav boolean NOT NULL DEFAULT false; -- inferred default

-- ── platform_settings: the five SHARED default-theme columns ───────────────
-- Evidence, twice over:
--   1. database.types.ts Row: default_theme_tokens / default_component_styles /
--      default_theme_preset_slug / default_theme_updated_at /
--      default_theme_updated_by, every one nullable.
--   2. 20260615041531_platform_default_theme_talent_override.sql, which adds
--      the `_talent` override columns and opens by stating of these five:
--      "The existing default_theme_* columns remain the SHARED / AGENCY
--       default (every new tenant/workspace inherits it via provisioning —
--       unchanged)."
--      A migration that adds an override to a column it does not create is
--      proof the column was already there.
-- default_theme_updated_by is a bare uuid: platform_settings' Relationships in
-- database.types.ts list only the two builder_templates FKs, so this column
-- carries none — matching `updated_by`, the column beside it.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS default_theme_tokens      jsonb,
  ADD COLUMN IF NOT EXISTS default_component_styles  jsonb,
  ADD COLUMN IF NOT EXISTS default_theme_preset_slug text,
  ADD COLUMN IF NOT EXISTS default_theme_updated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS default_theme_updated_by  uuid;

-- ── talent_profiles.subscription_template ──────────────────────────────────
-- Evidence: database.types.ts Row `subscription_template: string` (NOT NULL),
-- Insert `subscription_template?: string` (carries a default). Named in D-014.
-- The default's VALUE is not recoverable; '' keeps the NOT NULL satisfiable
-- for every INSERT the app makes, which is the contract the Insert type states.
ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS subscription_template text NOT NULL DEFAULT ''; -- inferred default

-- ── saas_marketing_signups.recovery_email_sent_at ──────────────────────────
-- Evidence: database.types.ts Row `recovery_email_sent_at: string | null`.
-- Named in D-014. Nullable, no default (Insert `?: string | null`).
ALTER TABLE public.saas_marketing_signups
  ADD COLUMN IF NOT EXISTS recovery_email_sent_at timestamptz;

-- ── talent_type_field_groups ───────────────────────────────────────────────
-- A whole table production holds and no migration creates. Named in D-014;
-- the feature it belongs to is described in docs/taxonomy-and-registration.md
-- §5 and OPERATING.md ("Dynamic profile fields by talent type … (deferred)").
--
-- The DDL sketch in that doc is the PLAN, not the table: it has
-- field_group_key / is_required_for_publish, which production does not have.
-- The columns below come from database.types.ts, which is production. Where
-- the two disagree, the types file wins — it is generated, the doc is written.
--
-- The single FK is the one Relationships records:
--   talent_type_field_groups_taxonomy_term_id_fkey → taxonomy_terms(id).
-- Its ON DELETE action is not recorded by the generator and is left at the
-- default (NO ACTION) rather than guessed.
CREATE TABLE IF NOT EXISTS public.talent_type_field_groups (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),        -- inferred default
  taxonomy_term_id    uuid        NOT NULL REFERENCES public.taxonomy_terms (id),
  label_en            text        NOT NULL,                              -- Insert: required, no default
  label_es            text,
  field_slugs         text[]      NOT NULL DEFAULT '{}',                 -- inferred default
  display_order       integer     NOT NULL DEFAULT 0,                    -- inferred default
  expanded_by_default boolean     NOT NULL DEFAULT false,                -- inferred default
  created_at          timestamptz NOT NULL DEFAULT now(),                -- inferred default
  updated_at          timestamptz NOT NULL DEFAULT now()                 -- inferred default
);

-- Every other hand-made table in this history is locked the same way
-- (20261124000000 asserts it of the leftovers): RLS on, no policy, so
-- PostgREST cannot reach it and the rls_disabled_in_public lint stays clean.
ALTER TABLE public.talent_type_field_groups ENABLE ROW LEVEL SECURITY;

-- ── _clamp_workspace_to_plan_limit(integer, uuid) ──────────────────────────
-- Evidence: database.types.ts Functions
--   _clamp_workspace_to_plan_limit: { Args: { p_limit: number;
--                                             p_tenant_id: string },
--                                     Returns: number }
-- No migration creates it and nothing in web/src calls it, so only the
-- SIGNATURE is recoverable — argument names, argument types and return type.
-- The generator sorts Args alphabetically, so the argument ORDER below is that
-- sort, not a recovered fact.
--
-- The BODY IS NOT RECOVERABLE. Inventing a clamp would be a schema lie that
-- returns plausible numbers: this raises instead, so any caller that appears
-- fails loudly in CI and names this file, rather than silently computing a
-- limit production computes differently.
CREATE OR REPLACE FUNCTION public._clamp_workspace_to_plan_limit(
  p_limit integer,
  p_tenant_id uuid
) RETURNS integer
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    '_clamp_workspace_to_plan_limit is a CI signature stand-in with no body: '
    'production holds this function, no migration creates it, and its body is '
    'not recoverable from database.types.ts. See supabase/ci/production-only-objects.sql.'
    USING ERRCODE = 'feature_not_supported';
END;
$$;

COMMENT ON FUNCTION public._clamp_workspace_to_plan_limit(integer, uuid) IS
  'CI stand-in (supabase/ci/production-only-objects.sql, D-014): signature only, body raises.';
