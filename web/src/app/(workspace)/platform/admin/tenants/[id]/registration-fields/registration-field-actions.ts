"use server";

/**
 * Platform Admin — per-tenant Registration Fields configurator actions.
 *
 * Lets a super_admin curate which profile fields appear (and are required,
 * and in what order) on a workspace's talent registration wizard — WITHOUT a
 * deploy. Every write lands in `workspace_profile_field_settings`
 * (`show_in_registration_override`, `required_override`,
 * `display_order_override`) which the resolver
 * (`profile-fields-service.loadFieldsForMode('registration')`) folds in.
 *
 * These take an explicit `tenantId` (the route's `[id]`) rather than the
 * caller's host scope — the configurator is a platform tool that operates on
 * ANY tenant — so they cannot reuse the host-scoped
 * `admin-workspace-field-settings.ts` actions. Auth + service-role +
 * audit + revalidate pattern mirrors `commission-actions.ts`.
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  CACHE_TAG_FIELD_CATALOG,
  fieldCatalogTagForTenant,
} from "@/lib/field-engine/cache-tags";
import { pgUuidSchema } from "@/lib/site-admin/validators";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requirePlatformAdmin(): Promise<
  { ok: true; sb: SupabaseClient; actorId: string } | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "You must be signed in." };
  if (getPlatformRole(session.profile) !== "super_admin") {
    return { ok: false, error: "Forbidden — platform admin only." };
  }
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Platform service client unavailable." };
  return { ok: true, sb, actorId: session.user.id };
}

/** Bust both the global + tenant-scoped catalog tags (so the resolver, the
 *  configurator loader, and the read-only posture page all refresh) and
 *  revalidate this tenant's pages. */
function bust(tenantId: string): void {
  revalidateTag(CACHE_TAG_FIELD_CATALOG, "default");
  revalidateTag(fieldCatalogTagForTenant(tenantId), "default");
  revalidatePath(`/platform/admin/tenants/${tenantId}/registration-fields`);
  revalidatePath(`/platform/admin/tenants/${tenantId}/catalog`);
}

async function audit(
  sb: SupabaseClient,
  actorId: string,
  tenantId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await sb.from("platform_audit_log").insert({
      actor_profile_id: actorId,
      actor_role: "super_admin",
      action,
      target_type: "workspace_profile_field_settings",
      target_id: tenantId,
      tenant_id: tenantId,
      severity: "info",
      metadata,
    });
  } catch (err) {
    logServerError("platform.reg-fields.audit", err);
  }
}

/** Guard: the field must exist, be non-deprecated, and live on a
 *  registration-eligible tier (universal / type-specific). Returns its key
 *  for the audit row, or an error message. */
async function assertRegistrationField(
  sb: SupabaseClient,
  fieldDefinitionId: string,
): Promise<{ ok: true; fieldKey: string } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("profile_field_definitions")
    .select("id, field_key, tier, deprecated_at")
    .eq("id", fieldDefinitionId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Unknown field." };
  const d = data as { field_key: string | null; tier: string | null; deprecated_at: string | null };
  if (d.deprecated_at) return { ok: false, error: "This field is deprecated." };
  if (d.tier !== "universal" && d.tier !== "type-specific") {
    return { ok: false, error: "This field is not eligible for the registration wizard." };
  }
  return { ok: true, fieldKey: d.field_key ?? fieldDefinitionId };
}

async function assertTenant(sb: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data } = await sb.from("agencies").select("id").eq("id", tenantId).maybeSingle();
  return !!data;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

// Canonical Postgres UUID-shape check (8-4-4-4-12 hex). zod's `.uuid()` enforces
// the RFC-4122 version/variant nibbles, which REJECTS hand-crafted seed tenant
// ids like Impronta's `00000000-0000-0000-0000-000000000001` (version nibble 0)
// — silently failing every registration-field write for those tenants with a
// generic "Invalid request." `pgUuidSchema` matches the column shape, not the
// RFC variant (shared helper from site-admin/validators).
const uuidish = pgUuidSchema();

