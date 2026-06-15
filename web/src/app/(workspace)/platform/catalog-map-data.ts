/**
 * Phase 9A — Platform Catalog Map data loader.
 *
 * Platform HQ (super_admin) inspection of the talent field-engine catalog.
 * Aggregate SELECTs over the canonical engine tables + the SHARED
 * visibility engine (`platformBaseVisibility`). Mutations live in the
 * platform catalog server actions; this loader stays query-only. Service-role
 * client bypasses tenant RLS because the route is super_admin-gated by the
 * platform layout. Server-only; never import from a client component.
 * Degrades to an empty shape on failure so the page never hard-fails.
 */

import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  platformBaseVisibility,
  type FieldVisibility,
} from "@/lib/field-engine/effective-visibility";
import { CACHE_TAG_FIELD_CATALOG } from "@/lib/field-engine/cache-tags";

export type CatalogField = {
  id: string;
  field_key: string;
  label: string;
  /** Spanish label (null when untranslated). Surfaced so the platform list +
   *  Section Fields tab can show ES inline and flag coverage gaps. */
  label_es: string | null;
  tier: string;
  section: string | null;
  field_group_id: string | null;
  display_order: number;
  /** Platform-default visibility, computed via the shared engine. */
  visibility: FieldVisibility;
  admin_only: boolean;
  is_sensitive: boolean;
  show_in_public: boolean;
  required_default: boolean;
  deprecated: boolean;
  /** How the field renders in the talent editor — 'catalog' (generic
   *  renderer) or 'bespoke' (hand-coded control). Defaults to 'catalog'. */
  render_mode: string;
  /** # of workspaces that have a per-field override row. */
  override_count: number;
  /** # of talents with a stored value for this field. */
  value_count: number;
};

export type CatalogGroup = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  field_count: number;
  fields: CatalogField[];
};

export type CatalogRisk = {
  kind:
    | "sensitive-but-public"
    | "admin-but-public"
    | "deprecated-with-values"
    | "unused"
    | "deprecated-active-overrides";
  field_key: string;
  detail: string;
};

export type PlatformCatalogMap = {
  ok: boolean;
  summary: {
    totalFields: number;
    byTier: Record<string, number>;
    deprecated: number;
    adminOnly: number;
    sensitive: number;
    totalGroups: number;
    fieldsWithOverrides: number;
    fieldsWithValues: number;
  };
  groups: CatalogGroup[];
  ungrouped: CatalogField[];
  risks: CatalogRisk[];
};

const EMPTY: PlatformCatalogMap = {
  ok: false,
  summary: {
    totalFields: 0,
    byTier: {},
    deprecated: 0,
    adminOnly: 0,
    sensitive: 0,
    totalGroups: 0,
    fieldsWithOverrides: 0,
    fieldsWithValues: 0,
  },
  groups: [],
  ungrouped: [],
  risks: [],
};

type DefRow = {
  id: string;
  field_key: string | null;
  label: string | null;
  label_es: string | null;
  tier: string | null;
  section: string | null;
  field_group_id: string | null;
  display_order: number | null;
  default_visibility: unknown;
  admin_only: boolean | null;
  is_sensitive: boolean | null;
  show_in_public: boolean | null;
  is_optional: boolean | null;
  deprecated_at: string | null;
  render_mode: string | null;
};
type GroupRow = {
  id: string;
  slug: string | null;
  name_en: string | null;
  sort_order: number | null;
  is_active: boolean | null;
};

function countBy(
  rows: Array<{ field_definition_id: string | null }> | null | undefined,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows ?? []) {
    if (!r.field_definition_id) continue;
    m.set(r.field_definition_id, (m.get(r.field_definition_id) ?? 0) + 1);
  }
  return m;
}

// Cached wrapper. Same `field-catalog` tag as the resolver and the per-field
// detail loader — every existing write path that busts the resolver also
// busts this. 60s revalidate is the defense-in-depth floor.
export async function loadPlatformCatalogMap(): Promise<PlatformCatalogMap> {
  return unstable_cache(
    () => loadPlatformCatalogMapUncached(),
    ["platform:catalog-map", "v1"],
    { tags: [CACHE_TAG_FIELD_CATALOG], revalidate: 60 },
  )();
}

