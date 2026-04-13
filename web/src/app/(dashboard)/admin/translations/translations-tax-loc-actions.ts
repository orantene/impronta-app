"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireStaff } from "@/lib/server/action-guards";

const idSchema = z.object({ id: z.string().uuid() });
const bulkSchema = z.object({ ids: z.array(z.string().uuid()).max(500) });

export type TaxLocActionResult = { error?: string; success?: true };

async function markTaxonomyTranslatedCore(
  supabase: SupabaseClient,
  id: string,
): Promise<{ error: string | null }> {
  const { data: row, error: loadErr } = await supabase
    .from("taxonomy_terms")
    .select("id, name_en, name_es")
    .eq("id", id)
    .maybeSingle();
  if (loadErr || !row) return { error: "Term not found." };

  const es = String(row.name_es ?? "").trim();
  if (es) return { error: null };

  const en = String(row.name_en ?? "").trim();
  if (!en) return { error: "English label is empty." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("taxonomy_terms")
    .update({ name_es: en, updated_at: now })
    .eq("id", id);
  if (error) return { error: error.message };
  return { error: null };
}

async function markLocationTranslatedCore(
  supabase: SupabaseClient,
  id: string,
): Promise<{ error: string | null }> {
  const { data: row, error: loadErr } = await supabase
    .from("locations")
    .select("id, display_name_en, display_name_es")
    .eq("id", id)
    .maybeSingle();
  if (loadErr || !row) return { error: "Location not found." };

  const es = String(row.display_name_es ?? "").trim();
  if (es) return { error: null };

  const en = String(row.display_name_en ?? "").trim();
  if (!en) return { error: "English display name is empty." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("locations")
    .update({ display_name_es: en, updated_at: now })
    .eq("id", id);
  if (error) return { error: error.message };
  return { error: null };
}

/** Fills empty Spanish from English (UI “mark translated” until dedicated workflow exists). */
export async function adminMarkTaxonomyTranslated(
  input: z.infer<typeof idSchema>,
): Promise<TaxLocActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid term." };

  const { error } = await markTaxonomyTranslatedCore(auth.supabase, parsed.data.id);
  if (error) return { error };

  revalidatePath("/admin/translations");
  revalidatePath("/admin/taxonomy");
  return { success: true };
}

export async function adminMarkLocationTranslated(
  input: z.infer<typeof idSchema>,
): Promise<TaxLocActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid location." };

  const { error } = await markLocationTranslatedCore(auth.supabase, parsed.data.id);
  if (error) return { error };

  revalidatePath("/admin/translations");
  revalidatePath("/admin/locations");
  return { success: true };
}

export type BulkTaxLocResult = { ok: number; failed: { id: string; message: string }[] };

export async function adminBulkMarkTaxonomyTranslated(
  input: z.infer<typeof bulkSchema>,
): Promise<BulkTaxLocResult | { error: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid selection." };
  const ids = parsed.data.ids;
  if (ids.length === 0) return { error: "Select at least one row." };

  const failed: { id: string; message: string }[] = [];
  let ok = 0;
  for (const id of ids) {
    const { error } = await markTaxonomyTranslatedCore(auth.supabase, id);
    if (error) failed.push({ id, message: error });
    else ok += 1;
  }
  revalidatePath("/admin/translations");
  revalidatePath("/admin/taxonomy");
  return { ok, failed };
}

export async function adminBulkMarkLocationTranslated(
  input: z.infer<typeof bulkSchema>,
): Promise<BulkTaxLocResult | { error: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid selection." };
  const ids = parsed.data.ids;
  if (ids.length === 0) return { error: "Select at least one row." };

  const failed: { id: string; message: string }[] = [];
  let ok = 0;
  for (const id of ids) {
    const { error } = await markLocationTranslatedCore(auth.supabase, id);
    if (error) failed.push({ id, message: error });
    else ok += 1;
  }
  revalidatePath("/admin/translations");
  revalidatePath("/admin/locations");
  return { ok, failed };
}
