/**
 * Live-bound kit band factories (portfolio / reviews / visit / FAQ).
 * Kept out of `section-kit.ts` so the core kit stays under the 800-line budget.
 * Provenance stamps mirror `TALENT_KIT_SECTIONS` in `section-kit.ts`.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { PORTFOLIO_DEFAULT_PROPS } from "@/lib/site-admin/builder-node/portfolio-defaults";
import { REVIEWS_DEFAULT_PROPS } from "@/lib/site-admin/builder-node/reviews-defaults";
import { VISIT_DEFAULT_PROPS } from "@/lib/site-admin/builder-node/visit-defaults";
import { styleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";
import { CONTACT_LAYER, TALENT_ASK_HREF } from "../contact-channels";
import type { MaxSiteTemplateIdFactory } from "../max-site-templates/types";

type KitIdFactory = MaxSiteTemplateIdFactory;

const BAND_SLOTS = {
  gallery: { slotKey: "gallery", originRole: "talent.gallery" },
  reviews: { slotKey: "reviews", originRole: "talent.reviews" },
  visit: { slotKey: "visit", originRole: "talent.visit" },
  contact: { slotKey: "contact", originRole: "talent.contact" },
} as const;

function stampBand(
  slot: keyof typeof BAND_SLOTS,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const mark = BAND_SLOTS[slot];
  return {
    ...props,
    ...mark,
    anchorId:
      typeof props.anchorId === "string" && props.anchorId.length > 0
        ? props.anchorId
        : mark.slotKey,
  };
}

/**
 * W-12 Portfolio: live-bound media (replaces copied-at-apply `galleryBlock`
 * for Designs that should stay in sync with talent media).
 */
export function portfolioBlock(
  makeId: KitIdFactory,
  opts: {
    layout?: "filmstrip" | "grid" | "masonry" | "contact_sheet";
    columns?: 2 | 3 | 4;
    heading?: string;
    showCaptions?: boolean;
  } = {},
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: stampBand("gallery", {
      layout: "stack",
      gap: "m",
      align: "start",
      layerLabel: "Gallery",
      style: { maxWidth: "wide", paddingY: "l", paddingX: "m" },
    }),
    children: [
      {
        id: makeId(),
        kind: "portfolio",
        props: {
          ...PORTFOLIO_DEFAULT_PROPS,
          layout: opts.layout ?? "grid",
          columns:
            opts.columns ??
            (opts.layout === "contact_sheet" ? 4 : opts.layout === "masonry" ? 2 : 3),
          title: opts.heading ?? "Recent work",
          showCaptions: opts.showCaptions === true,
        },
      },
    ],
  } as BuilderNode;
}

/**
 * W-14 Reviews: live-bound talent_reviews quote cards on the shared slider.
 * Hidden on the published site when there are no quotes.
 */
export function reviewsBlock(
  makeId: KitIdFactory,
  opts: {
    layout?: "trio" | "single" | "row";
    heading?: string;
    eyebrow?: string;
    autoplayMs?: number;
  } = {},
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: stampBand("reviews", {
      layout: "stack",
      gap: "m",
      align: "start",
      layerLabel: "Reviews",
      style: { maxWidth: "wide", paddingY: "l", paddingX: "m" },
    }),
    children: [
      {
        id: makeId(),
        kind: "reviews",
        props: {
          ...REVIEWS_DEFAULT_PROPS,
          layout: opts.layout ?? "row",
          title: opts.heading ?? "What clients say",
          eyebrow: opts.eyebrow ?? "",
          autoplayMs: opts.autoplayMs ?? REVIEWS_DEFAULT_PROPS.autoplayMs,
        },
      },
    ],
  } as BuilderNode;
}

/**
 * Visit presets: live service areas / languages / hours.
 * Layouts: `facts` (list) or `split` (optional authored map beside facts).
 * Hidden when empty.
 */
export function visitBlock(
  makeId: KitIdFactory,
  opts: {
    layout?: "facts" | "split";
    heading?: string;
    titleAccent?: string;
    eyebrow?: string;
    band?: boolean;
    showMap?: boolean;
    mapImageUrl?: string;
    mapCaption?: string;
  } = {},
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: stampBand("visit", {
      layout: "stack",
      gap: "m",
      align: "stretch",
      layerLabel: "Visit",
      style: { maxWidth: "wide", paddingY: "none", paddingX: "none" },
    }),
    children: [
      {
        id: makeId(),
        kind: "visit",
        props: {
          ...VISIT_DEFAULT_PROPS,
          layout: opts.layout ?? "facts",
          title: opts.heading ?? "Your visit",
          titleAccent: opts.titleAccent ?? "visit",
          eyebrow: opts.eyebrow ?? "",
          band: opts.band !== false,
          showMap: opts.showMap !== false,
          mapImageUrl: opts.mapImageUrl ?? "",
          mapCaption: opts.mapCaption ?? "",
        },
      },
    ],
  } as BuilderNode;
}

/**
 * FAQ presets: accordion bound to published `talent_faq_items`.
 * Stamps the contact kit slot (Designs require contact). Optional Ask CTA.
 */
export function faqBlock(
  makeId: KitIdFactory,
  opts: {
    heading?: string;
    center?: boolean;
    band?: boolean;
    ask?: boolean;
    askLabel?: string;
  } = {},
): BuilderNode {
  const center = opts.center === true;
  const align = center ? ({ align: "center" as const }) : {};
  const kids: BuilderNode[] = [
    {
      id: makeId(),
      kind: "heading",
      props: {
        text: opts.heading ?? "Before your appointment",
        level: 2,
        style: { size: "xl", ...align },
        layerLabel: "FAQ heading",
      },
    } as BuilderNode,
    {
      id: makeId(),
      kind: "accordion",
      props: { allowMultiple: true, layerLabel: "FAQ", bindSource: "talent_faq_items" },
      children: [],
    } as BuilderNode,
  ];
  if (opts.ask !== false) {
    kids.push({
      id: makeId(),
      kind: "button",
      props: {
        label: opts.askLabel ?? CONTACT_LAYER.ask,
        href: TALENT_ASK_HREF,
        tone: "primary",
        layerLabel: opts.askLabel ?? CONTACT_LAYER.ask,
        style: { marginTop: "m" },
      },
    } as BuilderNode);
  }
  return {
    id: makeId(),
    kind: "container",
    props: stampBand("contact", {
      layout: "stack",
      gap: "l",
      align: center ? "center" : "stretch",
      layerLabel: "FAQ",
      style: {
        maxWidth: center ? "reading" : "wide",
        paddingY: "l",
        paddingX: "m",
        marginBottom: "l",
        ...(opts.band ? { backgroundColor: styleTokenRef("color.surface-raised") } : {}),
      },
      responsive: { mobile: { layout: "stack" } },
    }),
    children: kids,
  } as BuilderNode;
}
