"use server";
/* eslint-disable max-lines -- cohesive platform-catalog server-action module (field/group CRUD + lifecycle + hard-delete); a split is a clean follow-up. */

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformRole } from "@/lib/access/platform-role";
import { CACHE_TAG_FIELD_CATALOG } from "@/lib/field-engine/cache-tags";
import { logServerError } from "@/lib/server/safe-error";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sanitizePlatformFieldSafety } from "./field-safety";

type PlatformActionContext = {
  ok: true;
  sb: SupabaseClient;
  actorId: string;
} | {
  ok: false;
  error: string;
};

const FIELD_KIND = new Set([
  "text",
  "number",
  "select",
  "multiselect",
  "chips",
  "date",
  "toggle",
  "textarea",
]);

const FIELD_TIER = new Set(["universal", "global", "type-specific"]);

const VISIBILITY_CHANNELS = ["public", "agency", "private"] as const;

async function requirePlatformAdmin(): Promise<PlatformActionContext> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "You must be signed in." };
  if (getPlatformRole(session.profile) !== "super_admin") {
    return { ok: false, error: "Forbidden - platform admin only." };
  }
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Platform service client unavailable." };
  return { ok: true, sb, actorId: session.user.id };
}

async function recordEngineAudit(
  sb: SupabaseClient,
  args: {
    actorId: string;
    action: string;
    targetType: string;
    targetId: string | null;
    beforeValue?: unknown;
    afterValue?: unknown;
    severity?: "info" | "warn" | "emergency";
  },
): Promise<void> {
  try {
    await sb.from("platform_audit_log").insert({
      actor_profile_id: args.actorId,
      actor_role: "super_admin",
      action: args.action,
      target_type: args.targetType,
      target_id: args.targetId,
      tenant_id: null,
      severity: args.severity ?? "info",
      metadata: {
        before: args.beforeValue ?? null,
        after: args.afterValue ?? null,
      },
    });
  } catch (err) {
    logServerError("platform.engine.audit", err);
  }
}

