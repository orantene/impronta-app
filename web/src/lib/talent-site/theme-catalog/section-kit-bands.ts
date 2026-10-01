/**
 * Live-bound kit band factories (portfolio / reviews / visit / FAQ / contents).
 * Kept out of `section-kit.ts` so the core kit stays under the 800-line budget.
 * Provenance stamps mirror `TALENT_KIT_SECTIONS` in `section-kit.ts`.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { PORTFOLIO_DEFAULT_PROPS } from "@/lib/site-admin/builder-node/portfolio-defaults";
import { REVIEWS_DEFAULT_PROPS } from "@/lib/site-admin/builder-node/reviews-defaults";
import { VISIT_DEFAULT_PROPS } from "@/lib/site-admin/builder-node/visit-defaults";
import { CONTENTS_DEFAULT_PROPS, cloneContentsDefaultProps } from "@/lib/site-admin/builder-node/contents-defaults";
import type { ContentsItem } from "@/lib/site-admin/builder-node/contents-defaults";
import {
  MASTHEAD_DEFAULT_PROPS,
  cloneMastheadDefaultProps,
} from "@/lib/site-admin/builder-node/masthead-defaults";
import type { MastheadCoverFilter } from "@/lib/site-admin/builder-node/masthead-defaults";
import {
  STATEMENT_FOOTER_DEFAULT_PROPS,
  cloneStatementFooterDefaultProps,
} from "@/lib/site-admin/builder-node/statement-footer-defaults";
import type { StatementFooterAlign } from "@/lib/site-admin/builder-node/statement-footer-defaults";
import {
  COMP_CARD_DEFAULT_PROPS,
  cloneCompCardDefaultProps,
} from "@/lib/site-admin/builder-node/comp-card-defaults";
import type { BuilderCompCardNode } from "@/lib/site-admin/builder-node/types";
import { styleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";
import { CONTACT_LAYER, TALENT_ASK_HREF } from "../contact-channels";
import type { MaxSiteTemplateIdFactory } from "../max-site-templates/types";

type KitIdFactory = MaxSiteTemplateIdFactory;

const BAND_SLOTS = {
  gallery: { slotKey: "gallery", originRole: "talent.gallery" },
  reviews: { slotKey: "reviews", originRole: "talent.reviews" },
  visit: { slotKey: "visit", originRole: "talent.visit" },
  contents: { slotKey: "contents", originRole: "talent.contents" },
  compCard: { slotKey: "comp_card", originRole: "talent.comp_card" },
  contact: { slotKey: "contact", originRole: "talent.contact" },
  statementFooter: {
    slotKey: "statement_footer",
    originRole: "talent.statement_footer",
  },
} as const;

/** Hero slot stamp (mirrors `stampKitSection("hero", …)` without circular import). */
function stampHero(props: Record<string, unknown>): Record<string, unknown> {
  return {
    ...props,
    slotKey: "hero",
    originRole: "talent.hero",
    anchorId:
      typeof props.anchorId === "string" && props.anchorId.length > 0
        ? props.anchorId
        : "hero",
  };
}

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
 * Shared layouts include `chapter` (sticky numeral + title + credit).
 */
export function portfolioBlock(
  makeId: KitIdFactory,
  opts: {
    layout?: "filmstrip" | "grid" | "masonry" | "contact_sheet" | "chapter" | "staggered" | "work_order";
    columns?: 2 | 3 | 4;
    heading?: string;
    eyebrow?: string;
    showCaptions?: boolean;
    chapterNumber?: number;
    creditLine?: string;
    albumId?: string;
    limit?: number;
  } = {},
): BuilderNode {
  const layout = opts.layout ?? "grid";
  return {
    id: makeId(),
    kind: "container",
    props: stampBand("gallery", {
      layout: "stack",
      gap: "m",
      align: "start",
      layerLabel: layout === "chapter" ? "Chapter" : "Gallery",
      style: { maxWidth: "wide", paddingY: "l", paddingX: "m" },
    }),
    children: [
      {
        id: makeId(),
        kind: "portfolio",
        props: {
          ...PORTFOLIO_DEFAULT_PROPS,
          layout,
          columns:
            opts.columns ??
            (layout === "contact_sheet" ? 4 : layout === "masonry" || layout === "chapter" ? 2 : 3),
          title: opts.heading ?? (layout === "chapter" ? "Editorial" : "Recent work"),
          ...(opts.eyebrow ? { eyebrow: opts.eyebrow } : {}),
          showCaptions: opts.showCaptions === true,
          chapterNumber: opts.chapterNumber ?? 1,
          creditLine: opts.creditLine ?? "",
          albumId: opts.albumId ?? "",
          limit: opts.limit ?? (layout === "chapter" ? 6 : PORTFOLIO_DEFAULT_PROPS.limit),
        },
      },
    ],
  } as BuilderNode;
}

