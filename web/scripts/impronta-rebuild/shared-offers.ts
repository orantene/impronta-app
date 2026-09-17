/**
 * shared-offers.ts — the "sellable thing" vocabulary for the Impronta pages.
 *
 * Alejandra's 2026-09 list is six priced products (a one-day experience, a
 * posing course, four studio photo packages) plus the Show for hotels and a
 * map of fourteen client segments. None of the existing helpers in
 * `shared.ts` says "this costs X, on this date, book it": `featureCard` has
 * no price and no picture, `photoTile` has no copy. These three do, and they
 * are built ONLY from the primitives the builder already renders (container,
 * image, heading, paragraph, button), so every card stays editable in the
 * inspector and needs no new node kind.
 *
 * INQUIRY-FIRST. Every CTA here lands on a form that already names the
 * product (`?f_<field>=` prefill, see `builder-node/form-prefill.ts`), so the
 * inquiry that reaches the inbox reads "Curso de Posing" without the visitor
 * typing it. Seats, dates and payment are then confirmed in the thread. The
 * live-seat `session_picker` block is the documented upgrade once a date has
 * a confirmed time and capacity.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { formPrefillQuery } from "@/lib/site-admin/builder-node/form-prefill";

import {
  CARD,
  CARD_BORDER,
  GOLD,
  GOLD_BRIGHT,
  HAIRLINE,
  IMAGE_SLOT,
  MUTED,
  SANS,
  SERIF,
  TEXT,
  bulletRow,
  goldButton,
  lineButton,
} from "./shared";

// ── hrefs ────────────────────────────────────────────────────────────────────

/**
 * The experiences page's own booking form, with the product preselected.
 * Product labels are deliberately the Spanish product NAMES Alejandra sells
 * under ("Curso de Posing") — they read correctly on both language sites and
 * match the Menu entries in the workspace one to one.
 */
export function experienceInquiryHref(product: string): string {
  return `/p/experiences?${formPrefillQuery({ experience: product })}#rb-exp-book`;
}

/** The contact page brief form, with "What are you booking?" prefilled. */
export function briefHref(topic: string): string {
  return `/p/contact?${formPrefillQuery({ brief: topic })}`;
}

/** The show page's venue form, with the venue type preselected. */
export function showVenueHref(venueType: string): string {
  return `/p/show?${formPrefillQuery({ venue_type: venueType })}#rb-show-venue`;
}

// ── offer card ───────────────────────────────────────────────────────────────

export interface OfferCardInput {
  imageSlot: string;
  imageAlt: string;
  /** Small-caps line above the title: a date ("27 September 2026") or a kind ("Photo session"). */
  chip: string;
  title: string;
  /** "$2,500 MXN" — the number is copy, so the team edits it in the inspector. */
  price: string;
  /** "per person" / "per session" / "on request". */
  priceNote?: string;
  text: string;
  cta: { label: string; href: string };
  /** Optional one-line reassurance under the button ("Limited seats"). */
  footnote?: string;
}

/**
 * Photo + chip + title + price + copy + gold CTA. The card is a stack so it
 * reads top-to-bottom on a phone; in a 3-up grid the image ratio keeps rows
 * level regardless of copy length.
 */
