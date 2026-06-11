// Canonical mapping between the talent-editor RAIL sections and the
// `profile_field_definitions.section` values whose fields render there.
//
// SINGLE SOURCE OF TRUTH — imported by BOTH the platform-admin "Section
// Fields" tab (`catalog/_tabs/editor-layout-admin-data.ts`) and the talent
// profile editor (`live-category-fields-editor.tsx`) so the admin map and
// the editor's field routing can never drift. Keep this module framework-
// neutral (no React, no `server-only`) so a "use client" component and a
// "server-only" loader can both import it.

/**
 * Each RAIL section slug (the sections the talent editor renders) → the DB
 * `profile_field_definitions.section` values whose fields belong there.
 *
 * Migration 20260610090001 re-tags most fields onto their editor slug
 * (bios/languages→about, social→social_proof, travel→logistics,
 * documents→files, skills→refinement, emergency→admin, media.polaroids→
 * polaroids). Three editor concepts are NOT standalone rail sections
 * (commercial_terms "Booking terms", refinement "Extra details", reviews) —
 * their fields fold into the nearest rail accordion (Rates, Details,
 * Credits). Legacy section aliases (travel/skills/social/emergency/documents)
 * are kept as defense-in-depth against drift. Every distinct DB section value
 * is claimed, so the admin "Section Fields" tab reports 0 unmapped.
 */
export const SECTION_FIELD_SECTIONS: Record<string, string[]> = {
  identity: ["identity"],
  services: ["services"],
  location: ["location"],
  logistics: ["logistics", "travel"],
  media: ["media"],
  albums: ["albums"],
  polaroids: ["polaroids"],
  about: ["about"],
  physical: ["measurements"],
  wardrobe: ["wardrobe"],
  details: ["type-specific", "refinement", "skills"],
  rates: ["rates", "commercial_terms"],
  availability: ["availability"],
  credits: ["credits", "reviews"],
  limits: ["limits"],
  files: ["files", "documents"],
  social_proof: ["social_proof", "social"],
  verifications: ["verifications"],
  agency_fields: ["agency_fields"],
  admin: ["admin", "emergency"],
};

// In the new field-engine drawer path the rail sections "details", "physical"
// and "wardrobe" have NO standalone accordion — `TalentProfileShellDrawer`'s
// `visible()` returns false for them when the engine is active, so their
// fields fold into the single Services "Details" catalog editor. EVERY other
// DB section has a dedicated, visible rail section whose bespoke editor
// renders it (Identity, About, Rates, Logistics, …), so those fields must NOT
// also appear in the Services catalog editor — that double-render is exactly
// the "Services duplication" bug this set prevents.
const DETAILS_RAIL_SECTIONS = ["details", "physical", "wardrobe"] as const;

/**
 * DB `section` values owned by the Services "Details" catalog editor:
 * { "type-specific", "refinement", "skills", "measurements", "wardrobe" }.
 * A field whose section is NOT in this set has a dedicated rail home and is
 * suppressed from the Services catalog editor (it is edited in its section).
 */
export const DETAILS_CATCH_ALL_SECTIONS: ReadonlySet<string> = new Set(
  DETAILS_RAIL_SECTIONS.flatMap((rail) => SECTION_FIELD_SECTIONS[rail] ?? []),
);

/**
 * True when a field's DB `section` belongs to the Services "Details" editor
 * (i.e. it has no dedicated visible rail section in the engine path). Fields
 * for which this is false are rendered by their dedicated rail section's
 * bespoke editor and must be excluded from the generic catalog editor.
 */
export function isDetailsSection(section: string | null | undefined): boolean {
  return !!section && DETAILS_CATCH_ALL_SECTIONS.has(section);
}
