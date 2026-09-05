/**
 * Builder Surface Kind — the discriminator that lets ONE Page Builder Core
 * serve multiple surfaces.
 *
 * The whole platform-plan premise is that surfaces differ ONLY by
 * config / permissions / connectors / templates / publish-targets — never by
 * forked editor code. The `BuilderSurfaceKind` is the single tag every
 * surface-aware decision keys off:
 *
 *   - `homepage`        — the legacy storefront homepage (the ONLY surface
 *                          allowed to write `cms_page_sections` / composition
 *                          slots). Frozen + wrapped, byte-identical.
 *   - `talent_page`     — Talent Max freeform pages (`talent_pages`).
 *   - `platform_lab`    — Platform-Admin Builder Lab (ephemeral persistence;
 *                          never writes a page, only `builder_templates`).
 *   - `cms_page`        — agency storefront pages (`cms_pages`) opted into
 *                          FREEFORM (`is_freeform=true`), edited via the
 *                          front-end `?edit=1` UX. Slot-composed cms_pages
 *                          (homepage + system + legacy) stay on `homepage`.
 *   - `site_shell`      — the tenant's shared site HEADER + FOOTER, edited as a
 *                          freeform tree (Builder Studio WS-A). Persists the
 *                          freeform `builderTree` to the dormant `site_shell`
 *                          `cms_pages` row's `blocks` column and publishes through
 *                          the existing `site-shell-publish` snapshot path. NEVER
 *                          writes `cms_page_sections` — the dormant slot
 *                          composition stays untouched. Behind `site-shell-flag`
 *                          (OFF by default), so it cannot affect live rendering.
 *
 * Keep this list closed: adding a surface means adding an adapter, not
 * special-casing the editor.
 *
 * (The retired `workspace_page` kind + its `workspace_pages` store were removed
 *  in the page-system consolidation — agency pages are now freeform cms_pages.)
 */
export type BuilderSurfaceKind =
  | "homepage"
  | "talent_page"
  | "platform_lab"
  | "cms_page"
  | "site_shell"
  // `print` — a print piece (table tent, A5, ...): a freeform tree at a FIXED
  // physical size, with page chrome (scroll, viewport, breakpoints, hover)
  // suppressed and a persistent trim/safe-area guide. Persists to `print_designs`
  // via a minimal adapter (load/save, no revisions); "publish" is export to a
  // print PDF (Piece B slice 2), not a live page. See docs/plans/print-canvas-design.md.
  | "print";

/** Every valid surface kind, for exhaustiveness checks + guard iteration. */
export const BUILDER_SURFACE_KINDS: readonly BuilderSurfaceKind[] = [
  "homepage",
  "talent_page",
  "platform_lab",
  "cms_page",
  "site_shell",
  "print",
] as const;

/** The single surface allowed to write the legacy `cms_page_sections` table /
 *  composition slots. Everything else persists only to pure-freeform tables. */
export const LEGACY_BUILDER_WRITE_SURFACE: BuilderSurfaceKind = "homepage";

/** Narrowing guard for untyped (e.g. DB / query-string) input. */
export function isBuilderSurfaceKind(value: unknown): value is BuilderSurfaceKind {
  return (
    typeof value === "string" &&
    (BUILDER_SURFACE_KINDS as readonly string[]).includes(value)
  );
}
