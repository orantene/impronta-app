"use server";
import { improntaLog } from "@/lib/server/structured-log";

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
    void improntaLog("admin_workspace_field_settings.error", {
      message: "[field-privacy-catalog] load failed:",
      detail: defsR.error?.message || groupsR.error?.message || ovR.error?.message,
    });
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
    void improntaLog("admin_workspace_field_settings.error", {
      message: "[workspace-field-settings] get failed:",
      error: error.message,
    });
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
    void improntaLog("admin_workspace_field_settings.error", {
      message: "[workspace-field-settings] set failed:",
      error: error.message,
    });
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
    void improntaLog("admin_workspace_field_settings.error", {
      message: "[workspace-field-settings] reset failed:",
      error: error.message,
    });
    return { ok: false, error: "Couldn't reset the field setting." };
  }
  bustFieldCatalog(tenantId);
  return { ok: true };
}

// ── Phase 2 — Field Catalog MVP (fully resolver-connected subset) ──────
// Only controls the resolver already honors today: per-field
// enabled/required/relabel (workspace_profile_field_settings) and
// per-group enable/relabel (workspace_field_group_settings). Custom NEW
// field definitions are deferred (platform-governed) — the drawer locks
// that honestly, no fake buttons.

type FieldCatalogField = {
  field_definition_id: string;
  field_key: string;
  label: string;
  field_group_id: string | null;
  /** effective: false only when enabled_override === false. */
  enabled: boolean;
  /** tenant override: null = inherit platform, true/false = forced. */
  required_override: boolean | null;
  custom_label: string | null;
  /** tenant per-field helper/guidance text. null = inherit the platform
   *  definition's `helper`. */
  custom_helper: string | null;
};
type FieldCatalogGroupRow = {
  id: string;
  name: string;
  sort_order: number;
  enabled: boolean;
  custom_label: string | null;
};

const catalogFieldSchema = z.object({
  field_definition_id: z.string().uuid(),
  enabled: z.boolean().nullable().optional(),
  required: z.boolean().nullable().optional(),
  custom_label: z.string().max(120).nullable().optional(),
  helper: z.string().max(240).nullable().optional(),
});
const catalogGroupSchema = z.object({
  field_group_id: z.string().uuid(),
  is_enabled: z.boolean().optional(),
  custom_label: z.string().max(120).nullable().optional(),
});

/** Field Catalog drawer data: every active field + its tenant catalog
 *  state (enabled/required/relabel) + groups (enabled/relabel). */
export async function getWorkspaceFieldCatalog(): Promise<
  Result<{ groups: FieldCatalogGroupRow[]; fields: FieldCatalogField[] }>
> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const [defsR, groupsR, fOvR, gOvR] = await Promise.all([
    supabase
      .from("profile_field_definitions")
      .select("id, field_key, label, field_group_id")
      .is("deprecated_at", null),
    supabase
      .from("profile_field_groups")
      .select("id, name_en, slug, sort_order")
      .eq("is_active", true),
    supabase
      .from("workspace_profile_field_settings")
      .select("field_definition_id, enabled_override, required_override, custom_label, custom_helper")
      .eq("tenant_id", tenantId),
    supabase
      .from("workspace_field_group_settings")
      .select("field_group_id, is_enabled, custom_label")
      .eq("tenant_id", tenantId),
  ]);

  if (defsR.error || groupsR.error || fOvR.error || gOvR.error) {
    void improntaLog("admin_workspace_field_settings.error", {
      message: "[field-catalog] load failed:",
      detail: defsR.error?.message || groupsR.error?.message ||
        fOvR.error?.message || gOvR.error?.message,
    });
    return { ok: false, error: "Couldn't load the field catalog." };
  }

  const fOv = new Map(
    (fOvR.data ?? []).map((o) => [o.field_definition_id as string, o]),
  );
  const gOv = new Map(
    (gOvR.data ?? []).map((o) => [o.field_group_id as string, o]),
  );

  const fields: FieldCatalogField[] = (defsR.data ?? []).map((d) => {
    const def = d as {
      id: string; field_key: string; label: string;
      field_group_id: string | null;
    };
    const o = fOv.get(def.id) as
      | {
          enabled_override: boolean | null; required_override: boolean | null;
          custom_label: string | null; custom_helper: string | null;
        }
      | undefined;
    return {
      field_definition_id: def.id,
      field_key: def.field_key,
      label: def.label,
      field_group_id: def.field_group_id,
      enabled: o?.enabled_override !== false,
      required_override: o?.required_override ?? null,
      custom_label: o?.custom_label ?? null,
      custom_helper: o?.custom_helper ?? null,
    };
  });

  const groups: FieldCatalogGroupRow[] = (groupsR.data ?? [])
    .map((g) => {
      const gg = g as {
        id: string; name_en: string | null; slug: string;
        sort_order: number | null;
      };
      const o = gOv.get(gg.id) as
        | { is_enabled: boolean | null; custom_label: string | null }
        | undefined;
      return {
        id: gg.id,
        name: gg.name_en ?? gg.slug,
        sort_order: gg.sort_order ?? 0,
        enabled: o?.is_enabled !== false,
        custom_label: o?.custom_label ?? null,
      };
    })
    .sort((a, b) => a.sort_order - b.sort_order);

  return { ok: true, groups, fields };
}

/** Set tenant catalog overrides for a field (enable / require / relabel).
 *  Only the provided keys are written; omit a key to leave it unchanged. */
export async function setWorkspaceFieldCatalog(
  input: z.infer<typeof catalogFieldSchema>,
): Promise<OkResult> {
  const parsed = catalogFieldSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { field_definition_id, enabled, required, custom_label, helper } = parsed.data;

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  const row: Record<string, unknown> = {
    tenant_id: tenantId,
    field_definition_id,
    last_changed_by_user_id: user?.id ?? null,
    updated_at: new Date().toISOString(),
  };
  if (enabled !== undefined) row.enabled_override = enabled;
  if (required !== undefined) row.required_override = required;
  if (custom_label !== undefined) {
    row.custom_label = custom_label && custom_label.trim() ? custom_label.trim() : null;
  }
  if (helper !== undefined) {
    row.custom_helper = helper && helper.trim() ? helper.trim() : null;
  }

  const { error } = await supabase
    .from("workspace_profile_field_settings")
    .upsert(row, { onConflict: "tenant_id,field_definition_id" });
  if (error) {
    void improntaLog("admin_workspace_field_settings.error", {
      message: "[field-catalog] set field failed:",
      error: error.message,
    });
    return { ok: false, error: "Couldn't save the field." };
  }
  bustFieldCatalog(tenantId);
  return { ok: true };
}

/** Set tenant overrides for a field GROUP (enable / relabel). */
export async function setWorkspaceFieldGroup(
  input: z.infer<typeof catalogGroupSchema>,
): Promise<OkResult> {
  const parsed = catalogGroupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { field_group_id, is_enabled, custom_label } = parsed.data;

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const row: Record<string, unknown> = {
    tenant_id: tenantId,
    field_group_id,
    updated_at: new Date().toISOString(),
  };
  if (is_enabled !== undefined) row.is_enabled = is_enabled;
  if (custom_label !== undefined) {
    row.custom_label = custom_label && custom_label.trim() ? custom_label.trim() : null;
  }

  const { error } = await supabase
    .from("workspace_field_group_settings")
    .upsert(row, { onConflict: "tenant_id,field_group_id" });
  if (error) {
    void improntaLog("admin_workspace_field_settings.error", {
      message: "[field-catalog] set group failed:",
      error: error.message,
    });
    return { ok: false, error: "Couldn't save the group." };
  }
  bustFieldCatalog(tenantId);
  return { ok: true };
}
