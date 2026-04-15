"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/lib/server/action-guards";
import { aiFillMissingSpanishBio, aiRefreshSpanishBioLive } from "@/lib/translation/talent-bio-translation-service";
import { translateDirectoryLabelEnToEs } from "@/lib/translation/ai-translate-label";

const uuid = z.string().uuid();

export type AiJobResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; error: string };

/**
 * One profile AI step for bulk/row: reviewed → skip; empty ES → fill missing;
 * else refresh live Spanish from English (same path for all legacy statuses).
 */
export async function adminAiRunProfileTranslationJob(input: {
  talent_profile_id: string;
}): Promise<AiJobResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = z.object({ talent_profile_id: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid profile." };
  const id = parsed.data.talent_profile_id;

  const { data: row, error: loadErr } = await auth.supabase
    .from("talent_profiles")
    .select("bio_es, bio_es_status")
    .eq("id", id)
    .maybeSingle();
  if (loadErr || !row) return { ok: false, error: "Profile not found." };

  const status = String(row.bio_es_status ?? "missing");
  const hasEs = Boolean(String(row.bio_es ?? "").trim());

  if (status === "reviewed") {
    return { ok: true, skipped: true };
  }

  if (!hasEs) {
    const { error } = await aiFillMissingSpanishBio(auth.supabase, id, auth.user.id);
    if (error) return { ok: false, error };
    revalidatePath("/admin/translations");
    revalidatePath("/admin/talent");
    revalidatePath(`/admin/talent/${id}`);
    return { ok: true };
  }

  const { error } = await aiRefreshSpanishBioLive(auth.supabase, id, auth.user.id);
  if (error) return { ok: false, error };
  revalidatePath("/admin/translations");
  revalidatePath("/admin/talent");
  revalidatePath(`/admin/talent/${id}`);
  return { ok: true };
}

/** AI fill Spanish label only when `name_es` is empty (never overwrite). */
export async function adminAiTranslateTaxonomyTerm(input: { id: string }): Promise<AiJobResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = z.object({ id: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid term." };

  const { data: row, error: loadErr } = await auth.supabase
    .from("taxonomy_terms")
    .select("id, name_en, name_es")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (loadErr || !row) return { ok: false, error: "Term not found." };
  if (String(row.name_es ?? "").trim()) {
    return { ok: true, skipped: true };
  }

  const en = String(row.name_en ?? "").trim();
  if (!en) return { ok: false, error: "English label is empty." };

  const tr = await translateDirectoryLabelEnToEs(en);
  if (!tr.ok) return { ok: false, error: tr.message };

  const now = new Date().toISOString();
  const { error } = await auth.supabase
    .from("taxonomy_terms")
    .update({ name_es: tr.text.trim(), updated_at: now })
    .eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/translations");
  revalidatePath("/admin/taxonomy");
  return { ok: true };
}

/** AI fill Spanish display name only when `display_name_es` is empty (never overwrite). */
export async function adminAiTranslateLocation(input: { id: string }): Promise<AiJobResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = z.object({ id: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid location." };

  const { data: row, error: loadErr } = await auth.supabase
    .from("locations")
    .select("id, display_name_en, display_name_es")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (loadErr || !row) return { ok: false, error: "Location not found." };
  if (String(row.display_name_es ?? "").trim()) {
    return { ok: true, skipped: true };
  }

  const en = String(row.display_name_en ?? "").trim();
  if (!en) return { ok: false, error: "English display name is empty." };

  const tr = await translateDirectoryLabelEnToEs(en);
  if (!tr.ok) return { ok: false, error: tr.message };

  const now = new Date().toISOString();
  const { error } = await auth.supabase
    .from("locations")
    .update({ display_name_es: tr.text.trim(), updated_at: now })
    .eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/translations");
  revalidatePath("/admin/locations");
  return { ok: true };
}