const showSchema = z.object({
  tenantId: uuidish,
  fieldDefinitionId: uuidish,
  shown: z.boolean(),
});
const requiredSchema = z.object({
  tenantId: uuidish,
  fieldDefinitionId: uuidish,
  required: z.boolean(),
});
const reorderSchema = z.object({
  tenantId: uuidish,
  /** field_definition_ids in their desired display order. */
  orderedIds: z.array(uuidish).min(1).max(500),
});
const resetSchema = z.object({
  tenantId: uuidish,
  fieldDefinitionId: uuidish,
});

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Toggle whether a field is SHOWN on this tenant's registration wizard.
 *  Writes `show_in_registration_override`. */
export async function setRegistrationFieldShow(
  input: z.infer<typeof showSchema>,
): Promise<ActionResult> {
  const parsed = showSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { tenantId, fieldDefinitionId, shown } = parsed.data;

  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  if (!(await assertTenant(sb, tenantId))) return { ok: false, error: "Workspace not found." };
  const field = await assertRegistrationField(sb, fieldDefinitionId);
  if (!field.ok) return field;

  const { error } = await sb.from("workspace_profile_field_settings").upsert(
    {
      tenant_id: tenantId,
      field_definition_id: fieldDefinitionId,
      show_in_registration_override: shown,
      last_changed_by_user_id: actorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,field_definition_id" },
  );
  if (error) {
    logServerError("platform.reg-fields.show", error);
    return { ok: false, error: "Couldn't save the registration visibility." };
  }
  bust(tenantId);
  await audit(sb, actorId, tenantId, "platform.reg_fields.show.set", {
    field_definition_id: fieldDefinitionId,
    field_key: field.fieldKey,
    show_in_registration_override: shown,
  });
  return { ok: true };
}

/** Toggle whether a field is REQUIRED on this tenant's registration wizard.
 *  Writes `required_override`. */
export async function setRegistrationFieldRequired(
  input: z.infer<typeof requiredSchema>,
): Promise<ActionResult> {
  const parsed = requiredSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { tenantId, fieldDefinitionId, required } = parsed.data;

  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  if (!(await assertTenant(sb, tenantId))) return { ok: false, error: "Workspace not found." };
  const field = await assertRegistrationField(sb, fieldDefinitionId);
  if (!field.ok) return field;

  const { error } = await sb.from("workspace_profile_field_settings").upsert(
    {
      tenant_id: tenantId,
      field_definition_id: fieldDefinitionId,
      required_override: required,
      last_changed_by_user_id: actorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,field_definition_id" },
  );
  if (error) {
    logServerError("platform.reg-fields.required", error);
    return { ok: false, error: "Couldn't save the required setting." };
  }
  bust(tenantId);
  await audit(sb, actorId, tenantId, "platform.reg_fields.required.set", {
    field_definition_id: fieldDefinitionId,
    field_key: field.fieldKey,
    required_override: required,
  });
  return { ok: true };
}

/** Persist a new field display order for this tenant. Writes
 *  `display_order_override` for every field in `orderedIds` (1-indexed *10 so
 *  there's headroom to slot fields between others later). One upsert per
 *  field; all share the (tenant_id, field_definition_id) conflict target. */
export async function reorderRegistrationFields(
  input: z.infer<typeof reorderSchema>,
): Promise<ActionResult> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { tenantId, orderedIds } = parsed.data;

  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  if (!(await assertTenant(sb, tenantId))) return { ok: false, error: "Workspace not found." };

  // Validate every id is a registration-eligible, non-deprecated field. Reject
  // the whole reorder if any id is bogus — partial reorders are worse than none.
  const { data: defs, error: defErr } = await sb
    .from("profile_field_definitions")
    .select("id, tier, deprecated_at")
    .in("id", orderedIds);
  if (defErr) {
    logServerError("platform.reg-fields.reorder.lookup", defErr);
    return { ok: false, error: "Couldn't validate the fields." };
  }
  const valid = new Set(
    ((defs ?? []) as Array<{ id: string; tier: string | null; deprecated_at: string | null }>)
      .filter((d) => !d.deprecated_at && (d.tier === "universal" || d.tier === "type-specific"))
      .map((d) => d.id),
  );
  if (orderedIds.some((id) => !valid.has(id))) {
    return { ok: false, error: "One or more fields are not eligible for registration ordering." };
  }

  const now = new Date().toISOString();
  const rows = orderedIds.map((id, index) => ({
    tenant_id: tenantId,
    field_definition_id: id,
    display_order_override: (index + 1) * 10,
    last_changed_by_user_id: actorId,
    updated_at: now,
  }));

  const { error } = await sb
    .from("workspace_profile_field_settings")
    .upsert(rows, { onConflict: "tenant_id,field_definition_id" });
  if (error) {
    logServerError("platform.reg-fields.reorder", error);
    return { ok: false, error: "Couldn't save the new field order." };
  }
  bust(tenantId);
  await audit(sb, actorId, tenantId, "platform.reg_fields.reorder", {
    count: orderedIds.length,
    ordered_field_ids: orderedIds,
  });
  return { ok: true };
}

/** Clear the registration overrides for ONE field → it inherits the catalog
 *  defaults again. Nulls `show_in_registration_override`,
 *  `required_override`, `display_order_override`. If that leaves the row with
 *  no meaningful override at all, delete it so the table stays sparse. */
export async function resetRegistrationField(
  input: z.infer<typeof resetSchema>,
): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { tenantId, fieldDefinitionId } = parsed.data;

  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  if (!(await assertTenant(sb, tenantId))) return { ok: false, error: "Workspace not found." };

  const { data: existing } = await sb
    .from("workspace_profile_field_settings")
    .select(
      "enabled_override, show_in_public_override, show_in_edit_drawer_override, show_in_directory_override, admin_only_override, talent_editable_override, requires_review_on_change_override, custom_label, custom_helper, default_visibility_override",
    )
    .eq("tenant_id", tenantId)
    .eq("field_definition_id", fieldDefinitionId)
    .maybeSingle();

  // If the row carries OTHER overrides (privacy, relabel, enable), keep it and
  // only null the three registration columns. Otherwise delete the whole row.
  const e = existing as Record<string, unknown> | null;
  const hasOtherOverrides =
    !!e &&
    (e.enabled_override != null ||
      e.show_in_public_override != null ||
      e.show_in_edit_drawer_override != null ||
      e.show_in_directory_override != null ||
      e.admin_only_override != null ||
      e.talent_editable_override != null ||
      e.requires_review_on_change_override != null ||
      e.custom_label != null ||
      e.custom_helper != null ||
      e.default_visibility_override != null);

  if (hasOtherOverrides) {
    const { error } = await sb
      .from("workspace_profile_field_settings")
      .update({
        show_in_registration_override: null,
        required_override: null,
        display_order_override: null,
        last_changed_by_user_id: actorId,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("field_definition_id", fieldDefinitionId);
    if (error) {
      logServerError("platform.reg-fields.reset.update", error);
      return { ok: false, error: "Couldn't reset the field." };
    }
  } else {
    const { error } = await sb
      .from("workspace_profile_field_settings")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("field_definition_id", fieldDefinitionId);
    if (error) {
      logServerError("platform.reg-fields.reset.delete", error);
      return { ok: false, error: "Couldn't reset the field." };
    }
  }
  bust(tenantId);
  await audit(sb, actorId, tenantId, "platform.reg_fields.reset", {
    field_definition_id: fieldDefinitionId,
    kept_other_overrides: hasOtherOverrides,
  });
  return { ok: true };
}
