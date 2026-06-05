import type { BuilderNode } from "../types";
import type { PageDesign } from "./types";
import { CINZEL, INTER } from "./tokens";
import {
  CLAY,
  dataSources,
  HAIR,
  INK,
  MUTE,
  PAPER,
  PHOTO,
  sizeChip,
  trustBadge,
} from "./store.parts";

/**
 * ARCHETYPE 4 — E-commerce product-detail (fine-art print store).
 *
 * Reference intent: a boutique fine-art photography print shop's product page —
 * a light gallery-white retail palette, an engraved CINZEL wordmark over a clean
 * INTER body, a two-column product hero (a thumbnail gallery feeding a large
 * main print, paired with a buy panel: price, a variant/size selector, trust
 * badges, and an add-to-cart), a sticky add-to-cart bar that pins as you scroll,
 * a print-size pricing table, and a "you may also like" product grid. The
 * "products" ARE real photographs (the shop literally sells prints of them), so
 * the Asset axis is honest real photography, not product mockups.
 *
 * Genuinely distinct from the other four archetypes: editorial is a single-
 * artist portfolio, saas is a dark product UI, agency is a creative studio, the
 * festival is a cinematic event — this is a RETAIL commerce surface (gallery
 * thumbnails → main image, variant chips, sticky buy bar, product grid, trust
 * badges), an idiom none of the others touch.
 *
 * Exercises the P1–P3 stack: Cinzel + Inter registry faces (font bridge), REAL
 * photography throughout, TWO P3 REPEATERS (the thumbnail gallery bound to
 * `store_gallery` and the "you may also like" grid bound to `store_related`,
 * each with field bindings + per-slot container queries), a rich_text product
 * description with an {accent} run and a safe inline link, a P2 pricing_table
 * for print sizes, the `nav` node (desktop inline links + mobile hamburger), a
 * sticky backdrop-filter buy bar (proven OVER scrolled content by the `scrolled`
 * motion frame), a product-card hover-lift (proven by the `hover` frame), and a
 * responsive layout that collapses to a single column on mobile.
 */

