"use server";

import { revalidatePath } from "next/cache";
import { revalidateDirectoryListing, revalidateTaxonomyCaches } from "@/lib/revalidate-public";
import { z } from "zod";
import { parseWithSchema, trimmedString } from "@/lib/admin/validation";
import {
  isBlockedDynamicLocationValueType,
  isReservedTalentProfileFieldKey,
} from "@/lib/field-canonical";
import { requireStaff } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FieldAdminActionState = { error?: string; success?: boolean } | undefined;

function revalidateFieldAdminSurfaces() {
  revalidatePath("/admin/fields");
  revalidatePath("/admin/directory/filters");
  revalidatePath("/talent/my-profile");
  revalidatePath("/talent/overview");
  revalidatePath("/talent/status");
  revalidatePath("/talent/portfolio");
  revalidatePath("/talent");
  revalidatePath("/directory");
  revalidateDirectoryListing();
  revalidateTaxonomyCaches();
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  return code === "23505";
}

function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeFieldKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeVisibleName(input: string): string {
  return input.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

async function findConflictingActiveFieldGroup(
  supabase: SupabaseClient,
  input: {
    slug?: string | null;
    name_en?: string | null;
    name_es?: string | null;
    excludeId?: string | null;
  },
) {
  const { data, error } = await supabase
    .from("field_groups")
    .select("id, slug, name_en, name_es")
    .is("archived_at", null);

  if (error) throw error;

  const slug = input.slug?.trim().toLocaleLowerCase() ?? "";
  const nameEn = normalizeVisibleName(input.name_en ?? "");
  const nameEs = normalizeVisibleName(input.name_es ?? "");

  return (data ?? []).find((group) => {
    if (input.excludeId && group.id === input.excludeId) return false;
    if (slug && group.slug.trim().toLocaleLowerCase() === slug) return true;
    if (nameEn && normalizeVisibleName(group.name_en) === nameEn) return true;
    if (nameEs && normalizeVisibleName(group.name_es ?? "") === nameEs) return true;
    return false;
  }) ?? null;
}

const FIELD_VALUE_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "boolean",
  "taxonomy_single",
  "taxonomy_multi",
  "location",
] as const;
type FieldValueType = (typeof FIELD_VALUE_TYPES)[number];
function isFieldValueType(v: string): v is FieldValueType {
  return (FIELD_VALUE_TYPES as readonly string[]).includes(v);
}

const REQUIRED_LEVELS = ["optional", "recommended", "required"] as const;
type RequiredLevel = (typeof REQUIRED_LEVELS)[number];

function isRequiredLevel(v: string): v is RequiredLevel {
  return (REQUIRED_LEVELS as readonly string[]).includes(v);
}

const groupIdSchema = z.object({
  group_id: z.string().min(1, "Missing group ID."),
});

const fieldIdSchema = z.object({
  field_id: z.string().min(1, "Missing field ID."),
});

const orderedIdsSchema = z.object({
  ordered_ids: z.string().min(1, "Nothing to reorder."),
});

const createFieldGroupSchema = z.object({
  name_en: z.string().min(1, "Group name (EN) is required."),
  name_es: z.string(),
  slug: z.string(),
});

const createFieldDefinitionSchema = z.object({
  field_group_id: z.string(),
  key: z.string(),
  label_en: z.string().min(1, "Label (EN) is required."),
  label_es: z.string(),
  help_en: z.string(),
  help_es: z.string(),
  value_type: z.string(),
  taxonomy_kind: z.string(),
});

