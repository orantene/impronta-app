"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { revalidateTaxonomyCaches } from "@/lib/revalidate-public";
import { requireStaff } from "@/lib/server/action-guards";
import type { ServerActionResult } from "@/lib/server-actions/result";
import { pgUuidSchema } from "@/lib/site-admin/validators";

const idSchema = z.object({ id: pgUuidSchema() });
const bulkSchema = z.object({ ids: z.array(pgUuidSchema()).max(500) });

export type TaxLocActionResult = ServerActionResult;

async function markTaxonomyTranslatedCore(
  supabase: SupabaseClient,
  id: string,
): Promise<{ error: string | null }> {
  // name_en/name_es folded into name_i18n {en,es} (WS4 migration). Merge so the
  // EN key is preserved when seeding ES from EN.
  const { data: row, error: loadErr } = await supabase
    .from("taxonomy_terms")
    .select("id, name_i18n")
    .eq("id", id)
    .maybeSingle();
  if (loadErr || !row) return { error: "Term not found." };

  const nameMap = (row.name_i18n as Record<string, string | null> | null) ?? {};
  const es = String(nameMap.es ?? "").trim();
  if (es) return { error: null };

  const en = String(nameMap.en ?? "").trim();
  if (!en) return { error: "English label is empty." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("taxonomy_terms")
    .update({ name_i18n: { ...nameMap, es: en }, updated_at: now })
    .eq("id", id);
  if (error) return { error: error.message };
  return { error: null };
}

async function markLocationTranslatedCore(
  supabase: SupabaseClient,
  id: string,
): Promise<{ error: string | null }> {
  // display_name_en/_es folded into display_name_i18n {en,es} (WS4). Merge so
  // the EN key is preserved when seeding ES from EN.
  const { data: row, error: loadErr } = await supabase
    .from("locations")
    .select("id, display_name_i18n")
    .eq("id", id)
    .maybeSingle();
  if (loadErr || !row) return { error: "Location not found." };

  const nameMap = (row.display_name_i18n as Record<string, string | null> | null) ?? {};
  const es = String(nameMap.es ?? "").trim();
  if (es) return { error: null };

  const en = String(nameMap.en ?? "").trim();
  if (!en) return { error: "English display name is empty." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("locations")
    .update({ display_name_i18n: { ...nameMap, es: en }, updated_at: now })
    .eq("id", id);
  if (error) return { error: error.message };
  return { error: null };
}

/** Fills empty Spanish from English (UI “mark translated” until dedicated workflow exists). */
export async function adminMarkTaxonomyTranslated(
  input: z.infer<typeof idSchema>,
): Promise<TaxLocActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid term." };

  const { error } = await markTaxonomyTranslatedCore(auth.supabase, parsed.data.id);
  if (error) return { ok: false, error };

  revalidatePath("/admin/translations");
  revalidatePath("/admin/taxonomy");
  return { ok: true, data: undefined };
}

export async function adminMarkLocationTranslated(
  input: z.infer<typeof idSchema>,
): Promise<TaxLocActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid location." };

  const { error } = await markLocationTranslatedCore(auth.supabase, parsed.data.id);
  if (error) return { ok: false, error };

  revalidatePath("/admin/translations");
  revalidatePath("/admin/locations");
  return { ok: true, data: undefined };
}

export type BulkTaxLocSummary = { processed: number; failed: { id: string; message: string }[] };

export async function adminBulkMarkTaxonomyTranslated(
  input: z.infer<typeof bulkSchema>,
): Promise<ServerActionResult<BulkTaxLocSummary>> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid selection." };
  const ids = parsed.data.ids;
  if (ids.length === 0) return { ok: false, error: "Select at least one row." };

  const failed: { id: string; message: string }[] = [];
  let processed = 0;
  for (const id of ids) {
    const { error } = await markTaxonomyTranslatedCore(auth.supabase, id);
    if (error) failed.push({ id, message: error });
    else processed += 1;
  }
  revalidatePath("/admin/translations");
  revalidatePath("/admin/taxonomy");
  return { ok: true, data: { processed, failed } };
}

