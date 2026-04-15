import { createPublicSupabaseClient } from "@/lib/supabase/public";

export type PublicProfileSectionKey =
  | "fit_labels"
  | "skills"
  | "languages"
  | "industries"
  | "event_types"
  | "tags";

export type PublicProfileSectionConfig = {
  key: PublicProfileSectionKey;
  label: string;
  sort: number;
  groupSort: number;
};

function pickLabel(locale: string, en: string, es?: string | null): string {
  if (locale === "es" && es && es.trim()) return es.trim();
  return en.trim();
}

const SUPPORTED: PublicProfileSectionKey[] = [
  "fit_labels",
  "skills",
  "languages",
  "industries",
  "event_types",
  "tags",
];

export async function getOrderedPublicProfileSections(
  locale: string = "en",
): Promise<PublicProfileSectionConfig[]> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    return SUPPORTED.map((key, i) => ({
      key,
      label: key.replace(/_/g, " "),
      sort: (i + 1) * 10,
      groupSort: 0,
    }));
  }

  const { data, error } = await supabase
    .from("field_definitions")
    .select("key, label_en, label_es, sort_order, field_groups(sort_order)")
    .in("key", SUPPORTED)
    .eq("active", true)
    .is("archived_at", null)
    .eq("public_visible", true)
    .eq("internal_only", false)
    .eq("profile_visible", true);

  if (error || !data) {
    return SUPPORTED.map((key, i) => ({
      key,
      label: key.replace(/_/g, " "),
      sort: (i + 1) * 10,
      groupSort: 0,
    }));
  }

  type FieldRow = {
    key: string;
    label_en: string;
    label_es: string | null;
    sort_order: number;
    field_groups: { sort_order: number } | { sort_order: number }[] | null;
  };

  const rows = (data as FieldRow[]).map((row) => {
    const fg = row.field_groups as { sort_order: number } | { sort_order: number }[] | null;
    const groupSort = Array.isArray(fg) ? fg[0]?.sort_order ?? 0 : fg?.sort_order ?? 0;
    return {
      key: row.key as PublicProfileSectionKey,
      label: pickLabel(locale, row.label_en, row.label_es ?? null),
      sort: row.sort_order ?? 0,
      groupSort,
    };
  });

  // preserve stable output even if some fields are missing
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const merged = SUPPORTED.map((key, i) => {
    const found = byKey.get(key);
    return (
      found ?? {
        key,
        label: key.replace(/_/g, " "),
        sort: (i + 1) * 10,
        groupSort: 0,
      }
    );
  });

  return merged.sort((a, b) => a.groupSort - b.groupSort || a.sort - b.sort);
}

