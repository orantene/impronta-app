/**
 * Location section (Design kit block, every design can place it): the shared
 * `visit` widget in its "location" layout inside a slot-stamped band. The data
 * (kind, zone, arrival note, address mode) comes from the talent's location
 * settings, never from the Design, so the block carries no place names and no
 * address. It hides itself when the talent has no zone yet. Token refs only.
 *
 * Kept out of `section-kit.ts` (800-line budget). Provenance mirrors the
 * `location` entry of `TALENT_KIT_SECTIONS`.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { LOCATION_DEFAULT_PROPS } from "@/lib/site-admin/builder-node/visit-defaults";
import type { MaxSiteTemplateIdFactory } from "../max-site-templates/types";

const SLOT = { slotKey: "location", originRole: "talent.location" } as const;

export function locationBlock(
  makeId: MaxSiteTemplateIdFactory,
  opts: { heading?: string; eyebrow?: string; band?: boolean; mapSide?: "left" | "right" } = {},
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      align: "stretch",
      layerLabel: "Location",
      style: { maxWidth: "wide", paddingY: "none", paddingX: "none" },
      ...SLOT,
      anchorId: SLOT.slotKey,
    },
    children: [
      {
        id: makeId(),
        kind: "visit",
        props: {
          ...LOCATION_DEFAULT_PROPS,
          // Empty heading = derived from the studio kind ("Where to find me" ...).
          title: opts.heading ?? "",
          ...(opts.eyebrow !== undefined ? { eyebrow: opts.eyebrow } : {}),
          band: opts.band !== false,
          mapSide: opts.mapSide ?? "left",
        },
      },
    ],
  } as BuilderNode;
}