function text(fd: FormData, key: string): string | null {
  const raw = fd.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function intOrNull(fd: FormData, key: string): number | null {
  const raw = text(fd, key);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function parseOrderedIds(fd: FormData): string[] {
  const raw = text(fd, "ordered_ids");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function checked(fd: FormData, key: string): boolean {
  return fd.get(key) === "on";
}

function parseDefaultVisibility(fd: FormData): string[] {
  return VISIBILITY_CHANNELS.filter((channel) => fd.get(`default_visibility_${channel}`) === "on");
}

function parseOptions(raw: string | null): unknown {
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Options must be a JSON array.");
  }
  return parsed;
}

function revalidateEngineSurfaces(fieldKey?: string | null): void {
  revalidateTag(CACHE_TAG_FIELD_CATALOG, "default");
  revalidatePath("/platform/admin/catalog");
  revalidatePath("/platform/admin/taxonomy");
  revalidatePath("/impronta/admin/settings");
  revalidatePath("/impronta/admin/roster");
  if (fieldKey) {
    revalidatePath(`/platform/admin/catalog/${encodeURIComponent(fieldKey)}`);
  }
}

export async function createPlatformFieldAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/catalog?error=${encodeURIComponent(auth.error)}`);

  const fieldKey = text(formData, "field_key");
  const label = text(formData, "label");
  const tier = text(formData, "tier") ?? "type-specific";
  const kind = text(formData, "kind") ?? "text";
  if (!fieldKey || !label) {
    redirect("/platform/admin/catalog?error=Field%20key%20and%20label%20are%20required");
  }
  if (!FIELD_TIER.has(tier) || !FIELD_KIND.has(kind)) {
    redirect("/platform/admin/catalog?error=Invalid%20field%20type");
  }

  let options: unknown = null;
  try {
    options = parseOptions(text(formData, "options_json"));
  } catch {
    redirect("/platform/admin/catalog?error=Options%20must%20be%20a%20JSON%20array");
  }

  const adminOnly = checked(formData, "admin_only");
  const sensitive = checked(formData, "is_sensitive");
  const safety = sanitizePlatformFieldSafety({
    defaultVisibility: parseDefaultVisibility(formData),
    showInPublic: checked(formData, "show_in_public"),
    showInDirectory: checked(formData, "show_in_directory"),
    showInRegistration: checked(formData, "show_in_registration"),
    talentEditable: checked(formData, "talent_editable"),
    adminOnly,
    sensitive,
  });

  const insertRow = {
    field_key: fieldKey,
    label,
    label_es: text(formData, "label_es"),
    helper: text(formData, "helper"),
    helper_es: text(formData, "helper_es"),
    placeholder: text(formData, "placeholder"),
    unit: text(formData, "unit"),
    tier,
    kind,
    section: text(formData, "section") ?? "type-specific",
    subsection: text(formData, "subsection"),
    field_group_id: text(formData, "field_group_id"),
    default_visibility: safety.defaultVisibility,
    show_in_public: safety.showInPublic,
    show_in_directory: safety.showInDirectory,
    show_in_registration: safety.showInRegistration,
    show_in_edit_drawer: checked(formData, "show_in_edit_drawer"),
    admin_only: adminOnly,
    is_sensitive: sensitive,
    talent_editable: safety.talentEditable,
    requires_review_on_change: checked(formData, "requires_review_on_change"),
    is_searchable: checked(formData, "is_searchable"),
    display_order: intOrNull(formData, "display_order") ?? 100,
    count_min: intOrNull(formData, "count_min"),
    is_optional: !checked(formData, "required_default"),
    options,
  };

  const { data: created, error } = await auth.sb
    .from("profile_field_definitions")
    .insert(insertRow)
    .select("id, field_key")
    .single();

  if (error) {
    logServerError("platform.catalog.createField", error);
    redirect("/platform/admin/catalog?error=Could%20not%20create%20field");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.field.create",
    targetType: "profile_field_definition",
    targetId: created?.id ?? null,
    beforeValue: null,
    afterValue: insertRow,
    severity: adminOnly || sensitive || !insertRow.is_optional ? "warn" : "info",
  });

  revalidateEngineSurfaces(created?.field_key ?? fieldKey);
  redirect(`/platform/admin/catalog/${encodeURIComponent(created?.field_key ?? fieldKey)}?saved=create`);
}

export async function updatePlatformFieldAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/catalog?error=${encodeURIComponent(auth.error)}`);

  const id = text(formData, "id");
  const currentFieldKey = text(formData, "current_field_key");
  if (!id || !currentFieldKey) redirect("/platform/admin/catalog?error=Missing%20field");

  const fieldKey = text(formData, "field_key") ?? currentFieldKey;
  const label = text(formData, "label") ?? fieldKey;
  const tier = text(formData, "tier") ?? "global";
  const kind = text(formData, "kind") ?? "text";
  if (!FIELD_TIER.has(tier) || !FIELD_KIND.has(kind)) {
    redirect(`/platform/admin/catalog/${encodeURIComponent(currentFieldKey)}?error=Invalid%20field%20type`);
  }

  let options: unknown = null;
  try {
    options = parseOptions(text(formData, "options_json"));
  } catch {
    redirect(`/platform/admin/catalog/${encodeURIComponent(currentFieldKey)}?error=Options%20must%20be%20a%20JSON%20array`);
  }

  const { data: beforeRow } = await auth.sb
    .from("profile_field_definitions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const adminOnly = checked(formData, "admin_only");
  const sensitive = checked(formData, "is_sensitive");
  const safety = sanitizePlatformFieldSafety({
    defaultVisibility: parseDefaultVisibility(formData),
    showInPublic: checked(formData, "show_in_public"),
    showInDirectory: checked(formData, "show_in_directory"),
    showInRegistration: checked(formData, "show_in_registration"),
    talentEditable: checked(formData, "talent_editable"),
    adminOnly,
    sensitive,
  });

  const patch = {
    field_key: fieldKey,
    label,
    label_es: text(formData, "label_es"),
    helper: text(formData, "helper"),
    helper_es: text(formData, "helper_es"),
    placeholder: text(formData, "placeholder"),
    unit: text(formData, "unit"),
    tier,
    kind,
    section: text(formData, "section") ?? "type-specific",
    subsection: text(formData, "subsection"),
    field_group_id: text(formData, "field_group_id"),
    default_visibility: safety.defaultVisibility,
    show_in_public: safety.showInPublic,
    show_in_directory: safety.showInDirectory,
    show_in_registration: safety.showInRegistration,
    show_in_edit_drawer: checked(formData, "show_in_edit_drawer"),
    admin_only: adminOnly,
    is_sensitive: sensitive,
    talent_editable: safety.talentEditable,
    requires_review_on_change: checked(formData, "requires_review_on_change"),
    is_searchable: checked(formData, "is_searchable"),
    display_order: intOrNull(formData, "display_order") ?? 100,
    count_min: intOrNull(formData, "count_min"),
    options,
    updated_at: new Date().toISOString(),
  };

  const { error } = await auth.sb
    .from("profile_field_definitions")
    .update(patch)
    .eq("id", id);

  if (error) {
    logServerError("platform.catalog.updateField", error);
    redirect(`/platform/admin/catalog/${encodeURIComponent(currentFieldKey)}?error=Could%20not%20save%20field`);
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.field.update",
    targetType: "profile_field_definition",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: patch,
    severity: patch.admin_only || patch.is_sensitive ? "warn" : "info",
  });

  revalidateEngineSurfaces(fieldKey);
  redirect(`/platform/admin/catalog/${encodeURIComponent(fieldKey)}?saved=field`);
}

export async function setPlatformFieldLifecycleAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/catalog?error=${encodeURIComponent(auth.error)}`);

  const id = text(formData, "id");
  const fieldKey = text(formData, "field_key");
  const mode = text(formData, "mode");
  if (!id || !fieldKey || (mode !== "archive" && mode !== "restore")) {
    redirect("/platform/admin/catalog?error=Invalid%20lifecycle%20request");
  }

  const { data: beforeRow } = await auth.sb
    .from("profile_field_definitions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const patch =
    mode === "archive"
      ? {
          deprecated_at: new Date().toISOString(),
          show_in_public: false,
          show_in_directory: false,
          show_in_registration: false,
          show_in_edit_drawer: false,
          updated_at: new Date().toISOString(),
        }
      : {
          deprecated_at: null,
          show_in_edit_drawer: true,
          updated_at: new Date().toISOString(),
        };

  const { error } = await auth.sb
    .from("profile_field_definitions")
    .update(patch)
    .eq("id", id);

  if (error) {
    logServerError("platform.catalog.lifecycle", error);
    redirect(`/platform/admin/catalog/${encodeURIComponent(fieldKey)}?error=Could%20not%20change%20lifecycle`);
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: mode === "archive" ? "platform.engine.field.archive" : "platform.engine.field.restore",
    targetType: "profile_field_definition",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: patch,
    severity: "warn",
  });

  revalidateEngineSurfaces(fieldKey);
  redirect(`/platform/admin/catalog/${encodeURIComponent(fieldKey)}?saved=lifecycle`);
}

export async function updatePlatformFieldRecommendationAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/catalog?error=${encodeURIComponent(auth.error)}`);

  const fieldDefinitionId = text(formData, "field_definition_id");
  const fieldKey = text(formData, "field_key");
  const taxonomyTermId = text(formData, "taxonomy_term_id");
  const relationship = text(formData, "relationship") ?? "applies";
  if (!fieldDefinitionId || !fieldKey || !taxonomyTermId) {
    redirect("/platform/admin/catalog?error=Missing%20mapping");
  }
  if (!["applies", "recommended", "required"].includes(relationship)) {
    redirect(`/platform/admin/catalog/${encodeURIComponent(fieldKey)}?error=Invalid%20mapping%20relationship`);
  }

  const { data: beforeRows } = await auth.sb
    .from("profile_field_recommendations")
    .select("*")
    .eq("field_definition_id", fieldDefinitionId)
    .eq("taxonomy_term_id", taxonomyTermId);

  const displayOrder = intOrNull(formData, "display_order") ?? 100;
  await auth.sb
    .from("profile_field_recommendations")
    .delete()
    .eq("field_definition_id", fieldDefinitionId)
    .eq("taxonomy_term_id", taxonomyTermId);

  const insertRow = {
    field_definition_id: fieldDefinitionId,
    taxonomy_term_id: taxonomyTermId,
    relationship,
    display_order: displayOrder,
    required_at_registration: checked(formData, "required_at_registration"),
    required_before_publish: checked(formData, "required_before_publish") || relationship === "required",
    required_before_verification: checked(formData, "required_before_verification"),
    requires_verification: checked(formData, "requires_verification"),
    is_admin_only: checked(formData, "is_admin_only"),
  };

  const { data: afterRow, error } = await auth.sb
    .from("profile_field_recommendations")
    .insert(insertRow)
    .select("*")
    .single();

  if (error) {
    logServerError("platform.catalog.setRecommendation", error);
    redirect(`/platform/admin/catalog/${encodeURIComponent(fieldKey)}?error=Could%20not%20save%20mapping`);
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.field.mapping.set",
    targetType: "profile_field_recommendation",
    targetId: afterRow?.id ?? null,
    beforeValue: beforeRows ?? [],
    afterValue: afterRow ?? insertRow,
    severity: insertRow.required_before_publish ? "warn" : "info",
  });

  revalidateEngineSurfaces(fieldKey);
  redirect(`/platform/admin/catalog/${encodeURIComponent(fieldKey)}?saved=mapping`);
}

export async function removePlatformFieldRecommendationAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/catalog?error=${encodeURIComponent(auth.error)}`);

  const id = text(formData, "id");
  const fieldKey = text(formData, "field_key");
  if (!id || !fieldKey) redirect("/platform/admin/catalog?error=Missing%20mapping");

  const { data: beforeRow } = await auth.sb
    .from("profile_field_recommendations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { error } = await auth.sb
    .from("profile_field_recommendations")
    .delete()
    .eq("id", id);

  if (error) {
    logServerError("platform.catalog.removeRecommendation", error);
    redirect(`/platform/admin/catalog/${encodeURIComponent(fieldKey)}?error=Could%20not%20remove%20mapping`);
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.field.mapping.remove",
    targetType: "profile_field_recommendation",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: null,
    severity: "warn",
  });

  revalidateEngineSurfaces(fieldKey);
  redirect(`/platform/admin/catalog/${encodeURIComponent(fieldKey)}?saved=mapping_removed`);
}

export async function createPlatformFieldGroupAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/catalog?tab=groups&error=${encodeURIComponent(auth.error)}`);

  const slug = text(formData, "slug");
  const nameEn = text(formData, "name_en");
  if (!slug || !nameEn) {
    redirect("/platform/admin/catalog?tab=groups&error=Slug%20and%20name%20(EN)%20are%20required");
  }

  const insertRow = {
    slug,
    name_en: nameEn,
    name_es: text(formData, "name_es"),
    description_en: text(formData, "description_en"),
    description_es: text(formData, "description_es"),
    sort_order: intOrNull(formData, "sort_order") ?? 100,
    is_active: true,
  };

  const { data: created, error } = await auth.sb
    .from("profile_field_groups")
    .insert(insertRow)
    .select("id")
    .single();

  if (error) {
    logServerError("platform.catalog.createGroup", error);
    redirect("/platform/admin/catalog?tab=groups&error=Could%20not%20create%20group");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.field_group.create",
    targetType: "profile_field_group",
    targetId: created?.id ?? null,
    beforeValue: null,
    afterValue: insertRow,
  });

  revalidateEngineSurfaces();
  redirect(`/platform/admin/catalog?tab=groups&saved=group_create`);
}

export async function setPlatformFieldGroupLifecycleAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/catalog?tab=groups&error=${encodeURIComponent(auth.error)}`);

  const id = text(formData, "id");
  const mode = text(formData, "mode");
  if (!id || (mode !== "archive" && mode !== "restore")) {
    redirect("/platform/admin/catalog?tab=groups&error=Invalid%20lifecycle%20request");
  }

  const { data: beforeRow } = await auth.sb
    .from("profile_field_groups")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const patch = {
    is_active: mode === "restore",
    updated_at: new Date().toISOString(),
  };

  const { error } = await auth.sb
    .from("profile_field_groups")
    .update(patch)
    .eq("id", id);

  if (error) {
    logServerError("platform.catalog.groupLifecycle", error);
    redirect(`/platform/admin/catalog/group/${id}?error=Could%20not%20change%20lifecycle`);
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: mode === "archive"
      ? "platform.engine.field_group.archive"
      : "platform.engine.field_group.restore",
    targetType: "profile_field_group",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: patch,
    severity: "warn",
  });

  revalidateEngineSurfaces();
  redirect(`/platform/admin/catalog/group/${id}?saved=group_lifecycle`);
}

export async function updatePlatformFieldGroupAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/catalog?tab=groups&error=${encodeURIComponent(auth.error)}`);

  const id = text(formData, "id");
  if (!id) redirect("/platform/admin/catalog?tab=groups&error=Missing%20group");

  const { data: beforeRow } = await auth.sb
    .from("profile_field_groups")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const patch = {
    slug: text(formData, "slug") ?? beforeRow?.slug,
    name_en: text(formData, "name_en") ?? beforeRow?.name_en,
    name_es: text(formData, "name_es"),
    description_en: text(formData, "description_en"),
    description_es: text(formData, "description_es"),
    sort_order: intOrNull(formData, "sort_order") ?? beforeRow?.sort_order ?? 100,
    is_active: checked(formData, "is_active"),
    updated_at: new Date().toISOString(),
  };

  const { error } = await auth.sb
    .from("profile_field_groups")
    .update(patch)
    .eq("id", id);

  if (error) {
    logServerError("platform.catalog.updateGroup", error);
    redirect(`/platform/admin/catalog?tab=groups&error=Could%20not%20save%20group`);
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.field_group.update",
    targetType: "profile_field_group",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: patch,
  });

  revalidateEngineSurfaces();
  redirect(`/platform/admin/catalog/group/${id}?saved=group`);
}

export async function reorderPlatformFieldGroupsAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/catalog?tab=groups&error=${encodeURIComponent(auth.error)}`);

  const orderedIds = parseOrderedIds(formData);
  if (orderedIds.length < 2) {
    redirect("/platform/admin/catalog?tab=groups&error=Add%20at%20least%20two%20groups%20to%20reorder");
  }

  const { data: rows, error } = await auth.sb
    .from("profile_field_groups")
    .select("id, name_en, sort_order")
    .in("id", orderedIds);

  if (error || !rows || rows.length !== orderedIds.length) {
    logServerError("platform.catalog.reorderGroups.readRows", error);
    redirect("/platform/admin/catalog?tab=groups&error=Could%20not%20load%20field%20groups");
  }

  const rowIds = new Set(rows.map((row) => row.id));
  if (new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !rowIds.has(id))) {
    redirect("/platform/admin/catalog?tab=groups&error=Invalid%20field%20group%20order");
  }

  const beforeValue = rows
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name_en.localeCompare(b.name_en))
    .map((row) => ({ id: row.id, sort_order: row.sort_order }));
  const afterValue = orderedIds.map((id, i) => ({ id, sort_order: (i + 1) * 10 }));
  const now = new Date().toISOString();

  const results = await Promise.all(
    afterValue.map((row) =>
      auth.sb
        .from("profile_field_groups")
        .update({ sort_order: row.sort_order, updated_at: now })
        .eq("id", row.id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    logServerError("platform.catalog.reorderGroups.update", failed.error);
    redirect("/platform/admin/catalog?tab=groups&error=Could%20not%20save%20field%20group%20order");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.field_group.reorder",
    targetType: "profile_field_group",
    targetId: "field_groups",
    beforeValue,
    afterValue,
  });

  revalidateEngineSurfaces();
  redirect("/platform/admin/catalog?tab=groups&saved=order");
}

export async function deletePlatformFieldAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/catalog?error=${encodeURIComponent(auth.error)}`);

  const id = text(formData, "id");
  const fieldKey = text(formData, "field_key");
  if (!id || !fieldKey) redirect("/platform/admin/catalog?error=Missing%20field");

  const { data: beforeRow } = await auth.sb
    .from("profile_field_definitions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // Dependent-row cleanup — delete child rows first to satisfy FKs.
  const { error: recErr } = await auth.sb
    .from("profile_field_recommendations")
    .delete()
    .eq("field_definition_id", id);
  if (recErr) {
    logServerError("platform.catalog.deleteField.recommendations", recErr);
    redirect(`/platform/admin/catalog/${encodeURIComponent(fieldKey)}?error=Could%20not%20remove%20field%20mappings`);
  }

  const { error: wsErr } = await auth.sb
    .from("workspace_profile_field_settings")
    .delete()
    .eq("field_definition_id", id);
  if (wsErr) {
    logServerError("platform.catalog.deleteField.workspaceSettings", wsErr);
    redirect(`/platform/admin/catalog/${encodeURIComponent(fieldKey)}?error=Could%20not%20remove%20workspace%20overrides`);
  }

  const { error: valErr } = await auth.sb
    .from("talent_profile_field_values")
    .delete()
    .eq("field_definition_id", id);
  if (valErr) {
    logServerError("platform.catalog.deleteField.values", valErr);
    redirect(`/platform/admin/catalog/${encodeURIComponent(fieldKey)}?error=Could%20not%20remove%20talent%20values`);
  }

  const { error } = await auth.sb
    .from("profile_field_definitions")
    .delete()
    .eq("id", id);
  if (error) {
    logServerError("platform.catalog.deleteField", error);
    redirect(`/platform/admin/catalog/${encodeURIComponent(fieldKey)}?error=Could%20not%20delete%20field`);
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.field.delete",
    targetType: "profile_field_definition",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: null,
    severity: "warn",
  });

  revalidateEngineSurfaces();
  redirect("/platform/admin/catalog?saved=field_deleted");
}

export async function deletePlatformFieldGroupAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/catalog?tab=groups&error=${encodeURIComponent(auth.error)}`);

  const id = text(formData, "id");
  if (!id) redirect("/platform/admin/catalog?tab=groups&error=Missing%20group");

  const { data: beforeRow } = await auth.sb
    .from("profile_field_groups")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // Dependent-row cleanup — detach member fields (don't destroy them).
  const { error: detachErr } = await auth.sb
    .from("profile_field_definitions")
    .update({ field_group_id: null, updated_at: new Date().toISOString() })
    .eq("field_group_id", id);
  if (detachErr) {
    logServerError("platform.catalog.deleteGroup.detachFields", detachErr);
    redirect("/platform/admin/catalog?tab=groups&error=Could%20not%20detach%20member%20fields");
  }

  const { error } = await auth.sb
    .from("profile_field_groups")
    .delete()
    .eq("id", id);
  if (error) {
    logServerError("platform.catalog.deleteGroup", error);
    redirect("/platform/admin/catalog?tab=groups&error=Could%20not%20delete%20group");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.field_group.delete",
    targetType: "profile_field_group",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: null,
    severity: "warn",
  });

  revalidateEngineSurfaces();
  redirect("/platform/admin/catalog?tab=groups&saved=group_deleted");
}

export async function reorderPlatformFieldsAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/catalog?error=${encodeURIComponent(auth.error)}`);

  const orderedIds = parseOrderedIds(formData);
  const fieldGroupIdRaw = text(formData, "field_group_id");
  const fieldGroupId = fieldGroupIdRaw === "__ungrouped__" ? null : fieldGroupIdRaw;
  if (orderedIds.length < 2) {
    redirect("/platform/admin/catalog?error=Add%20at%20least%20two%20fields%20to%20reorder");
  }

  const { data: rows, error } = await auth.sb
    .from("profile_field_definitions")
    .select("id, field_key, field_group_id, display_order")
    .in("id", orderedIds);

  if (error || !rows || rows.length !== orderedIds.length) {
    logServerError("platform.catalog.reorderFields.readRows", error);
    redirect("/platform/admin/catalog?error=Could%20not%20load%20fields");
  }

  const rowIds = new Set(rows.map((row) => row.id));
  const validIds = new Set(orderedIds).size === orderedIds.length &&
    orderedIds.every((id) => rowIds.has(id));
  const sameGroup = rows.every((row) => row.field_group_id === fieldGroupId);
  if (!validIds || !sameGroup) {
    redirect("/platform/admin/catalog?error=Invalid%20field%20order");
  }

  const beforeValue = rows
    .slice()
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.field_key.localeCompare(b.field_key))
    .map((row) => ({
      id: row.id,
      field_key: row.field_key,
      field_group_id: row.field_group_id,
      display_order: row.display_order,
    }));
  const afterValue = orderedIds.map((id, i) => ({ id, display_order: (i + 1) * 10 }));
  const now = new Date().toISOString();

  const results = await Promise.all(
    afterValue.map((row) =>
      auth.sb
        .from("profile_field_definitions")
        .update({ display_order: row.display_order, updated_at: now })
        .eq("id", row.id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    logServerError("platform.catalog.reorderFields.update", failed.error);
    redirect("/platform/admin/catalog?error=Could%20not%20save%20field%20order");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.field.reorder",
    targetType: "profile_field_definition",
    targetId: fieldGroupId ?? "ungrouped",
    beforeValue,
    afterValue,
  });

  revalidateEngineSurfaces();
  redirect("/platform/admin/catalog?saved=field_order");
}