const storeTree: BuilderNode[] = [
  {
    id: "store-page",
    kind: "container",
    props: {
      layout: "stack",
      style: {
        width: "100%",
        maxWidthFree: "100%",
        gap: "0px",
        backgroundColor: "#f4f1ea",
        textColor: INK,
      },
    },
    children: [
      // ── Header (nav node: desktop inline + mobile hamburger) ────────────────
      {
        id: "store-nav",
        kind: "nav",
        props: {
          brand: "ATELIER LUMA",
          brandHref: "/",
          collapseAt: "mobile",
          menuLabel: "Menu",
          ariaLabel: "Primary",
          links: [
            { id: "n1", label: "Shop", href: "/shop" },
            { id: "n2", label: "Collections", href: "/collections" },
            { id: "n3", label: "Studio", href: "/studio" },
            { id: "n4", label: "Cart (1)", href: "/cart" },
          ],
          style: {
            width: "100%",
            maxWidthFree: "1200px",
            fontFamily: CINZEL,
            fontSize: "13px",
            letterSpacing: "0.14em",
            textColor: INK,
            paddingTop: "22px",
            paddingRight: "40px",
            paddingBottom: "22px",
            paddingLeft: "40px",
            responsive: { mobile: { paddingRight: "20px", paddingLeft: "20px" } },
          },
        },
      },
      // ── Sticky add-to-cart bar (pins OVER scrolled content) ─────────────────
      {
        id: "store-buybar",
        kind: "container",
        props: {
          layout: "row",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            justifyContent: "center",
            gap: "20px",
            paddingTop: "12px",
            paddingRight: "40px",
            paddingBottom: "12px",
            paddingLeft: "40px",
            position: "sticky",
            top: "0px",
            zIndex: 30,
            backgroundColor: "rgba(248,245,238,0.78)",
            backdropFilter: "blur(16px)",
            borderColor: HAIR,
            borderWidth: "1px",
            borderStyle: "solid",
            responsive: { mobile: { paddingRight: "18px", paddingLeft: "18px", gap: "12px" } },
          },
        },
        children: [
          {
            id: "store-buybar-inner",
            kind: "container",
            props: {
              layout: "row",
              align: "center",
              style: {
                width: "100%",
                maxWidthFree: "1200px",
                justifyContent: "space-between",
                gap: "18px",
              },
            },
            children: [
              {
                id: "store-buybar-meta",
                kind: "paragraph",
                props: {
                  text: "Vocalist, CDMX — archival giclée · $280",
                  style: {
                    fontFamily: INTER,
                    fontSize: "14px",
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                    textColor: INK,
                    responsive: { mobile: { fontSize: "12.5px" } },
                  },
                },
              },
              {
                id: "store-buybar-cta",
                kind: "button",
                props: {
                  label: "Add to cart",
                  href: "/cart/add",
                  tone: "primary",
                  style: {
                    fontFamily: INTER,
                    fontSize: "13px",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    backgroundColor: INK,
                    textColor: PAPER,
                    borderColor: INK,
                    borderWidth: "1px",
                    borderStyle: "solid",
                    transitionProperty: "background-color, transform, box-shadow",
                    transitionDuration: "200ms",
                    transitionTimingFunction: "ease",
                    hover: {
                      backgroundColor: CLAY,
                      scale: "1.04",
                      boxShadow: "0 14px 30px rgba(29,26,22,0.24)",
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      // ── Product hero (gallery repeater + buy panel) ─────────────────────────
      {
        id: "store-hero",
        kind: "split",
        props: {
          ratio: "60-40",
          gap: "l",
          collapseOnMobile: true,
          style: {
            width: "100%",
            maxWidthFree: "1200px",
            alignItems: "flex-start",
            paddingTop: "44px",
            paddingRight: "40px",
            paddingBottom: "72px",
            paddingLeft: "40px",
            responsive: { mobile: { paddingRight: "20px", paddingLeft: "20px", paddingBottom: "48px" } },
          },
        },
        children: [
          // Gallery column — main print + thumbnail strip (P3 repeater).
          {
            id: "store-gallery",
            kind: "container",
            props: { layout: "stack", style: { gap: "16px", width: "100%", maxWidthFree: "100%" } },
            children: [
              {
                id: "store-main-image",
                kind: "image",
                props: {
                  src: PHOTO.print,
                  alt: "Vocalist, CDMX — archival giclée print",
                  style: {
                    width: "100%",
                    aspectRatioFree: "0.82",
                    objectFit: "cover",
                    objectPosition: "center top",
                    borderRadius: "3px",
                    boxShadow: "0 34px 90px rgba(29,26,22,0.18)",
                  },
                },
              },
              {
                id: "store-thumb-grid",
                kind: "container",
                props: {
                  layout: "grid",
                  columns: 4,
                  gap: "s",
                  responsive: { mobile: { columns: 4 } },
                  dataBinding: { sourceKey: "store_gallery", mode: "bound", repeat: true, maxItems: 4 },
                  style: { width: "100%", maxWidthFree: "100%", gap: "12px" },
                },
                children: [
                  {
                    id: "store-thumb",
                    kind: "image",
                    props: {
                      src: PHOTO.print,
                      alt: "Alternate view",
                      fieldBindings: { src: "imageUrl", alt: "label" },
                      style: {
                        width: "100%",
                        aspectRatio: "1:1",
                        objectFit: "cover",
                        objectPosition: "center",
                        borderRadius: "2px",
                        containerType: "inline-size",
                        containerName: "thumb",
                        borderColor: HAIR,
                        borderWidth: "1px",
                        borderStyle: "solid",
                      },
                    },
                  },
                ],
              },
            ],
          },
          // Buy panel column.
          {
            id: "store-buy",
            kind: "container",
            props: {
              layout: "stack",
              style: {
                gap: "20px",
                paddingLeft: "8px",
                responsive: { mobile: { paddingLeft: "0px" } },
              },
            },
            children: [
              {
                id: "store-eyebrow",
                kind: "paragraph",
                props: {
                  text: "Limited edition — 50 prints",
                  style: {
                    fontFamily: CINZEL,
                    fontSize: "12px",
                    fontWeight: 600,
                    letterSpacing: "0.2em",
                    textColor: CLAY,
                  },
                },
              },
              {
                id: "store-title",
                kind: "heading",
                props: {
                  text: "Vocalist, CDMX",
                  level: 1,
                  style: {
                    fontFamily: CINZEL,
                    fontSize: "52px",
                    lineHeight: "1.02",
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                    textColor: INK,
                    marginBottomFree: "0px",
                    responsive: { tablet: { fontSize: "42px" }, mobile: { fontSize: "36px" } },
                  },
                },
              },
              {
                id: "store-price",
                kind: "paragraph",
                props: {
                  text: "$280",
                  style: {
                    fontFamily: INTER,
                    fontSize: "28px",
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    textColor: INK,
                  },
                },
              },
              {
                id: "store-desc",
                kind: "rich_text",
                props: {
                  text: "A warm, available-light portrait from the {accent}Sessions{/accent} series — printed on 310gsm cotton rag with archival pigment, hand-numbered and signed. Each order includes a certificate of authenticity. See the [full printing notes](/printing).",
                  style: {
                    fontFamily: INTER,
                    fontSize: "16px",
                    lineHeight: "1.66",
                    textColor: "#574e44",
                    maxWidthFree: "440px",
                  },
                },
              },
              {
                id: "store-variant-label",
                kind: "paragraph",
                props: {
                  text: "Size",
                  style: {
                    fontFamily: INTER,
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    textColor: MUTE,
                    marginBottomFree: "0px",
                  },
                },
              },
              {
                id: "store-variants",
                kind: "container",
                props: {
                  layout: "row",
                  align: "center",
                  style: { gap: "10px", width: "100%", maxWidthFree: "100%" },
                },
                children: [
                  sizeChip("store-size-a4", "A4 · $180", false),
                  sizeChip("store-size-a3", "A3 · $280", true),
                  sizeChip("store-size-a2", "A2 · $380", false),
                ],
              },
              {
                id: "store-add",
                kind: "button",
                props: {
                  label: "Add to cart — $280",
                  href: "/cart/add",
                  tone: "primary",
                  style: {
                    fontFamily: INTER,
                    fontSize: "15px",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    marginTopFree: "4px",
                    backgroundColor: INK,
                    textColor: PAPER,
                    borderColor: INK,
                    borderWidth: "1px",
                    borderStyle: "solid",
                    paddingTop: "15px",
                    paddingBottom: "15px",
                    paddingLeft: "30px",
                    paddingRight: "30px",
                    transitionProperty: "background-color, transform, box-shadow",
                    transitionDuration: "200ms",
                    transitionTimingFunction: "ease",
                    hover: {
                      backgroundColor: CLAY,
                      scale: "1.02",
                      boxShadow: "0 18px 38px rgba(29,26,22,0.24)",
                    },
                  },
                },
              },
              {
                id: "store-trust",
                kind: "container",
                props: {
                  layout: "row",
                  align: "center",
                  responsive: { mobile: { layout: "stack", align: "start" } },
                  style: {
                    gap: "20px",
                    marginTopFree: "8px",
                    paddingTop: "18px",
                    width: "100%",
                    maxWidthFree: "100%",
                    borderColor: HAIR,
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderRadius: "0px",
                  },
                },
                children: [
                  trustBadge("store-trust-1", "Archival giclée"),
                  trustBadge("store-trust-2", "Ships in 5 days"),
                  trustBadge("store-trust-3", "Certificate included"),
                ],
              },
            ],
          },
        ],
      },
      // ── You may also like (P3 repeater, hover-lift cards) ───────────────────
      {
        id: "store-related",
        kind: "container",
        props: {
          layout: "stack",
          style: {
            width: "100%",
            maxWidthFree: "1200px",
            gap: "26px",
            paddingTop: "84px",
            paddingRight: "40px",
            paddingBottom: "96px",
            paddingLeft: "40px",
            responsive: { mobile: { paddingRight: "20px", paddingLeft: "20px", paddingTop: "60px" } },
          },
        },
        children: [
          {
            id: "store-related-head",
            kind: "container",
            props: {
              layout: "row",
              align: "end",
              responsive: { mobile: { layout: "stack", align: "start" } },
              style: { width: "100%", maxWidthFree: "100%", justifyContent: "space-between", gap: "12px" },
            },
            children: [
              {
                id: "store-related-title",
                kind: "heading",
                props: {
                  text: "You may also like",
                  level: 2,
                  style: {
                    fontFamily: CINZEL,
                    fontSize: "34px",
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                    textColor: INK,
                    marginBottomFree: "0px",
                    responsive: { mobile: { fontSize: "26px" } },
                  },
                },
              },
              {
                id: "store-related-link",
                kind: "paragraph",
                props: {
                  text: "View the full collection",
                  style: {
                    fontFamily: INTER,
                    fontSize: "13px",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    textColor: CLAY,
                  },
                },
              },
            ],
          },
          {
            id: "store-related-grid",
            kind: "container",
            props: {
              layout: "grid",
              columns: 3,
              gap: "m",
              responsive: { tablet: { columns: 3 }, mobile: { columns: 1 } },
              dataBinding: { sourceKey: "store_related", mode: "bound", repeat: true, maxItems: 3 },
              style: { width: "100%", maxWidthFree: "100%", gap: "22px" },
            },
            children: [
              {
                id: "store-related-card",
                kind: "container",
                props: {
                  layout: "stack",
                  style: {
                    gap: "12px",
                    containerType: "inline-size",
                    containerName: "related-card",
                    // Product-card hover-lift — captured as store-1440-hover so
                    // the Motion axis is proven by a real state change (translate
                    // settles to its hovered end state under animations:"disabled"),
                    // alongside the sticky buy-bar `scrolled` frame.
                    transitionProperty: "translate",
                    transitionDuration: "240ms",
                    transitionTimingFunction: "ease",
                    hover: { translate: "0 -6px" },
                  },
                },
                children: [
                  {
                    id: "store-related-image",
                    kind: "image",
                    props: {
                      src: PHOTO.relA,
                      alt: "Related print",
                      fieldBindings: { src: "imageUrl", alt: "title" },
                      style: {
                        width: "100%",
                        aspectRatio: "4:3",
                        objectFit: "cover",
                        objectPosition: "center",
                        borderRadius: "2px",
                        boxShadow: "0 16px 44px rgba(29,26,22,0.14)",
                      },
                    },
                  },
                  {
                    id: "store-related-card-title",
                    kind: "heading",
                    props: {
                      text: "{{title}}",
                      level: 3,
                      fieldBindings: { text: "title" },
                      style: {
                        fontFamily: CINZEL,
                        fontSize: "20px",
                        fontWeight: 600,
                        lineHeight: "1.1",
                        letterSpacing: "0.01em",
                        textColor: INK,
                        marginBottomFree: "0px",
                        containerQueries: { mobile: { fontSize: "18px" } },
                      },
                    },
                  },
                  {
                    id: "store-related-card-price",
                    kind: "paragraph",
                    props: {
                      text: "{{price}}",
                      fieldBindings: { text: "price" },
                      style: {
                        fontFamily: INTER,
                        fontSize: "15px",
                        fontWeight: 600,
                        letterSpacing: "0.01em",
                        textColor: MUTE,
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      // ── Print sizes (P2 pricing_table) ──────────────────────────────────────
      {
        id: "store-sizes-section",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            gap: "12px",
            paddingTop: "76px",
            paddingRight: "40px",
            paddingBottom: "84px",
            paddingLeft: "40px",
            backgroundColor: PAPER,
            borderColor: HAIR,
            borderWidth: "1px",
            borderStyle: "solid",
            responsive: { mobile: { paddingRight: "20px", paddingLeft: "20px" } },
          },
        },
        children: [
          {
            id: "store-sizes-eyebrow",
            kind: "paragraph",
            props: {
              text: "Choose your size",
              style: {
                align: "center",
                fontFamily: CINZEL,
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.2em",
                textColor: CLAY,
              },
            },
          },
          {
            id: "store-sizes-heading",
            kind: "heading",
            props: {
              text: "Print sizes & editions",
              level: 2,
              style: {
                align: "center",
                fontFamily: CINZEL,
                fontSize: "40px",
                fontWeight: 600,
                letterSpacing: "0.01em",
                textColor: INK,
                marginBottomFree: "20px",
                responsive: { mobile: { fontSize: "28px" } },
              },
            },
          },
          {
            id: "store-sizes",
            kind: "pricing_table",
            props: {
              style: { fontFamily: INTER, maxWidthFree: "1080px" },
              tiers: [
                {
                  id: "a4",
                  name: "A4",
                  description: "21 × 30 cm",
                  price: "$180",
                  period: "/ print",
                  ctaLabel: "Add A4",
                  ctaHref: "/cart/add?size=a4",
                  features: [
                    { label: "310gsm cotton rag", included: true },
                    { label: "Edition of 50", included: true },
                    { label: "Signed + numbered", included: true },
                    { label: "Framing add-on", included: false },
                  ],
                },
                {
                  id: "a3",
                  name: "A3",
                  description: "30 × 42 cm",
                  price: "$280",
                  period: "/ print",
                  ctaLabel: "Add A3",
                  ctaHref: "/cart/add?size=a3",
                  highlighted: true,
                  features: [
                    { label: "310gsm cotton rag", included: true },
                    { label: "Edition of 50", included: true },
                    { label: "Signed + numbered", included: true },
                    { label: "Oak frame add-on", included: true },
                  ],
                },
                {
                  id: "a2",
                  name: "A2",
                  description: "42 × 59 cm",
                  price: "$380",
                  period: "/ print",
                  ctaLabel: "Add A2",
                  ctaHref: "/cart/add?size=a2",
                  features: [
                    { label: "Hahnemühle Photo Rag", included: true },
                    { label: "Edition of 25", included: true },
                    { label: "Signed + numbered", included: true },
                    { label: "Oak or walnut frame", included: true },
                  ],
                },
              ],
            },
          },
        ],
      },
      // ── Footer ──────────────────────────────────────────────────────────────
      {
        id: "store-footer",
        kind: "container",
        props: {
          layout: "row",
          align: "center",
          responsive: { mobile: { layout: "stack", align: "start" } },
          style: {
            width: "100%",
            maxWidthFree: "1200px",
            justifyContent: "space-between",
            paddingTop: "44px",
            paddingRight: "40px",
            paddingBottom: "44px",
            paddingLeft: "40px",
            gap: "14px",
            borderColor: HAIR,
            borderWidth: "1px",
            borderStyle: "solid",
          },
        },
        children: [
          {
            id: "store-footer-brand",
            kind: "paragraph",
            props: {
              text: "ATELIER LUMA",
              style: {
                fontFamily: CINZEL,
                fontSize: "15px",
                letterSpacing: "0.16em",
                textColor: INK,
              },
            },
          },
          {
            id: "store-footer-copy",
            kind: "paragraph",
            props: {
              text: "Archival prints, made to order — Mexico City",
              style: {
                align: "right",
                fontFamily: INTER,
                fontSize: "14px",
                textColor: MUTE,
                responsive: { mobile: { align: "left" } },
              },
            },
          },
        ],
      },
    ],
  },
];

export const storeDesign: PageDesign = {
  id: "store",
  title: "Fine-art print store",
  label: "Print store",
  description:
    "A fine-art print storefront: a Roman-caps display, a product hero gallery, edition details, a price-and-buy block, and a related-prints row.",
  archetype: "store",
  tree: storeTree,
  dataSources,
};
