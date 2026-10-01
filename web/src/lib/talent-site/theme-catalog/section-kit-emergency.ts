/**
 * Gridline emergency kit block: ONE slot-stamped container holding the
 * `alert_band`. The band renders only while the talent's emergencies-today flag
 * is on, so the slot is absent from the page when it is off. Authored copy
 * only (headline, safety note, action); nothing is invented.
 *
 * Provenance mirrors the `emergency` entry of `TALENT_KIT_SECTIONS`.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { ALERT_BAND_DEFAULT_PROPS } from "@/lib/site-admin/builder-node/utility-bar-defaults";
import type { MaxSiteTemplateIdFactory } from "../max-site-templates/types";

const EMERGENCY = { slotKey: "emergency", originRole: "talent.emergency" } as const;

export function emergencyBlock(
  makeId: MaxSiteTemplateIdFactory,
  opts: {
    title?: string;
    body?: string;
    safetyLabel?: string;
    safetyNote?: string;
    ctaLabel?: string;
    ctaHref?: string;
  } = {},
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: {
      layout: "stack",
      gap: "none",
      align: "stretch",
      layerLabel: "Emergency",
      style: { maxWidth: "wide", paddingY: "none", paddingX: "none" },
      ...EMERGENCY,
      anchorId: EMERGENCY.slotKey,
    },
    children: [
      {
        id: makeId(),
        kind: "alert_band",
        props: { ...ALERT_BAND_DEFAULT_PROPS, ...opts },
      },
    ],
  } as BuilderNode;
}
