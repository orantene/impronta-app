import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantScope } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";

// Type-only import. `_state.tsx` is a client module ("use client") and
// runtime-importing it from server code would defeat the whole point of
// the bridge. `import type` is erased at compile time and emits no JS,
// so we get the shape without pulling the client tree into server land.
import type { TalentProfile } from "./_state";

/**
 * _data-bridge.ts — Phase 1 server-side bridge for the admin-shell prototype.
 *
 * Plan reference: `~/.claude/plans/ancient-gathering-sparkle.md` (Phase 1).
 * Task spec: `docs/handoffs/admin-shell-execution-task-package.md` Task P1.2.
 *
 * The prototype at `web/src/app/prototypes/admin-shell/*` is otherwise
 * 100% client-side mock. This module is the single doorway through which
 * live Impronta data enters the prototype tree. It runs on the server,
 * resolves the tenant scope from middleware-set headers + the user
 * session, queries Supabase under the user's RLS, and returns a payload
 * shaped exactly like the prototype's existing `TalentProfile` mock type.
 *
 * Contract:
 *   - Server-only ("server-only" guard above will throw if any client
 *     module imports this file at runtime).
 *   - No service-role key — every read goes through the SSR client tied
 *     to the user's auth cookie. RLS enforces tenant isolation at the
 *     database, not in this file.
 *   - No URL params, no cookie reads, no hardcoded fallback. Tenant
 *     resolution funnels through `getTenantScope()` only.
 *   - Returns `[]` when scope is null, the env is unconfigured, or the
 *     query fails. Never throws into the render path. Errors are logged
 *     server-side via `logServerError`.
 *
 * Schema decision (binding for Phase 1 forward — see task package P1.2):
 *   - `talent_profile_taxonomy` carries BOTH `is_primary BOOLEAN` (legacy
 *     2025 init) and `relationship_type TEXT` (v2 added in
 *     `20260801120100_taxonomy_v2_assignments_extend.sql`, CHECK +
 *     trigger validated, with unique index `ux_talent_profile_taxonomy_one_primary`
 *     enforcing one `primary_role` per profile). Phase 1 reads canonical
 *     v2: `relationship_type === 'primary_role'`.
 *   - `taxonomy_terms` carries BOTH `kind ENUM` (legacy) and
 *     `term_type TEXT NOT NULL` (v2 from
 *     `20260801120000_taxonomy_v2_hierarchy_columns.sql`). Phase 1 reads
 *     canonical v2: `term_type`.
 *   - `talent_service_areas` (migration `20260801120150` is live) is
 *     joined for `service_kind='home_base'` to derive the city label on
 *     roster cards.
 *
 * Phase 1 scope is **workspace roster only**. Other surfaces (talent,
 * client, platform) are mock-only until their own surface-specific
 * bridge functions land in Phase 3.
 */

export type BridgeData = {
  /**
   * Roster rows for the workspace surface. `null` means "live mode was
   * not requested — fall back to the per-plan mock arrays". An empty
   * array means "live mode was requested but the tenant has zero
   * rostered talent (or scope/query failed)" — the UI should render the
   * standard empty state, NOT silently swap in mock data.
   */
  roster: TalentProfile[] | null;
};

type RosterRow = {
  status: string;
  agency_visibility: string;
  talent_profile_id: string;
  talent_profiles: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    workflow_status: string | null;
    height_cm: number | null;
    cover_photo_url: string | null;
    talent_profile_taxonomy:
      | {
          relationship_type: string | null;
          taxonomy_terms: {
            term_type: string | null;
            slug: string | null;
          } | null;
        }[]
      | null;
    talent_service_areas:
      | {
          service_kind: string | null;
          locations: {
            display_name_en: string | null;
            country_code: string | null;
          } | null;
        }[]
      | null;
  } | null;
};

/**
 * Map Supabase roster + profile state into the prototype's
 * `TalentProfile["state"]` lifecycle. Conservative — anything we cannot
 * confidently classify falls to "draft" so a real talent never appears
 * "published" by accident.
 */
function deriveProfileState(row: RosterRow): TalentProfile["state"] {
  const rosterStatus = row.status;
  const profileWorkflow = row.talent_profiles?.workflow_status ?? null;

  if (rosterStatus === "pending") return "awaiting-approval";
  if (rosterStatus === "active" && profileWorkflow === "published") {
    return "published";
  }
  if (profileWorkflow === "draft") return "draft";
  if (profileWorkflow === "invited") return "invited";
  return "draft";
}

