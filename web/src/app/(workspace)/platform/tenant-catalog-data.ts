/**
 * Phase 9A slice 7 — Tenant Catalog Posture loader.
 *
 * Platform HQ (super_admin) per-tenant inspection: which fields the tenant
 * has overridden, how many of their talents have values for each field,
 * and risks specific to their configuration. STRICTLY READ-ONLY — no
 * mutation, no migration. Service-role client (route is super_admin-gated
 * by the platform layout). Degrades to an empty shape on failure.
 */

import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  platformBaseVisibility,
  effectiveFieldVisibility,
  type FieldVisibility,
} from "@/lib/field-engine/effective-visibility";
import {
  CACHE_TAG_FIELD_CATALOG,
  fieldCatalogTagForTenant,
} from "@/lib/field-engine/cache-tags";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TenantCatalogHeader = {
  id: string;
  name: string;
  slug: string;
  entityType: string;
  plan: string;
  status: string;
  totalTalents: number;
};

export type TenantFieldOverride = {
  field_definition_id: string;
  field_key: string;
  label: string;
  tier: string;
  /** Platform default visibility via the shared engine. */
  platformVisibility: FieldVisibility;
  /** Effective visibility after this tenant's override. */
  effectiveVisibility: FieldVisibility;
  enabled_override: boolean | null;
  required_override: boolean | null;
  custom_label: string | null;
  custom_helper: string | null;
  show_in_public_override: boolean | null;
  admin_only_override: boolean | null;
  /** True when at least one column differs from the platform default. */
  is_customized: boolean;
  deprecated: boolean;
  /** Platform-side `admin_only` flag — carried through so risk logic can
   *  distinguish "tenant tried to widen an admin field" from "tenant tried
   *  to widen a sensitive field" (both clamp to admin via the engine, but
   *  the diagnostic message + remediation differ). */
  platformAdminOnly: boolean;
  /** Platform-side `is_sensitive` flag — see platformAdminOnly. */
  platformIsSensitive: boolean;
};

export type TenantGroupOverride = {
  field_group_id: string;
  group_name: string;
  is_enabled: boolean | null;
  custom_label: string | null;
};

export type TenantFieldAdoption = {
  field_definition_id: string;
  field_key: string;
  label: string;
  tier: string;
  platformVisibility: FieldVisibility;
  talentCount: number;
  deprecated: boolean;
};

export type TenantCatalogRisk = {
  kind:
    | "deprecated-field-overridden"
    | "deprecated-field-has-values"
    | "admin-field-made-public"
    | "sensitive-field-made-public"
    | "field-disabled-but-has-values";
  field_key: string;
  detail: string;
};

export type TenantCatalogPosture = {
  ok: boolean;
  header: TenantCatalogHeader | null;
  fieldOverrides: TenantFieldOverride[];
  groupOverrides: TenantGroupOverride[];
  valueAdoption: TenantFieldAdoption[];
  risks: TenantCatalogRisk[];
};

const EMPTY: TenantCatalogPosture = {
  ok: false,
  header: null,
  fieldOverrides: [],
  groupOverrides: [],
  valueAdoption: [],
  risks: [],
};

// ─── Internal row types ───────────────────────────────────────────────────────

type DefRow = {
  id: string;
  field_key: string | null;
  label: string | null;
  tier: string | null;
  default_visibility: unknown;
  admin_only: boolean | null;
  is_sensitive: boolean | null;
  show_in_public: boolean | null;
  deprecated_at: string | null;
};

type FieldSettingRow = {
  field_definition_id: string;
  enabled_override: boolean | null;
  required_override: boolean | null;
  custom_label: string | null;
  custom_helper: string | null;
  show_in_public_override: boolean | null;
  admin_only_override: boolean | null;
};

type GroupSettingRow = {
  field_group_id: string;
  is_enabled: boolean | null;
  custom_label: string | null;
};

type GroupRow = {
  id: string;
  name_en: string | null;
  slug: string | null;
};

// ─── Main loader ──────────────────────────────────────────────────────────────

