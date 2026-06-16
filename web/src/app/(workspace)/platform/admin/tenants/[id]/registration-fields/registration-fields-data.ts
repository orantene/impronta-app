/**
 * Registration Fields configurator — per-tenant data loader.
 *
 * Platform HQ (super_admin) tool that lists the registration-eligible
 * catalog fields for ONE workspace and shows, per field, the EFFECTIVE
 * registration posture (shown / required / order) after this tenant's
 * `workspace_profile_field_settings` overrides are folded in — plus
 * whether each control is currently overridden (vs inheriting the catalog
 * default) so the UI can show an "overridden" badge + a reset.
 *
 * Mirrors the resolver in `profile-fields-service.ts`
 * (`loadFieldsForMode(supabase, 'registration', …)`): registration mode =
 * fields where `enabled && showInRegistration && tier !== 'global'`. So
 * this configurator lists the UNIVERSAL + TYPE-SPECIFIC tiers (global is
 * never on the registration wizard) and the controls it writes
 * (`show_in_registration_override`, `required_override`,
 * `display_order_override`) flow straight through that resolver.
 *
 * STRICTLY a read layer — no mutation. Service-role client (the platform
 * layout enforces super_admin); degrades to an empty shape on failure.
 */

import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  CACHE_TAG_FIELD_CATALOG,
  fieldCatalogTagForTenant,
} from "@/lib/field-engine/cache-tags";

// ─── Types ──────────────────────────────────────────────────────────────────

export type RegFieldTier = "universal" | "type-specific";

export type RegistrationField = {
  field_definition_id: string;
  field_key: string;
  label: string;
  tier: RegFieldTier;
  /** Catalog display_order (platform default). */
  catalog_display_order: number;
  /** Effective display_order = override ?? catalog. Drives row ordering. */
  display_order: number;
  /** Effective: shown at registration for this tenant. */
  shown: boolean;
  /** Catalog default for shown (no override). */
  shown_default: boolean;
  /** Effective: required for this tenant (catalog `!is_optional` folded with
   *  required_override). */
  required: boolean;
  /** Catalog default for required (no override). */
  required_default: boolean;
  /** Whether the field is enabled for this tenant. A disabled field never
   *  reaches the wizard; we surface it dimmed so the admin can see why. */
  enabled: boolean;
  /** Per-control override state — drives the "overridden" badge + reset. */
  override: {
    shown: boolean;
    required: boolean;
    order: boolean;
    /** enabled_override === false (field hard-disabled for this tenant). */
    disabled: boolean;
  };
  /** True when ANY of the registration controls is overridden. */
  has_override: boolean;
  /** Type-specific fields: the talent-type slugs they apply to (for the
   *  group header context). Empty for universal. */
  applies_to: string[];
};

export type RegistrationFieldGroup = {
  /** A talent-type slug, or the sentinel "universal" for the always-on tier. */
  key: string;
  label: string;
  tier: RegFieldTier;
  fields: RegistrationField[];
};

export type TenantRegistrationFieldsData = {
  ok: boolean;
  header: { id: string; name: string; slug: string } | null;
  groups: RegistrationFieldGroup[];
  counts: { total: number; shown: number; required: number; overridden: number };
};

const EMPTY: TenantRegistrationFieldsData = {
  ok: false,
  header: null,
  groups: [],
  counts: { total: 0, shown: 0, required: 0, overridden: 0 },
};

// ─── Internal row types ─────────────────────────────────────────────────────

type DefRow = {
  id: string;
  field_key: string | null;
  // label folded into label_i18n {en,es} (WS3).
  label_i18n: Record<string, string | null> | null;
  tier: string | null;
  display_order: number | null;
  show_in_registration: boolean | null;
  is_optional: boolean | null;
  deprecated_at: string | null;
};

type SettingRow = {
  field_definition_id: string;
  enabled_override: boolean | null;
  required_override: boolean | null;
  show_in_registration_override: boolean | null;
  display_order_override: number | null;
};