function deriveDisplayName(
  profile: NonNullable<RosterRow["talent_profiles"]>,
): string {
  if (profile.display_name && profile.display_name.trim()) {
    return profile.display_name.trim();
  }
  const first = profile.first_name?.trim() ?? "";
  const last = profile.last_name?.trim() ?? "";
  const joined = `${first} ${last}`.trim();
  return joined || "Unnamed talent";
}

/**
 * Read the talent's primary role slug. The unique partial index
 * `ux_talent_profile_taxonomy_one_primary` (migration 20260801120100)
 * guarantees at most one row per profile with
 * `relationship_type='primary_role'`, so `find()` is safe.
 */
function derivePrimaryType(
  profile: NonNullable<RosterRow["talent_profiles"]>,
): string | undefined {
  const taxonomy = profile.talent_profile_taxonomy ?? [];
  const primary = taxonomy.find(
    (t) => t.relationship_type === "primary_role",
  );
  return primary?.taxonomy_terms?.slug ?? undefined;
}

/**
 * Read the home base city label from `talent_service_areas`. A talent
 * may have multiple service areas (home_base, travel_to, remote_only);
 * we take the row whose `service_kind='home_base'`. Falls back to
 * `undefined` when no home base is set — the roster card primitive
 * renders gracefully without a city.
 */
function deriveCity(
  profile: NonNullable<RosterRow["talent_profiles"]>,
): string | undefined {
  const areas = profile.talent_service_areas ?? [];
  const home = areas.find((a) => a.service_kind === "home_base");
  return home?.locations?.display_name_en ?? undefined;
}

function deriveHeightLabel(profile: {
  height_cm: number | null;
}): string | undefined {
  if (profile.height_cm == null) return undefined;
  // Match the prototype mock format ("5'9\"") — Imperial labels are what
  // the design uses on roster cards. The bridge does the conversion so
  // every surface that reads this DTO sees a string identical in shape
  // to what the mock provides.
  const totalInches = Math.round(profile.height_cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

/**
 * Load the workspace roster for the currently-scoped tenant. Phase 1
 * Acceptance test: Impronta owner on `impronta.tulala.digital` should
 * see all 29 active+pending Impronta roster rows.
 *
 * Returns `[]` when:
 *   - No tenant scope is resolvable (anonymous, no membership, or
 *     stale cookie that doesn't match memberships).
 *   - Supabase env is not configured (createClient returns null).
 *   - The query throws (logged server-side).
 *
 * Never falls back to mock data — that decision lives in the client
 * shell, NOT the bridge. The bridge is a faithful "here is what live
 * data looks like" function.
 */
export async function loadWorkspaceRosterForCurrentTenant(): Promise<
  TalentProfile[]
> {
  try {
    const scope = await getTenantScope();
    if (!scope) return [];

    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("agency_talent_roster")
      .select(
        `
        status,
        agency_visibility,
        talent_profile_id,
        talent_profiles:talent_profile_id (
          id,
          display_name,
          first_name,
          last_name,
          workflow_status,
          height_cm,
          cover_photo_url,
          talent_profile_taxonomy (
            relationship_type,
            taxonomy_terms ( term_type, slug )
          ),
          talent_service_areas (
            service_kind,
            locations ( display_name_en, country_code )
          )
        )
        `,
      )
      .eq("tenant_id", scope.tenantId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });

    if (error) {
      logServerError("admin-shell-prototype.loadWorkspaceRoster", error);
      return [];
    }

    const rows = (data ?? []) as unknown as RosterRow[];
    const out: TalentProfile[] = [];
    for (const row of rows) {
      const profile = row.talent_profiles;
      if (!profile) continue;
      out.push({
        id: profile.id,
        name: deriveDisplayName(profile),
        state: deriveProfileState(row),
        height: deriveHeightLabel(profile),
        city: deriveCity(profile),
        thumb: profile.cover_photo_url ?? undefined,
        primaryType: derivePrimaryType(profile),
        // `completeness`, `availability`, `lastActive` are derived UI
        // hints not yet wired in the live schema. Leaving them undefined
        // is a valid `TalentProfile` and the existing roster card
        // primitives render their fallbacks for missing fields.
      });
    }
    return out;
  } catch (err) {
    logServerError("admin-shell-prototype.loadWorkspaceRoster", err);
    return [];
  }
}
