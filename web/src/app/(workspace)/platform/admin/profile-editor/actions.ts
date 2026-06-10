"use server";
/* eslint-disable max-lines -- cohesive section-editor server-action module (group/section CRUD + reorder + hard-delete); a split is a clean follow-up. */

// Server actions for the Editor Layout admin tab (B2). Mirrors the catalog
// actions pattern (catalog/actions.ts): super_admin gate via requirePlatformAdmin,
// engine-audit each mutation, then revalidate the profile-editor-layout cache tag
// + the catalog page, and redirect back to ?tab=editor with a saved/error flag.
//
// These mutate the two soft-archive tables B0 created:
//   profile_editor_section_groups (id, slug, label_en, label_es, label_en_alt,
//     label_es_alt, sort_order, is_active, is_system)
//   profile_editor_sections (id, slug, label_en, label_es, emoji,
//     section_group_id FK, sort_order, is_active, is_system, archived_at)

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformRole } from "@/lib/access/platform-role";
import {
  CACHE_TAG_PROFILE_EDITOR_LAYOUT,
  CACHE_TAG_FIELD_CATALOG,
} from "@/lib/field-engine/cache-tags";
import { logServerError } from "@/lib/server/safe-error";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type PlatformActionContext =
  | {
      ok: true;
      sb: SupabaseClient;
      actorId: string;
    }
  | {
      ok: false;
      error: string;
    };

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
    logServerError("platform.editor.audit", err);
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

function checked(fd: FormData, key: string): boolean {
  return fd.get(key) === "on";
}

function parseOrderedIds(fd: FormData): string[] {
  const raw = text(fd, "ordered_ids");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        )
      : [];
  } catch {
    return [];
  }
}

const TAB = "/platform/admin/catalog?tab=editor";

function revalidateEditorSurfaces(): void {
  revalidateTag(CACHE_TAG_PROFILE_EDITOR_LAYOUT, "default");
  revalidatePath("/platform/admin/catalog");
}

function fail(message: string): never {
  redirect(`${TAB}&error=${encodeURIComponent(message)}`);
}