// Cached wrapper. Tagged with `field-catalog` (busted on every catalog
// write) AND `field-catalog:${tenantId}` (busted on per-tenant override
// writes — the tenant-specific tag also fires for the same writes today
// but stays as a future-proof handle for tenant-scoped busts). 60s
// revalidate is the defense-in-depth floor; tag-bust is the primary path.
export async function loadTenantCatalogPosture(
  tenantId: string,
): Promise<TenantCatalogPosture> {
  return unstable_cache(
    () => loadTenantCatalogPostureUncached(tenantId),
    ["platform:tenant-catalog-posture", "v1", tenantId],
    {
      tags: [CACHE_TAG_FIELD_CATALOG, fieldCatalogTagForTenant(tenantId)],
      revalidate: 60,
    },
  )();
}

async function loadTenantCatalogPostureUncached(
  tenantId: string,
): Promise<TenantCatalogPosture> {
  const sb = createServiceRoleClient();
  if (!sb) return EMPTY;

  try {
    // 1. Tenant header. NOTE: the real column on `agencies` is `kind`
    // (organization_kind enum), not `entity_type` — an early version of this
    // loader queried `entity_type` and the maybeSingle() failed with
    // "column does not exist", which then 404'd the entire page via the
    // page-level notFound() guard. We query `kind` and re-surface it on the
    // public `entityType` field of the header so callers don't have to
    // change their shape.
    const { data: agencyRow, error: agencyErr } = await sb
      .from("agencies")
      .select("id, display_name, slug, kind, plan_tier, status")
      .eq("id", tenantId)
      .maybeSingle();

    if (agencyErr || !agencyRow) {
      // eslint-disable-next-line no-console
      console.error("[tenant-catalog] agency lookup:", agencyErr?.message);
      return EMPTY;
    }
    const ag = agencyRow as {
      id: string;
      display_name: string | null;
      slug: string | null;
      kind: string | null;
      plan_tier: string | null;
      status: string | null;
    };

    // 2. Parallel fetches: field overrides, group overrides, active roster
    const [fieldOvR, groupOvR, rosterR] = await Promise.all([
      sb
        .from("workspace_profile_field_settings")
        .select(
          "field_definition_id, enabled_override, required_override, custom_label, custom_helper, show_in_public_override, admin_only_override",
        )
        .eq("tenant_id", tenantId),
      sb
        .from("workspace_field_group_settings")
        .select("field_group_id, is_enabled, custom_label")
        .eq("tenant_id", tenantId),
      sb
        .from("agency_talent_roster")
        .select("talent_profile_id")
        .eq("tenant_id", tenantId)
        .eq("status", "active"),
    ]);

    const fieldSettingRows = (fieldOvR.data ?? []) as FieldSettingRow[];
    const groupSettingRows = (groupOvR.data ?? []) as GroupSettingRow[];
    const rosterRows = (rosterR.data ?? []) as Array<{ talent_profile_id: string }>;
    const talentIds = rosterRows.map((r) => r.talent_profile_id).filter(Boolean);
    const totalTalents = talentIds.length;

    // 3. Enrich field overrides with definition metadata
    const overrideDefIds = fieldSettingRows.map((r) => r.field_definition_id);
    let fieldOverrides: TenantFieldOverride[] = [];

    if (overrideDefIds.length > 0) {
      const { data: defsData } = await sb
        .from("profile_field_definitions")
        .select(
          "id, field_key, label, tier, default_visibility, admin_only, is_sensitive, show_in_public, deprecated_at",
        )
        .in("id", overrideDefIds);

      const defById = new Map<string, DefRow>(
        ((defsData ?? []) as DefRow[]).map((d) => [d.id, d]),
      );

      fieldOverrides = fieldSettingRows
        .map((ov) => {
          const d = defById.get(ov.field_definition_id);
          if (!d) return null;
          const key = d.field_key ?? d.id;
          const dv = Array.isArray(d.default_visibility)
            ? (d.default_visibility as string[])
            : [];
          const platformVisibility = platformBaseVisibility({
            default_visibility: dv,
            show_in_public: d.show_in_public,
            admin_only: d.admin_only,
            is_sensitive: d.is_sensitive,
          });
          const effectiveVisibility = effectiveFieldVisibility(
            { default_visibility: dv, show_in_public: d.show_in_public, admin_only: d.admin_only, is_sensitive: d.is_sensitive },
            {
              show_in_public_override: ov.show_in_public_override,
              admin_only_override: ov.admin_only_override,
            },
          );
          const is_customized =
            !!ov.custom_label ||
            !!ov.custom_helper ||
            ov.enabled_override === false ||
            ov.required_override !== null ||
            ov.show_in_public_override !== null ||
            ov.admin_only_override !== null;
          return {
            field_definition_id: d.id,
            field_key: key,
            label: d.label ?? key,
            tier: d.tier ?? "unknown",
            platformVisibility,
            effectiveVisibility,
            enabled_override: ov.enabled_override,
            required_override: ov.required_override,
            custom_label: ov.custom_label,
            custom_helper: ov.custom_helper,
            show_in_public_override: ov.show_in_public_override,
            admin_only_override: ov.admin_only_override,
            is_customized,
            deprecated: !!d.deprecated_at,
            platformAdminOnly: !!d.admin_only,
            platformIsSensitive: !!d.is_sensitive,
          } satisfies TenantFieldOverride;
        })
        .filter((x): x is TenantFieldOverride => x !== null)
        .sort((a, b) => a.field_key.localeCompare(b.field_key));
    }

    // 4. Enrich group overrides with group names
    const groupIds = groupSettingRows.map((r) => r.field_group_id);
    let groupOverrides: TenantGroupOverride[] = [];

    if (groupIds.length > 0) {
      const { data: groupsData } = await sb
        .from("profile_field_groups")
        .select("id, name_en, slug")
        .in("id", groupIds);

      const groupById = new Map<string, GroupRow>(
        ((groupsData ?? []) as GroupRow[]).map((g) => [g.id, g]),
      );

      groupOverrides = groupSettingRows
        .map((gs) => {
          const g = groupById.get(gs.field_group_id);
          return {
            field_group_id: gs.field_group_id,
            group_name: g?.name_en ?? g?.slug ?? gs.field_group_id,
            is_enabled: gs.is_enabled,
            custom_label: gs.custom_label,
          };
        })
        .sort((a, b) => a.group_name.localeCompare(b.group_name));
    }

    // 5. Value adoption: which fields do this tenant's talents fill in?
    let valueAdoption: TenantFieldAdoption[] = [];
    if (talentIds.length > 0) {
      // Fetch field_definition_ids + count for live values
      const { data: valData } = await sb
        .from("talent_profile_field_values")
        .select("field_definition_id, talent_profile_id")
        .in("talent_profile_id", talentIds)
        .eq("workflow_state", "live");

      // Aggregate counts per field_definition_id
      const countByFieldId = new Map<string, number>();
      for (const v of (valData ?? []) as Array<{ field_definition_id: string | null; talent_profile_id: string }>) {
        if (!v.field_definition_id) continue;
        countByFieldId.set(
          v.field_definition_id,
          (countByFieldId.get(v.field_definition_id) ?? 0) + 1,
        );
      }

      if (countByFieldId.size > 0) {
        const adoptionDefIds = Array.from(countByFieldId.keys());
        const { data: adoptionDefs } = await sb
          .from("profile_field_definitions")
          .select(
            "id, field_key, label, tier, default_visibility, admin_only, is_sensitive, show_in_public, deprecated_at",
          )
          .in("id", adoptionDefIds);

        valueAdoption = ((adoptionDefs ?? []) as DefRow[])
          .map((d) => {
            const key = d.field_key ?? d.id;
            const dv = Array.isArray(d.default_visibility)
              ? (d.default_visibility as string[])
              : [];
            return {
              field_definition_id: d.id,
              field_key: key,
              label: d.label ?? key,
              tier: d.tier ?? "unknown",
              platformVisibility: platformBaseVisibility({
                default_visibility: dv,
                show_in_public: d.show_in_public,
                admin_only: d.admin_only,
                is_sensitive: d.is_sensitive,
              }),
              talentCount: countByFieldId.get(d.id) ?? 0,
              deprecated: !!d.deprecated_at,
            } satisfies TenantFieldAdoption;
          })
          .sort((a, b) => b.talentCount - a.talentCount || a.field_key.localeCompare(b.field_key));
      }
    }

    // 6. Risk detection — tenant-specific diagnostics (read-only)
    const risks: TenantCatalogRisk[] = [];
    const adoptionById = new Map(valueAdoption.map((a) => [a.field_definition_id, a]));

    for (const ov of fieldOverrides) {
      if (ov.deprecated) {
        risks.push({
          kind: "deprecated-field-overridden",
          field_key: ov.field_key,
          detail: "Deprecated field still has an active workspace override.",
        });
      }
      if (ov.deprecated && adoptionById.has(ov.field_definition_id)) {
        risks.push({
          kind: "deprecated-field-has-values",
          field_key: ov.field_key,
          detail: `Deprecated field has values on ${adoptionById.get(ov.field_definition_id)!.talentCount} talent(s).`,
        });
      }
      // Tenant tried to widen a platform-locked field — engine will clamp
      // it, but the override row itself is misleading. Two distinct cases:
      //  - `admin_only` platform flag → "admin-field-made-public"
      //  - `is_sensitive` platform flag → "sensitive-field-made-public"
      // Both collapse to `platformVisibility === "admin"` via the shared
      // engine; we need the raw platform flags (carried on the override
      // row) to differentiate. Before the platformAdminOnly + platformIsSensitive
      // additions, this was two copy-paste duplicates of the SAME condition,
      // so every admin-only override fired BOTH risks. Now each fires only
      // when the matching platform flag is set.
      if (
        ov.show_in_public_override === true &&
        ov.platformAdminOnly &&
        ov.admin_only_override !== true
      ) {
        risks.push({
          kind: "admin-field-made-public",
          field_key: ov.field_key,
          detail:
            "show_in_public_override=true on a platform admin-only field — engine clamps to admin, but override row is misleading.",
        });
      }
      if (
        ov.show_in_public_override === true &&
        ov.platformIsSensitive
      ) {
        risks.push({
          kind: "sensitive-field-made-public",
          field_key: ov.field_key,
          detail:
            "show_in_public_override=true on a sensitive field — engine clamps it, but override row is misleading.",
        });
      }
      if (
        ov.enabled_override === false &&
        adoptionById.has(ov.field_definition_id)
      ) {
        risks.push({
          kind: "field-disabled-but-has-values",
          field_key: ov.field_key,
          detail: `Field is disabled for this workspace but ${adoptionById.get(ov.field_definition_id)!.talentCount} talent(s) still have values stored.`,
        });
      }
    }
    // Also flag deprecated fields that have values but no explicit override
    for (const a of valueAdoption) {
      if (a.deprecated && !fieldOverrides.some((o) => o.field_definition_id === a.field_definition_id)) {
        risks.push({
          kind: "deprecated-field-has-values",
          field_key: a.field_key,
          detail: `Deprecated field has values on ${a.talentCount} talent(s) (no override row).`,
        });
      }
    }
    risks.sort((a, b) => a.kind.localeCompare(b.kind) || a.field_key.localeCompare(b.field_key));

    return {
      ok: true,
      header: {
        id: ag.id,
        name: ag.display_name ?? ag.slug ?? ag.id,
        slug: ag.slug ?? ag.id,
        entityType: ag.kind ?? "agency",
        plan: ag.plan_tier ?? "free",
        status: ag.status ?? "active",
        totalTalents,
      },
      fieldOverrides,
      groupOverrides,
      valueAdoption,
      risks,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[tenant-catalog] unexpected:", e);
    return EMPTY;
  }
}
