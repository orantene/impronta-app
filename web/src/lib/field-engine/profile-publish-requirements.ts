import type { ResolvedField } from "@/lib/field-engine/resolve-talent-fields";

export type PublishBlockingResolvedField = Pick<
  ResolvedField,
  | "field_definition_id"
  | "field_key"
  | "label"
  | "is_required"
  | "required_before_publish"
  | "is_admin_only"
  | "default_visibility"
>;

export function isResolvedFieldPublishBlocking(
  field: PublishBlockingResolvedField,
): boolean {
  if (field.is_admin_only) return false;
  if (field.default_visibility.length === 0) return false;
  return field.required_before_publish || field.is_required;
}
