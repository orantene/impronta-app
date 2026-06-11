/**
 * section-embed-preview-subject.ts — WS4 (Architecture §D).
 *
 * Single source of truth for "which preview subject does a connected
 * `section_embed` hydrate against". Pure (no imports beyond types) so it can be
 * imported by the renderer, the freeform builders, and the node test runner.
 *
 * The connected freeform resolvers each declare the section-embed key they
 * decompose + the subject kind it scopes to:
 *   - `featured_talent`    (featured-talent-freeform)    → workspace
 *   - `location_discovery` (location-discovery-freeform) → workspace
 *   - `talent_type_grid`   (talent-discipline-freeform)  → workspace
 * plus the other tenant-scoped curated sections that read `workspace_profile`
 * /roster/directory data from request context.
 *
 * When a render context carries a `previewSubject` whose `kind` matches a
 * section's subject kind, the renderer scopes the section's data fetch to
 * `previewSubject.id` instead of `context.tenantId`. A `null` previewSubject
 * (the published storefront default) leaves every render scoped to the active
 * tenant → byte-identical.
 */

export type SectionEmbedSubjectKind = "talent" | "workspace";

/**
 * Curated section-embed keys that resolve their data from the active TENANT /
 * WORKSPACE (roster, directory taxonomy, locations, brand profile, header/
 * footer shell). Previewing as a `workspace` subject rescopes these to the
 * chosen workspace id.
 *
 * Derived from the data-bound section set (`section-live-data.ts`
 * LIVE_DATA_SECTION_TYPE_KEYS) — every section here fetches tenant-scoped data.
 * Kept as an explicit list (not an import of the meta graph) so this module
 * stays free of section `Component`/server deps.
 */
const WORKSPACE_SUBJECT_SECTION_KEYS: ReadonlySet<string> = new Set([
  // ── named in the WS4 plan §D (the three decomposed freeform resolvers) ──
  "featured_talent", // featured-talent-freeform
  "location_discovery", // location-discovery-freeform
  "talent_type_grid", // talent-discipline-freeform
  // ── other tenant/workspace-scoped curated sections (workspace_profile,
  //    roster, directory taxonomy, shell) ──
  "directory",
  "hero_search",
  "join_register",
  "site_header",
  "site_footer",
]);

/**
 * Returns the preview-subject kind a section embed scopes to, or `null` when
 * the section is not subject-scoped (pure-render sections — their on-screen
 * output does not depend on a tenant/talent and so never rescope under a
 * preview subject).
 */
export function sectionEmbedPreviewSubjectKind(
  sectionTypeKey: string,
): SectionEmbedSubjectKind | null {
  if (WORKSPACE_SUBJECT_SECTION_KEYS.has(sectionTypeKey)) return "workspace";
  return null;
}

/**
 * Given a render context's tenant id + optional preview subject, return the
 * EFFECTIVE tenant id + locale a section of `sectionTypeKey` should resolve
 * against.
 *
 * Rescopes to `previewSubject.id` ONLY when:
 *   - a previewSubject is present, AND
 *   - its `kind` matches the section's subject kind.
 * Otherwise returns the active tenant id + locale unchanged (published default).
 */
export function resolveSectionEmbedSubjectScope(input: {
  sectionTypeKey: string;
  tenantId: string;
  locale: string;
  previewSubject?: {
    kind: SectionEmbedSubjectKind;
    id: string;
    locale?: string;
  } | null;
}): { tenantId: string; locale: string } {
  const { sectionTypeKey, tenantId, locale, previewSubject } = input;
  if (!previewSubject) return { tenantId, locale };
  const subjectKind = sectionEmbedPreviewSubjectKind(sectionTypeKey);
  if (subjectKind && subjectKind === previewSubject.kind) {
    return {
      tenantId: previewSubject.id,
      locale: previewSubject.locale ?? locale,
    };
  }
  return { tenantId, locale };
}
