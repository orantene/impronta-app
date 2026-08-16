/**
 * Footer selection routing — the mirror of `site-header/selection-id.ts`.
 *
 * ASYMMETRY WITH THE HEADER, STATED UP FRONT (it is the reason this file looks
 * different from its header twin):
 *
 *   - The HEADER is NOT a real `cms_page_sections` row on the legacy slot path.
 *     `PublishedShell` emits the synthetic `__site_header__` string as the slot's
 *     `data-section-id`, and the dock early-branches on that literal.
 *   - The FOOTER *is* a real section. `PublishedShell` emits its true `sectionId`,
 *     the dock loads the row like any other section, and until now that meant the
 *     auto-bound `ZodSchemaForm` editor. So the footer cannot be routed by a
 *     synthetic id — it is routed by the LOADED row's `sectionTypeKey`.
 *
 * Same gate as the header on the other axis, though: on the fully-freeform
 * `site_shell` SURFACE the landmarks are plain freeform section nodes that must
 * stay selectable and route through the normal node/section inspector, so the
 * special-case goes inert there.
 *
 * PURE + client-safe: no `next/headers`, no server actions, no DB. The dock is a
 * client component and Next follows the import graph — a server-only dep
 * smuggled through here would break the client bundle (the exact warning the
 * header's twin file carries).
 */

/** The `cms_sections.section_type_key` that identifies the shared site footer. */
export const SITE_FOOTER_SECTION_TYPE_KEY = "site_footer";

/**
 * Should the inspector dock render `<SiteFooterInspector>` for the current
 * selection?
 *
 * True only when the LOADED section is the shared site footer AND we are not on
 * the freeform `site_shell` surface. On the shell surface the footer landmark is
 * an ordinary freeform node — returning false there keeps zone-level editing
 * (which is the paid, node-level experience) reachable.
 *
 * @param loadedSectionTypeKey `cms_sections.section_type_key` of the row the dock
 *        has finished loading, or null while loading / when nothing is selected.
 * @param surfaceKind the active builder surface (`site_shell`, `homepage`, …).
 */
export function isSiteFooterSectionSelection(input: {
  loadedSectionTypeKey: string | null | undefined;
  surfaceKind: string;
}): boolean {
  if (input.surfaceKind === "site_shell") return false;
  return input.loadedSectionTypeKey === SITE_FOOTER_SECTION_TYPE_KEY;
}