function done(saved: string): never {
  revalidateEditorSurfaces();
  redirect(`${TAB}&saved=${encodeURIComponent(saved)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Section groups
// ─────────────────────────────────────────────────────────────────────────────

export async function createSectionGroup(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) fail(auth.error);

  const slug = text(formData, "slug");
  const labelEn = text(formData, "label_en");
  if (!slug || !labelEn) {
    fail("Slug and label (EN) are required.");
  }

  const insertRow = {
    slug,
    label_en: labelEn,
    label_es: text(formData, "label_es"),
    label_en_alt: text(formData, "label_en_alt"),
    label_es_alt: text(formData, "label_es_alt"),
    sort_order: intOrNull(formData, "sort_order") ?? 100,
    is_active: true,
    is_system: false,
  };

  const { data: created, error } = await auth.sb
    .from("profile_editor_section_groups")
    .insert(insertRow)
    .select("id")
    .single();

  if (error) {
    logServerError("platform.editor.createGroup", error);
    fail("Could not create section group.");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.editor.section_group.create",
    targetType: "profile_editor_section_group",
    targetId: created?.id ?? null,
    beforeValue: null,
    afterValue: insertRow,
  });

  done("group_create");
}

export async function updateSectionGroup(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) fail(auth.error);

  const id = text(formData, "id");
  if (!id) fail("Missing section group.");

  const { data: beforeRow } = await auth.sb
    .from("profile_editor_section_groups")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const patch = {
    label_en: text(formData, "label_en") ?? beforeRow?.label_en,
    label_es: text(formData, "label_es"),
    label_en_alt: text(formData, "label_en_alt"),
    label_es_alt: text(formData, "label_es_alt"),
    sort_order:
      intOrNull(formData, "sort_order") ?? beforeRow?.sort_order ?? 100,
    is_active: checked(formData, "is_active"),
    updated_at: new Date().toISOString(),
  };

  const { error } = await auth.sb
    .from("profile_editor_section_groups")
    .update(patch)
    .eq("id", id);

  if (error) {
    logServerError("platform.editor.updateGroup", error);
    fail("Could not save section group.");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.editor.section_group.update",
    targetType: "profile_editor_section_group",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: patch,
  });

  done("group");
}

export async function reorderSectionGroups(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) fail(auth.error);

  const orderedIds = parseOrderedIds(formData);
  if (orderedIds.length < 2) {
    fail("Add at least two section groups to reorder.");
  }

  const { data: rows, error } = await auth.sb
    .from("profile_editor_section_groups")
    .select("id, label_en, sort_order")
    .in("id", orderedIds);

  if (error || !rows || rows.length !== orderedIds.length) {
    logServerError("platform.editor.reorderGroups.readRows", error);
    fail("Could not load section groups.");
  }

  const rowIds = new Set(rows.map((row) => row.id));
  if (
    new Set(orderedIds).size !== orderedIds.length ||
    orderedIds.some((groupId) => !rowIds.has(groupId))
  ) {
    fail("Invalid section group order.");
  }

  const beforeValue = rows
    .slice()
    .sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        String(a.label_en).localeCompare(String(b.label_en)),
    )
    .map((row) => ({ id: row.id, sort_order: row.sort_order }));
  const afterValue = orderedIds.map((groupId, i) => ({
    id: groupId,
    sort_order: (i + 1) * 10,
  }));
  const now = new Date().toISOString();

  const results = await Promise.all(
    afterValue.map((row) =>
      auth.sb
        .from("profile_editor_section_groups")
        .update({ sort_order: row.sort_order, updated_at: now })
        .eq("id", row.id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    logServerError("platform.editor.reorderGroups.update", failed.error);
    fail("Could not save section group order.");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.editor.section_group.reorder",
    targetType: "profile_editor_section_group",
    targetId: "section_groups",
    beforeValue,
    afterValue,
  });

  done("group_order");
}

export async function archiveSectionGroup(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) fail(auth.error);

  const id = text(formData, "id");
  if (!id) fail("Missing section group.");

  // Block archiving a group that still has active (non-archived) sections —
  // the operator must move/archive its sections first so they never end up
  // orphaned under an inactive group.
  const { data: liveSections, error: countErr } = await auth.sb
    .from("profile_editor_sections")
    .select("id")
    .eq("section_group_id", id)
    .eq("is_active", true)
    .is("archived_at", null);

  if (countErr) {
    logServerError("platform.editor.archiveGroup.count", countErr);
    fail("Could not check section group.");
  }
  if ((liveSections?.length ?? 0) > 0) {
    fail("move-sections-first");
  }

  const { data: beforeRow } = await auth.sb
    .from("profile_editor_section_groups")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const patch = { is_active: false, updated_at: new Date().toISOString() };
  const { error } = await auth.sb
    .from("profile_editor_section_groups")
    .update(patch)
    .eq("id", id);

  if (error) {
    logServerError("platform.editor.archiveGroup", error);
    fail("Could not archive section group.");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.editor.section_group.archive",
    targetType: "profile_editor_section_group",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: patch,
    severity: "warn",
  });

  done("group_archived");
}

export async function restoreSectionGroup(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) fail(auth.error);

  const id = text(formData, "id");
  if (!id) fail("Missing section group.");

  const { data: beforeRow } = await auth.sb
    .from("profile_editor_section_groups")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const patch = { is_active: true, updated_at: new Date().toISOString() };
  const { error } = await auth.sb
    .from("profile_editor_section_groups")
    .update(patch)
    .eq("id", id);

  if (error) {
    logServerError("platform.editor.restoreGroup", error);
    fail("Could not restore section group.");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.editor.section_group.restore",
    targetType: "profile_editor_section_group",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: patch,
    severity: "warn",
  });

  done("group_restored");
}

// ─────────────────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────────────────

export async function updateSection(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) fail(auth.error);

  const id = text(formData, "id");
  if (!id) fail("Missing section.");

  const { data: beforeRow } = await auth.sb
    .from("profile_editor_sections")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // slug is NOT editable — it's the stable join key to catalog fields.
  const patch = {
    label_en: text(formData, "label_en") ?? beforeRow?.label_en,
    label_es: text(formData, "label_es"),
    emoji: text(formData, "emoji") ?? beforeRow?.emoji ?? "",
    is_active: checked(formData, "is_active"),
    updated_at: new Date().toISOString(),
  };

  const { error } = await auth.sb
    .from("profile_editor_sections")
    .update(patch)
    .eq("id", id);

  if (error) {
    logServerError("platform.editor.updateSection", error);
    fail("Could not save section.");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.editor.section.update",
    targetType: "profile_editor_section",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: patch,
  });

  done("section");
}

export async function moveSection(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) fail(auth.error);

  const id = text(formData, "id");
  const targetGroupId = text(formData, "section_group_id");
  if (!id || !targetGroupId) fail("Missing section or target group.");

  // Confirm the target group exists.
  const { data: targetGroup, error: groupErr } = await auth.sb
    .from("profile_editor_section_groups")
    .select("id")
    .eq("id", targetGroupId)
    .maybeSingle();
  if (groupErr || !targetGroup) {
    logServerError("platform.editor.moveSection.group", groupErr);
    fail("Target section group not found.");
  }

  const { data: beforeRow } = await auth.sb
    .from("profile_editor_sections")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // Sort order: explicit, else append to the end of the target group.
  let sortOrder = intOrNull(formData, "sort_order");
  if (sortOrder == null) {
    const { data: siblings } = await auth.sb
      .from("profile_editor_sections")
      .select("sort_order")
      .eq("section_group_id", targetGroupId)
      .order("sort_order", { ascending: false })
      .limit(1);
    const maxSort = siblings?.[0]?.sort_order ?? 0;
    sortOrder = maxSort + 10;
  }

  const patch = {
    section_group_id: targetGroupId,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  };

  const { error } = await auth.sb
    .from("profile_editor_sections")
    .update(patch)
    .eq("id", id);

  if (error) {
    logServerError("platform.editor.moveSection", error);
    fail("Could not move section.");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.editor.section.move",
    targetType: "profile_editor_section",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: patch,
  });

  done("section_moved");
}

export async function reorderSections(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) fail(auth.error);

  const orderedIds = parseOrderedIds(formData);
  const sectionGroupId = text(formData, "section_group_id");
  if (!sectionGroupId) fail("Missing section group.");
  if (orderedIds.length < 2) {
    fail("Add at least two sections to reorder.");
  }

  const { data: rows, error } = await auth.sb
    .from("profile_editor_sections")
    .select("id, slug, section_group_id, sort_order")
    .in("id", orderedIds);

  if (error || !rows || rows.length !== orderedIds.length) {
    logServerError("platform.editor.reorderSections.readRows", error);
    fail("Could not load sections.");
  }

  const rowIds = new Set(rows.map((row) => row.id));
  const validIds =
    new Set(orderedIds).size === orderedIds.length &&
    orderedIds.every((sectionId) => rowIds.has(sectionId));
  const sameGroup = rows.every(
    (row) => row.section_group_id === sectionGroupId,
  );
  if (!validIds || !sameGroup) {
    fail("Invalid section order.");
  }

  const beforeValue = rows
    .slice()
    .sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        String(a.slug).localeCompare(String(b.slug)),
    )
    .map((row) => ({ id: row.id, slug: row.slug, sort_order: row.sort_order }));
  const afterValue = orderedIds.map((sectionId, i) => ({
    id: sectionId,
    sort_order: (i + 1) * 10,
  }));
  const now = new Date().toISOString();

  const results = await Promise.all(
    afterValue.map((row) =>
      auth.sb
        .from("profile_editor_sections")
        .update({ sort_order: row.sort_order, updated_at: now })
        .eq("id", row.id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    logServerError("platform.editor.reorderSections.update", failed.error);
    fail("Could not save section order.");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.editor.section.reorder",
    targetType: "profile_editor_section",
    targetId: sectionGroupId,
    beforeValue,
    afterValue,
  });

  done("section_order");
}

export async function archiveSection(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) fail(auth.error);

  const id = text(formData, "id");
  if (!id) fail("Missing section.");

  const { data: beforeRow } = await auth.sb
    .from("profile_editor_sections")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const patch = {
    archived_at: new Date().toISOString(),
    is_active: false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await auth.sb
    .from("profile_editor_sections")
    .update(patch)
    .eq("id", id);

  if (error) {
    logServerError("platform.editor.archiveSection", error);
    fail("Could not archive section.");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.editor.section.archive",
    targetType: "profile_editor_section",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: patch,
    severity: "warn",
  });

  done("section_archived");
}

// ─────────────────────────────────────────────────────────────────────────────
// Section field order (within a single profile-editor section)
// ─────────────────────────────────────────────────────────────────────────────

export async function reorderSectionFieldsAction(
  formData: FormData,
): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) fail(auth.error);

  const orderedIds = parseOrderedIds(formData);
  if (orderedIds.length < 2) {
    fail("Add at least two fields to reorder.");
  }

  const { data: rows, error } = await auth.sb
    .from("profile_field_definitions")
    .select("id, field_key, display_order")
    .in("id", orderedIds);

  if (error || !rows || rows.length !== orderedIds.length) {
    logServerError("platform.editor.reorderSectionFields.readRows", error);
    fail("Could not load fields.");
  }

  const rowIds = new Set(rows.map((row) => row.id));
  if (
    new Set(orderedIds).size !== orderedIds.length ||
    orderedIds.some((id) => !rowIds.has(id))
  ) {
    fail("Invalid field order.");
  }

  const beforeValue = rows
    .slice()
    .sort(
      (a, b) =>
        (a.display_order ?? 0) - (b.display_order ?? 0) ||
        String(a.field_key).localeCompare(String(b.field_key)),
    )
    .map((row) => ({ id: row.id, field_key: row.field_key, display_order: row.display_order }));
  const afterValue = orderedIds.map((id, i) => ({
    id,
    display_order: (i + 1) * 10,
  }));
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
    logServerError("platform.editor.reorderSectionFields.update", failed.error);
    fail("Could not save field order.");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.editor.section_field.reorder",
    targetType: "profile_field_definition",
    targetId: "section_fields",
    beforeValue,
    afterValue,
  });

  // Revalidate field catalog (display_order change) + editor surfaces.
  revalidateTag(CACHE_TAG_FIELD_CATALOG, "default");
  revalidatePath("/platform/admin/catalog");
  redirect(
    `/platform/admin/catalog?tab=section-fields&saved=${encodeURIComponent("field_order")}`,
  );
}

export async function deleteSectionGroup(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) fail(auth.error);

  const id = text(formData, "id");
  if (!id) fail("Missing section group.");

  const { data: beforeRow } = await auth.sb
    .from("profile_editor_section_groups")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // Dependent-row cleanup — detach member sections (null their FK; don't delete them).
  const { error: detachErr } = await auth.sb
    .from("profile_editor_sections")
    .update({ section_group_id: null, updated_at: new Date().toISOString() })
    .eq("section_group_id", id);
  if (detachErr) {
    logServerError("platform.editor.deleteSectionGroup.detach", detachErr);
    fail("Could not detach member sections.");
  }

  const { error } = await auth.sb
    .from("profile_editor_section_groups")
    .delete()
    .eq("id", id);
  if (error) {
    logServerError("platform.editor.deleteSectionGroup", error);
    fail("Could not delete section group.");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.editor.section_group.delete",
    targetType: "profile_editor_section_group",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: null,
    severity: "warn",
  });

  revalidateTag(CACHE_TAG_PROFILE_EDITOR_LAYOUT, "default");
  revalidatePath("/platform/admin/catalog");
  redirect(`${TAB}&saved=${encodeURIComponent("group_deleted")}`);
}

export async function deleteSection(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) fail(auth.error);

  const id = text(formData, "id");
  if (!id) fail("Missing section.");

  const { data: beforeRow } = await auth.sb
    .from("profile_editor_sections")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // No FK dependents on profile_editor_sections — slug is code-referenced only.
  const { error } = await auth.sb
    .from("profile_editor_sections")
    .delete()
    .eq("id", id);
  if (error) {
    logServerError("platform.editor.deleteSection", error);
    fail("Could not delete section.");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.editor.section.delete",
    targetType: "profile_editor_section",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: null,
    severity: "warn",
  });

  revalidateTag(CACHE_TAG_PROFILE_EDITOR_LAYOUT, "default");
  revalidatePath("/platform/admin/catalog");
  redirect(`/platform/admin/catalog?tab=sections&saved=${encodeURIComponent("section_deleted")}`);
}

export async function restoreSection(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) fail(auth.error);

  const id = text(formData, "id");
  if (!id) fail("Missing section.");

  const { data: beforeRow } = await auth.sb
    .from("profile_editor_sections")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const patch = {
    archived_at: null,
    is_active: true,
    updated_at: new Date().toISOString(),
  };
  const { error } = await auth.sb
    .from("profile_editor_sections")
    .update(patch)
    .eq("id", id);

  if (error) {
    logServerError("platform.editor.restoreSection", error);
    fail("Could not restore section.");
  }

  await recordEngineAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.editor.section.restore",
    targetType: "profile_editor_section",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: patch,
    severity: "warn",
  });

  done("section_restored");
}