async function loadPlatformCatalogMapUncached(): Promise<PlatformCatalogMap> {
  const sb = createServiceRoleClient();
  if (!sb) return EMPTY;

  try {
    const [defsR, groupsR, ovR, valR] = await Promise.all([
      sb
        .from("profile_field_definitions")
        .select(
          "id, field_key, label, label_es, tier, section, field_group_id, display_order, default_visibility, admin_only, is_sensitive, show_in_public, is_optional, deprecated_at, render_mode",
        ),
      sb
        .from("profile_field_groups")
        .select("id, slug, name_en, sort_order, is_active"),
      sb.from("workspace_profile_field_settings").select("field_definition_id"),
      sb.from("talent_profile_field_values").select("field_definition_id"),
    ]);

    if (defsR.error || groupsR.error) {
      // eslint-disable-next-line no-console
      console.error(
        "[platform-catalog-map] load failed:",
        defsR.error?.message ?? groupsR.error?.message,
      );
      return EMPTY;
    }

    const overrideCounts = countBy(
      ovR.data as Array<{ field_definition_id: string | null }> | null,
    );
    const valueCounts = countBy(
      valR.data as Array<{ field_definition_id: string | null }> | null,
    );

    const defs = (defsR.data ?? []) as DefRow[];
    const groupRows = (groupsR.data ?? []) as GroupRow[];

    const byTier: Record<string, number> = {};
    let deprecated = 0;
    let adminOnly = 0;
    let sensitive = 0;
    let fieldsWithOverrides = 0;
    let fieldsWithValues = 0;
    const risks: CatalogRisk[] = [];

    const fields: CatalogField[] = defs.map((d) => {
      const dv = Array.isArray(d.default_visibility)
        ? (d.default_visibility as string[])
        : [];
      const visibility = platformBaseVisibility({
        default_visibility: dv,
        show_in_public: d.show_in_public,
        admin_only: d.admin_only,
        is_sensitive: d.is_sensitive,
      });
      const tier = d.tier ?? "unknown";
      const isDeprecated = !!d.deprecated_at;
      const ov = overrideCounts.get(d.id) ?? 0;
      const vc = valueCounts.get(d.id) ?? 0;
      const key = d.field_key ?? d.id;

      byTier[tier] = (byTier[tier] ?? 0) + 1;
      if (isDeprecated) deprecated += 1;
      if (d.admin_only) adminOnly += 1;
      if (d.is_sensitive) sensitive += 1;
      if (ov > 0) fieldsWithOverrides += 1;
      if (vc > 0) fieldsWithValues += 1;

      // Risk findings (read-only diagnostics; never auto-acted).
      if (d.is_sensitive && d.show_in_public) {
        risks.push({
          kind: "sensitive-but-public",
          field_key: key,
          detail: "Marked sensitive but show_in_public is true.",
        });
      }
      if (d.admin_only && d.show_in_public) {
        risks.push({
          kind: "admin-but-public",
          field_key: key,
          detail: "Marked admin_only but show_in_public is true.",
        });
      }
      if (isDeprecated && vc > 0) {
        risks.push({
          kind: "deprecated-with-values",
          field_key: key,
          detail: `Deprecated but ${vc} talent value(s) still stored.`,
        });
      }
      if (isDeprecated && ov > 0) {
        risks.push({
          kind: "deprecated-active-overrides",
          field_key: key,
          detail: `Deprecated but ${ov} workspace override(s) still active.`,
        });
      }
      if (!isDeprecated && ov === 0 && vc === 0) {
        risks.push({
          kind: "unused",
          field_key: key,
          detail: "No workspace overrides and no stored values anywhere.",
        });
      }

      return {
        id: d.id,
        field_key: key,
        label: d.label ?? key,
        label_es: d.label_es ?? null,
        tier,
        section: d.section,
        field_group_id: d.field_group_id,
        display_order: d.display_order ?? 100,
        visibility,
        admin_only: !!d.admin_only,
        is_sensitive: !!d.is_sensitive,
        show_in_public: !!d.show_in_public,
        required_default: d.is_optional === false,
        deprecated: isDeprecated,
        render_mode: d.render_mode ?? "catalog",
        override_count: ov,
        value_count: vc,
      };
    });

    const byGroupId = new Map<string, CatalogField[]>();
    const ungrouped: CatalogField[] = [];
    for (const f of fields) {
      if (f.field_group_id) {
        const list = byGroupId.get(f.field_group_id) ?? [];
        list.push(f);
        byGroupId.set(f.field_group_id, list);
      } else {
        ungrouped.push(f);
      }
    }

    const groups: CatalogGroup[] = groupRows
      .map((g) => {
        const gf = (byGroupId.get(g.id) ?? []).sort((a, b) =>
          a.display_order - b.display_order ||
          a.label.localeCompare(b.label) ||
          a.field_key.localeCompare(b.field_key),
        );
        return {
          id: g.id,
          slug: g.slug ?? g.id,
          name: g.name_en ?? g.slug ?? g.id,
          sort_order: g.sort_order ?? 0,
          is_active: g.is_active !== false,
          field_count: gf.length,
          fields: gf,
        };
      })
      .sort((a, b) => a.sort_order - b.sort_order);

    ungrouped.sort(
      (a, b) =>
        a.display_order - b.display_order ||
        a.label.localeCompare(b.label) ||
        a.field_key.localeCompare(b.field_key),
    );
    risks.sort((a, b) => a.kind.localeCompare(b.kind));

    return {
      ok: true,
      summary: {
        totalFields: fields.length,
        byTier,
        deprecated,
        adminOnly,
        sensitive,
        totalGroups: groups.length,
        fieldsWithOverrides,
        fieldsWithValues,
      },
      groups,
      ungrouped,
      risks,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[platform-catalog-map] unexpected error:", e);
    return EMPTY;
  }
}
