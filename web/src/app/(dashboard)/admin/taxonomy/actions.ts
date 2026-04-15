"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseWithSchema, trimmedString } from "@/lib/admin/validation";
import { requireStaff } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { revalidateTaxonomyCaches } from "@/lib/revalidate-public";
import { fetchOpenAiTaxonomyPromoImageBytes } from "@/lib/taxonomy/openai-taxonomy-promo-image";
import {
  isMissingTaxonomyPromoColumnsError,
  isTaxonomyPromoPathForTerm,
  isTaxonomyPromoPlacement,
  taxonomyPromoStoragePrefix,
} from "@/lib/taxonomy/taxonomy-promo";

export type TaxonomyActionState =
  | {
      error?: string;
      success?: boolean;
      /** Returned after promo image mutations so the edit modal can refresh preview without closing. */
      promo_image_storage_path?: string | null;
    }
  | undefined;

const TAXONOMY_KINDS = [
  "talent_type",
  "tag",
  "skill",
  "industry",
  "event_type",
  "fit_label",
  "language",
  "location_city",
  "location_country",
] as const;

const SYSTEM_MANAGED_KINDS = ["location_city", "location_country"] as const;

export type LockedTaxonomyKind = (typeof TAXONOMY_KINDS)[number];
type SystemManagedTaxonomyKind = (typeof SYSTEM_MANAGED_KINDS)[number];

function isLockedKind(value: string): value is LockedTaxonomyKind {
  return (TAXONOMY_KINDS as readonly string[]).includes(value);
}

function isSystemManagedKind(value: string): value is SystemManagedTaxonomyKind {
  return (SYSTEM_MANAGED_KINDS as readonly string[]).includes(value);
}

const taxonomyKindSchema = z.string().refine(isLockedKind, {
  message: "Unsupported taxonomy kind.",
});

const createTaxonomyTermSchema = z.object({
  kind: z.string().min(1, "kind, slug, and name_en are required."),
  slug: z.string().min(1, "kind, slug, and name_en are required."),
  name_en: z.string().min(1, "kind, slug, and name_en are required."),
  name_es: z.string(),
  sort_order: z.string(),
});

const termIdSchema = z.object({
  term_id: z.string().min(1, "Missing term ID."),
});

const updateTaxonomyTermSchema = z.object({
  term_id: z.string().min(1, "term_id, slug, and name_en are required."),
  slug: z.string().min(1, "term_id, slug, and name_en are required."),
  name_en: z.string().min(1, "term_id, slug, and name_en are required."),
  name_es: z.string(),
  sort_order: z.string(),
  /** Comma-separated placement keys (validated server-side). */
  promo_placements: z.string(),
});

const orderedIdsSchema = z.object({
  kind: z.string(),
  ordered_ids: z.string().min(1, "Nothing to reorder."),
});

const bulkToggleTaxonomySchema = z.object({
  term_ids: z.string().min(1, "No terms selected."),
  next_archived: z.string(),
});

const PROMO_MAX_BYTES = 20 * 1024 * 1024;

/** Shown when DB is missing `promo_*` columns (migration not applied). */
const TAXONOMY_PROMO_MIGRATION_HINT =
  "Promo image fields are not in the database yet. Apply the latest Supabase migrations (file: taxonomy_term_promo_images), restart if needed, then try again.";

