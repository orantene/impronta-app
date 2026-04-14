import type { SupabaseClient } from "@supabase/supabase-js";

/** Matches `directory_sidebar_layout` and DirectoryFiltersSidebar. */
export const DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY = "__filter_search__" as const;

export type DirectorySidebarLayoutRow = {
  item_order: string[];
  filter_option_search_visible: boolean;
  /** Keys with true start collapsed in the public sidebar; missing keys = expanded. */
  section_collapsed_defaults: Record<string, boolean>;
  /** When true, talent type uses the top pill row instead of a sidebar section. */
  talent_type_top_bar_visible: boolean;
  /**
   * Per-field visibility overrides for the public sidebar.
   * `false` = hidden from visitors. Missing key = visible (default).
   * This is independent of `field_definitions.directory_filter_visible`, which
   * controls whether a field participates in filtering at all.
   */
  field_visibility_overrides: Record<string, boolean>;
};

const DEFAULT_LAYOUT: DirectorySidebarLayoutRow = {
  item_order: [DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY],
  filter_option_search_visible: true,
  section_collapsed_defaults: {},
  talent_type_top_bar_visible: true,
  field_visibility_overrides: {},
};

export function parseSectionCollapsedDefaults(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k === "string" && k.length > 0 && v === true) out[k] = true;
  }
  return out;
}

export function parseFieldVisibilityOverrides(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k === "string" && k.length > 0 && typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

function isMissingDirectoryFilterColumns(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    text.includes("directory_filter_visible") ||
    text.includes("directory_sidebar_layout") ||
    (text.includes("column") && text.includes("does not exist"))
  );
}

export async function fetchDirectorySidebarLayout(
  supabase: SupabaseClient,
): Promise<DirectorySidebarLayoutRow> {
  const { data, error } = await supabase
    .from("directory_sidebar_layout")
    .select(
      "item_order, filter_option_search_visible, section_collapsed_defaults, talent_type_top_bar_visible, field_visibility_overrides",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    const msg = `${error.message ?? ""}`.toLowerCase();
    if (msg.includes("talent_type_top_bar_visible")) {
      const retry = await supabase
        .from("directory_sidebar_layout")
        .select("item_order, filter_option_search_visible, section_collapsed_defaults")
        .eq("id", 1)
        .maybeSingle();
      if (retry.error || !retry.data) return DEFAULT_LAYOUT;
      const d = retry.data as {
        item_order?: unknown;
        filter_option_search_visible?: boolean;
        section_collapsed_defaults?: unknown;
      };
      const rawOrder = d.item_order;
      const item_order = Array.isArray(rawOrder)
        ? rawOrder.filter((x): x is string => typeof x === "string" && x.length > 0)
        : DEFAULT_LAYOUT.item_order;
      return {
        item_order: item_order.length > 0 ? item_order : DEFAULT_LAYOUT.item_order,
        filter_option_search_visible: Boolean(d.filter_option_search_visible ?? true),
        section_collapsed_defaults: parseSectionCollapsedDefaults(d.section_collapsed_defaults),
        talent_type_top_bar_visible: DEFAULT_LAYOUT.talent_type_top_bar_visible,
        field_visibility_overrides: {},
      };
    }
    if (msg.includes("section_collapsed_defaults")) {
      const retry = await supabase
        .from("directory_sidebar_layout")
        .select("item_order, filter_option_search_visible")
        .eq("id", 1)
        .maybeSingle();
      if (retry.error || !retry.data) return DEFAULT_LAYOUT;
      const d = retry.data as { item_order?: unknown; filter_option_search_visible?: boolean };
      const rawOrder = d.item_order;
      const item_order = Array.isArray(rawOrder)
        ? rawOrder.filter((x): x is string => typeof x === "string" && x.length > 0)
        : DEFAULT_LAYOUT.item_order;
      return {
        item_order: item_order.length > 0 ? item_order : DEFAULT_LAYOUT.item_order,
        filter_option_search_visible: Boolean(d.filter_option_search_visible ?? true),
        section_collapsed_defaults: {},
        talent_type_top_bar_visible: DEFAULT_LAYOUT.talent_type_top_bar_visible,
        field_visibility_overrides: {},
      };
    }
    if (isMissingDirectoryFilterColumns(error)) return DEFAULT_LAYOUT;
    return DEFAULT_LAYOUT;
  }

  if (!data) return DEFAULT_LAYOUT;

  const rawOrder = (data as { item_order?: unknown }).item_order;
  const item_order = Array.isArray(rawOrder)
    ? rawOrder.filter((x): x is string => typeof x === "string" && x.length > 0)
    : DEFAULT_LAYOUT.item_order;

  const row = data as {
    filter_option_search_visible?: boolean;
    section_collapsed_defaults?: unknown;
    talent_type_top_bar_visible?: boolean;
    field_visibility_overrides?: unknown;
  };

  return {
    item_order: item_order.length > 0 ? item_order : DEFAULT_LAYOUT.item_order,
    filter_option_search_visible: Boolean(row.filter_option_search_visible ?? true),
    section_collapsed_defaults: parseSectionCollapsedDefaults(row.section_collapsed_defaults),
    talent_type_top_bar_visible:
      row.talent_type_top_bar_visible !== undefined
        ? Boolean(row.talent_type_top_bar_visible)
        : DEFAULT_LAYOUT.talent_type_top_bar_visible,
    field_visibility_overrides: parseFieldVisibilityOverrides(row.field_visibility_overrides),
  };
}

/**
 * Merge saved order with current facet keys: drop stale keys, append new keys at end.
 */
export function mergeSidebarItemOrder(saved: string[], facetKeys: string[]): string[] {
  const facetSet = new Set(facetKeys);
  const searchKey = DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY;
  const filtered = saved.filter((k) => k === searchKey || facetSet.has(k));
  const seen = new Set(filtered);
  for (const k of facetKeys) {
    if (!seen.has(k)) {
      filtered.push(k);
      seen.add(k);
    }
  }
  if (!seen.has(searchKey)) {
    filtered.unshift(searchKey);
  }
  return filtered;
}
