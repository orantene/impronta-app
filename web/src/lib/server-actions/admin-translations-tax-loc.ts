"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { revalidateTaxonomyCaches } from "@/lib/revalidate-public";
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

const labelEsSchema = z.object({
  id: z.string().uuid(),
  name_es: z.string(),
});

const locationEsSchema = z.object({
  id: z.string().uuid(),
  display_name_es: z.string(),
});

export type TaxonomyTranslationPanelPayload = {
  id: string;
  kind: string;
  slug: string;
  name_en: string;
  name_es: string | null;
};

export type LocationTranslationPanelPayload = {
  id: string;
  country_code: string;
  city_slug: string;
  display_name_en: string;
  display_name_es: string | null;
};

export async function adminLoadTaxonomyTranslationPanelData(
  input: z.infer<typeof idSchema>,
): Promise<{ error: string } | { data: TaxonomyTranslationPanelPayload }> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid term." };

  const { data: row, error } = await auth.supabase
    .from("taxonomy_terms")
    .select("id, kind, slug, name_en, name_es")
    .eq("id", parsed.data.id)
    .is("archived_at", null)
    .maybeSingle();
  if (error || !row) return { error: "Term not found." };
  return {
    data: {
      id: row.id as string,
      kind: String(row.kind ?? ""),
      slug: String(row.slug ?? ""),
      name_en: String(row.name_en ?? ""),
      name_es: (row.name_es as string | null) ?? null,
    },
  };
}

export async function adminLoadLocationTranslationPanelData(
  input: z.infer<typeof idSchema>,
): Promise<{ error: string } | { data: LocationTranslationPanelPayload }> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid location." };

  const { data: row, error } = await auth.supabase
    .from("locations")
    .select("id, country_code, city_slug, display_name_en, display_name_es")
    .eq("id", parsed.data.id)
    .is("archived_at", null)
    .maybeSingle();
  if (error || !row) return { error: "Location not found." };
  return {
    data: {
      id: row.id as string,
      country_code: String(row.country_code ?? ""),
      city_slug: String(row.city_slug ?? ""),
      display_name_en: String(row.display_name_en ?? ""),
      display_name_es: (row.display_name_es as string | null) ?? null,
    },
  };
}

export async function adminSaveTaxonomySpanishLabel(
  input: z.infer<typeof labelEsSchema>,
): Promise<TaxLocActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = labelEsSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid data." };

  const now = new Date().toISOString();
  const { error } = await auth.supabase
    .from("taxonomy_terms")
    .update({
      name_es: parsed.data.name_es.trim() || null,
      updated_at: now,
    })
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };

  revalidatePath("/admin/translations");
  revalidatePath("/admin/taxonomy");
  revalidateTaxonomyCaches();
  return { success: true };
}

export async function adminSaveLocationSpanishDisplay(
  input: z.infer<typeof locationEsSchema>,
): Promise<TaxLocActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = locationEsSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid data." };

  const now = new Date().toISOString();
  const { error } = await auth.supabase
    .from("locations")
    .update({
      display_name_es: parsed.data.display_name_es.trim() || null,
      updated_at: now,
    })
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };

  revalidatePath("/admin/translations");
  revalidatePath("/admin/locations");
  revalidateTaxonomyCaches();
  return { success: true };
}
