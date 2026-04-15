"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { revalidateDirectoryListing } from "@/lib/revalidate-public";
import { DIRECTORY_TALENT_TYPE_FIELD_KEY } from "@/lib/directory/field-driven-filters";
import { DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY } from "@/lib/directory/directory-sidebar-layout";
import { parseWithSchema, trimmedString } from "@/lib/admin/validation";
import { requireStaff } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

export type DirectoryFiltersActionState = { error?: string; success?: boolean } | undefined;

const savePayloadSchema = z.object({
  item_order: z.array(z.string().min(1)),
  filter_search_visible: z.boolean(),
  field_visibility: z.record(z.string(), z.boolean()),
  /** Keys with true = facet accordion starts collapsed on the public directory. */
  section_collapsed_defaults: z.record(z.string(), z.boolean()).optional(),
  /** Taxonomy facet key for the pill row above results, or null to disable. */
  top_bar_facet_key: z.union([z.string().min(1).max(120), z.null()]),
});

export async function saveDirectorySidebarLayout(
  _prev: DirectoryFiltersActionState,
  formData: FormData,
): Promise<DirectoryFiltersActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const raw = trimmedString(formData, "payload");
  if (!raw) return { error: "Missing payload." };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw) as unknown;
  } catch {
    return { error: "Invalid JSON payload." };
  }

  const parsed = parseWithSchema(savePayloadSchema, parsedJson);
  if ("error" in parsed) return { error: parsed.error };

  const {
    item_order,
    filter_search_visible,
    field_visibility,
    section_collapsed_defaults,
    top_bar_facet_key,
  } = parsed.data;

  if (item_order.some((k) => k !== DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY && k.includes(","))) {
    return { error: "Invalid order key." };
  }

  const collapsedClean: Record<string, boolean> = {};
  const rawCollapsed = section_collapsed_defaults ?? {};
  for (const [k, v] of Object.entries(rawCollapsed)) {
    if (k === DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY) continue;
    if (v === true) collapsedClean[k] = true;
  }

  // Sanitize field visibility overrides — only keep explicit `false` values to keep the
  // JSONB compact (missing key = visible by default).
  const visibilityOverrides: Record<string, boolean> = {};
  for (const [key, visible] of Object.entries(field_visibility)) {
    if (key === DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY) continue;
    if (visible === false) visibilityOverrides[key] = false;
  }

  if (top_bar_facet_key) {
    const { data: facetRow, error: facetErr } = await supabase
      .from("field_definitions")
      .select("key")
      .eq("key", top_bar_facet_key)
      .eq("active", true)
      .is("archived_at", null)
      .in("value_type", ["taxonomy_single", "taxonomy_multi"])
      .maybeSingle();
    if (facetErr || !facetRow) {
      return {
        error:
          "Top bar facet must be an active taxonomy field (taxonomy_single or taxonomy_multi) that participates in directory filters.",
      };
    }
  }

  const layoutRow: Record<string, unknown> = {
    id: 1,
    item_order,
    filter_option_search_visible: filter_search_visible,
    section_collapsed_defaults: collapsedClean,
    field_visibility_overrides: visibilityOverrides,
    top_bar_facet_key,
    talent_type_top_bar_visible: top_bar_facet_key === DIRECTORY_TALENT_TYPE_FIELD_KEY,
    updated_at: new Date().toISOString(),
  };

  const { error: layoutErr } = await supabase
    .from("directory_sidebar_layout")
    .upsert(layoutRow, { onConflict: "id" });

  if (layoutErr) {
    const le = `${layoutErr.message ?? ""} ${layoutErr.code ?? ""}`.toLowerCase();
    if (le.includes("top_bar_facet_key")) {
      return {
        error:
          "Database is missing top_bar_facet_key. Apply migration 20260414120100_directory_top_bar_facet_key.sql.",
      };
    }
    if (le.includes("field_visibility_overrides")) {
      return {
        error:
          "Database is missing field_visibility_overrides. Apply migration 20260429100000_directory_sidebar_field_visibility_overrides.sql.",
      };
    }
    if (le.includes("talent_type_top_bar_visible")) {
      return {
        error:
          "Database is missing talent_type_top_bar_visible. Apply migration 20260412140000_directory_talent_type_top_bar.sql.",
      };
    }
    if (le.includes("section_collapsed_defaults")) {
      return {
        error:
          "Database is missing section_collapsed_defaults. Apply migration 20260412133000_directory_sidebar_collapsed_defaults.sql.",
      };
    }
    if (le.includes("directory_sidebar_layout")) {
      return {
        error:
          "Database is missing directory sidebar tables. Apply migration 20260411230000_directory_sidebar_filter_layout.sql.",
      };
    }
    logServerError("admin/directory-filters/layout", layoutErr);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/directory/filters");
  revalidatePath("/directory");
  revalidateDirectoryListing();
  return { success: true };
}