type RecRow = { field_definition_id: string; taxonomy_term_id: string; relationship: string };
type TermRow = { id: string; slug: string | null; name_i18n: Record<string, string | null> | null };

const UNIVERSAL_GROUP_KEY = "universal";

// ─── Loader ─────────────────────────────────────────────────────────────────

/** Cached wrapper. Same tags the override writes bust, so a save → reload
 *  reflects immediately. 60s revalidate is the defense-in-depth floor. */
export async function loadTenantRegistrationFields(
  tenantId: string,
): Promise<TenantRegistrationFieldsData> {
  return unstable_cache(
    () => loadTenantRegistrationFieldsUncached(tenantId),
    ["platform:tenant-registration-fields", "v1", tenantId],
    {
      tags: [CACHE_TAG_FIELD_CATALOG, fieldCatalogTagForTenant(tenantId)],
      revalidate: 60,
    },
  )();
}

async function loadTenantRegistrationFieldsUncached(
  tenantId: string,
): Promise<TenantRegistrationFieldsData> {
  const sb = createServiceRoleClient();
  if (!sb) return EMPTY;

  try {
    const { data: agencyRow, error: agencyErr } = await sb
      .from("agencies")
      .select("id, display_name, slug")
      .eq("id", tenantId)
      .maybeSingle();
    if (agencyErr || !agencyRow) {
      // eslint-disable-next-line no-console
      console.error("[reg-fields] agency lookup:", agencyErr?.message);
      return EMPTY;
    }
    const ag = agencyRow as { id: string; display_name: string | null; slug: string | null };

    const [defsR, ovR, recsR] = await Promise.all([
      // Registration-eligible tiers only. Global tier is excluded by the
      // resolver from registration mode, so it never appears here.
      sb
        .from("profile_field_definitions")
        // label folded into label_i18n {en,es} (WS3); resolved to .en at the read.
        .select(
          "id, field_key, label_i18n, tier, display_order, show_in_registration, is_optional, deprecated_at",
        )
        .is("deprecated_at", null)
        .in("tier", ["universal", "type-specific"]),
      sb
        .from("workspace_profile_field_settings")
        .select(
          "field_definition_id, enabled_override, required_override, show_in_registration_override, display_order_override",
        )
        .eq("tenant_id", tenantId),
      sb
        .from("profile_field_recommendations")
        .select("field_definition_id, taxonomy_term_id, relationship"),
    ]);

    const defs = (defsR.data ?? []) as DefRow[];
    const ovById = new Map<string, SettingRow>(
      ((ovR.data ?? []) as SettingRow[]).map((o) => [o.field_definition_id, o]),
    );
    const recs = (recsR.data ?? []) as RecRow[];

    // term-id → slug/label lookup for the talent-type group headers + a
    // field → applies-to-slugs map (relationship 'applies').
    const termIds = Array.from(new Set(recs.map((r) => r.taxonomy_term_id)));
    let termById = new Map<string, TermRow>();
    if (termIds.length > 0) {
      const { data: termsData } = await sb
        .from("taxonomy_terms")
        .select("id, slug, name_i18n")
        .in("id", termIds);
      termById = new Map(((termsData ?? []) as TermRow[]).map((t) => [t.id, t]));
    }

    const appliesByField = new Map<string, Set<string>>();
    for (const r of recs) {
      if (r.relationship !== "applies") continue;
      const slug = termById.get(r.taxonomy_term_id)?.slug;
      if (!slug) continue;
      const set = appliesByField.get(r.field_definition_id) ?? new Set<string>();
      set.add(slug);
      appliesByField.set(r.field_definition_id, set);
    }

    // Build the per-field rows. List fields the catalog itself ever puts on
    // registration (show_in_registration default true) OR that this tenant
    // has explicitly overridden — so a field the tenant hid is still listed,
    // just toggled off.
    const all: RegistrationField[] = [];
    for (const d of defs) {
      const o = ovById.get(d.id);
      const tier = (d.tier === "universal" ? "universal" : "type-specific") as RegFieldTier;
      const catalogShown = d.show_in_registration !== false;
      const showOv = o?.show_in_registration_override;
      const shown = showOv === null || showOv === undefined ? catalogShown : showOv;
      // A field with show_in_registration=false at the catalog AND no tenant
      // override would never reach the wizard — skip it (noise).
      if (!catalogShown && showOv == null) continue;

      const enabled = tier === "universal" ? true : o?.enabled_override !== false;
      const catalogRequired = d.is_optional === false;
      const reqOv = o?.required_override;
      const required = reqOv === null || reqOv === undefined ? catalogRequired : reqOv;
      const catalogOrder = d.display_order ?? 100;
      const order = o?.display_order_override ?? catalogOrder;

      const ovShown = showOv != null;
      const ovRequired = reqOv != null;
      const ovOrder = o?.display_order_override != null;
      const ovDisabled = o?.enabled_override === false;

      all.push({
        field_definition_id: d.id,
        field_key: d.field_key ?? d.id,
        label: d.label_i18n?.en ?? d.field_key ?? d.id,
        tier,
        catalog_display_order: catalogOrder,
        display_order: order,
        shown,
        shown_default: catalogShown,
        required,
        required_default: catalogRequired,
        enabled,
        override: { shown: ovShown, required: ovRequired, order: ovOrder, disabled: ovDisabled },
        has_override: ovShown || ovRequired || ovOrder || ovDisabled,
        applies_to: Array.from(appliesByField.get(d.id) ?? []),
      });
    }

    // Group: universal first, then one group per talent-type slug. A
    // type-specific field that applies to multiple types appears under each.
    const universalFields = all.filter((f) => f.tier === "universal").sort(byOrder);

    const typeGroups = new Map<string, RegistrationField[]>();
    for (const f of all) {
      if (f.tier !== "type-specific") continue;
      const slugs = f.applies_to.length > 0 ? f.applies_to : ["(no talent type)"];
      for (const slug of slugs) {
        const arr = typeGroups.get(slug) ?? [];
        arr.push(f);
        typeGroups.set(slug, arr);
      }
    }

    const slugLabelMap = new Map<string, string>();
    for (const t of termById.values()) {
      if (t.slug) slugLabelMap.set(t.slug, t.name_i18n?.en ?? t.slug);
    }
    const slugLabel = (slug: string): string => slugLabelMap.get(slug) ?? slug;

    const groups: RegistrationFieldGroup[] = [];
    if (universalFields.length > 0) {
      groups.push({
        key: UNIVERSAL_GROUP_KEY,
        label: "Universal — every talent type",
        tier: "universal",
        fields: universalFields,
      });
    }
    for (const [slug, fields] of [...typeGroups.entries()].sort((a, b) =>
      slugLabel(a[0]).localeCompare(slugLabel(b[0])),
    )) {
      groups.push({
        key: slug,
        label: slugLabel(slug),
        tier: "type-specific",
        fields: [...fields].sort(byOrder),
      });
    }

    // De-dup counts across the (possibly multi-grouped) field set.
    const counts = {
      total: all.length,
      shown: all.filter((f) => f.shown && f.enabled).length,
      required: all.filter((f) => f.required && f.shown && f.enabled).length,
      overridden: all.filter((f) => f.has_override).length,
    };

    return {
      ok: true,
      header: { id: ag.id, name: ag.display_name ?? ag.slug ?? ag.id, slug: ag.slug ?? ag.id },
      groups,
      counts,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[reg-fields] unexpected:", e);
    return EMPTY;
  }
}

function byOrder(a: RegistrationField, b: RegistrationField): number {
  return a.display_order - b.display_order || a.label.localeCompare(b.label);
}