export async function adminBulkMarkLocationTranslated(
  input: z.infer<typeof bulkSchema>,
): Promise<ServerActionResult<BulkTaxLocSummary>> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid selection." };
  const ids = parsed.data.ids;
  if (ids.length === 0) return { ok: false, error: "Select at least one row." };

  const failed: { id: string; message: string }[] = [];
  let processed = 0;
  for (const id of ids) {
    const { error } = await markLocationTranslatedCore(auth.supabase, id);
    if (error) failed.push({ id, message: error });
    else processed += 1;
  }
  revalidatePath("/admin/translations");
  revalidatePath("/admin/locations");
  return { ok: true, data: { processed, failed } };
}

const labelEsSchema = z.object({
  id: pgUuidSchema(),
  name_es: z.string(),
});

const locationEsSchema = z.object({
  id: pgUuidSchema(),
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
): Promise<ServerActionResult<TaxonomyTranslationPanelPayload>> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid term." };

  const { data: row, error } = await auth.supabase
    .from("taxonomy_terms")
    .select("id, kind, slug, name_i18n")
    .eq("id", parsed.data.id)
    .is("archived_at", null)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "Term not found." };
  const nameMap = (row.name_i18n as Record<string, string | null> | null) ?? {};
  return {
    ok: true,
    data: {
      id: row.id as string,
      kind: String(row.kind ?? ""),
      slug: String(row.slug ?? ""),
      name_en: String(nameMap.en ?? ""),
      name_es: (nameMap.es as string | null) ?? null,
    },
  };
}

export async function adminLoadLocationTranslationPanelData(
  input: z.infer<typeof idSchema>,
): Promise<ServerActionResult<LocationTranslationPanelPayload>> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid location." };

  const { data: row, error } = await auth.supabase
    .from("locations")
    .select("id, country_code, city_slug, display_name_i18n")
    .eq("id", parsed.data.id)
    .is("archived_at", null)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "Location not found." };
  const nameMap = (row.display_name_i18n as Record<string, string | null> | null) ?? {};
  return {
    ok: true,
    data: {
      id: row.id as string,
      country_code: String(row.country_code ?? ""),
      city_slug: String(row.city_slug ?? ""),
      display_name_en: String(nameMap.en ?? ""),
      display_name_es: (nameMap.es as string | null) ?? null,
    },
  };
}

export async function adminSaveTaxonomySpanishLabel(
  input: z.infer<typeof labelEsSchema>,
): Promise<TaxLocActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = labelEsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid data." };

  // name_es folded into name_i18n {en,es} (WS4). Read-merge-write so the EN key
  // is never clobbered; clear ES (delete key) when the input is blank.
  const { data: cur, error: loadErr } = await auth.supabase
    .from("taxonomy_terms")
    .select("name_i18n")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (loadErr || !cur) return { ok: false, error: "Term not found." };
  const nameMap = { ...((cur.name_i18n as Record<string, string | null> | null) ?? {}) };
  const es = parsed.data.name_es.trim();
  if (es) nameMap.es = es;
  else delete nameMap.es;

  const now = new Date().toISOString();
  const { error } = await auth.supabase
    .from("taxonomy_terms")
    .update({
      name_i18n: nameMap,
      updated_at: now,
    })
    .eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/translations");
  revalidatePath("/admin/taxonomy");
  revalidateTaxonomyCaches();
  return { ok: true, data: undefined };
}

export async function adminSaveLocationSpanishDisplay(
  input: z.infer<typeof locationEsSchema>,
): Promise<TaxLocActionResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = locationEsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid data." };

  // display_name_es folded into display_name_i18n {en,es} (WS4). Read-merge-write
  // so the EN key survives; clear ES (delete key) when the input is blank.
  const { data: cur, error: loadErr } = await auth.supabase
    .from("locations")
    .select("display_name_i18n")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (loadErr || !cur) return { ok: false, error: "Location not found." };
  const nameMap = { ...((cur.display_name_i18n as Record<string, string | null> | null) ?? {}) };
  const es = parsed.data.display_name_es.trim();
  if (es) nameMap.es = es;
  else delete nameMap.es;

  const now = new Date().toISOString();
  const { error } = await auth.supabase
    .from("locations")
    .update({
      display_name_i18n: nameMap,
      updated_at: now,
    })
    .eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/translations");
  revalidatePath("/admin/locations");
  revalidateTaxonomyCaches();
  return { ok: true, data: undefined };
}
