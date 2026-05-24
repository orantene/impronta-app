"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformRole } from "@/lib/access/platform-role";
import { CACHE_TAG_FIELD_CATALOG } from "@/lib/field-engine/cache-tags";
import { logServerError } from "@/lib/server/safe-error";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type PlatformActionContext =
  | { ok: true; sb: SupabaseClient; actorId: string }
  | { ok: false; error: string };

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

function list(fd: FormData, key: string): string[] {
  return (text(fd, key) ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function taxonomyKindFor(termType: string): string {
  if (termType === "talent_type") return "talent_type";
  if (termType === "skill" || termType === "skill_group") return "skill";
  if (termType === "context" || termType === "context_group") return "event_type";
  if (termType === "language") return "language";
  return "tag";
}

function defaultLevelFor(termType: string): number {
  if (termType === "parent_category") return 1;
  if (termType === "category_group" || termType.endsWith("_group")) return 2;
  if (termType === "talent_type") return 3;
  return 1;
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

async function recordTaxonomyAudit(
  sb: SupabaseClient,
  args: {
    actorId: string;
    action: string;
    targetId: string | null;
    targetType?: string;
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
      target_type: args.targetType ?? "taxonomy_term",
      target_id: args.targetId,
      tenant_id: null,
      severity: args.severity ?? "info",
      metadata: {
        before: args.beforeValue ?? null,
        after: args.afterValue ?? null,
      },
    });
  } catch (err) {
    logServerError("platform.taxonomy.audit", err);
  }
}

function revalidateTaxonomySurfaces(termId?: string | null, fieldKey?: string | null): void {
  revalidateTag(CACHE_TAG_FIELD_CATALOG, "default");
  revalidatePath("/platform/admin/taxonomy");
  revalidatePath("/platform/admin/catalog");
  revalidatePath("/impronta/admin/settings");
  revalidatePath("/impronta/admin/roster");
  if (termId) revalidatePath(`/platform/admin/taxonomy?term=${encodeURIComponent(termId)}`);
  if (fieldKey) revalidatePath(`/platform/admin/catalog/${encodeURIComponent(fieldKey)}`);
}

export async function createPlatformTaxonomyTermAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/taxonomy?error=${encodeURIComponent(auth.error)}`);

  const slug = text(formData, "slug");
  const nameEn = text(formData, "name_en");
  const termType = text(formData, "term_type") ?? "talent_type";
  if (!slug || !nameEn) {
    redirect("/platform/admin/taxonomy?error=Slug%20and%20English%20name%20are%20required");
  }
  if (![
    "parent_category",
    "category_group",
    "talent_type",
    "specialty",
    "skill_group",
    "skill",
    "context_group",
    "context",
    "credential",
    "attribute",
    "language",
  ].includes(termType)) {
    redirect("/platform/admin/taxonomy?error=Invalid%20taxonomy%20term%20type");
  }

  const insertRow = {
    kind: taxonomyKindFor(termType),
    term_type: termType,
    level: intOrNull(formData, "level") ?? defaultLevelFor(termType),
    slug,
    name_en: nameEn,
    name_es: text(formData, "name_es"),
    plural_name: text(formData, "plural_name") ?? nameEn,
    description: text(formData, "description"),
    icon: text(formData, "icon"),
    parent_id: text(formData, "parent_id"),
    sort_order: intOrNull(formData, "sort_order") ?? 100,
    aliases: list(formData, "aliases"),
    search_synonyms: list(formData, "search_synonyms"),
    ai_keywords: list(formData, "ai_keywords"),
    is_active: true,
    is_public_filter: checked(formData, "is_public_filter"),
    is_visible_by_default: checked(formData, "is_visible_by_default"),
    is_profile_badge: checked(formData, "is_profile_badge"),
    is_restricted: checked(formData, "is_restricted"),
    is_generic_fallback: checked(formData, "is_generic_fallback"),
    restriction_level: text(formData, "restriction_level"),
  };

  const { data: created, error } = await auth.sb
    .from("taxonomy_terms")
    .insert(insertRow)
    .select("id, slug")
    .single();

  if (error) {
    logServerError("platform.taxonomy.createTerm", error);
    redirect("/platform/admin/taxonomy?error=Could%20not%20create%20taxonomy%20term");
  }

  await recordTaxonomyAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.taxonomy.create",
    targetId: created?.id ?? null,
    beforeValue: null,
    afterValue: insertRow,
    severity: insertRow.is_restricted ? "warn" : "info",
  });

  revalidateTaxonomySurfaces(created?.id ?? null);
  redirect(`/platform/admin/taxonomy?term=${encodeURIComponent(created?.slug ?? slug)}&saved=create`);
}

export async function updatePlatformTaxonomyTermAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/taxonomy?error=${encodeURIComponent(auth.error)}`);

  const id = text(formData, "id");
  if (!id) redirect("/platform/admin/taxonomy?error=Missing%20term");

  const { data: beforeRow } = await auth.sb
    .from("taxonomy_terms")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!beforeRow) redirect("/platform/admin/taxonomy?error=Term%20not%20found");

  const patch = {
    slug: text(formData, "slug") ?? beforeRow.slug,
    name_en: text(formData, "name_en") ?? beforeRow.name_en,
    name_es: text(formData, "name_es"),
    plural_name: text(formData, "plural_name"),
    description: text(formData, "description"),
    icon: text(formData, "icon"),
    term_type: text(formData, "term_type") ?? beforeRow.term_type,
    parent_id: text(formData, "parent_id"),
    level: intOrNull(formData, "level") ?? beforeRow.level,
    sort_order: intOrNull(formData, "sort_order") ?? beforeRow.sort_order,
    aliases: list(formData, "aliases"),
    search_synonyms: list(formData, "search_synonyms"),
    ai_keywords: list(formData, "ai_keywords"),
    is_active: checked(formData, "is_active"),
    is_public_filter: checked(formData, "is_public_filter"),
    is_visible_by_default: checked(formData, "is_visible_by_default"),
    is_profile_badge: checked(formData, "is_profile_badge"),
    is_restricted: checked(formData, "is_restricted"),
    is_generic_fallback: checked(formData, "is_generic_fallback"),
    restriction_level: text(formData, "restriction_level"),
    updated_at: new Date().toISOString(),
  };

  const { error } = await auth.sb
    .from("taxonomy_terms")
    .update(patch)
    .eq("id", id);

  if (error) {
    logServerError("platform.taxonomy.updateTerm", error);
    redirect("/platform/admin/taxonomy?error=Could%20not%20save%20taxonomy%20term");
  }

  await recordTaxonomyAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.taxonomy.update",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: patch,
    severity: patch.is_restricted ? "warn" : "info",
  });

  revalidateTaxonomySurfaces(id);
  redirect("/platform/admin/taxonomy?saved=term");
}

export async function setPlatformTaxonomyLifecycleAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/taxonomy?error=${encodeURIComponent(auth.error)}`);

  const id = text(formData, "id");
  const mode = text(formData, "mode");
  if (!id || (mode !== "archive" && mode !== "restore")) {
    redirect("/platform/admin/taxonomy?error=Invalid%20lifecycle%20request");
  }

  const { data: beforeRow } = await auth.sb
    .from("taxonomy_terms")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const patch =
    mode === "archive"
      ? { archived_at: new Date().toISOString(), is_active: false, updated_at: new Date().toISOString() }
      : { archived_at: null, is_active: true, updated_at: new Date().toISOString() };

  const { error } = await auth.sb
    .from("taxonomy_terms")
    .update(patch)
    .eq("id", id);

  if (error) {
    logServerError("platform.taxonomy.lifecycle", error);
    redirect("/platform/admin/taxonomy?error=Could%20not%20change%20taxonomy%20lifecycle");
  }

  await recordTaxonomyAudit(auth.sb, {
    actorId: auth.actorId,
    action: mode === "archive" ? "platform.engine.taxonomy.archive" : "platform.engine.taxonomy.restore",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: patch,
    severity: "warn",
  });

  revalidateTaxonomySurfaces(id);
  redirect("/platform/admin/taxonomy?saved=lifecycle");
}

export async function movePlatformTaxonomyTermAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/taxonomy?error=${encodeURIComponent(auth.error)}`);

  const id = text(formData, "id");
  const direction = text(formData, "direction");
  if (!id || (direction !== "up" && direction !== "down")) {
    redirect("/platform/admin/taxonomy?error=Invalid%20ordering%20request");
  }

  const { data: term } = await auth.sb
    .from("taxonomy_terms")
    .select("id, slug, parent_id, term_type")
    .eq("id", id)
    .maybeSingle();

  if (!term) redirect("/platform/admin/taxonomy?error=Term%20not%20found");

  let siblingsQuery = auth.sb
    .from("taxonomy_terms")
    .select("id, slug, sort_order, name_en, parent_id, term_type")
    .eq("term_type", term.term_type)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });

  siblingsQuery = term.parent_id
    ? siblingsQuery.eq("parent_id", term.parent_id)
    : siblingsQuery.is("parent_id", null);

  const { data: siblings, error } = await siblingsQuery;
  if (error || !siblings) {
    logServerError("platform.taxonomy.move.readSiblings", error);
    redirect("/platform/admin/taxonomy?error=Could%20not%20load%20siblings");
  }

  const index = siblings.findIndex((row) => row.id === id);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) {
    revalidateTaxonomySurfaces(id);
    redirect(`/platform/admin/taxonomy?term=${encodeURIComponent(term.slug)}&saved=order`);
  }

  const reordered = [...siblings];
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
  const beforeValue = siblings.map((row) => ({ id: row.id, sort_order: row.sort_order }));
  const afterValue = reordered.map((row, i) => ({ id: row.id, sort_order: (i + 1) * 10 }));

  const updates = afterValue.map((row) =>
    auth.sb
      .from("taxonomy_terms")
      .update({ sort_order: row.sort_order, updated_at: new Date().toISOString() })
      .eq("id", row.id),
  );
  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    logServerError("platform.taxonomy.move.update", failed.error);
    redirect("/platform/admin/taxonomy?error=Could%20not%20save%20taxonomy%20order");
  }

  await recordTaxonomyAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.taxonomy.move",
    targetId: id,
    beforeValue,
    afterValue,
  });

  revalidateTaxonomySurfaces(id);
  redirect(`/platform/admin/taxonomy?term=${encodeURIComponent(term.slug)}&saved=order`);
}

export async function reorderPlatformTaxonomySiblingsAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/taxonomy?error=${encodeURIComponent(auth.error)}`);

  const orderedIds = parseOrderedIds(formData);
  const returnTerm = text(formData, "return_term");
  if (orderedIds.length < 2) {
    redirect("/platform/admin/taxonomy?error=Add%20at%20least%20two%20terms%20to%20reorder");
  }

  const { data: rows, error } = await auth.sb
    .from("taxonomy_terms")
    .select("id, slug, sort_order, name_en, parent_id, term_type")
    .in("id", orderedIds);

  if (error || !rows || rows.length !== orderedIds.length) {
    logServerError("platform.taxonomy.reorder.readRows", error);
    redirect("/platform/admin/taxonomy?error=Could%20not%20load%20taxonomy%20terms");
  }

  const first = rows[0];
  const sameSiblingSet = rows.every(
    (row) => row.parent_id === first.parent_id && row.term_type === first.term_type,
  );
  if (!sameSiblingSet) {
    redirect("/platform/admin/taxonomy?error=Only%20sibling%20terms%20can%20be%20reordered%20together");
  }

  const rowIds = new Set(rows.map((row) => row.id));
  if (new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !rowIds.has(id))) {
    redirect("/platform/admin/taxonomy?error=Invalid%20taxonomy%20order");
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
        .from("taxonomy_terms")
        .update({ sort_order: row.sort_order, updated_at: now })
        .eq("id", row.id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    logServerError("platform.taxonomy.reorder.update", failed.error);
    redirect("/platform/admin/taxonomy?error=Could%20not%20save%20taxonomy%20order");
  }

  await recordTaxonomyAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.taxonomy.reorder",
    targetId: first.parent_id ?? first.term_type,
    beforeValue,
    afterValue,
  });

  revalidateTaxonomySurfaces(returnTerm);
  const termSlug = returnTerm ?? rows.find((row) => row.id === orderedIds[0])?.slug ?? "";
  redirect(`/platform/admin/taxonomy?term=${encodeURIComponent(termSlug)}&saved=order`);
}

export async function setPlatformTaxonomyFieldMappingAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/taxonomy?error=${encodeURIComponent(auth.error)}`);

  const taxonomyTermId = text(formData, "taxonomy_term_id");
  const returnTerm = text(formData, "return_term");
  const fieldDefinitionId = text(formData, "field_definition_id");
  const relationship = text(formData, "relationship") ?? "applies";
  if (!taxonomyTermId || !fieldDefinitionId) {
    redirect("/platform/admin/taxonomy?error=Missing%20field%20mapping");
  }
  if (!["applies", "recommended", "required"].includes(relationship)) {
    redirect(`/platform/admin/taxonomy?term=${encodeURIComponent(returnTerm ?? taxonomyTermId)}&error=Invalid%20mapping%20relationship`);
  }

  const [{ data: term }, { data: field }] = await Promise.all([
    auth.sb
      .from("taxonomy_terms")
      .select("id, slug, name_en")
      .eq("id", taxonomyTermId)
      .maybeSingle(),
    auth.sb
      .from("profile_field_definitions")
      .select("id, field_key, label, deprecated_at")
      .eq("id", fieldDefinitionId)
      .maybeSingle(),
  ]);
  if (!term || !field) {
    redirect("/platform/admin/taxonomy?error=Field%20or%20taxonomy%20term%20not%20found");
  }
  if (field.deprecated_at) {
    redirect(`/platform/admin/taxonomy?term=${encodeURIComponent(term.slug)}&error=Archived%20fields%20cannot%20be%20mapped%20for%20new%20input`);
  }

  const { data: beforeRows } = await auth.sb
    .from("profile_field_recommendations")
    .select("*")
    .eq("field_definition_id", fieldDefinitionId)
    .eq("taxonomy_term_id", taxonomyTermId);

  const insertRow = {
    field_definition_id: fieldDefinitionId,
    taxonomy_term_id: taxonomyTermId,
    relationship,
    display_order: intOrNull(formData, "display_order") ?? 100,
    required_at_registration: checked(formData, "required_at_registration"),
    required_before_publish: checked(formData, "required_before_publish") || relationship === "required",
    required_before_verification: checked(formData, "required_before_verification"),
    requires_verification: checked(formData, "requires_verification"),
    is_admin_only: checked(formData, "is_admin_only"),
  };

  const existingId = beforeRows?.[0]?.id as string | undefined;
  const writeQuery = existingId
    ? auth.sb
        .from("profile_field_recommendations")
        .update(insertRow)
        .eq("id", existingId)
        .select("*")
        .single()
    : auth.sb
        .from("profile_field_recommendations")
        .insert(insertRow)
        .select("*")
        .single();
  const { data: afterRow, error } = await writeQuery;

  if (error) {
    logServerError("platform.taxonomy.fieldMapping.set", error);
    redirect(`/platform/admin/taxonomy?term=${encodeURIComponent(term.slug)}&error=Could%20not%20save%20field%20mapping`);
  }

  const duplicateIds = (beforeRows ?? [])
    .slice(1)
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (duplicateIds.length > 0) {
    const { error: deleteDuplicatesError } = await auth.sb
      .from("profile_field_recommendations")
      .delete()
      .in("id", duplicateIds);
    if (deleteDuplicatesError) {
      logServerError("platform.taxonomy.fieldMapping.dedupe", deleteDuplicatesError);
    }
  }

  await recordTaxonomyAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.taxonomy.field_mapping.set",
    targetType: "taxonomy_field_mapping",
    targetId: (afterRow?.id as string | null) ?? taxonomyTermId,
    beforeValue: beforeRows ?? [],
    afterValue: {
      ...afterRow,
      field_key: field.field_key,
      term_slug: term.slug,
    },
    severity: insertRow.required_before_publish ? "warn" : "info",
  });

  revalidateTaxonomySurfaces(term.slug, field.field_key);
  redirect(`/platform/admin/taxonomy?term=${encodeURIComponent(term.slug)}&saved=mapping`);
}

export async function removePlatformTaxonomyFieldMappingAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/taxonomy?error=${encodeURIComponent(auth.error)}`);

  const id = text(formData, "id");
  const returnTerm = text(formData, "return_term");
  if (!id) redirect("/platform/admin/taxonomy?error=Missing%20field%20mapping");

  const { data: beforeRow } = await auth.sb
    .from("profile_field_recommendations")
    .select("*, taxonomy_terms(slug), profile_field_definitions(field_key)")
    .eq("id", id)
    .maybeSingle();

  const { error } = await auth.sb
    .from("profile_field_recommendations")
    .delete()
    .eq("id", id);

  if (error) {
    logServerError("platform.taxonomy.fieldMapping.remove", error);
    redirect(`/platform/admin/taxonomy?term=${encodeURIComponent(returnTerm ?? "")}&error=Could%20not%20remove%20field%20mapping`);
  }

  const termSlug =
    (beforeRow?.taxonomy_terms as { slug?: string } | null)?.slug ??
    returnTerm ??
    "";
  const fieldKey =
    (beforeRow?.profile_field_definitions as { field_key?: string } | null)?.field_key ??
    null;

  await recordTaxonomyAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.taxonomy.field_mapping.remove",
    targetType: "taxonomy_field_mapping",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: null,
    severity: "warn",
  });

  revalidateTaxonomySurfaces(termSlug, fieldKey);
  redirect(`/platform/admin/taxonomy?term=${encodeURIComponent(termSlug)}&saved=mapping_removed`);
}
