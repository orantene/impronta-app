"use server";

// admin-workspace-field-settings.ts
//
// Phase 1 — Field Privacy becomes REAL. Tenant-scoped per-field
// visibility overrides persisted to `workspace_profile_field_settings`
// (schema + RLS + write policy already exist; the table was empty / had
// no writer). Empty table == platform defaults == prior behaviour, so
// this is fully additive and reversible. The resolver
// (getFieldsForTalent) consumes these via `effectiveFieldVisibility`.
//
// "use server": only async functions may be exported — shared types/pure
// logic live in src/lib/field-engine/effective-visibility.ts.

import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import {
  type FieldVisibility,
  effectiveFieldVisibility,
  visibilityToOverrideColumns,
} from "@/lib/field-engine/effective-visibility";

// Same string the resolver's unstable_cache is tagged with
// (admin-taxonomy.ts CACHE_TAG_FIELD_CATALOG). Phase 1b exports the
// canonical const + tenant-scopes the key; busting the shared tag here
// is correct and harmless in the meantime.
const FIELD_CATALOG_TAG = "field-catalog";

type WorkspaceFieldSettingRow = {
  field_definition_id: string;
  enabled_override: boolean | null;
  required_override: boolean | null;
  show_in_public_override: boolean | null;
  admin_only_override: boolean | null;
  default_visibility_override: string[] | null;
  custom_label: string | null;
  custom_helper: string | null;
};

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
type OkResult = { ok: true } | { ok: false; error: string };

/** Bust the resolver's tenant catalog cache (tagged with both forms). */
function bustFieldCatalog(tenantId: string): void {
  revalidateTag(FIELD_CATALOG_TAG, "default");
  revalidateTag(`${FIELD_CATALOG_TAG}:${tenantId}`, "default");
}

const visibilitySchema = z.object({
  field_definition_id: z.string().uuid(),
  visibility: z.enum(["public", "admin", "hidden"]),
});
const fieldIdSchema = z.object({ field_definition_id: z.string().uuid() });

type FieldPrivacyGroup = { id: string; slug: string; name: string; sort_order: number };
type FieldPrivacyEntry = {
  field_definition_id: string;
  field_key: string;
  label: string;
  field_group_id: string | null;
  effective: FieldVisibility;
  /** platform default (no tenant override) — for the "changed" badge. */
  platform_default: FieldVisibility;
  /** platform admin_only/is_sensitive — cannot be made Public by a tenant. */
  floored: boolean;
  has_override: boolean;
};

/**
 * The Field Privacy catalog for this tenant: every active platform field
 * definition + its EFFECTIVE visibility (platform default folded with
 * this tenant's workspace_profile_field_settings override via the shared
 * primitive) + grouping. Drives the real Field Privacy drawer.
 */
export async function getFieldPrivacyCatalog(): Promise<
  Result<{ groups: FieldPrivacyGroup[]; fields: FieldPrivacyEntry[] }>
> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const [defsR, groupsR, ovR] = await Promise.all([
    supabase
      .from("profile_field_definitions")
      .select(
        "id, field_key, label, field_group_id, admin_only, is_sensitive, default_visibility, show_in_public",
      )
      .is("deprecated_at", null),
    supabase
      .from("profile_field_groups")
      .select("id, slug, name_en, sort_order")
      .eq("is_active", true),
    supabase
      .from("workspace_profile_field_settings")
      .select(
        "field_definition_id, show_in_public_override, admin_only_override, default_visibility_override",
      )
      .eq("tenant_id", tenantId),
  ]);

  if (defsR.error || groupsR.error || ovR.error) {
    console.error(
      "[field-privacy-catalog] load failed:",
      defsR.error?.message || groupsR.error?.message || ovR.error?.message,
    );
    return { ok: false, error: "Couldn't load the field catalog." };
  }

  const ovByField = new Map(
    (ovR.data ?? []).map((o) => [o.field_definition_id as string, o]),
  );

  const fields: FieldPrivacyEntry[] = (defsR.data ?? []).map((d) => {
    const def = d as {
      id: string;
      field_key: string;
      label: string;
      field_group_id: string | null;
      admin_only: boolean | null;
      is_sensitive: boolean | null;
      default_visibility: string[] | null;
      show_in_public: boolean | null;
    };
    const o = ovByField.get(def.id);
    const defInput = {
      default_visibility: def.default_visibility,
      admin_only: def.admin_only,
      is_sensitive: def.is_sensitive,
      show_in_public: def.show_in_public,
    };
    const platform_default = effectiveFieldVisibility(defInput, null);
    const effective = effectiveFieldVisibility(
      defInput,
      o
        ? {
            show_in_public_override: o.show_in_public_override as boolean | null,
            admin_only_override: o.admin_only_override as boolean | null,
            default_visibility_override:
              o.default_visibility_override as string[] | null,
          }
        : null,
    );
    return {
      field_definition_id: def.id,
      field_key: def.field_key,
      label: def.label,
      field_group_id: def.field_group_id,
      effective,
      platform_default,
      floored: !!(def.admin_only || def.is_sensitive),
      has_override: !!o,
    };
  });

  const groups: FieldPrivacyGroup[] = (groupsR.data ?? [])
    .map((g) => {
      const gg = g as {
        id: string;
        slug: string;
        name_en: string | null;
        sort_order: number | null;
      };
      return {
        id: gg.id,
        slug: gg.slug,
        name: gg.name_en ?? gg.slug,
        sort_order: gg.sort_order ?? 0,
      };
    })
    .sort((a, b) => a.sort_order - b.sort_order);

  return { ok: true, groups, fields };
}

