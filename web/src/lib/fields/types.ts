export type FieldRequiredLevel = "optional" | "recommended" | "required";

export type FieldValueType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "boolean"
  | "taxonomy_single"
  | "taxonomy_multi"
  | "location";

export type FieldGroupRow = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  sort_order: number;
  archived_at: string | null;
};

export type FieldDefinitionRow = {
  id: string;
  field_group_id: string | null;
  key: string;
  label_en: string;
  label_es: string | null;
  help_en: string | null;
  help_es: string | null;
  value_type: FieldValueType;
  required_level: FieldRequiredLevel;
  /** Anonymous/public release gate; pair with profile_visible (and often card_visible) for directory traits. */
  public_visible: boolean;
  internal_only: boolean;
  /** Directory card trait lines (not page layout). */
  card_visible: boolean;
  /** Public talent profile sections + part of directory trait catalog. */
  profile_visible: boolean;
  filterable: boolean;
  /**
   * Adds text/textarea `field_values` to directory `q` when public_visible and profile_visible are on.
   * Does not enable or disable name / short_bio / taxonomy / location baseline search.
   */
  searchable: boolean;
  /** Reserved; no production consumer yet. */
  ai_visible: boolean;
  editable_by_talent: boolean;
  editable_by_staff: boolean;
  editable_by_admin: boolean;
  active: boolean;
  sort_order: number;
  taxonomy_kind: string | null;
  config: Record<string, unknown>;
  archived_at: string | null;
};

export type FieldValueRow = {
  id: string;
  talent_profile_id: string;
  field_definition_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_taxonomy_ids: string[];
  created_at: string;
  updated_at: string;
};

