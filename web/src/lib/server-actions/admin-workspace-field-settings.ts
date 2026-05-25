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
import { logEngineAudit } from "./engine-audit";
import {
  CACHE_TAG_FIELD_CATALOG,
  fieldCatalogTagForTenant,
} from "@/lib/field-engine/cache-tags";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

// ── Phase 7a — audit helpers ────────────────────────────────────────────
// Tiny shaping helpers so the before/after snapshots stored in
// engine_audit_log are readable and stable across operations. Keep these
// in this file (not in engine-audit.ts) — they're tied to *this* table's
// column set, not to the audit log itself.

type FieldOverrideSnapshot = {
  enabled_override: boolean | null;
  required_override: boolean | null;
  show_in_public_override: boolean | null;
  admin_only_override: boolean | null;
  default_visibility_override: string[] | null;
  custom_label: string | null;
  custom_helper: string | null;
  display_order_override: number | null;
};

type GroupOverrideSnapshot = {
  is_enabled: boolean | null;
  custom_label: string | null;
  display_order: number | null;
};

const FIELD_OVERRIDE_COLS =
  "enabled_override, required_override, show_in_public_override, admin_only_override, default_visibility_override, custom_label, custom_helper, display_order_override";

const GROUP_OVERRIDE_COLS = "is_enabled, custom_label, display_order";

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
  revalidateTag(CACHE_TAG_FIELD_CATALOG, "default");
  revalidateTag(fieldCatalogTagForTenant(tenantId), "default");
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
  display_order: number;
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

  const [defsR, groupsR, ovR, groupOvR] = await Promise.all([
    // eslint-disable-next-line ratchet/no-untenanted-from -- profile_field_definitions is the platform-global catalog table and has no tenant_id column
    supabase
      .from("profile_field_definitions")
      .select(
        "id, field_key, label, field_group_id, display_order, admin_only, is_sensitive, default_visibility, show_in_public",
      )
      .is("deprecated_at", null),
    // eslint-disable-next-line ratchet/no-untenanted-from -- profile_field_groups is the platform-global catalog table and has no tenant_id column
    supabase
      .from("profile_field_groups")
      .select("id, slug, name_en, sort_order")
      .eq("is_active", true),
    tenantScopedQuery(supabase, "workspace_profile_field_settings", tenantId)
      .select(
        "field_definition_id, show_in_public_override, admin_only_override, default_visibility_override, custom_label, display_order_override",
      ),
    tenantScopedQuery(supabase, "workspace_field_group_settings", tenantId)
      .select("field_group_id, custom_label, display_order"),
  ]);

  if (defsR.error || groupsR.error || ovR.error || groupOvR.error) {
    void improntaLog("admin_workspace_field_settings.error", {
      message: "[field-privacy-catalog] load failed:",
      detail:
        defsR.error?.message ||
        groupsR.error?.message ||
        ovR.error?.message ||
        groupOvR.error?.message,
    });
    return { ok: false, error: "Couldn't load the field catalog." };
  }

  const ovByField = new Map(
    (ovR.data ?? []).map((o) => [o.field_definition_id as string, o]),
  );
  const groupOvByGroup = new Map(
    (groupOvR.data ?? []).map((o) => [o.field_group_id as string, o]),
  );

  const fields: FieldPrivacyEntry[] = (defsR.data ?? []).map((d) => {
    const def = d as {
      id: string;
      field_key: string;
      label: string;
      field_group_id: string | null;
      display_order: number | null;
      admin_only: boolean | null;
      is_sensitive: boolean | null;
      default_visibility: string[] | null;
      show_in_public: boolean | null;
    };
    const o = ovByField.get(def.id) as
      | {
          show_in_public_override: boolean | null;
          admin_only_override: boolean | null;
          default_visibility_override: string[] | null;
          custom_label: string | null;
          display_order_override: number | null;
        }
      | undefined;
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
      label: o?.custom_label ?? def.label,
      field_group_id: def.field_group_id,
      display_order: o?.display_order_override ?? def.display_order ?? 100,
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
      const o = groupOvByGroup.get(gg.id) as
        | { custom_label: string | null; display_order: number | null }
        | undefined;
      return {
        id: gg.id,
        slug: gg.slug,
        name: o?.custom_label ?? gg.name_en ?? gg.slug,
        sort_order: o?.display_order ?? gg.sort_order ?? 0,
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

  const { data, error } = await tenantScopedQuery(
    supabase,
    "workspace_profile_field_settings",
    tenantId,
  )
    .select(
      "field_definition_id, enabled_override, required_override, show_in_public_override, admin_only_override, default_visibility_override, custom_label, custom_helper",
    );

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
  // eslint-disable-next-line ratchet/no-untenanted-from -- profile_field_definitions is the platform-global catalog table and has no tenant_id column
  const { data: def, error: defErr } = await supabase
    .from("profile_field_definitions")
    .select("id, field_key, admin_only, is_sensitive")
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

  // Phase 7a: capture before-snapshot for audit. Null when no override
  // existed yet (the resolver treats that as platform-default).
  const { data: beforeRow } = await tenantScopedQuery(
    supabase,
    "workspace_profile_field_settings",
    tenantId,
  )
    .select(FIELD_OVERRIDE_COLS)
    .eq("field_definition_id", field_definition_id)
    .maybeSingle();

  const cols = visibilityToOverrideColumns(visibility as FieldVisibility);
  const { error } = await tenantScopedQuery(
    supabase,
    "workspace_profile_field_settings",
    tenantId,
  )
    .upsert(
      {
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
  await logEngineAudit({
    tenantId,
    actorUserId: user?.id ?? null,
    actorRole: "agency_admin",
    surface: "field-privacy",
    subjectKind: "field",
    subjectId: field_definition_id,
    subjectKey: (def as { field_key?: string }).field_key ?? null,
    operation: "set",
    beforeValue: (beforeRow as FieldOverrideSnapshot | null) ?? null,
    afterValue: {
      show_in_public_override: cols.show_in_public_override,
      admin_only_override: cols.admin_only_override,
      default_visibility_override: cols.default_visibility_override,
      visibility,
    },
  });
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
  const { supabase, tenantId, user } = auth;

  // Phase 7a: snapshot before-state (and resolve field_key for the
  // audit row's human-readable handle) before we delete the override.
  const [beforeRowR, defR] = await Promise.all([
    tenantScopedQuery(supabase, "workspace_profile_field_settings", tenantId)
      .select(FIELD_OVERRIDE_COLS)
      .eq("field_definition_id", parsed.data.field_definition_id)
      .maybeSingle(),
    // eslint-disable-next-line ratchet/no-untenanted-from -- profile_field_definitions is the platform-global catalog table and has no tenant_id column
    supabase
      .from("profile_field_definitions")
      .select("field_key")
      .eq("id", parsed.data.field_definition_id)
      .maybeSingle(),
  ]);

  const { error } = await tenantScopedQuery(
    supabase,
    "workspace_profile_field_settings",
    tenantId,
  )
    .delete()
    .eq("field_definition_id", parsed.data.field_definition_id);

  if (error) {
    void improntaLog("admin_workspace_field_settings.error", {
      message: "[workspace-field-settings] reset failed:",
      error: error.message,
    });
    return { ok: false, error: "Couldn't reset the field setting." };
  }
  bustFieldCatalog(tenantId);
  await logEngineAudit({
    tenantId,
    actorUserId: user?.id ?? null,
    actorRole: "agency_admin",
    surface: "reset",
    subjectKind: "field",
    subjectId: parsed.data.field_definition_id,
    subjectKey: (defR.data as { field_key?: string } | null)?.field_key ?? null,
    operation: "reset",
    beforeValue: (beforeRowR.data as FieldOverrideSnapshot | null) ?? null,
    afterValue: null,
  });
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
  display_order: number;
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
  display_order: z.number().int().nullable().optional(),
});
const catalogGroupSchema = z.object({
  field_group_id: z.string().uuid(),
  is_enabled: z.boolean().optional(),
  custom_label: z.string().max(120).nullable().optional(),
  display_order: z.number().int().nullable().optional(),
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
    // eslint-disable-next-line ratchet/no-untenanted-from -- profile_field_definitions is the platform-global catalog table and has no tenant_id column
    supabase
      .from("profile_field_definitions")
      .select("id, field_key, label, field_group_id, display_order")
      .is("deprecated_at", null),
    // eslint-disable-next-line ratchet/no-untenanted-from -- profile_field_groups is the platform-global catalog table and has no tenant_id column
    supabase
      .from("profile_field_groups")
      .select("id, name_en, slug, sort_order")
      .eq("is_active", true),
    tenantScopedQuery(supabase, "workspace_profile_field_settings", tenantId)
      .select("field_definition_id, enabled_override, required_override, custom_label, custom_helper, display_order_override"),
    tenantScopedQuery(supabase, "workspace_field_group_settings", tenantId)
      .select("field_group_id, is_enabled, custom_label, display_order"),
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
      field_group_id: string | null; display_order: number | null;
    };
    const o = fOv.get(def.id) as
      | {
          enabled_override: boolean | null; required_override: boolean | null;
          custom_label: string | null; custom_helper: string | null;
          display_order_override: number | null;
        }
      | undefined;
    return {
      field_definition_id: def.id,
      field_key: def.field_key,
      label: def.label,
      field_group_id: def.field_group_id,
      display_order: o?.display_order_override ?? def.display_order ?? 100,
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
        | { is_enabled: boolean | null; custom_label: string | null; display_order: number | null }
        | undefined;
      return {
        id: gg.id,
        name: gg.name_en ?? gg.slug,
        sort_order: o?.display_order ?? gg.sort_order ?? 0,
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
  const { field_definition_id, enabled, required, custom_label, helper, display_order } = parsed.data;

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  const row: Record<string, unknown> = {
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
  if (display_order !== undefined) row.display_order_override = display_order;

  // Phase 7a: capture before-state + field_key for audit.
  const [beforeRowR, defR] = await Promise.all([
    tenantScopedQuery(supabase, "workspace_profile_field_settings", tenantId)
      .select(FIELD_OVERRIDE_COLS)
      .eq("field_definition_id", field_definition_id)
      .maybeSingle(),
    // eslint-disable-next-line ratchet/no-untenanted-from -- profile_field_definitions is the platform-global catalog table and has no tenant_id column
    supabase
      .from("profile_field_definitions")
      .select("field_key")
      .eq("id", field_definition_id)
      .maybeSingle(),
  ]);

  const { error } = await tenantScopedQuery(
    supabase,
    "workspace_profile_field_settings",
    tenantId,
  )
    .upsert(row, { onConflict: "tenant_id,field_definition_id" });
  if (error) {
    void improntaLog("admin_workspace_field_settings.error", {
      message: "[field-catalog] set field failed:",
      error: error.message,
    });
    return { ok: false, error: "Couldn't save the field." };
  }
  bustFieldCatalog(tenantId);

  // Pick the audited operation: enable/disable when only the toggle
  // moved, otherwise generic 'set'.
  const onlyEnableToggle =
    enabled !== undefined &&
    required === undefined &&
    custom_label === undefined &&
    helper === undefined &&
    display_order === undefined;
  const operation: "set" | "enable" | "disable" = onlyEnableToggle
    ? enabled
      ? "enable"
      : "disable"
    : "set";

  await logEngineAudit({
    tenantId,
    actorUserId: user?.id ?? null,
    actorRole: "agency_admin",
    surface: "field-catalog",
    subjectKind: "field",
    subjectId: field_definition_id,
    subjectKey: (defR.data as { field_key?: string } | null)?.field_key ?? null,
    operation,
    beforeValue: (beforeRowR.data as FieldOverrideSnapshot | null) ?? null,
    // Only echo the writer's intent (the columns we actually set), so a
    // reader can diff cleanly against `beforeValue`. Don't re-query the
    // row — the upsert just succeeded.
    afterValue: {
      enabled_override: enabled,
      required_override: required,
      custom_label: row.custom_label,
      custom_helper: row.custom_helper,
      display_order_override: display_order,
    },
  });
  return { ok: true };
}

/** Set tenant overrides for a field GROUP (enable / relabel). */
export async function setWorkspaceFieldGroup(
  input: z.infer<typeof catalogGroupSchema>,
): Promise<OkResult> {
  const parsed = catalogGroupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { field_group_id, is_enabled, custom_label, display_order } = parsed.data;

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  const row: Record<string, unknown> = {
    field_group_id,
    updated_at: new Date().toISOString(),
  };
  if (is_enabled !== undefined) row.is_enabled = is_enabled;
  if (custom_label !== undefined) {
    row.custom_label = custom_label && custom_label.trim() ? custom_label.trim() : null;
  }
  if (display_order !== undefined) row.display_order = display_order;

  // Phase 7a: capture before-state + group slug for audit.
  const [beforeRowR, groupR] = await Promise.all([
    tenantScopedQuery(supabase, "workspace_field_group_settings", tenantId)
      .select(GROUP_OVERRIDE_COLS)
      .eq("field_group_id", field_group_id)
      .maybeSingle(),
    // eslint-disable-next-line ratchet/no-untenanted-from -- profile_field_groups is the platform-global catalog table and has no tenant_id column
    supabase
      .from("profile_field_groups")
      .select("slug")
      .eq("id", field_group_id)
      .maybeSingle(),
  ]);

  const { error } = await tenantScopedQuery(
    supabase,
    "workspace_field_group_settings",
    tenantId,
  )
    .upsert(row, { onConflict: "tenant_id,field_group_id" });
  if (error) {
    void improntaLog("admin_workspace_field_settings.error", {
      message: "[field-catalog] set group failed:",
      error: error.message,
    });
    return { ok: false, error: "Couldn't save the group." };
  }
  bustFieldCatalog(tenantId);

  const onlyEnableToggle =
    is_enabled !== undefined && custom_label === undefined && display_order === undefined;
  const operation: "set" | "enable" | "disable" = onlyEnableToggle
    ? is_enabled
      ? "enable"
      : "disable"
    : "set";

  await logEngineAudit({
    tenantId,
    actorUserId: user?.id ?? null,
    actorRole: "agency_admin",
    surface: "field-group",
    subjectKind: "group",
    subjectId: field_group_id,
    subjectKey: (groupR.data as { slug?: string } | null)?.slug ?? null,
    operation,
    beforeValue: (beforeRowR.data as GroupOverrideSnapshot | null) ?? null,
    afterValue: {
      is_enabled,
      custom_label: row.custom_label,
      display_order,
    },
  });
  return { ok: true };
}