/** All of THIS tenant's per-field overrides (RLS: wpfs_select_tenant_or_platform). */
export async function getWorkspaceFieldSettings(): Promise<
  Result<{ rows: WorkspaceFieldSettingRow[] }>
> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data, error } = await supabase
    .from("workspace_profile_field_settings")
    .select(
      "field_definition_id, enabled_override, required_override, show_in_public_override, admin_only_override, default_visibility_override, custom_label, custom_helper",
    )
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("[workspace-field-settings] get failed:", error.message);
    return { ok: false, error: "Couldn't load field settings." };
  }
  return { ok: true, rows: (data ?? []) as WorkspaceFieldSettingRow[] };
}

/**
 * Set a field's visibility for this tenant (Public / Admin-only /
 * Hidden). Platform floor is enforced server-side: a definition that is
 * `admin_only` or `is_sensitive` can never be made Public.
 */
export async function setWorkspaceFieldVisibility(
  input: z.infer<typeof visibilitySchema>,
): Promise<OkResult> {
  const parsed = visibilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { field_definition_id, visibility } = parsed.data;

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  // Platform floor check — definition must exist and not be a hard-floor
  // field being raised to public.
  const { data: def, error: defErr } = await supabase
    .from("profile_field_definitions")
    .select("id, admin_only, is_sensitive")
    .eq("id", field_definition_id)
    .maybeSingle();
  if (defErr || !def) {
    return { ok: false, error: "Unknown field." };
  }
  if (
    visibility === "public" &&
    ((def as { admin_only?: boolean | null }).admin_only ||
      (def as { is_sensitive?: boolean | null }).is_sensitive)
  ) {
    return {
      ok: false,
      error: "This field is platform-restricted and cannot be made public.",
    };
  }

  const cols = visibilityToOverrideColumns(visibility as FieldVisibility);
  const { error } = await supabase
    .from("workspace_profile_field_settings")
    .upsert(
      {
        tenant_id: tenantId,
        field_definition_id,
        show_in_public_override: cols.show_in_public_override,
        admin_only_override: cols.admin_only_override,
        default_visibility_override: cols.default_visibility_override,
        last_changed_by_user_id: user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,field_definition_id" },
    );

  if (error) {
    console.error("[workspace-field-settings] set failed:", error.message);
    return { ok: false, error: "Couldn't save the field setting." };
  }
  bustFieldCatalog(tenantId);
  return { ok: true };
}

/** Clear this tenant's override for a field → inherit the platform default. */
export async function resetWorkspaceFieldVisibility(
  input: z.infer<typeof fieldIdSchema>,
): Promise<OkResult> {
  const parsed = fieldIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { error } = await supabase
    .from("workspace_profile_field_settings")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("field_definition_id", parsed.data.field_definition_id);

  if (error) {
    console.error("[workspace-field-settings] reset failed:", error.message);
    return { ok: false, error: "Couldn't reset the field setting." };
  }
  bustFieldCatalog(tenantId);
  return { ok: true };
}
