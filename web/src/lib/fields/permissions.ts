import type { FieldDefinitionRow } from "@/lib/fields/types";

export type FieldActor = "talent" | "staff" | "admin";

export function canEditFieldDefinition(actor: FieldActor): boolean {
  return actor === "staff" || actor === "admin";
}

export function canEditFieldValue(def: FieldDefinitionRow, actor: FieldActor): boolean {
  if (actor === "admin") return def.editable_by_admin === true;
  if (actor === "staff") return def.editable_by_staff === true;
  return def.editable_by_talent === true;
}

export function isPublicProfileVisible(def: FieldDefinitionRow): boolean {
  if (def.archived_at) return false;
  if (!def.active) return false;
  if (def.internal_only) return false;
  if (!def.public_visible) return false;
  return def.profile_visible === true;
}

