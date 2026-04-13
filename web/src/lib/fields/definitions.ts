import { cache } from "react";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import type { FieldDefinitionRow, FieldGroupRow, FieldValueType } from "@/lib/fields/types";

function isFieldValueType(v: string): v is FieldValueType {
  return (
    v === "text" ||
    v === "textarea" ||
    v === "number" ||
    v === "date" ||
    v === "boolean" ||
    v === "taxonomy_single" ||
    v === "taxonomy_multi" ||
    v === "location"
  );
}

type RawDefinitionRow = Omit<FieldDefinitionRow, "value_type" | "config"> & {
  value_type: string;
  config: unknown;
};

function normalizeConfig(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export type FieldCatalog = {
  groups: FieldGroupRow[];
  definitions: FieldDefinitionRow[];
  definitionsByKey: Map<string, FieldDefinitionRow>;
  definitionsByGroupId: Map<string, FieldDefinitionRow[]>;
};

export const loadActiveFieldCatalog = cache(async (): Promise<FieldCatalog> => {
  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return {
      groups: [],
      definitions: [],
      definitionsByKey: new Map(),
      definitionsByGroupId: new Map(),
    };
  }

  const [{ data: groups }, { data: defs }] = await Promise.all([
    supabase
      .from("field_groups")
      .select("id, slug, name_en, name_es, sort_order, archived_at")
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("field_definitions")
      .select(
        "id, field_group_id, key, label_en, label_es, help_en, help_es, value_type, required_level, public_visible, internal_only, card_visible, profile_visible, filterable, searchable, ai_visible, editable_by_talent, editable_by_staff, editable_by_admin, active, sort_order, taxonomy_kind, config, archived_at",
      )
      .is("archived_at", null)
      .order("field_group_id")
      .order("sort_order"),
  ]);

  const groupRows = (groups ?? []) as FieldGroupRow[];
  const raw = (defs ?? []) as RawDefinitionRow[];
  const definitions: FieldDefinitionRow[] = raw
    .filter((d) => isFieldValueType(d.value_type))
    .map((d): FieldDefinitionRow => {
      const { value_type, config, ...rest } = d;
      return {
        ...(rest as Omit<FieldDefinitionRow, "value_type" | "config">),
        value_type: value_type as FieldValueType,
        config: normalizeConfig(config),
      };
    });

  const definitionsByKey = new Map(definitions.map((d) => [d.key, d] as const));
  const definitionsByGroupId = new Map<string, FieldDefinitionRow[]>();
  for (const d of definitions) {
    const gid = d.field_group_id ?? "ungrouped";
    const arr = definitionsByGroupId.get(gid) ?? [];
    arr.push(d);
    definitionsByGroupId.set(gid, arr);
  }

  return { groups: groupRows, definitions, definitionsByKey, definitionsByGroupId };
});