export function offerCard(id: string, o: OfferCardInput): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "stack",
      align: "start",
      layerLabel: o.title,
      style: {
        width: "100%",
        gap: "0px",
        backgroundColor: CARD,
        borderColor: CARD_BORDER,
        borderWidth: "1px",
        borderStyle: "solid",
        borderRadius: "6px",
        overflow: "hidden",
        transitionProperty: "border-color, transform, box-shadow",
        transitionDuration: "240ms",
        transitionTimingFunction: "ease",
        hover: { borderColor: GOLD, translate: "0 -4px", boxShadow: "0 30px 70px rgba(0,0,0,0.45)" },
      },
    },
    children: [
      {
        id: `${id}-image`,
        kind: "image",
        props: {
          src: IMAGE_SLOT(o.imageSlot),
          alt: o.imageAlt,
          layerLabel: "Offer photo",
          style: {
            width: "100%",
            aspectRatioFree: "1.25",
            objectFit: "cover",
            objectPosition: "center",
            responsive: { mobile: { aspectRatioFree: "1.35" } },
          },
        },
      },
      {
        id: `${id}-body`,
        kind: "container",
        props: {
          layout: "stack",
          align: "start",
          layerLabel: "Offer copy",
          style: {
            width: "100%",
            gap: "10px",
            paddingTop: "22px",
            paddingBottom: "26px",
            paddingLeft: "24px",
            paddingRight: "24px",
            flexGrow: 1,
          },
        },
        children: [
          {
            id: `${id}-chip`,
            kind: "paragraph",
            props: {
              text: o.chip,
              layerLabel: "Date / kind",
              style: {
                fontFamily: SANS,
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                textColor: GOLD_BRIGHT,
                marginTopFree: "0px",
                marginBottomFree: "0px",
                align: "left",
              },
            },
          },
          {
            id: `${id}-title`,
            kind: "heading",
            props: {
              text: o.title,
              level: 3,
              layerLabel: "Offer title",
              style: {
                fontFamily: SERIF,
                fontSize: "24px",
                fontWeight: 500,
                lineHeight: "1.15",
                textColor: TEXT,
                marginTopFree: "0px",
                marginBottomFree: "0px",
                align: "left",
              },
            },
          },
          {
            id: `${id}-price-row`,
            kind: "container",
            props: {
              layout: "row",
              align: "center",
              layerLabel: "Price",
              style: { gap: "8px", justifyContent: "flex-start", flexWrap: "wrap" },
            },
            children: [
              {
                id: `${id}-price`,
                kind: "paragraph",
                props: {
                  text: o.price,
                  layerLabel: "Price",
                  style: {
                    fontFamily: SANS,
                    fontSize: "17px",
                    fontWeight: 700,
                    textColor: TEXT,
                    marginTopFree: "0px",
                    marginBottomFree: "0px",
                    align: "left",
                  },
                },
              },
              ...(o.priceNote
                ? [
                    {
                      id: `${id}-price-note`,
                      kind: "paragraph" as const,
                      props: {
                        text: o.priceNote,
                        layerLabel: "Price note",
                        style: {
                          fontFamily: SANS,
                          fontSize: "13px",
                          textColor: MUTED,
                          marginTopFree: "0px",
                          marginBottomFree: "0px",
                          align: "left" as const,
                        },
                      },
                    },
                  ]
                : []),
            ],
          },
          {
            id: `${id}-text`,
            kind: "paragraph",
            props: {
              text: o.text,
              layerLabel: "Offer copy",
              style: {
                fontFamily: SANS,
                fontSize: "15px",
                lineHeight: "1.6",
                textColor: MUTED,
                marginTopFree: "2px",
                marginBottomFree: "6px",
                align: "left",
                flexGrow: 1,
              },
            },
          },
          goldButton(`${id}-cta`, o.cta.label, o.cta.href),
          ...(o.footnote
            ? [
                {
                  id: `${id}-footnote`,
                  kind: "paragraph" as const,
                  props: {
                    text: o.footnote,
                    layerLabel: "Reassurance",
                    style: {
                      fontFamily: SANS,
                      fontSize: "12px",
                      textColor: MUTED,
                      marginTopFree: "4px",
                      marginBottomFree: "0px",
                      align: "left" as const,
                    },
                  },
                },
              ]
            : []),
        ],
      },
    ],
  };
}

// ── segment card (who we work with) ──────────────────────────────────────────

export interface SegmentCardInput {
  /** Small-caps index or category line ("01", "Brands"). */
  chip: string;
  title: string;
  intro: string;
  bullets: string[];
  cta: { label: string; href: string };
}

/**
 * Title + intro + diamond-bullet list + text CTA. The node id doubles as the
 * in-page anchor (`/p/for-clients#rb-clients-seg-hotels`), which is how the
 * homepage services strip and the header mega menu deep-link into it.
 */
export function segmentCard(id: string, s: SegmentCardInput): BuilderNode {
  return {
    id,
    kind: "container",
    // The card id is the deep-link target for the homepage strip and the
    // header menu (`/p/for-clients#rb-clients-seg-hotels`).
    anchorId: id,
    props: {
      layout: "stack",
      align: "start",
      layerLabel: s.title,
      style: {
        width: "100%",
        gap: "10px",
        backgroundColor: CARD,
        borderColor: CARD_BORDER,
        borderWidth: "1px",
        borderStyle: "solid",
        borderRadius: "6px",
        paddingTop: "28px",
        paddingBottom: "26px",
        paddingLeft: "26px",
        paddingRight: "26px",
        transitionProperty: "border-color, transform",
        transitionDuration: "240ms",
        transitionTimingFunction: "ease",
        hover: { borderColor: GOLD, translate: "0 -3px" },
      },
    },
    children: [
      {
        id: `${id}-chip`,
        kind: "paragraph",
        props: {
          text: s.chip,
          layerLabel: "Index",
          style: {
            fontFamily: SANS,
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            textColor: GOLD_BRIGHT,
            marginTopFree: "0px",
            marginBottomFree: "0px",
            align: "left",
          },
        },
      },
      {
        id: `${id}-title`,
        kind: "heading",
        props: {
          text: s.title,
          level: 3,
          layerLabel: "Segment title",
          style: {
            fontFamily: SERIF,
            fontSize: "23px",
            fontWeight: 500,
            lineHeight: "1.15",
            textColor: TEXT,
            marginTopFree: "0px",
            marginBottomFree: "0px",
            align: "left",
          },
        },
      },
      {
        id: `${id}-intro`,
        kind: "paragraph",
        props: {
          text: s.intro,
          layerLabel: "Segment intro",
          style: {
            fontFamily: SANS,
            fontSize: "15px",
            lineHeight: "1.6",
            textColor: MUTED,
            marginTopFree: "0px",
            marginBottomFree: "6px",
            align: "left",
          },
        },
      },
      {
        id: `${id}-list`,
        kind: "container",
        props: {
          layout: "stack",
          align: "start",
          layerLabel: "What we provide",
          style: {
            width: "100%",
            gap: "0px",
            borderColor: HAIRLINE,
            borderWidth: "1px 0px 0px 0px",
            borderStyle: "solid",
            flexGrow: 1,
          },
        },
        children: s.bullets.map((text, i) => compactBullet(`${id}-b${i + 1}`, text)),
      },
      lineButton(`${id}-cta`, s.cta.label, s.cta.href),
    ],
  };
}

