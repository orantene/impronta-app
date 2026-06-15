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

import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { fetchAllTaxonomyTerms } from "@/lib/supabase/paged";
import {
  platformBaseVisibility,
  type FieldVisibility,
} from "@/lib/field-engine/effective-visibility";
import { CACHE_TAG_FIELD_CATALOG } from "@/lib/field-engine/cache-tags";

export type FieldDetailField = {
  id: string;
  field_key: string;
  label: string;
  label_es: string | null;
  tier: string;
  section: string | null;
  subsection: string | null;
  field_group_id: string | null;
  field_group_name: string | null;
  helper: string | null;
  helper_es: string | null;
  placeholder: string | null;
  unit: string | null;
  kind: string;
  options: unknown;
  default_visibility: string[];
  visibility: FieldVisibility;
  admin_only: boolean;
  is_sensitive: boolean;
  show_in_public: boolean;
  show_in_directory: boolean;
  show_in_registration: boolean;
  show_in_edit_drawer: boolean;
  talent_editable: boolean;
  requires_review_on_change: boolean;
  is_searchable: boolean;
  display_order: number;
  count_min: number | null;
  required_default: boolean;
  deprecated: boolean;
  deprecated_at: string | null;
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
    // "unused" is no longer emitted (a field with no data is informational, not
    // a risk — it buried the real warnings). Kept in the union for back-compat
    // with the detail view's tone map; safe to drop once that map is updated.
    | "unused";
  detail: string;
};

export type FieldDetailRecommendation = {
  id: string;
  taxonomy_term_id: string;
  relationship: string;
  display_order: number;
  required_at_registration: boolean;
  required_before_publish: boolean;
  required_before_verification: boolean;
  requires_verification: boolean;
  is_admin_only: boolean;
  term_slug: string;
  term_name_en: string;
  term_name_es: string | null;
  term_type: string;
  level: number;
};

export type FieldDetailTaxonomyTerm = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  term_type: string;
  level: number;
  parent_id: string | null;
  sort_order: number;
};

export type FieldDetailGroupOption = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  sort_order: number;
  is_active: boolean;
};

export type FieldDetailAuditEntry = {
  id: string;
  created_at: string;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  severity: string;
  changed_keys: string[];
  changes: Array<{
    key: string;
    before: string;
    after: string;
  }>;
};

export type PlatformCatalogFieldDetail = {
  ok: boolean;
  /** null when ok=true but the field_key was not found (404-ish). */
  field: FieldDetailField | null;
  workspaces: FieldDetailWorkspace[];
  risks: FieldDetailRisk[];
  recommendations: FieldDetailRecommendation[];
  taxonomyTerms: FieldDetailTaxonomyTerm[];
  fieldGroups: FieldDetailGroupOption[];
  audit: FieldDetailAuditEntry[];
};

const EMPTY: PlatformCatalogFieldDetail = {
  ok: false,
  field: null,
  workspaces: [],
  risks: [],
  recommendations: [],
  taxonomyTerms: [],
  fieldGroups: [],
  audit: [],
};

type DefRow = {
  id: string;
  field_key: string;
  label: string | null;
  label_es: string | null;
  tier: string | null;
  section: string | null;
  subsection: string | null;
  field_group_id: string | null;
  default_visibility: unknown;
  admin_only: boolean | null;
  is_sensitive: boolean | null;
  show_in_public: boolean | null;
  show_in_directory: boolean | null;
  show_in_registration: boolean | null;
  show_in_edit_drawer: boolean | null;
  talent_editable: boolean | null;
  requires_review_on_change: boolean | null;
  is_searchable: boolean | null;
  is_optional: boolean | null;
  deprecated_at: string | null;
  helper: string | null;
  helper_es: string | null;
  placeholder: string | null;
  unit: string | null;
  kind: string | null;
  options: unknown;
  display_order: number | null;
  count_min: number | null;
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

function auditRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? first as Record<string, unknown> : {};
  }
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function auditValue(value: unknown): string {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  }
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  try {
    const json = JSON.stringify(value);
    return json.length > 80 ? `${json.slice(0, 77)}...` : json;
  } catch {
    return "object";
  }
}

// Cached wrapper around the inner loader. Tagged with `field-catalog` so
// every existing write path (workspace field settings, taxonomy mutators)
// already busts this on edit. 60s revalidate is a defense-in-depth floor
// against any future write path that forgets to call `bustFieldCatalog`.
// Per-fieldKey key part keeps every field independently cacheable.
export async function loadPlatformCatalogFieldDetail(
  fieldKey: string,
): Promise<PlatformCatalogFieldDetail> {
  return unstable_cache(
    () => loadPlatformCatalogFieldDetailUncached(fieldKey),
    ["platform:catalog-field-detail", "v2", fieldKey],
    { tags: [CACHE_TAG_FIELD_CATALOG], revalidate: 60 },
  )();
}

