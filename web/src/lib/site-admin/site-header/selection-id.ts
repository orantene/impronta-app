/**
 * Synthetic section ID for the live header element.
 *
 * Both the server-rendered <PublicHeader> (when in edit mode) and the
 * client-rendered <InspectorDock> reference this. It must NOT live in
 * a module that imports server-only APIs (next/headers, server actions,
 * etc.) — Next.js follows the import graph, and a server-only dep
 * smuggled through this constant breaks the client bundle.
 */
export const SITE_HEADER_SELECTION_ID = "__site_header__";

/**
 * Should the inspector take the synthetic site-header special-case
 * (short-circuit the section load → render <SiteHeaderInspector>)?
 *
 * The sentinel ITSELF is the gate. `SITE_HEADER_SELECTION_ID` is emitted in
 * exactly one place — `PublishedShell`'s legacy SLOT render of the header
 * (`sectionTypeKey === "site_header" ? SITE_HEADER_SELECTION_ID : sectionId`).
 * A freeform shell's header/footer landmarks are ordinary BuilderNodes whose
 * ids are node UUIDs; a `section_embed` of the header carries the embedded
 * row's REAL id. Neither can ever equal the sentinel, so matching on it
 * cannot hijack node-level editing on a freeform shell.
 *
 * WS-A A2 originally ALSO gated this on `surfaceKind !== "site_shell"`,
 * assuming the sentinel "is never produced" on the shell surface. That
 * assumption fails for tenants whose `__site_shell__` page is still
 * slot-composed (empty `blocks`, header/footer attached via
 * `cms_page_sections` — Impronta in production): the shell SURFACE is active,
 * but `PublishedShell` still does the slot render and still emits the
 * sentinel. With the surface gate in place the selection fell through to the
 * generic section loader, which queried `cms_sections.id = '__site_header__'`
 * and rendered a dead "Section not found" inspector — the header was
 * uneditable on exactly the surface built to edit it.
 */
export function isLegacySiteHeaderSelection(input: {
  selectedSectionId: string | null;
  surfaceKind: string;
}): boolean {
  return input.selectedSectionId === SITE_HEADER_SELECTION_ID;
}
