/**
 * Hero parts shared by the kit's split hero (kept apart for the file-size cap):
 * the proposal CTA row and the next-free chip pinned on the hero photo.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { NEXT_FREE_CHIP_DEFAULT_PROPS } from "@/lib/site-admin/builder-node/next-free-chip-defaults";
import { CONTACT_LAYER, TALENT_ASK_HREF } from "../contact-channels";
import type { MaxSiteTemplateIdFactory } from "../max-site-templates/types";

export type HeroCtaRow = { primaryLabel: string; primaryHref: string; secondaryLabel: string };

/** One row: a solid primary (seeded, follows the booking mode) + a ghost Ask. */
export function heroCtaRow(makeId: MaxSiteTemplateIdFactory, row: HeroCtaRow): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: {
      layout: "row",
      gap: "s",
      align: "center",
      layerLabel: "Hero actions",
      style: { marginTop: "s", flexWrap: "wrap" },
    },
    children: [
      {
        id: makeId(),
        kind: "button",
        props: { label: row.primaryLabel, href: row.primaryHref, tone: "primary", layerLabel: row.primaryLabel },
      },
      {
        id: makeId(),
        kind: "button",
        props: { label: row.secondaryLabel, href: TALENT_ASK_HREF, tone: "secondary", layerLabel: CONTACT_LAYER.ask },
      },
    ],
  } as BuilderNode;
}

/** The live next-free chip, bottom-left ON the hero photo. */
export function heroMediaChip(makeId: MaxSiteTemplateIdFactory): BuilderNode {
  return {
    id: makeId(),
    kind: "next_free_chip",
    props: {
      ...NEXT_FREE_CHIP_DEFAULT_PROPS,
      style: { position: "absolute", left: "12px", bottom: "12px", zIndex: 3 },
    },
  } as BuilderNode;
}
