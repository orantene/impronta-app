import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { stampKitSection, type KitIdFactory } from "./section-kit";
// ── GALLERY ──────────────────────────────────────────────────────────────────

/** Masonry keeps an editorial rhythm; each tile still reserves its frame. */
const MASONRY_TILE_RATIOS = ["3 / 4", "1 / 1", "4 / 5", "4 / 5", "3 / 4", "1 / 1"] as const;

/**
 * A gallery tile reserves its frame before the photo loads (lazy images with
 * no size collapsed to 0px, leaving a ~300px blank run at 390 and a layout
 * jump). `cover` crops into the frame. The first tile loads eagerly.
 */
function galleryTile(makeId: KitIdFactory, index: number, masonry: boolean): BuilderNode {
  return {
    id: makeId(),
    kind: "image",
    props: {
      src: `{{gallery${index}}}`,
      alt: "{{displayName}}",
      ...(index === 0 ? { priority: true } : {}),
      style: {
        radius: "md",
        objectFit: "cover",
        width: "100%",
        ...(masonry
          ? { aspectRatioFree: MASONRY_TILE_RATIOS[index] }
          : { aspectRatio: "3:4" }),
      },
    },
  } as BuilderNode;
}

/** Gallery: `masonry` or a fixed `grid` of six `{{gallery0..5}}` tiles. */
export function galleryBlock(
  makeId: KitIdFactory,
  opts: { mode?: "masonry" | "grid"; columns?: 2 | 3 | 4; heading?: string } = {},
): BuilderNode {
  const tiles = [0, 1, 2, 3, 4, 5].map((i) => galleryTile(makeId, i, opts.mode !== "grid"));
  const grid: BuilderNode =
    opts.mode === "grid"
      ? ({
          id: makeId(),
          kind: "container",
          props: {
            layout: "grid",
            columns: opts.columns ?? 3,
            gap: "m",
            responsive: { mobile: { layout: "stack" } },
          },
          children: tiles,
        } as BuilderNode)
      : ({
          id: makeId(),
          kind: "masonry",
          props: { columns: opts.columns ?? 3, gap: "m" },
          children: tiles,
        } as BuilderNode);

  return {
    id: makeId(),
    kind: "container",
    props: stampKitSection("gallery", {
      layout: "stack",
      gap: "m",
      align: "start",
      layerLabel: "Gallery",
      style: { maxWidth: "wide", paddingY: "l", paddingX: "m" },
    }),
    children: [
      {
        id: makeId(),
        kind: "heading",
        props: { text: opts.heading ?? "Selected work", level: 2, style: { size: "lg" } },
      },
      grid,
    ],
  } as BuilderNode;
}