/** `bulletRow` with tighter vertical rhythm for lists inside a card. */
function compactBullet(id: string, text: string): BuilderNode {
  const row = bulletRow(id, text);
  const style = (row.props as { style: Record<string, unknown> }).style;
  style.paddingTop = "9px";
  style.paddingBottom = "9px";
  const textNode = (row as { children?: BuilderNode[] }).children?.[1];
  if (textNode) {
    const ts = (textNode.props as { style: Record<string, unknown> }).style;
    ts.fontSize = "14px";
  }
  return row;
}

// ── price row (compact list, studio page) ────────────────────────────────────

/** "Studio + photographer ……… $1,500 MXN" — one line of a compact price list. */
export function priceRow(id: string, title: string, price: string, note?: string): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "row",
      align: "center",
      layerLabel: title,
      style: {
        width: "100%",
        gap: "16px",
        justifyContent: "space-between",
        flexWrap: "wrap",
        paddingTop: "16px",
        paddingBottom: "16px",
        borderColor: HAIRLINE,
        borderWidth: "0px 0px 1px 0px",
        borderStyle: "solid",
      },
    },
    children: [
      {
        id: `${id}-copy`,
        kind: "container",
        props: {
          layout: "stack",
          align: "start",
          layerLabel: "Package",
          style: { gap: "2px", flexGrow: 1, minWidth: "220px" },
        },
        children: [
          {
            id: `${id}-title`,
            kind: "paragraph",
            props: {
              text: title,
              layerLabel: "Package name",
              style: {
                fontFamily: SERIF,
                fontSize: "19px",
                textColor: TEXT,
                marginTopFree: "0px",
                marginBottomFree: "0px",
                align: "left",
              },
            },
          },
          ...(note
            ? [
                {
                  id: `${id}-note`,
                  kind: "paragraph" as const,
                  props: {
                    text: note,
                    layerLabel: "Includes",
                    style: {
                      fontFamily: SANS,
                      fontSize: "14px",
                      textColor: MUTED,
                      marginTopFree: "0px",
                      marginBottomFree: "0px",
                      align: "left" as const,
                    },
                  },
                },
              ]
            : []),
        ],
      },
      {
        id: `${id}-price`,
        kind: "paragraph",
        props: {
          text: price,
          layerLabel: "Price",
          style: {
            fontFamily: SANS,
            fontSize: "16px",
            fontWeight: 700,
            textColor: GOLD_BRIGHT,
            marginTopFree: "0px",
            marginBottomFree: "0px",
            align: "right",
            flexShrink: 0,
          },
        },
      },
    ],
  };
}

// ── live-tree repair: bullet rows on phones ──────────────────────────────────

/**
 * Walk a live tree and give every `bulletRow` container (layer label
 * "List item", row layout) the mobile row override the helper now sets, so
 * pages patched in place get the same fix as pages reseeded from modules.
 */
export function keepBulletRowsOnMobile(nodes: BuilderNode[]): { tree: BuilderNode[]; fixed: number } {
  let fixed = 0;
  const walk = (list: BuilderNode[]): BuilderNode[] =>
    list.map((node) => {
      let next = node;
      if (node.kind === "container") {
        const props = node.props as Record<string, unknown>;
        const responsive = (props.responsive as { mobile?: Record<string, unknown> } | undefined) ?? {};
        if (props.layout === "row" && props.layerLabel === "List item" && responsive.mobile?.layout !== "row") {
          fixed += 1;
          next = {
            ...node,
            props: { ...props, responsive: { ...responsive, mobile: { ...(responsive.mobile ?? {}), layout: "row" } } },
          } as unknown as BuilderNode;
        }
      }
      const children = (next as { children?: BuilderNode[] }).children;
      if (Array.isArray(children)) {
        const nc = walk(children);
        if (nc.some((c, i) => c !== children[i])) next = { ...next, children: nc } as BuilderNode;
      }
      return next;
    });
  return { tree: walk(nodes), fixed };
}
