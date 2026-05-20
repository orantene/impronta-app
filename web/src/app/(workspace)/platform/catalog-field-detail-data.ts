/**
 * Phase 9A slices 4 + 5 — Per-field detail loader for the Platform Catalog
 * Map. Slice 4: joins workspace_profile_field_settings → agencies so
 * platform admin can see which workspaces override a given field. Slice 5:
 * adds per-tenant talent-value counts — for each tenant whose active-roster
 * talents have at least one 'live' value for this field, how many?
 * Merges override rows ∪ value-only rows sorted by value_count desc.
 * STRICTLY READ-ONLY.
 *
 * Service-role client (the platform/admin layout already gates the route
 * to super_admin). Server-only; never import from a client component.
 * Degrades to an empty/null shape on failure.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  platformBaseVisibility,
  type FieldVisibility,
} from "@/lib/field-engine/effective-visibility";

export type FieldDetailField = {
  id: string;
  field_key: string;
  label: string;
  tier: string;
  section: string | null;
  field_group_id: string | null;
  field_group_name: string | null;
  helper: string | null;
  visibility: FieldVisibility;
  admin_only: boolean;
  is_sensitive: boolean;
  show_in_public: boolean;
  required_default: boolean;
  deprecated: boolean;
  total_value_count: number;
  total_override_count: number;
  /** Number of tenants with ≥1 active-roster talent that has a live value. */
  tenants_with_values: number;
};

export type FieldDetailWorkspace = {
  tenant_id: string;
  name: string;
  slug: string;
  entity_type: string;
  plan: string;
  status: string;
  enabled_override: boolean | null;
  required_override: boolean | null;
  custom_label: string | null;
  custom_helper: string | null;
  show_in_public_override: boolean | null;
  admin_only_override: boolean | null;
  effective_label: string;
  is_customized: boolean;
  /** Active-roster talents on this tenant with a live value for this field. */
  value_count: number;
  /** True when a workspace_profile_field_settings row exists for this tenant. */
  has_override: boolean;
};

export type FieldDetailRisk = {
  kind:
    | "sensitive-but-public"
    | "admin-but-public"
    | "deprecated-with-values"
    | "deprecated-active-overrides"
    | "unused";
  detail: string;
};

export type PlatformCatalogFieldDetail = {
  ok: boolean;
  /** null when ok=true but the field_key was not found (404-ish). */
  field: FieldDetailField | null;
  workspaces: FieldDetailWorkspace[];
  risks: FieldDetailRisk[];
};

const EMPTY: PlatformCatalogFieldDetail = {
  ok: false,
  field: null,
  workspaces: [],
  risks: [],
};

type DefRow = {
  id: string;
  field_key: string;
  label: string | null;
  tier: string | null;
  section: string | null;
  field_group_id: string | null;
  default_visibility: unknown;
  admin_only: boolean | null;
  is_sensitive: boolean | null;
  show_in_public: boolean | null;
  is_optional: boolean | null;
  deprecated_at: string | null;
  helper: string | null;
};
type OverrideRow = {
  tenant_id: string;
  enabled_override: boolean | null;
  required_override: boolean | null;
  custom_label: string | null;
  custom_helper: string | null;
  show_in_public_override: boolean | null;
  admin_only_override: boolean | null;
};
// Raw row shape from the agencies table query. `kind` is the actual column
// (organization_kind enum: 'agency' | 'hub' | …); a pre-Phase-9A version of
// this loader queried a non-existent `entity_type` column and silently
// errored, leaving every workspace as the fallback row. We query `kind` and
// surface it on the public `FieldDetailWorkspace.entity_type` field — the
// field name stays the same so downstream consumers (page, export) don't
// have to change.
type AgencyRow = {
  id: string;
  display_name: string | null;
  slug: string | null;
  kind: string | null;
  plan_tier: string | null;
  status: string | null;
};

