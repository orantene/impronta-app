/**
 * Shared shape for the operator icon library.
 *
 * Lives in its own module because the generated catalogs import it and the
 * registry re-exports it — a cycle if it sat in `icon-registry.ts`.
 */

export type BuilderIconCategory =
  | "ui"
  | "arrows"
  | "commerce"
  | "communication"
  | "media"
  | "places"
  | "people"
  | "nature"
  | "social";

/**
 * A glyph as DATA, not a component: primitive lists drawn at render time in
 * `currentColor`. That is what lets the same definition paint the published
 * page (inline SVG, CSP-safe, no icon font) and the editor's picker tiles.
 */
export interface BuilderIconCatalogEntry {
  name: string;
  label: string;
  category: BuilderIconCategory;
  /** Extra words the picker's search should match. */
  keywords?: ReadonlyArray<string>;
  /** Brand marks are solid; everything else is stroked. */
  render?: "stroke" | "fill";
  paths: ReadonlyArray<string>;
  circles?: ReadonlyArray<{ cx: number; cy: number; r: number; fill?: boolean }>;
  rects?: ReadonlyArray<{
    x: number;
    y: number;
    width: number;
    height: number;
    rx?: number;
  }>;
  polygons?: ReadonlyArray<string>;
}
