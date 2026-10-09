/**
 * Gridline proof + area kit blocks (any design can place them).
 *
 * `proofBlock`: ONE slot-stamped container holding the spec table and the
 * work-order portfolio, so the mockup's U6 stays a single parity unit.
 * `areaBlock`: the shared `visit` widget in its "area" layout. Neither carries
 * place names, client names or an address: the rows are authored copy, the jobs
 * and the area come from the talent's live media and location settings.
 *
 * Kept out of `section-kit.ts` (800-line budget). Provenance mirrors the
 * `proof` and `area` entries of `TALENT_KIT_SECTIONS`.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { PORTFOLIO_DEFAULT_PROPS } from "@/lib/site-admin/builder-node/portfolio-defaults";
import { cloneSpecTableDefaultProps } from "@/lib/site-admin/builder-node/spec-table-defaults";
import { AREA_DEFAULT_PROPS } from "@/lib/site-admin/builder-node/visit-defaults";
import type { MaxSiteTemplateIdFactory } from "../max-site-templates/types";
import { RECENT_JOBS_LABEL } from "./seed-i18n";

const PROOF = { slotKey: "proof", originRole: "talent.proof" } as const;
const AREA = { slotKey: "area", originRole: "talent.area" } as const;

const band = (layerLabel: string, slot: { slotKey: string; originRole: string }) => ({
  layout: "stack",
  gap: "m",
  align: "stretch",
  layerLabel,
  // TUL-496: phone sections need side gutter (was flush to the screen edge).
  style: { maxWidth: "wide", paddingY: "m", paddingX: "m" },
  ...slot,
  anchorId: slot.slotKey,
});

export function proofBlock(
  makeId: MaxSiteTemplateIdFactory,
  opts: {
    rows?: Array<{ label: string; value: string }>;
    jobsHeading?: string;
    jobsLimit?: number;
  } = {},
): BuilderNode {
  const spec = cloneSpecTableDefaultProps();
  return {
    id: makeId(),
    kind: "container",
    props: band("Proof", PROOF),
    children: [
      {
        id: makeId(),
        kind: "spec_table",
        props: { ...spec, ...(opts.rows ? { rows: opts.rows.map((r) => ({ ...r })) } : {}) },
      },
      {
        id: makeId(),
        kind: "portfolio",
        props: {
          ...PORTFOLIO_DEFAULT_PROPS,
          layout: "work_order",
          title: opts.jobsHeading ?? RECENT_JOBS_LABEL.en,
          showCaptions: true,
          limit: opts.jobsLimit ?? 6,
        },
      },
    ],
  } as BuilderNode;
}

export function areaBlock(
  makeId: MaxSiteTemplateIdFactory,
  opts: { heading?: string; eyebrow?: string } = {},
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: band("Area", AREA),
    children: [
      {
        id: makeId(),
        kind: "visit",
        props: {
          ...AREA_DEFAULT_PROPS,
          title: opts.heading ?? "",
          ...(opts.eyebrow !== undefined ? { eyebrow: opts.eyebrow } : {}),
        },
      },
    ],
  } as BuilderNode;
}
