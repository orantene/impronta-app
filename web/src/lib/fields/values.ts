import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { FieldValueRow } from "@/lib/fields/types";

type RawValueRow = Omit<FieldValueRow, "value_taxonomy_ids"> & {
  value_taxonomy_ids: unknown;
};

function normalizeUuidArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}

export const loadTalentFieldValues = cache(
  async (talentProfileId: string): Promise<FieldValueRow[]> => {
    const supabase = await createClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("field_values")
      .select(
        "id, talent_profile_id, field_definition_id, value_text, value_number, value_boolean, value_date, value_taxonomy_ids, created_at, updated_at",
      )
      .eq("talent_profile_id", talentProfileId)
      .order("updated_at", { ascending: false });

    if (error || !data) return [];

    return (data as RawValueRow[]).map((row) => ({
      ...(row as Omit<RawValueRow, "value_taxonomy_ids">),
      value_taxonomy_ids: normalizeUuidArray(row.value_taxonomy_ids),
    }));
  },
);

