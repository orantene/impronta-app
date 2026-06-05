import type { BuilderNode } from "../types";
import { pageDesignPhoto } from "./photos";
import type { BuilderNodeRenderDataSources } from "../render";
import { INTER } from "./tokens";

/**
 * Store archetype building blocks — palette, sample collection data, and the
 * two node-factory helpers (size chip + trust badge). Extracted from `store.ts`
 * so the archetype's page tree stays under the 800-line file budget; the
 * values here are byte-for-byte what previously lived inline in `store.ts`.
 */

export const PHOTO = {
  print: pageDesignPhoto("vocalistPortrait"),
  altA: pageDesignPhoto("studioScene"),
  altB: pageDesignPhoto("serviceProsScene"),
  altC: pageDesignPhoto("directorPortrait"),
  relA: pageDesignPhoto("studioDesk"),
  relB: pageDesignPhoto("studioScene"),
  relC: pageDesignPhoto("serviceProsScene"),
};

export const dataSources: BuilderNodeRenderDataSources = {
  collections: {
    // Thumbnail strip under the main print — alternate views/crops of the work.
    store_gallery: [
      { id: "g1", imageUrl: PHOTO.print, label: "Full frame" },
      { id: "g2", imageUrl: PHOTO.altA, label: "In the room" },
      { id: "g3", imageUrl: PHOTO.altB, label: "Detail" },
      { id: "g4", imageUrl: PHOTO.altC, label: "Framed" },
    ],
    // "You may also like" product grid.
    store_related: [
      { id: "r1", imageUrl: PHOTO.relA, title: "Atelier, Morning", price: "$240" },
      { id: "r2", imageUrl: PHOTO.relB, title: "On Air, CDMX", price: "$260" },
      { id: "r3", imageUrl: PHOTO.relC, title: "The Service Issue", price: "$220" },
    ],
  },
};

export const INK = "#1d1a16";
export const MUTE = "#6c645a";
export const CLAY = "#9a6a4f";
export const PAPER = "#fbfaf6";
export const HAIR = "#e3dccf";

/** A small bordered "size" chip in the variant selector row. */
export function sizeChip(id: string, label: string, selected: boolean): BuilderNode {
  return {
    id,
    kind: "paragraph",
    props: {
      text: label,
      style: {
        fontFamily: INTER,
        fontSize: "13px",
        fontWeight: 600,
        letterSpacing: "0.02em",
        textColor: selected ? PAPER : INK,
        backgroundColor: selected ? INK : "transparent",
        borderColor: selected ? INK : HAIR,
        borderWidth: "1px",
        borderStyle: "solid",
        borderRadius: "999px",
        paddingTop: "9px",
        paddingBottom: "9px",
        paddingLeft: "16px",
        paddingRight: "16px",
      },
    },
  };
}

/** A trust badge (label) in the reassurance row under the CTA. */
export function trustBadge(id: string, text: string): BuilderNode {
  return {
    id,
    kind: "paragraph",
    props: {
      text,
      style: {
        fontFamily: INTER,
        fontSize: "12px",
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        textColor: MUTE,
      },
    },
  };
}
