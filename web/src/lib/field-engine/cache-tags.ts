// src/lib/field-engine/cache-tags.ts
//
// Shared revalidateTag identifiers for the talent field catalog. Lives
// outside any "use server" boundary so both the resolver
// (admin-taxonomy.ts) and the workspace overrides writer
// (admin-workspace-field-settings.ts) can import the same constant
// instead of duplicating the literal "field-catalog" string.
//
// Surfaced in §11 of web/docs/engine-architecture.md.

/** Global tenant-static field-catalog cache tag. */
export const CACHE_TAG_FIELD_CATALOG = "field-catalog";

/** Tenant-scoped variant: `field-catalog:<tenantId>`. */
export function fieldCatalogTagForTenant(tenantId: string): string {
  return `${CACHE_TAG_FIELD_CATALOG}:${tenantId}`;
}

/**
 * Cache tag for the DB-backed talent profile-editor sidebar layout
 * (`loadProfileEditorLayout`). Revalidate this after any write to
 * `profile_editor_section_groups` / `profile_editor_sections`.
 */
export const CACHE_TAG_PROFILE_EDITOR_LAYOUT = "profile-editor-layout";