async function loadPlatformCatalogFieldDetailUncached(
  fieldKey: string,
): Promise<PlatformCatalogFieldDetail> {
  const sb = createServiceRoleClient();
  if (!sb) return EMPTY;

  try {
    // 1. The field itself
    const { data: defR, error: defErr } = await sb
      .from("profile_field_definitions")
      .select(
        "id, field_key, label, label_es, tier, section, subsection, field_group_id, default_visibility, admin_only, is_sensitive, show_in_public, show_in_directory, show_in_registration, show_in_edit_drawer, talent_editable, requires_review_on_change, is_searchable, is_optional, deprecated_at, helper, helper_es, placeholder, unit, kind, options, display_order, count_min",
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
      return {
        ok: true,
        field: null,
        workspaces: [],
        risks: [],
        recommendations: [],
        taxonomyTerms: [],
        fieldGroups: [],
        audit: [],
      };
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
    const [valCountRes, ovsRes, recsRes, termRows, groupsRes] = await Promise.all([
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
      sb
        .from("profile_field_recommendations")
        .select(
          "id, taxonomy_term_id, relationship, display_order, required_at_registration, required_before_publish, required_before_verification, requires_verification, is_admin_only",
        )
        .eq("field_definition_id", def.id),
      // `archived_at IS NULL` alone ≈ 1068 rows > PostgREST's 1000-row cap, so an
      // un-paged select silently dropped terms past row 1000. Page by `id`, then
      // re-sort by the original display order (level → sort_order → name_en) below.
      fetchAllTaxonomyTerms<FieldDetailTaxonomyTerm>(
        sb,
        "id, slug, name_en, name_es, term_type, level, parent_id, sort_order",
        (q) => q.is("archived_at", null),
      ),
      sb
        .from("profile_field_groups")
        .select("id, slug, name_en, name_es, sort_order, is_active")
        .order("sort_order", { ascending: true }),
    ]);
    const ovRows = (ovsRes.data ?? []) as OverrideRow[];

    const taxonomyTerms = termRows.sort(
      (a, b) => a.level - b.level || a.sort_order - b.sort_order || a.name_en.localeCompare(b.name_en),
    );
    const taxonomyById = new Map(taxonomyTerms.map((t) => [t.id, t] as const));
    const recommendations = ((recsRes.data ?? []) as Array<{
      id: string;
      taxonomy_term_id: string;
      relationship: string;
      display_order: number | null;
      required_at_registration: boolean | null;
      required_before_publish: boolean | null;
      required_before_verification: boolean | null;
      requires_verification: boolean | null;
      is_admin_only: boolean | null;
    }>)
      .map((r) => {
        const term = taxonomyById.get(r.taxonomy_term_id);
        return {
          id: r.id,
          taxonomy_term_id: r.taxonomy_term_id,
          relationship: r.relationship,
          display_order: r.display_order ?? 100,
          required_at_registration: !!r.required_at_registration,
          required_before_publish: !!r.required_before_publish,
          required_before_verification: !!r.required_before_verification,
          requires_verification: !!r.requires_verification,
          is_admin_only: !!r.is_admin_only,
          term_slug: term?.slug ?? r.taxonomy_term_id,
          term_name_en: term?.name_en ?? r.taxonomy_term_id,
          term_name_es: term?.name_es ?? null,
          term_type: term?.term_type ?? "unknown",
          level: term?.level ?? 0,
        } satisfies FieldDetailRecommendation;
      })
      .sort((a, b) => a.display_order - b.display_order || a.term_name_en.localeCompare(b.term_name_en));

    const fieldGroups = ((groupsRes.data ?? []) as FieldDetailGroupOption[]).sort(
      (a, b) => a.sort_order - b.sort_order || a.name_en.localeCompare(b.name_en),
    );

    const auditTargetIds = [def.id, ...recommendations.map((r) => r.id)];
    const { data: auditData } = auditTargetIds.length > 0
      ? await sb
          .from("platform_audit_log")
          .select("id, created_at, actor_role, action, target_type, target_id, severity, metadata")
          .in("target_id", auditTargetIds)
          .order("created_at", { ascending: false })
          .limit(12)
      : { data: [] };
    const audit = ((auditData ?? []) as Array<{
      id: string;
      created_at: string;
      actor_role: string | null;
      action: string;
      target_type: string | null;
      target_id: string | null;
      severity: string;
      metadata: unknown;
    }>).map((row) => {
      const metadata = row.metadata as { before?: unknown; after?: unknown } | null;
      const before = auditRecord(metadata?.before);
      const after = auditRecord(metadata?.after);
      const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) =>
        JSON.stringify(before[key]) !== JSON.stringify(after[key]),
      );
      const changes = keys.slice(0, 8).map((key) => ({
        key,
        before: auditValue(before[key]),
        after: auditValue(after[key]),
      }));
      return {
        id: row.id,
        created_at: row.created_at,
        actor_role: row.actor_role,
        action: row.action,
        target_type: row.target_type,
        target_id: row.target_id,
        severity: row.severity,
        changed_keys: keys.slice(0, 8),
        changes,
      } satisfies FieldDetailAuditEntry;
    });

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
      label_es: def.label_es,
      tier: def.tier ?? "unknown",
      section: def.section,
      subsection: def.subsection,
      field_group_id: def.field_group_id,
      field_group_name: groupName,
      helper: def.helper,
      helper_es: def.helper_es,
      placeholder: def.placeholder,
      unit: def.unit,
      kind: def.kind ?? "text",
      options: def.options,
      default_visibility: dv,
      visibility,
      admin_only: !!def.admin_only,
      is_sensitive: !!def.is_sensitive,
      show_in_public: !!def.show_in_public,
      show_in_directory: !!def.show_in_directory,
      show_in_registration: !!def.show_in_registration,
      show_in_edit_drawer: !!def.show_in_edit_drawer,
      talent_editable: def.talent_editable !== false,
      requires_review_on_change: !!def.requires_review_on_change,
      is_searchable: !!def.is_searchable,
      display_order: def.display_order ?? 100,
      count_min: def.count_min,
      required_default: def.is_optional === false,
      deprecated: isDeprecated,
      deprecated_at: def.deprecated_at,
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
    // "unused" (no overrides + no values) is intentionally NOT pushed — a field
    // with no data yet is informational, not action-worthy, and previously
    // buried the real warnings. Mirrors catalog-map-data.ts.

    return { ok: true, field, workspaces, risks, recommendations, taxonomyTerms, fieldGroups, audit };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[catalog-field-detail] unexpected:", e);
    return EMPTY;
  }
}
