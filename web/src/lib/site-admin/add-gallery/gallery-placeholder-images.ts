/**
 * TUL-80 / TUL-398: Gallery Grid / Strip placeholders.
 *
 * Never seed fashion-model Unsplash stock in the section library. Freeform
 * templates use equal-aspect first-party marketing photos; registry embeds
 * (schema requires absolute URLs) use soft SVG tiles. Same aspect keeps the
 * masonry grid even (no gap under the middle tile).
 */
import type { BuilderNodeStyle } from "@/lib/site-admin/builder-node/types";

export type GalleryPlaceholder = {
  src: string;
  alt: string;
  style: BuilderNodeStyle;
};

/** Shared 4:3 cover crop so three masonry tiles stay level. */
const TILE_STYLE: BuilderNodeStyle = {
  objectFit: "cover",
  width: "100%",
  aspectRatio: "4:3",
};

function softTileSvg(fill: string, label: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">` +
    `<rect width="1200" height="900" fill="${fill}"/>` +
    `<text x="600" y="460" text-anchor="middle" fill="#6b645c" font-family="Georgia, serif" font-size="36">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Service- and studio-leaning shots from `/marketing/photos` (no fashion
 * runway / model portraits). Agency sites get the same neutral tiles; operators
 * replace with their own photography.
 */
export const GALLERY_PLACEHOLDERS: ReadonlyArray<GalleryPlaceholder> = [
  {
    src: "/marketing/photos/mk-hero-service.jpg",
    alt: "Studio service work",
    style: TILE_STYLE,
  },
  {
    src: "/marketing/photos/service-pros-lifestyle.jpg",
    alt: "Professionals at work",
    style: TILE_STYLE,
  },
  {
    src: "/marketing/photos/mk-hero-business.jpg",
    alt: "Business studio space",
    style: TILE_STYLE,
  },
  {
    src: "/marketing/photos/agency-workspace-builder.jpg",
    alt: "Creative workspace",
    style: TILE_STYLE,
  },
] as const;

/**
 * Absolute-URL placeholders for registry `gallery_strip` embeds and
 * `default-content` (Zod `.url()` rejects root-relative paths). Soft tiles,
 * no people, no Unsplash stock.
 */
export const GALLERY_EMBED_PLACEHOLDERS: ReadonlyArray<{
  src: string;
  alt: string;
  aspect: "wide" | "tall" | "square";
}> = [
  { src: softTileSvg("#efe8df", "Photo 1"), alt: "Add your photo", aspect: "wide" },
  { src: softTileSvg("#e4ddd3", "Photo 2"), alt: "Add your photo", aspect: "tall" },
  { src: softTileSvg("#d9d2c7", "Photo 3"), alt: "Add your photo", aspect: "square" },
];

/** Fashion / talent Unsplash hosts that must not appear in gallery defaults. */
const STOCK_TALENT_SRC =
  /images\.unsplash\.com\/photo-(1494790108377|1508214751196|1517841905240|1524504388940|1529139574466|1580489944761|1507003211169|1531746020798|1519741497674|1519225421980|1464366400600)/i;

export function isStockTalentGallerySrc(src: string | null | undefined): boolean {
  return typeof src === "string" && STOCK_TALENT_SRC.test(src);
}

export function galleryPlaceholderAt(index: number): GalleryPlaceholder {
  return GALLERY_PLACEHOLDERS[index % GALLERY_PLACEHOLDERS.length]!;
}