/** Several chapter portfolio nodes under one gallery slot (unique slotKey). */
export function portfolioChaptersBlock(
  makeId: KitIdFactory,
  chapters: ReadonlyArray<{
    heading?: string;
    chapterNumber?: number;
    creditLine?: string;
    showCaptions?: boolean;
    albumId?: string;
    limit?: number;
    /** DOM fragment id for Contents / nav links; defaults to `chapter-N`. */
    anchorId?: string;
  }>,
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: stampBand("gallery", {
      layout: "stack",
      gap: "l",
      align: "start",
      layerLabel: "The book",
      style: { maxWidth: "wide", paddingY: "l", paddingX: "m" },
    }),
    children: chapters.map((ch, i) => {
      const chapterNumber = ch.chapterNumber ?? i + 1;
      const anchorId = ch.anchorId?.trim() || `chapter-${chapterNumber}`;
      return {
        id: makeId(),
        kind: "portfolio" as const,
        anchorId,
        props: {
          ...PORTFOLIO_DEFAULT_PROPS,
          layout: "chapter" as const,
          columns: 2 as const,
          title: ch.heading ?? "Editorial",
          showCaptions: ch.showCaptions === true,
          chapterNumber,
          creditLine: ch.creditLine ?? "",
          albumId: ch.albumId ?? "",
          limit: ch.limit ?? 6,
        },
      };
    }),
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

/**
 * Contents — authored chapter index / TOC with anchor links.
 * Shared widget; pairs with portfolio chapter `anchorId`s and header chrome.
 */
export function contentsBlock(
  makeId: KitIdFactory,
  opts: {
    heading?: string;
    eyebrow?: string;
    showNumbers?: boolean;
    numberStyle?: "roman" | "decimal";
    items?: ReadonlyArray<ContentsItem>;
  } = {},
): BuilderNode {
  const defaults = cloneContentsDefaultProps();
  const items = (opts.items ?? defaults.items ?? []).map((it) => ({
    label: it.label,
    anchor: it.anchor,
  }));
  return {
    id: makeId(),
    kind: "container",
    props: stampBand("contents", {
      layout: "stack",
      gap: "m",
      align: "stretch",
      layerLabel: "Contents",
      style: { maxWidth: "reading", paddingY: "none", paddingX: "none" },
    }),
    children: [
      {
        id: makeId(),
        kind: "contents",
        props: {
          ...defaults,
          title: opts.heading ?? CONTENTS_DEFAULT_PROPS.title,
          eyebrow: opts.eyebrow ?? "",
          showNumbers: opts.showNumbers !== false,
          numberStyle: opts.numberStyle ?? "roman",
          items,
        },
      },
    ],
  } as BuilderNode;
}

/**
 * Masthead hero — giant stacked words over an optional B&W cover.
 * Shared W-10 variant on the hero slot (not a Folio-only renderer).
 * Lives here so `section-kit.ts` stays under the 800-line eslint cap.
 */
export function heroMasthead(
  makeId: KitIdFactory,
  opts: {
    lines?: ReadonlyArray<string>;
    splitWords?: boolean;
    subline?: string;
    creditLine?: string;
    showCover?: boolean;
    coverFilter?: MastheadCoverFilter;
    coverSrc?: string;
  } = {},
): BuilderNode {
  const defaults = cloneMastheadDefaultProps();
  const lines = (opts.lines ?? defaults.lines ?? []).map((line) => line);
  return {
    id: makeId(),
    kind: "container",
    props: stampHero({
      layout: "stack",
      gap: "m",
      align: "stretch",
      layerLabel: "Hero",
      style: {
        maxWidth: "full",
        paddingY: "none",
        paddingX: "none",
        minHeight: "82vh",
      },
    }),
    children: [
      {
        id: makeId(),
        kind: "masthead",
        props: {
          ...defaults,
          lines,
          splitWords: opts.splitWords ?? defaults.splitWords !== false,
          subline: opts.subline ?? defaults.subline ?? "",
          creditLine: opts.creditLine ?? defaults.creditLine ?? "",
          showCover: opts.showCover ?? defaults.showCover !== false,
          coverFilter: opts.coverFilter ?? defaults.coverFilter ?? "bw",
          coverSrc: opts.coverSrc ?? defaults.coverSrc ?? MASTHEAD_DEFAULT_PROPS.coverSrc,
        },
      },
    ],
  } as BuilderNode;
}

/**
 * Statement footer — short editorial closing statement + optional credit /
 * contact. Shared widget; Designs stamp after contact. Never Folio-only CSS.
 */
export function statementFooterBlock(
  makeId: KitIdFactory,
  opts: {
    statement?: string;
    creditLine?: string;
    contactLine?: string;
    align?: StatementFooterAlign;
    showRule?: boolean;
  } = {},
): BuilderNode {
  const defaults = cloneStatementFooterDefaultProps();
  return {
    id: makeId(),
    kind: "container",
    props: stampBand("statementFooter", {
      layout: "stack",
      gap: "m",
      align: "stretch",
      layerLabel: "Statement footer",
      style: { maxWidth: "reading", paddingY: "none", paddingX: "none" },
    }),
    children: [
      {
        id: makeId(),
        kind: "statement_footer",
        props: {
          ...defaults,
          statement: opts.statement ?? STATEMENT_FOOTER_DEFAULT_PROPS.statement,
          creditLine: opts.creditLine ?? STATEMENT_FOOTER_DEFAULT_PROPS.creditLine,
          contactLine:
            opts.contactLine ?? STATEMENT_FOOTER_DEFAULT_PROPS.contactLine,
          align: opts.align ?? STATEMENT_FOOTER_DEFAULT_PROPS.align ?? "center",
          showRule: opts.showRule ?? STATEMENT_FOOTER_DEFAULT_PROPS.showRule !== false,
        },
      },
    ],
  } as BuilderNode;
}

/**
 * Comp card — live measure strip from public profile fields.
 * Shared widget; Folio stamps it after About. Never Folio-only CSS.
 */
export function compCardBlock(
  makeId: KitIdFactory,
  opts: {
    layout?: "strip" | "strip_with_details";
    heading?: string;
    eyebrow?: string;
    measures?: BuilderCompCardNode["props"]["measures"];
    minMeasures?: number;
    showFullDetails?: boolean;
  } = {},
): BuilderNode {
  const defaults = cloneCompCardDefaultProps();
  return {
    id: makeId(),
    kind: "container",
    props: stampBand("compCard", {
      layout: "stack",
      gap: "m",
      align: "stretch",
      layerLabel: "Comp card",
      style: { maxWidth: "wide", paddingY: "none", paddingX: "none" },
    }),
    children: [
      {
        id: makeId(),
        kind: "comp_card",
        props: {
          ...defaults,
          layout: opts.layout ?? "strip_with_details",
          title: opts.heading ?? COMP_CARD_DEFAULT_PROPS.title ?? "",
          eyebrow: opts.eyebrow ?? "",
          measures: opts.measures ?? defaults.measures,
          minMeasures: opts.minMeasures ?? defaults.minMeasures ?? 4,
          showFullDetails: opts.showFullDetails !== false,
        },
      },
    ],
  } as BuilderNode;
}

/** Alias used by some Designs / docs for the measure-strip band. */
export const measureStripBlock = compCardBlock;
