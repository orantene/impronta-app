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
 *   - `workspace_page`  — agency/workspace freeform pages (`workspace_pages`).
 *   - `talent_page`     — Talent Max freeform pages (`talent_pages`).
 *   - `platform_lab`    — Platform-Admin Builder Lab (ephemeral persistence;
 *                          never writes a page, only `builder_templates`).
 *
 * Keep this list closed: adding a surface means adding an adapter, not
 * special-casing the editor.
 */
export type BuilderSurfaceKind =
  | "homepage"
  | "workspace_page"
  | "talent_page"
  | "platform_lab"
  // Wave 4.1 — agency storefront pages (`cms_pages`) opted into FREEFORM
  // (`is_freeform=true`), edited via the front-end `?edit=1` UX. Slot-composed
  // cms_pages (homepage + system + legacy) stay on the `homepage` kind.
  | "cms_page";

/** Every valid surface kind, for exhaustiveness checks + guard iteration. */
export const BUILDER_SURFACE_KINDS: readonly BuilderSurfaceKind[] = [
  "homepage",
  "workspace_page",
  "talent_page",
  "platform_lab",
  "cms_page",
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