function normalizePromoPlacements(raw: string): string[] {
  const parts = raw
    .split(/[,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (isTaxonomyPromoPlacement(p) && !out.includes(p)) out.push(p);
  }
  return out;
}

async function toPromoUploadPayload(
  input: Buffer,
  originalMime: string,
): Promise<{ body: Buffer; contentType: string; ext: string }> {
  try {
    const sharp = (await import("sharp")).default;
    const webp = await sharp(input).rotate().webp({ quality: 86 }).toBuffer();
    return { body: webp, contentType: "image/webp", ext: "webp" };
  } catch {
    const ext = mimeToFileExt(originalMime);
    return {
      body: input,
      contentType: originalMime || "application/octet-stream",
      ext: ext || "bin",
    };
  }
}

function mimeToFileExt(m: string): string {
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  return "";
}

async function removeTaxonomyPromoFromBucket(
  supabase: SupabaseClient,
  termId: string,
  path: string | null | undefined,
) {
  if (!path || !isTaxonomyPromoPathForTerm(termId, path)) return;
  const { error } = await supabase.storage.from("media-public").remove([path]);
  if (error) {
    logServerError("admin/taxonomyPromo/removeObject", error);
  }
}

export async function createTaxonomyTerm(
  _prev: TaxonomyActionState,
  formData: FormData,
): Promise<TaxonomyActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(createTaxonomyTermSchema, {
    kind: trimmedString(formData, "kind"),
    slug: trimmedString(formData, "slug"),
    name_en: trimmedString(formData, "name_en"),
    name_es: trimmedString(formData, "name_es"),
    sort_order: trimmedString(formData, "sort_order") || "0",
  });
  if ("error" in parsed) return { error: parsed.error };

  const { kind, slug, name_en, name_es, sort_order: sort_order_raw } = parsed.data;
  const sort_order = parseInt(sort_order_raw, 10) || 0;
  if (!taxonomyKindSchema.safeParse(kind).success) return { error: "Unsupported taxonomy kind." };

  if (isSystemManagedKind(kind)) {
    return { error: "Locations are managed in the Locations workspace." };
  }

  const { error } = await supabase.from("taxonomy_terms").insert({
    kind,
    slug,
    name_en,
    name_es: name_es || null,
    sort_order,
  });

  if (error) {
    logServerError("admin/createTaxonomyTerm", error);
    return { error: CLIENT_ERROR.update };
  }
  revalidatePath("/admin/taxonomy");
  revalidateTaxonomyCaches();
  return { success: true };
}