export async function loadPlatformCatalogFieldDetail(
  fieldKey: string,
): Promise<PlatformCatalogFieldDetail> {
  const sb = createServiceRoleClient();
  if (!sb) return EMPTY;

  try {
    // 1. The field itself
    const { data: defR, error: defErr } = await sb
      .from("profile_field_definitions")
      .select(
        "id, field_key, label, tier, section, field_group_id, default_visibility, admin_only, is_sensitive, show_in_public, is_optional, deprecated_at, helper",
      )
      .eq("field_key", fieldKey)
      .maybeSingle();

    if (defErr) {
      // eslint-disable-next-line no-console
      console.error("[catalog-field-detail] def lookup:", defErr.message);
      return EMPTY;
    }
    if (!defR) {
      // Field key not found — return ok with no field; page renders 404 state.
      return { ok: true, field: null, workspaces: [], risks: [] };
    }
    const def = defR as DefRow;

    // 2. Group name (if any)
    let groupName: string | null = null;
    if (def.field_group_id) {
      const { data: gR } = await sb
        .from("profile_field_groups")
        .select("name_en, slug")
        .eq("id", def.field_group_id)
        .maybeSingle();
      const g = gR as { name_en: string | null; slug: string | null } | null;
      groupName = g?.name_en ?? g?.slug ?? null;
    }

    // 3. Value count (existence only; never the value) + workspace overrides —
    //    independent queries, run in parallel.
    //    Filter the value count by workflow_state='live' so the headline number
    //    matches the per-tenant breakdown below (which is also live-only).
    //    Before this filter, total_value_count included pending/archived rows
    //    while tenants_with_values reflected only live, producing inconsistent
    //    totals on the field summary card.
    const [valCountRes, ovsRes] = await Promise.all([
      sb
        .from("talent_profile_field_values")
        .select("id", { count: "exact", head: true })
        .eq("field_definition_id", def.id)
        .eq("workflow_state", "live"),
      sb
        .from("workspace_profile_field_settings")
        .select(
          "tenant_id, enabled_override, required_override, custom_label, custom_helper, show_in_public_override, admin_only_override",
        )
        .eq("field_definition_id", def.id),
    ]);
    const ovRows = (ovsRes.data ?? []) as OverrideRow[];

    // 4. Slice 5 — per-tenant talent-value counts.
    //    Step A: talent_profile_ids with a live value for this field.
    const { data: talentValRows } = await sb
      .from("talent_profile_field_values")
      .select("talent_profile_id")
      .eq("field_definition_id", def.id)
      .eq("workflow_state", "live");

    const talentIdsWithValue = [
      ...new Set(
        ((talentValRows ?? []) as Array<{ talent_profile_id: string }>).map(
          (r) => r.talent_profile_id,
        ),
      ),
    ];

    //    Step B: roster rows joining those talent_ids to active tenant_ids.
    const perTenantValueCount = new Map<string, number>();
    if (talentIdsWithValue.length > 0) {
      const { data: rosterRows } = await sb
        .from("agency_talent_roster")
        .select("talent_profile_id, tenant_id")
        .in("talent_profile_id", talentIdsWithValue)
        .eq("status", "active");

      //    Step C: aggregate distinct talent_profile_id per tenant_id.
      for (const row of (rosterRows ?? []) as Array<{
        talent_profile_id: string;
        tenant_id: string;
      }>) {
        perTenantValueCount.set(
          row.tenant_id,
          (perTenantValueCount.get(row.tenant_id) ?? 0) + 1,
        );
      }
    }

    // 5. Agency lookup for all tenant_ids (overrides ∪ value-only).
    const allTenantIds = [
      ...new Set([
        ...ovRows.map((o) => o.tenant_id),
        ...perTenantValueCount.keys(),
      ]),
    ];
    const byId = new Map<string, AgencyRow>();
    if (allTenantIds.length > 0) {
      const { data: agenciesData, error: agenciesErr } = await sb
        .from("agencies")
        .select("id, display_name, slug, kind, plan_tier, status")
        .in("id", allTenantIds);
      if (agenciesErr) {
        // eslint-disable-next-line no-console
        console.error("[catalog-field-detail] agency lookup:", agenciesErr.message);
        // Continue with empty byId — workspace rows will render UUID fallbacks.
      }
      for (const a of (agenciesData ?? []) as AgencyRow[]) {
        byId.set(a.id, a);
      }
    }

    // 6. Build merged workspace rows.
    const fieldLabel = def.label ?? def.field_key;
    const workspaceMap = new Map<string, FieldDetailWorkspace>();

    // Override rows first (may or may not have value counts).
    for (const o of ovRows) {
      const a = byId.get(o.tenant_id);
      const isCustomized =
        !!o.custom_label ||
        !!o.custom_helper ||
        o.enabled_override === false ||
        o.required_override !== null ||
        o.show_in_public_override !== null ||
        o.admin_only_override !== null;
      workspaceMap.set(o.tenant_id, {
        tenant_id: o.tenant_id,
        name: a?.display_name ?? a?.slug ?? o.tenant_id,
        slug: a?.slug ?? o.tenant_id,
        entity_type: a?.kind ?? "—",
        plan: a?.plan_tier ?? "free",
        status: a?.status ?? "unknown",
        enabled_override: o.enabled_override,
        required_override: o.required_override,
        custom_label: o.custom_label,
        custom_helper: o.custom_helper,
        show_in_public_override: o.show_in_public_override,
        admin_only_override: o.admin_only_override,
        effective_label: o.custom_label ?? fieldLabel,
        is_customized: isCustomized,
        value_count: perTenantValueCount.get(o.tenant_id) ?? 0,
        has_override: true,
      });
    }

    // Value-only rows — tenants using the field without a settings override.
    for (const [tenantId, count] of perTenantValueCount.entries()) {
      if (workspaceMap.has(tenantId)) continue;
      const a = byId.get(tenantId);
      workspaceMap.set(tenantId, {
        tenant_id: tenantId,
        name: a?.display_name ?? a?.slug ?? tenantId,
        slug: a?.slug ?? tenantId,
        entity_type: a?.kind ?? "—",
        plan: a?.plan_tier ?? "free",
        status: a?.status ?? "unknown",
        enabled_override: null,
        required_override: null,
        custom_label: null,
        custom_helper: null,
        show_in_public_override: null,
        admin_only_override: null,
        effective_label: fieldLabel,
        is_customized: false,
        value_count: count,
        has_override: false,
      });
    }

    // Sort by value_count desc, then name asc for ties.
    const workspaces = [...workspaceMap.values()].sort((a, b) => {
      if (b.value_count !== a.value_count) return b.value_count - a.value_count;
      return a.name.localeCompare(b.name);
    });

    // 7. Field summary + visibility via the shared engine
    const dv = Array.isArray(def.default_visibility)
      ? (def.default_visibility as string[])
      : [];
    const visibility = platformBaseVisibility({
      default_visibility: dv,
      show_in_public: def.show_in_public,
      admin_only: def.admin_only,
      is_sensitive: def.is_sensitive,
    });
    const isDeprecated = !!def.deprecated_at;
    const totalValue = valCountRes.count ?? 0;
    const totalOverride = ovRows.length;

    const field: FieldDetailField = {
      id: def.id,
      field_key: def.field_key,
      label: def.label ?? def.field_key,
      tier: def.tier ?? "unknown",
      section: def.section,
      field_group_id: def.field_group_id,
      field_group_name: groupName,
      helper: def.helper,
      visibility,
      admin_only: !!def.admin_only,
      is_sensitive: !!def.is_sensitive,
      show_in_public: !!def.show_in_public,
      required_default: def.is_optional === false,
      deprecated: isDeprecated,
      total_value_count: totalValue,
      total_override_count: totalOverride,
      tenants_with_values: perTenantValueCount.size,
    };

    // 8. Per-field risks (read-only diagnostics, never auto-acted)
    const risks: FieldDetailRisk[] = [];
    if (def.is_sensitive && def.show_in_public) {
      risks.push({
        kind: "sensitive-but-public",
        detail: "Marked sensitive but show_in_public is true.",
      });
    }
    if (def.admin_only && def.show_in_public) {
      risks.push({
        kind: "admin-but-public",
        detail: "Marked admin_only but show_in_public is true.",
      });
    }
    if (isDeprecated && totalValue > 0) {
      risks.push({
        kind: "deprecated-with-values",
        detail: `Deprecated but ${totalValue} talent value(s) still stored.`,
      });
    }
    if (isDeprecated && totalOverride > 0) {
      risks.push({
        kind: "deprecated-active-overrides",
        detail: `Deprecated but ${totalOverride} workspace override(s) still active.`,
      });
    }
    if (!isDeprecated && totalOverride === 0 && totalValue === 0) {
      risks.push({
        kind: "unused",
        detail: "No workspace overrides and no stored values anywhere.",
      });
    }

    return { ok: true, field, workspaces, risks };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[catalog-field-detail] unexpected:", e);
    return EMPTY;
  }
}
