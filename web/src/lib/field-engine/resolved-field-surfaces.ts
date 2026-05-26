import type { ResolvedField } from "@/lib/field-engine/resolve-talent-fields";

type SurfaceField = Pick<
  ResolvedField,
  | "default_visibility"
  | "is_admin_only"
  | "show_in_registration"
  | "show_in_edit_drawer"
  | "show_in_public"
  | "show_in_directory"
  | "talent_editable"
>;

function hasPublicChannel(field: SurfaceField): boolean {
  return field.default_visibility.includes("public") && !field.is_admin_only;
}

export function isResolvedFieldVisibleInAdminEditor(field: SurfaceField): boolean {
  return field.show_in_edit_drawer;
}

export function isResolvedFieldVisibleInTalentEditor(field: SurfaceField): boolean {
  return field.show_in_edit_drawer && field.talent_editable && !field.is_admin_only;
}

export function isResolvedFieldVisibleAtRegistration(field: SurfaceField): boolean {
  return field.show_in_registration && field.talent_editable && !field.is_admin_only;
}

export function isResolvedFieldVisibleOnPublicProfile(field: SurfaceField): boolean {
  return field.show_in_public && hasPublicChannel(field);
}

export function isResolvedFieldVisibleInDirectory(field: SurfaceField): boolean {
  return field.show_in_directory && hasPublicChannel(field);
}