export async function reorderTaxonomyKind(
  _prev: TaxonomyActionState,
  formData: FormData,
): Promise<TaxonomyActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(orderedIdsSchema, {
    kind: trimmedString(formData, "kind"),
    ordered_ids: trimmedString(formData, "ordered_ids"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { kind, ordered_ids: orderedIdsRaw } = parsed.data;
  const orderedIds = orderedIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!taxonomyKindSchema.safeParse(kind).success) return { error: "Unsupported taxonomy kind." };
  if (isSystemManagedKind(kind)) {
    return { error: "Location taxonomy is system-managed from the Locations workspace." };
  }
  if (orderedIds.length === 0) return { error: "Nothing to reorder." };

  const updates = orderedIds.map((id, index) =>
    supabase
      .from("taxonomy_terms")
      .update({ sort_order: (index + 1) * 10, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("kind", kind),
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    logServerError("admin/reorderTaxonomyKind", failed.error);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/taxonomy");
  revalidateTaxonomyCaches();
  return { success: true };
}

export async function bulkToggleArchiveTaxonomyTerms(
  _prev: TaxonomyActionState,
  formData: FormData,
): Promise<TaxonomyActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(bulkToggleTaxonomySchema, {
    term_ids: trimmedString(formData, "term_ids"),
    next_archived: trimmedString(formData, "next_archived"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { term_ids: idsRaw, next_archived: nextArchivedRaw } = parsed.data;
  const ids = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const nextArchived = nextArchivedRaw === "1";

  if (ids.length === 0) return { error: "No terms selected." };

  const { data: terms, error: termsError } = await supabase
    .from("taxonomy_terms")
    .select("kind")
    .in("id", ids);

  if (termsError) {
    logServerError("admin/bulkToggleArchiveTaxonomyTerms/list", termsError);
    return { error: CLIENT_ERROR.update };
  }

  if ((terms ?? []).some((term) => isSystemManagedKind(String(term.kind ?? "")))) {
    return { error: "Location taxonomy is system-managed from the Locations workspace." };
  }

  const { error } = await supabase
    .from("taxonomy_terms")
    .update({ archived_at: nextArchived ? new Date().toISOString() : null })
    .in("id", ids);

  if (error) {
    logServerError("admin/bulkToggleArchiveTaxonomyTerms", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/taxonomy");
  revalidateTaxonomyCaches();
  return { success: true };
}

export async function archiveTaxonomyTerm(
  _prev: TaxonomyActionState,
  formData: FormData,
): Promise<TaxonomyActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(termIdSchema, {
    term_id: trimmedString(formData, "term_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { term_id: id } = parsed.data;

  const { data: term, error: termError } = await supabase
    .from("taxonomy_terms")
    .select("kind")
    .eq("id", id)
    .maybeSingle();

  if (termError) {
    logServerError("admin/archiveTaxonomyTerm/load", termError);
    return { error: CLIENT_ERROR.update };
  }

  if (term && isSystemManagedKind(String(term.kind ?? ""))) {
    return { error: "Location taxonomy is system-managed from the Locations workspace." };
  }

  const { error } = await supabase
    .from("taxonomy_terms")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logServerError("admin/archiveTaxonomyTerm", error);
    return { error: CLIENT_ERROR.update };
  }
  revalidatePath("/admin/taxonomy");
  revalidateTaxonomyCaches();
  return { success: true };
}

export async function restoreTaxonomyTerm(
  _prev: TaxonomyActionState,
  formData: FormData,
): Promise<TaxonomyActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(termIdSchema, {
    term_id: trimmedString(formData, "term_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { term_id: id } = parsed.data;

  const { data: term, error: termError } = await supabase
    .from("taxonomy_terms")
    .select("kind")
    .eq("id", id)
    .maybeSingle();

  if (termError) {
    logServerError("admin/restoreTaxonomyTerm/load", termError);
    return { error: CLIENT_ERROR.update };
  }

  if (term && isSystemManagedKind(String(term.kind ?? ""))) {
    return { error: "Location taxonomy is system-managed from the Locations workspace." };
  }

  const { error } = await supabase
    .from("taxonomy_terms")
    .update({ archived_at: null })
    .eq("id", id);

  if (error) {
    logServerError("admin/restoreTaxonomyTerm", error);
    return { error: CLIENT_ERROR.update };
  }
  revalidatePath("/admin/taxonomy");
  revalidateTaxonomyCaches();
  return { success: true };
}

export async function updateTaxonomyTerm(
  _prev: TaxonomyActionState,
  formData: FormData,
): Promise<TaxonomyActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(updateTaxonomyTermSchema, {
    term_id: trimmedString(formData, "term_id"),
    slug: trimmedString(formData, "slug"),
    name_en: trimmedString(formData, "name_en"),
    name_es: trimmedString(formData, "name_es"),
    sort_order: trimmedString(formData, "sort_order") || "0",
    promo_placements: trimmedString(formData, "promo_placements"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { term_id: id, slug, name_en, name_es, sort_order: sort_order_raw, promo_placements } =
    parsed.data;
  const sort_order = parseInt(sort_order_raw, 10) || 0;
  const promoPlacements = normalizePromoPlacements(promo_placements);

  const { data: existing, error: loadErr } = await supabase
    .from("taxonomy_terms")
    .select("id, kind, slug")
    .eq("id", id)
    .maybeSingle();

  if (loadErr) {
    logServerError("admin/updateTaxonomyTerm/load", loadErr);
    return { error: CLIENT_ERROR.update };
  }
  if (!existing) return { error: "Term not found." };

  const kind = String(existing.kind ?? "");
  if (!isLockedKind(kind)) return { error: "Unsupported taxonomy kind." };
  if (isSystemManagedKind(kind)) {
    return { error: "Location taxonomy is system-managed from the Locations workspace." };
  }

  if (slug !== existing.slug) {
    const { data: clash, error: clashErr } = await supabase
      .from("taxonomy_terms")
      .select("id")
      .eq("kind", kind)
      .eq("slug", slug)
      .neq("id", id)
      .maybeSingle();

    if (clashErr) {
      logServerError("admin/updateTaxonomyTerm/clash", clashErr);
      return { error: CLIENT_ERROR.update };
    }
    if (clash) return { error: "Another term in this group already uses that slug." };
  }

  let { error } = await supabase
    .from("taxonomy_terms")
    .update({
      slug,
      name_en,
      name_es: name_es || null,
      sort_order,
      promo_placements: promoPlacements,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error && isMissingTaxonomyPromoColumnsError(error)) {
    ({ error } = await supabase
      .from("taxonomy_terms")
      .update({
        slug,
        name_en,
        name_es: name_es || null,
        sort_order,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id));
  }

  if (error) {
    logServerError("admin/updateTaxonomyTerm", error);
    return { error: CLIENT_ERROR.update };
  }
  revalidatePath("/admin/taxonomy");
  revalidateTaxonomyCaches();
  return { success: true };
}

export async function deleteTaxonomyTerm(
  _prev: TaxonomyActionState,
  formData: FormData,
): Promise<TaxonomyActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(termIdSchema, {
    term_id: trimmedString(formData, "term_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { term_id: id } = parsed.data;

  let { data: term, error: termError } = await supabase
    .from("taxonomy_terms")
    .select("kind, promo_image_storage_path")
    .eq("id", id)
    .maybeSingle();

  let promoPath: string | null = null;
  if (!termError && term) {
    promoPath = (term as { promo_image_storage_path?: string | null }).promo_image_storage_path ?? null;
  } else if (termError && isMissingTaxonomyPromoColumnsError(termError)) {
    const r2 = await supabase.from("taxonomy_terms").select("kind").eq("id", id).maybeSingle();
    term = r2.data as typeof term;
    termError = r2.error;
    promoPath = null;
  }

  if (termError) {
    logServerError("admin/deleteTaxonomyTerm/load", termError);
    return { error: CLIENT_ERROR.update };
  }
  if (!term) return { error: "Term not found." };

  if (isSystemManagedKind(String(term.kind ?? ""))) {
    return { error: "Location taxonomy is system-managed from the Locations workspace." };
  }

  await removeTaxonomyPromoFromBucket(supabase, id, promoPath);

  const { error } = await supabase.from("taxonomy_terms").delete().eq("id", id);

  if (error) {
    logServerError("admin/deleteTaxonomyTerm", error);
    return { error: CLIENT_ERROR.update };
  }
  revalidatePath("/admin/taxonomy");
  revalidateTaxonomyCaches();
  return { success: true };
}

export async function archiveAllTermsInKind(
  _prev: TaxonomyActionState,
  formData: FormData,
): Promise<TaxonomyActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(z.object({ kind: z.string() }), {
    kind: trimmedString(formData, "kind"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { kind } = parsed.data;
  if (!taxonomyKindSchema.safeParse(kind).success) return { error: "Unsupported taxonomy kind." };
  if (isSystemManagedKind(kind)) {
    return { error: "Location taxonomy is system-managed from the Locations workspace." };
  }

  const { error } = await supabase
    .from("taxonomy_terms")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("kind", kind)
    .is("archived_at", null);

  if (error) {
    logServerError("admin/archiveAllTermsInKind", error);
    return { error: CLIENT_ERROR.update };
  }
  revalidatePath("/admin/taxonomy");
  revalidateTaxonomyCaches();
  return { success: true };
}

export async function restoreAllTermsInKind(
  _prev: TaxonomyActionState,
  formData: FormData,
): Promise<TaxonomyActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(z.object({ kind: z.string() }), {
    kind: trimmedString(formData, "kind"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { kind } = parsed.data;
  if (!taxonomyKindSchema.safeParse(kind).success) return { error: "Unsupported taxonomy kind." };
  if (isSystemManagedKind(kind)) {
    return { error: "Location taxonomy is system-managed from the Locations workspace." };
  }

  const { error } = await supabase
    .from("taxonomy_terms")
    .update({ archived_at: null, updated_at: new Date().toISOString() })
    .eq("kind", kind)
    .not("archived_at", "is", null);

  if (error) {
    logServerError("admin/restoreAllTermsInKind", error);
    return { error: CLIENT_ERROR.update };
  }
  revalidatePath("/admin/taxonomy");
  revalidateTaxonomyCaches();
  return { success: true };
}

export async function uploadTaxonomyPromoImage(
  _prev: TaxonomyActionState,
  formData: FormData,
): Promise<TaxonomyActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(termIdSchema, {
    term_id: trimmedString(formData, "term_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { term_id: id } = parsed.data;

  const file = formData.get("file");
  if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
    return { error: "Choose an image file to upload." };
  }
  const blob = file as File;
  if (blob.size > PROMO_MAX_BYTES) {
    return { error: "Image must be 20MB or smaller." };
  }
  const mime = blob.type || "";
  if (!mime.startsWith("image/")) {
    return { error: "Only image files are allowed." };
  }

  const { data: existing, error: loadErr } = await supabase
    .from("taxonomy_terms")
    .select("id, kind, promo_image_storage_path")
    .eq("id", id)
    .maybeSingle();

  if (loadErr) {
    if (isMissingTaxonomyPromoColumnsError(loadErr)) {
      return { error: TAXONOMY_PROMO_MIGRATION_HINT };
    }
    logServerError("admin/uploadTaxonomyPromoImage/load", loadErr);
    return { error: CLIENT_ERROR.update };
  }
  if (!existing) return { error: "Term not found." };

  const kind = String(existing.kind ?? "");
  if (!isLockedKind(kind)) return { error: "Unsupported taxonomy kind." };
  if (isSystemManagedKind(kind)) {
    return { error: "Location taxonomy is system-managed from the Locations workspace." };
  }

  let inputBuf: Buffer;
  try {
    inputBuf = Buffer.from(await blob.arrayBuffer());
  } catch {
    return { error: "Could not read the uploaded file." };
  }

  const { body, contentType, ext } = await toPromoUploadPayload(inputBuf, mime);
  const prefix = taxonomyPromoStoragePrefix(id);
  const newPath = `${prefix}${randomUUID()}.${ext}`;
  const oldPath = existing.promo_image_storage_path as string | null | undefined;

  await removeTaxonomyPromoFromBucket(supabase, id, oldPath);

  const { error: upErr } = await supabase.storage.from("media-public").upload(newPath, body, {
    contentType,
    upsert: false,
  });
  if (upErr) {
    logServerError("admin/uploadTaxonomyPromoImage/storage", upErr);
    return { error: CLIENT_ERROR.update };
  }

  const { error: dbErr } = await supabase
    .from("taxonomy_terms")
    .update({
      promo_image_storage_path: newPath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (dbErr) {
    logServerError("admin/uploadTaxonomyPromoImage/db", dbErr);
    await supabase.storage.from("media-public").remove([newPath]).catch(() => {});
    if (isMissingTaxonomyPromoColumnsError(dbErr)) {
      return { error: TAXONOMY_PROMO_MIGRATION_HINT };
    }
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/taxonomy");
  revalidateTaxonomyCaches();
  return { success: true, promo_image_storage_path: newPath };
}

export async function clearTaxonomyPromoImage(
  _prev: TaxonomyActionState,
  formData: FormData,
): Promise<TaxonomyActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(termIdSchema, {
    term_id: trimmedString(formData, "term_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { term_id: id } = parsed.data;

  const { data: existing, error: loadErr } = await supabase
    .from("taxonomy_terms")
    .select("id, kind, promo_image_storage_path")
    .eq("id", id)
    .maybeSingle();

  if (loadErr) {
    if (isMissingTaxonomyPromoColumnsError(loadErr)) {
      return { success: true, promo_image_storage_path: null };
    }
    logServerError("admin/clearTaxonomyPromoImage/load", loadErr);
    return { error: CLIENT_ERROR.update };
  }
  if (!existing) return { error: "Term not found." };

  const kind = String(existing.kind ?? "");
  if (!isLockedKind(kind)) return { error: "Unsupported taxonomy kind." };
  if (isSystemManagedKind(kind)) {
    return { error: "Location taxonomy is system-managed from the Locations workspace." };
  }

  const prevPath = (existing as { promo_image_storage_path?: string | null }).promo_image_storage_path ?? null;
  await removeTaxonomyPromoFromBucket(supabase, id, prevPath);

  const { error } = await supabase
    .from("taxonomy_terms")
    .update({
      promo_image_storage_path: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    logServerError("admin/clearTaxonomyPromoImage", error);
    if (isMissingTaxonomyPromoColumnsError(error)) {
      return { success: true, promo_image_storage_path: null };
    }
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/taxonomy");
  revalidateTaxonomyCaches();
  return { success: true, promo_image_storage_path: null };
}

export async function generateTaxonomyPromoImage(
  _prev: TaxonomyActionState,
  formData: FormData,
): Promise<TaxonomyActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(termIdSchema, {
    term_id: trimmedString(formData, "term_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { term_id: id } = parsed.data;

  const { data: existing, error: loadErr } = await supabase
    .from("taxonomy_terms")
    .select("id, kind, name_en, promo_image_storage_path")
    .eq("id", id)
    .maybeSingle();

  if (loadErr) {
    if (isMissingTaxonomyPromoColumnsError(loadErr)) {
      return { error: TAXONOMY_PROMO_MIGRATION_HINT };
    }
    logServerError("admin/generateTaxonomyPromoImage/load", loadErr);
    return { error: CLIENT_ERROR.update };
  }
  if (!existing) return { error: "Term not found." };

  const kind = String(existing.kind ?? "");
  if (!isLockedKind(kind)) return { error: "Unsupported taxonomy kind." };
  if (isSystemManagedKind(kind)) {
    return { error: "Location taxonomy is system-managed from the Locations workspace." };
  }

  let rawBytes: Buffer;
  try {
    rawBytes = await fetchOpenAiTaxonomyPromoImageBytes(String(existing.name_en ?? ""));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Image generation failed.";
    return { error: msg };
  }

  const { body, contentType, ext } = await toPromoUploadPayload(rawBytes, "image/png");
  const prefix = taxonomyPromoStoragePrefix(id);
  const newPath = `${prefix}${randomUUID()}.${ext}`;
  const oldPath = existing.promo_image_storage_path as string | null | undefined;

  await removeTaxonomyPromoFromBucket(supabase, id, oldPath);

  const { error: upErr } = await supabase.storage.from("media-public").upload(newPath, body, {
    contentType,
    upsert: false,
  });
  if (upErr) {
    logServerError("admin/generateTaxonomyPromoImage/storage", upErr);
    return { error: CLIENT_ERROR.update };
  }

  const { error: dbErr } = await supabase
    .from("taxonomy_terms")
    .update({
      promo_image_storage_path: newPath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (dbErr) {
    logServerError("admin/generateTaxonomyPromoImage/db", dbErr);
    await supabase.storage.from("media-public").remove([newPath]).catch(() => {});
    if (isMissingTaxonomyPromoColumnsError(dbErr)) {
      return { error: TAXONOMY_PROMO_MIGRATION_HINT };
    }
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/taxonomy");
  revalidateTaxonomyCaches();
  return { success: true, promo_image_storage_path: newPath };
}