export async function createFieldGroup(
  _prev: FieldAdminActionState,
  formData: FormData,
): Promise<FieldAdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(createFieldGroupSchema, {
    name_en: trimmedString(formData, "name_en"),
    name_es: trimmedString(formData, "name_es"),
    slug: trimmedString(formData, "slug"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { name_en, name_es, slug: slugRaw } = parsed.data;
  const slug = normalizeSlug(slugRaw || name_en);

  if (!slug) return { error: "Group slug is required." };

  try {
    const existing = await findConflictingActiveFieldGroup(supabase, { slug, name_en, name_es });
    if (existing) {
      return {
        error: `Group already exists (${existing.name_en}). Active groups must use a unique slug and visible name.`,
      };
    }
  } catch (error) {
    logServerError("admin/createFieldGroup/checkDuplicate", error);
    return { error: CLIENT_ERROR.update };
  }

  const { data: maxRow } = await supabase
    .from("field_groups")
    .select("sort_order")
    .is("archived_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((maxRow?.sort_order as number | undefined) ?? 0) + 10;

  const { error } = await supabase.from("field_groups").insert({
    slug,
    name_en,
    name_es: name_es || null,
    sort_order: nextSort,
  });

  if (error) {
    if (isUniqueViolation(error)) return { error: "Group already exists." };
    logServerError("admin/createFieldGroup", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidateFieldAdminSurfaces();
  return { success: true };
}

export async function createFieldGroupForm(formData: FormData): Promise<void> {
  await createFieldGroup(undefined, formData);
}

export async function updateFieldGroup(
  _prev: FieldAdminActionState,
  formData: FormData,
): Promise<FieldAdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(groupIdSchema, {
    group_id: trimmedString(formData, "group_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { group_id: id } = parsed.data;

  const patch: Record<string, unknown> = {};
  if (formData.has("name_en")) {
      const name_en = trimmedString(formData, "name_en");
    if (!name_en) return { error: "Group name (EN) is required." };
    patch.name_en = name_en;
  }
  if (formData.has("name_es")) {
      const name_es = trimmedString(formData, "name_es");
    patch.name_es = name_es || null;
  }
  if (formData.has("slug")) {
      const slug = normalizeSlug(trimmedString(formData, "slug"));
    if (!slug) return { error: "Group slug is required." };
    patch.slug = slug;
  }
  if (formData.has("sort_order")) {
      const raw = trimmedString(formData, "sort_order");
    const n = Number.parseInt(raw, 10);
    patch.sort_order = Number.isFinite(n) ? n : 0;
  }
  patch.updated_at = new Date().toISOString();

  try {
    const { data: current, error: currentError } = await supabase
      .from("field_groups")
      .select("id, slug, name_en, name_es")
      .eq("id", id)
      .maybeSingle();
    if (currentError || !current) return { error: "Field group not found." };

    const existing = await findConflictingActiveFieldGroup(supabase, {
      slug: typeof patch.slug === "string" ? patch.slug : current.slug,
      name_en: typeof patch.name_en === "string" ? patch.name_en : current.name_en,
      name_es:
        typeof patch.name_es === "string" || patch.name_es === null
          ? (patch.name_es as string | null)
          : current.name_es,
      excludeId: id,
    });
    if (existing) {
      return {
        error: `Another active group already uses that visible name or slug (${existing.name_en}).`,
      };
    }
  } catch (error) {
    logServerError("admin/updateFieldGroup/checkDuplicate", error);
    return { error: CLIENT_ERROR.update };
  }

  const { error } = await supabase.from("field_groups").update(patch).eq("id", id);
  if (error) {
    if (isUniqueViolation(error)) return { error: "Group already exists." };
    logServerError("admin/updateFieldGroup", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidateFieldAdminSurfaces();
  return { success: true };
}

export async function updateFieldGroupForm(formData: FormData): Promise<void> {
  await updateFieldGroup(undefined, formData);
}

export async function archiveFieldGroup(
  _prev: FieldAdminActionState,
  formData: FormData,
): Promise<FieldAdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(groupIdSchema, {
    group_id: trimmedString(formData, "group_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { group_id: id } = parsed.data;

  const now = new Date().toISOString();
  const [{ error: gErr }, { error: dErr }] = await Promise.all([
    supabase
      .from("field_groups")
      .update({ archived_at: now, updated_at: now })
      .eq("id", id),
    // Archive definitions in the group so talent/admin surfaces stay consistent.
    supabase
      .from("field_definitions")
      .update({ archived_at: now, updated_at: now })
      .eq("field_group_id", id),
  ]);
  if (gErr || dErr) {
    if (gErr) logServerError("admin/archiveFieldGroup", gErr);
    if (dErr) logServerError("admin/archiveFieldGroup/defs", dErr);
    return { error: CLIENT_ERROR.update };
  }
  revalidateFieldAdminSurfaces();
  return { success: true };
}

export async function archiveFieldGroupForm(formData: FormData): Promise<void> {
  await archiveFieldGroup(undefined, formData);
}

export async function restoreFieldGroup(
  _prev: FieldAdminActionState,
  formData: FormData,
): Promise<FieldAdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(groupIdSchema, {
    group_id: trimmedString(formData, "group_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { group_id: id } = parsed.data;

  const now = new Date().toISOString();
  try {
    const { data: current, error: currentError } = await supabase
      .from("field_groups")
      .select("id, slug, name_en, name_es")
      .eq("id", id)
      .maybeSingle();
    if (currentError || !current) return { error: "Field group not found." };

    const existing = await findConflictingActiveFieldGroup(supabase, {
      slug: current.slug,
      name_en: current.name_en,
      name_es: current.name_es,
      excludeId: id,
    });
    if (existing) {
      return {
        error: `Restore blocked: another active group already uses this visible name or slug (${existing.name_en}). Merge/archive duplicates first.`,
      };
    }
  } catch (error) {
    logServerError("admin/restoreFieldGroup/checkDuplicate", error);
    return { error: CLIENT_ERROR.update };
  }

  const [{ error: gErr }, { error: dErr }] = await Promise.all([
    supabase.from("field_groups").update({ archived_at: null, updated_at: now }).eq("id", id),
    supabase.from("field_definitions").update({ archived_at: null, updated_at: now }).eq("field_group_id", id),
  ]);
  if (gErr || dErr) {
    if (gErr) logServerError("admin/restoreFieldGroup", gErr);
    if (dErr) logServerError("admin/restoreFieldGroup/defs", dErr);
    return { error: CLIENT_ERROR.update };
  }
  revalidateFieldAdminSurfaces();
  return { success: true };
}

export async function restoreFieldGroupForm(formData: FormData): Promise<void> {
  await restoreFieldGroup(undefined, formData);
}

export async function createFieldDefinition(
  _prev: FieldAdminActionState,
  formData: FormData,
): Promise<FieldAdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(createFieldDefinitionSchema, {
    field_group_id: trimmedString(formData, "field_group_id"),
    key: trimmedString(formData, "key"),
    label_en: trimmedString(formData, "label_en"),
    label_es: trimmedString(formData, "label_es"),
    help_en: trimmedString(formData, "help_en"),
    help_es: trimmedString(formData, "help_es"),
    value_type: trimmedString(formData, "value_type"),
    taxonomy_kind: trimmedString(formData, "taxonomy_kind"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const field_group_id = parsed.data.field_group_id || null;
  const key = normalizeFieldKey(parsed.data.key);
  const label_en = parsed.data.label_en;
  const label_es = parsed.data.label_es;
  const help_en = parsed.data.help_en;
  const help_es = parsed.data.help_es;
  const value_type_raw = parsed.data.value_type;
  const taxonomy_kind = parsed.data.taxonomy_kind || null;

  if (!key) return { error: "Field key is required." };
  if (isReservedTalentProfileFieldKey(key)) {
    return {
      error:
        "This key is reserved for canonical profile columns (talent_profiles). Identity and location are edited on the profile forms, not as dynamic fields.",
    };
  }
  if (!isFieldValueType(value_type_raw)) return { error: "Invalid field value type." };

  if (isBlockedDynamicLocationValueType(value_type_raw)) {
    return {
      error:
        "Location-type fields are not allowed in the dynamic catalog. Set Lives in / Originally from on the talent profile (canonical cities).",
    };
  }

  if ((value_type_raw === "taxonomy_single" || value_type_raw === "taxonomy_multi") && !taxonomy_kind) {
    return { error: "Taxonomy kind is required for taxonomy fields." };
  }

  const { error } = await supabase.from("field_definitions").insert({
    field_group_id,
    key,
    label_en,
    label_es: label_es || null,
    help_en: help_en || null,
    help_es: help_es || null,
    value_type: value_type_raw,
    taxonomy_kind: value_type_raw.startsWith("taxonomy") ? taxonomy_kind : null,
    sort_order: 0,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    logServerError("admin/createFieldDefinition", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidateFieldAdminSurfaces();
  return { success: true };
}

export async function createFieldDefinitionForm(formData: FormData): Promise<void> {
  await createFieldDefinition(undefined, formData);
}

export async function updateFieldDefinitionCore(
  _prev: FieldAdminActionState,
  formData: FormData,
): Promise<FieldAdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(fieldIdSchema, {
    field_id: trimmedString(formData, "field_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { field_id: id } = parsed.data;

  const { data: defKeyRow, error: keyLoadErr } = await supabase
    .from("field_definitions")
    .select("key")
    .eq("id", id)
    .maybeSingle();
  if (keyLoadErr) {
    logServerError("admin/updateFieldDefinitionCore/load_key", keyLoadErr);
    return { error: CLIENT_ERROR.update };
  }
  if (defKeyRow?.key && isReservedTalentProfileFieldKey(defKeyRow.key)) {
    return {
      error:
        "Canonical Basic Information mirrors cannot be edited here — labels and types are fixed. Use visibility toggles on the Fields list.",
    };
  }

  const patch: Record<string, unknown> = {};

  if (formData.has("field_group_id")) {
    const raw = trimmedString(formData, "field_group_id");
    patch.field_group_id = raw || null;
  }
  if (formData.has("key")) {
    const key = normalizeFieldKey(trimmedString(formData, "key"));
    if (!key) return { error: "Field key is required." };
    if (isReservedTalentProfileFieldKey(key)) {
      return {
        error:
          "This key is reserved for canonical profile columns (talent_profiles). Choose a different key.",
      };
    }
    patch.key = key;
  }
  if (formData.has("label_en")) {
    const label_en = trimmedString(formData, "label_en");
    if (!label_en) return { error: "Label (EN) is required." };
    patch.label_en = label_en;
  }
  if (formData.has("label_es")) {
    const label_es = trimmedString(formData, "label_es");
    patch.label_es = label_es || null;
  }
  if (formData.has("help_en")) patch.help_en = trimmedString(formData, "help_en") || null;
  if (formData.has("help_es")) patch.help_es = trimmedString(formData, "help_es") || null;
  if (formData.has("value_type")) {
    const vt = trimmedString(formData, "value_type");
    if (!isFieldValueType(vt)) return { error: "Invalid field value type." };
    if (isBlockedDynamicLocationValueType(vt)) {
      return {
        error:
          "Cannot set value type to location — canonical geography lives on talent_profiles (residence / origin).",
      };
    }
    patch.value_type = vt;
  }
  if (formData.has("taxonomy_kind")) {
    const tk = trimmedString(formData, "taxonomy_kind");
    patch.taxonomy_kind = tk || null;
  }

  if (formData.has("required_level")) {
    const rl = trimmedString(formData, "required_level");
    if (!isRequiredLevel(rl)) return { error: "Invalid required level." };
    patch.required_level = rl;
  }

  patch.updated_at = new Date().toISOString();

  const { error } = await supabase.from("field_definitions").update(patch).eq("id", id);
  if (error) {
    logServerError("admin/updateFieldDefinitionCore", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidateFieldAdminSurfaces();
  return { success: true };
}

export async function updateFieldDefinitionCoreForm(formData: FormData): Promise<void> {
  await updateFieldDefinitionCore(undefined, formData);
}

export async function updateFieldDefinition(
  _prev: FieldAdminActionState,
  formData: FormData,
): Promise<FieldAdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(fieldIdSchema, {
    field_id: trimmedString(formData, "field_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { field_id: id } = parsed.data;

  const { data: defMeta, error: metaErr } = await supabase
    .from("field_definitions")
    .select("key")
    .eq("id", id)
    .maybeSingle();
  if (metaErr) {
    logServerError("admin/updateFieldDefinition/load_key", metaErr);
    return { error: CLIENT_ERROR.update };
  }
  const key = defMeta?.key ?? "";
  const canonicalMirror = Boolean(key && isReservedTalentProfileFieldKey(key));

  const patch: Record<string, unknown> = {};
  const boolKeys = [
    "public_visible",
    "internal_only",
    "card_visible",
    "preview_visible",
    "profile_visible",
    "filterable",
    "directory_filter_visible",
    "searchable",
    "ai_visible",
    "editable_by_talent",
    "editable_by_staff",
    "editable_by_admin",
    "active",
  ] as const;
  for (const k of boolKeys) {
    if (!formData.has(k)) continue;
    patch[k] = String(formData.get(k) ?? "") === "1";
  }

  if (formData.has("required_level")) {
    if (canonicalMirror) {
      return {
        error: "Required level is fixed for canonical Basic Information mirrors (use product rules / migrations).",
      };
    }
    const rl = trimmedString(formData, "required_level");
    if (!isRequiredLevel(rl)) return { error: "Invalid required level." };
    patch.required_level = rl;
  }

  if (formData.has("sort_order")) {
    if (canonicalMirror) {
      return { error: "Canonical mirrors use a fixed sort order in the Basic Information group." };
    }
    const raw = trimmedString(formData, "sort_order");
    const n = Number.parseInt(raw, 10);
    patch.sort_order = Number.isFinite(n) ? n : 0;
  }

  patch.updated_at = new Date().toISOString();

  const { error } = await supabase.from("field_definitions").update(patch).eq("id", id);
  if (error) {
    logServerError("admin/updateFieldDefinition", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidateFieldAdminSurfaces();
  return { success: true };
}

export async function archiveFieldDefinition(
  _prev: FieldAdminActionState,
  formData: FormData,
): Promise<FieldAdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(fieldIdSchema, {
    field_id: trimmedString(formData, "field_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { field_id: id } = parsed.data;

  const { data: def, error: loadErr } = await supabase
    .from("field_definitions")
    .select("key")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) {
    logServerError("admin/archiveFieldDefinition/load", loadErr);
    return { error: CLIENT_ERROR.update };
  }
  if (def?.key && isReservedTalentProfileFieldKey(def.key)) {
    return {
      error:
        "Canonical profile mirrors cannot be archived — they define how Basic Information appears in admin and visibility toggles.",
    };
  }

  const { error } = await supabase
    .from("field_definitions")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    logServerError("admin/archiveFieldDefinition", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidateFieldAdminSurfaces();
  return { success: true };
}

export async function restoreFieldDefinition(
  _prev: FieldAdminActionState,
  formData: FormData,
): Promise<FieldAdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(fieldIdSchema, {
    field_id: trimmedString(formData, "field_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { field_id: id } = parsed.data;

  const { data: existing, error: loadErr } = await supabase
    .from("field_definitions")
    .select("key, value_type")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) {
    logServerError("admin/restoreFieldDefinition/load", loadErr);
    return { error: CLIENT_ERROR.update };
  }
  if (existing?.value_type && isBlockedDynamicLocationValueType(existing.value_type)) {
    return {
      error:
        "Location-type field definitions are retired — canonical geography is on talent_profiles (residence / origin).",
    };
  }

  const { error } = await supabase
    .from("field_definitions")
    .update({ archived_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    logServerError("admin/restoreFieldDefinition", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidateFieldAdminSurfaces();
  return { success: true };
}

export async function reorderFieldGroupFields(
  _prev: FieldAdminActionState,
  formData: FormData,
): Promise<FieldAdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(orderedIdsSchema, {
    ordered_ids: trimmedString(formData, "ordered_ids"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { ordered_ids: orderedIdsRaw } = parsed.data;
  const orderedIds = orderedIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (orderedIds.length === 0) return { error: "Nothing to reorder." };

  const updates = orderedIds.map((id, index) =>
    supabase
      .from("field_definitions")
      .update({ sort_order: (index + 1) * 10, updated_at: new Date().toISOString() })
      .eq("id", id),
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    logServerError("admin/reorderFieldGroupFields", failed.error);
    return { error: CLIENT_ERROR.update };
  }

  revalidateFieldAdminSurfaces();
  return { success: true };
}

export async function reorderFieldGroups(
  _prev: FieldAdminActionState,
  formData: FormData,
): Promise<FieldAdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(orderedIdsSchema, {
    ordered_ids: trimmedString(formData, "ordered_ids"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { ordered_ids: orderedIdsRaw } = parsed.data;
  const orderedIds = orderedIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (orderedIds.length === 0) return { error: "Nothing to reorder." };

  const now = new Date().toISOString();
  const updates = orderedIds.map((id, index) =>
    supabase
      .from("field_groups")
      .update({ sort_order: (index + 1) * 10, updated_at: now })
      .eq("id", id),
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    logServerError("admin/reorderFieldGroups", failed.error);
    return { error: CLIENT_ERROR.update };
  }
  revalidateFieldAdminSurfaces();
  return { success: true };
}

export async function hardDeleteFieldGroup(
  _prev: FieldAdminActionState,
  formData: FormData,
): Promise<FieldAdminActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(groupIdSchema, {
    group_id: trimmedString(formData, "group_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { group_id: id } = parsed.data;

  const mode = trimmedString(formData, "mode") || "archive";
  if (mode !== "delete" && mode !== "archive") return { error: "Invalid delete mode." };

  // Prefer safe behavior unless explicitly deleting.
  if (mode === "archive") {
    const fd = new FormData();
    fd.set("group_id", id);
    return archiveFieldGroup(undefined, fd);
  }

  const { error: dErr } = await supabase.from("field_definitions").delete().eq("field_group_id", id);
  if (dErr) {
    logServerError("admin/hardDeleteFieldGroup/defs", dErr);
    return { error: CLIENT_ERROR.update };
  }

  const { error: gErr } = await supabase.from("field_groups").delete().eq("id", id);
  if (gErr) {
    logServerError("admin/hardDeleteFieldGroup/group", gErr);
    return { error: CLIENT_ERROR.update };
  }

  revalidateFieldAdminSurfaces();
  return { success: true };
}
