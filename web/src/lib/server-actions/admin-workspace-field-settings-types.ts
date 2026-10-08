export type FieldOverrideSnapshot = {
  enabled_override: boolean | null;
  required_override: boolean | null;
  show_in_public_override: boolean | null;
  admin_only_override: boolean | null;
  default_visibility_override: string[] | null;
  custom_label: string | null;
  custom_helper: string | null;
  display_order_override: number | null;
};

export type GroupOverrideSnapshot = {
  is_enabled: boolean | null;
  custom_label: string | null;
  display_order: number | null;
};

export type ScopeDefRow = { id: string; tier: string | null; field_group_id?: string | null };
export type ScopeRecRow = { field_definition_id: string; taxonomy_term_id: string };
export type ScopeTermRow = { id: string; parent_id: string | null; is_active: boolean | null };
export type ScopeSettingRow = { taxonomy_term_id: string; is_enabled: boolean | null };
