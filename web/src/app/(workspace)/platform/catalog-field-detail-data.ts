/**
 * Phase 9A slice 4 — Per-field detail loader for the Platform Catalog
 * Map. Joins workspace_profile_field_settings → agencies so platform
 * admin can see *which workspaces* override a given field (name, plan,
 * entity type, override specifics). STRICTLY READ-ONLY.
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
type AgencyRow = {
  id: string;
  display_name: string | null;
  slug: string | null;
  entity_type: string | null;
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

    // 3. Value count (existence only; never the value)
    const { count: valCount } = await sb
      .from("talent_profile_field_values")
      .select("id", { count: "exact", head: true })
      .eq("field_definition_id", def.id);

    // 4. Workspace overrides
    const { data: ovs } = await sb
      .from("workspace_profile_field_settings")
      .select(
        "tenant_id, enabled_override, required_override, custom_label, custom_helper, show_in_public_override, admin_only_override",
      )
      .eq("field_definition_id", def.id);
    const ovRows = (ovs ?? []) as OverrideRow[];

    // 5. Agency lookup for the tenant_ids in those overrides
    let workspaces: FieldDetailWorkspace[] = [];
    if (ovRows.length > 0) {
      const tenantIds = ovRows.map((o) => o.tenant_id);
      const { data: agenciesData } = await sb
        .from("agencies")
        .select("id, display_name, slug, entity_type, plan_tier, status")
        .in("id", tenantIds);
      const byId = new Map<string, AgencyRow>(
        ((agenciesData ?? []) as AgencyRow[]).map((a) => [a.id, a]),
      );
      const fieldLabel = def.label ?? def.field_key;
      workspaces = ovRows
        .map((o) => {
          const a = byId.get(o.tenant_id);
          const isCustomized =
            !!o.custom_label ||
            !!o.custom_helper ||
            o.enabled_override === false ||
            o.required_override !== null ||
            o.show_in_public_override !== null ||
            o.admin_only_override !== null;
          return {
            tenant_id: o.tenant_id,
            name: a?.display_name ?? a?.slug ?? o.tenant_id,
            slug: a?.slug ?? o.tenant_id,
            entity_type: a?.entity_type ?? "—",
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
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    // 6. Field summary + visibility via the shared engine
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
    const totalValue = valCount ?? 0;
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
    };

    // 7. Per-field risks (read-only diagnostics, never auto-acted)
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
