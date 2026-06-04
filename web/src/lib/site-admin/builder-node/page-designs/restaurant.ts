import type { BuilderNode } from "../types";
import { pageDesignPhoto } from "./photos";
import type { BuilderNodeRenderDataSources } from "../render";
import type { PageDesign } from "./types";
import { FRAUNCES, INTER, PLAYFAIR } from "./tokens";

/**
 * ARCHETYPE 8 — Restaurant / menu landing page.
 *
 * Reference intent: a contemporary independent restaurant homepage — warm
 * ember palette (dark mahogany canvas with amber/terracotta accents), an
 * oversized Playfair Display restaurant name over a full-bleed food photograph,
 * a two-column section pairing the story copy with a chef portrait, a hand-set
 * menu section (P3 repeater bound to `menu_items` with per-item field bindings),
 * a one-line booking CTA, and a minimal footer with hours + address.
 *
 * Exercises the P1–P3 stack: Playfair Display + Inter registry faces, REAL
 * photography (food scene + chef portrait), a P3 REPEATER for the menu items
 * (bound to `menu_items` with field bindings), a rich_text "about the kitchen"
 * with an {accent} run + a safe inline link, hover/transition on the reservation
 * CTA, a scroll-driven entrance on the menu section, and a responsive layout
 * that collapses cleanly to a single column.
 */

const MAHOGANY = "#1a0f09";
const PANEL = "#231409";
const CREAM = "#f5ede0";
const MUTED = "rgba(245,237,224,0.68)";
const EMBER = "#c95e2a";
const AMBER = "#e0923a";
const LINE = "rgba(245,237,224,0.14)";

const PHOTO = {
  hero: pageDesignPhoto("serviceProsScene"),
  chef: pageDesignPhoto("directorPortrait"),
  interior: pageDesignPhoto("studioDesk"),
};

const dataSources: BuilderNodeRenderDataSources = {
  collections: {
    menu_items: [
      { id: "m1", name: "Lamb shoulder a la braise", description: "48-hour slow cook, preserved-lemon gremolata, roasted chickpea", price: "$42" },
      { id: "m2", name: "Hand-rolled pasta, cacio e pepe", description: "Imported Pecorino Romano, coarse black pepper, cultured butter", price: "$28" },
      { id: "m3", name: "Tuna crudo", description: "Day-boat albacore, burnt orange vinaigrette, micro basil, yuzu salt", price: "$24" },
      { id: "m4", name: "Bitter greens salad", description: "Radicchio, endive, toasted walnut, house white-wine vinaigrette", price: "$18" },
    ],
  },
};

const restaurantTree: BuilderNode[] = [
  {
    id: "restaurant-page",
    kind: "container",
    props: {
      layout: "stack",
      style: { width: "100%", maxWidthFree: "100%", gap: "0px", backgroundColor: MAHOGANY },
    },
    children: [
      // ── Hero ──────────────────────────────────────────────────────────────
      {
        id: "restaurant-hero",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            minHeight: "820px",
            paddingTop: "0px",
            paddingRight: "0px",
            paddingBottom: "0px",
            paddingLeft: "0px",
            position: "relative",
            overflow: "hidden",
          },
        },
        children: [
          {
            id: "restaurant-hero-bg",
            kind: "image",
            props: {
              src: PHOTO.hero,
              alt: "Restaurant kitchen scene",
              style: {
                position: "absolute",
                top: "0px",
                left: "0px",
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center",
                zIndex: 0,
                opacity: 0.52,
              },
            },
          },
          {
            id: "restaurant-hero-scrim",
            kind: "container",
            props: {
              layout: "stack",
              style: {
                position: "absolute",
                top: "0px",
                left: "0px",
                width: "100%",
                height: "100%",
                zIndex: 1,
                backgroundImage: `linear-gradient(180deg, ${MAHOGANY} 0%, rgba(26,15,9,0.32) 40%, rgba(26,15,9,0.72) 100%)`,
              },
            },
            children: [],
          },
          {
            id: "restaurant-hero-content",
            kind: "container",
            props: {
              layout: "stack",
              align: "center",
              style: {
                position: "relative",
                zIndex: 2,
                width: "100%",
                maxWidthFree: "100%",
                paddingTop: "0px",
                paddingRight: "44px",
                paddingBottom: "96px",
                paddingLeft: "44px",
                responsive: { mobile: { paddingRight: "24px", paddingLeft: "24px", paddingBottom: "64px" } },
              },
            },
            children: [
              {
                id: "restaurant-nav",
                kind: "container",
                props: {
                  layout: "row",
                  align: "center",
                  style: {
                    width: "100%",
                    maxWidthFree: "1200px",
                    justifyContent: "space-between",
                    paddingTop: "36px",
                    paddingBottom: "36px",
                    marginBottomFree: "140px",
                    boxShadow: `inset 0 -1px 0 0 ${LINE}`,
                    responsive: { mobile: { marginBottomFree: "80px" } },
                  },
                },
                children: [
                  {
                    id: "restaurant-brand",
                    kind: "paragraph",
                    props: {
                      text: "CASA LUMBRE",
                      style: {
                        fontFamily: PLAYFAIR,
                        fontSize: "18px",
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        textColor: CREAM,
                      },
                    },
                  },
                  {
                    id: "restaurant-nav-links",
                    kind: "paragraph",
                    props: {
                      text: "Menu · Story · Reserve",
                      style: {
                        fontFamily: INTER,
                        fontSize: "13px",
                        fontWeight: 500,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        textColor: MUTED,
                        responsive: { mobile: { visibility: "hidden" } },
                      },
                    },
                  },
                ],
              },
              {
                id: "restaurant-eyebrow",
                kind: "paragraph",
                props: {
                  text: "Modern Mexican Kitchen · Mexico City",
                  style: {
                    align: "center",
                    fontFamily: INTER,
                    fontSize: "13px",
                    fontWeight: 600,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    textColor: EMBER,
                    marginBottomFree: "20px",
                  },
                },
              },
              {
                id: "restaurant-headline",
                kind: "heading",
                props: {
                  text: "Every dish is a\nconversation",
                  level: 1,
                  style: {
                    align: "center",
                    fontFamily: PLAYFAIR,
                    fontSize: "104px",
                    lineHeight: "0.92",
                    letterSpacing: "-0.01em",
                    textColor: CREAM,
                    maxWidthFree: "1000px",
                    textWrap: "balance",
                    responsive: { tablet: { fontSize: "72px" }, mobile: { fontSize: "48px" } },
                  },
                },
              },
              {
                id: "restaurant-sub",
                kind: "paragraph",
                props: {
                  text: "Open Tuesday – Sunday · Reservations recommended",
                  style: {
                    align: "center",
                    fontFamily: INTER,
                    fontSize: "16px",
                    lineHeight: "1.5",
                    textColor: MUTED,
                    marginTopFree: "24px",
                  },
                },
              },
              {
                id: "restaurant-cta",
                kind: "button",
                props: {
                  label: "Reserve a table",
                  href: "/reserve",
                  tone: "primary",
                  style: {
                    fontFamily: INTER,
                    fontSize: "15px",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    backgroundColor: EMBER,
                    textColor: CREAM,
                    borderRadius: "2px",
                    paddingTop: "14px",
                    paddingBottom: "14px",
                    paddingLeft: "36px",
                    paddingRight: "36px",
                    marginTopFree: "32px",
                    transitionProperty: "background-color, transform, box-shadow",
                    transitionDuration: "200ms",
                    transitionTimingFunction: "ease",
                    hover: {
                      backgroundColor: AMBER,
                      scale: "1.03",
                      boxShadow: `0 20px 48px rgba(201,94,42,0.40)`,
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      // ── Story split ────────────────────────────────────────────────────────
      {
        id: "restaurant-story",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            paddingTop: "96px",
            paddingRight: "44px",
            paddingBottom: "96px",
            paddingLeft: "44px",
            backgroundImage: `linear-gradient(180deg, ${MAHOGANY} 0%, ${PANEL} 100%)`,
            responsive: { mobile: { paddingRight: "24px", paddingLeft: "24px", paddingTop: "64px", paddingBottom: "64px" } },
          },
        },
        children: [
          {
            id: "restaurant-story-inner",
            kind: "split",
            props: {
              ratio: "60-40",
              gap: "l",
              collapseOnMobile: true,
              style: { width: "100%", maxWidthFree: "1200px", alignItems: "center" },
            },
            children: [
              {
                id: "restaurant-story-copy",
                kind: "container",
                props: { layout: "stack", style: { gap: "22px" } },
                children: [
                  {
                    id: "restaurant-story-kicker",
                    kind: "paragraph",
                    props: {
                      text: "The kitchen",
                      style: {
                        fontFamily: INTER,
                        fontSize: "12px",
                        fontWeight: 700,
                        letterSpacing: "0.26em",
                        textTransform: "uppercase",
                        textColor: EMBER,
                      },
                    },
                  },
                  {
                    id: "restaurant-story-heading",
                    kind: "heading",
                    props: {
                      text: "Rooted in season, driven by fire",
                      level: 2,
                      style: {
                        fontFamily: PLAYFAIR,
                        fontSize: "54px",
                        lineHeight: "1.04",
                        letterSpacing: "-0.01em",
                        textColor: CREAM,
                        maxWidthFree: "520px",
                        textWrap: "balance",
                        responsive: { mobile: { fontSize: "36px" } },
                      },
                    },
                  },
                  {
                    id: "restaurant-story-body",
                    kind: "rich_text",
                    props: {
                      text: "Chef Andrés Moya built the Casa Lumbre kitchen around {accent}a wood-fire grill and a weekly market run{/accent} — no freezers, no shortcuts. The menu changes when the produce does. [Read the full story](/story).",
                      style: {
                        fontFamily: INTER,
                        fontSize: "18px",
                        lineHeight: "1.7",
                        textColor: MUTED,
                        maxWidthFree: "480px",
                      },
                    },
                  },
                ],
              },
              {
                id: "restaurant-story-image",
                kind: "image",
                props: {
                  src: PHOTO.chef,
                  alt: "Chef in the kitchen",
                  style: {
                    width: "100%",
                    aspectRatioFree: "0.82",
                    objectFit: "cover",
                    objectPosition: "center top",
                    borderRadius: "2px",
                    boxShadow: `0 40px 100px rgba(10,5,3,0.52)`,
                  },
                },
              },
            ],
          },
        ],
      },
      // ── Menu section (P3 repeater) ─────────────────────────────────────────
      {
        id: "restaurant-menu",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            paddingTop: "96px",
            paddingRight: "44px",
            paddingBottom: "96px",
            paddingLeft: "44px",
            backgroundColor: PANEL,
            animationPreset: "rise",
            animationTrigger: "scroll",
            animationDuration: "0.9s",
            responsive: { mobile: { paddingRight: "24px", paddingLeft: "24px" } },
          },
        },
        children: [
          {
            id: "restaurant-menu-inner",
            kind: "container",
            props: {
              layout: "stack",
              style: { width: "100%", maxWidthFree: "800px", gap: "8px" },
            },
            children: [
              {
                id: "restaurant-menu-kicker",
                kind: "paragraph",
                props: {
                  text: "On the table",
                  style: {
                    fontFamily: INTER,
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.26em",
                    textTransform: "uppercase",
                    textColor: EMBER,
                  },
                },
              },
              {
                id: "restaurant-menu-heading",
                kind: "heading",
                props: {
                  text: "Tonight's selection",
                  level: 2,
                  style: {
                    fontFamily: PLAYFAIR,
                    fontSize: "52px",
                    lineHeight: "1.06",
                    textColor: CREAM,
                    marginBottomFree: "8px",
                    responsive: { mobile: { fontSize: "34px" } },
                  },
                },
              },
              {
                id: "restaurant-menu-rule",
                kind: "divider",
                props: {
                  style: {
                    width: "100%",
                    height: "1px",
                    backgroundColor: LINE,
                    marginTopFree: "16px",
                    marginBottomFree: "8px",
                  },
                },
              },
              {
                id: "restaurant-menu-list",
                kind: "container",
                props: {
                  layout: "stack",
                  style: { width: "100%", maxWidthFree: "100%", gap: "0px" },
                  dataBinding: { sourceKey: "menu_items", mode: "bound", repeat: true, maxItems: 4 },
                },
                children: [
                  {
                    id: "restaurant-menu-item",
                    kind: "container",
                    props: {
                      layout: "row",
                      align: "center",
                      responsive: { mobile: { layout: "stack" } },
                      style: {
                        width: "100%",
                        justifyContent: "space-between",
                        gap: "16px",
                        paddingTop: "22px",
                        paddingBottom: "22px",
                        boxShadow: `inset 0 -1px 0 0 ${LINE}`,
                        transitionProperty: "background-color",
                        transitionDuration: "180ms",
                        transitionTimingFunction: "ease",
                        hover: { backgroundColor: "rgba(245,237,224,0.04)" },
                      },
                    },
                    children: [
                      {
                        id: "restaurant-item-body",
                        kind: "container",
                        props: { layout: "stack", style: { gap: "6px" } },
                        children: [
                          {
                            id: "restaurant-item-name",
                            kind: "heading",
                            props: {
                              text: "{{name}}",
                              level: 3,
                              fieldBindings: { text: "name" },
                              style: {
                                fontFamily: FRAUNCES,
                                fontSize: "22px",
                                fontWeight: 600,
                                lineHeight: "1.1",
                                textColor: CREAM,
                                marginBottomFree: "0px",
                              },
                            },
                          },
                          {
                            id: "restaurant-item-desc",
                            kind: "paragraph",
                            props: {
                              text: "{{description}}",
                              fieldBindings: { text: "description" },
                              style: {
                                fontFamily: INTER,
                                fontSize: "14px",
                                lineHeight: "1.5",
                                textColor: MUTED,
                              },
                            },
                          },
                        ],
                      },
                      {
                        id: "restaurant-item-price",
                        kind: "paragraph",
                        props: {
                          text: "{{price}}",
                          fieldBindings: { text: "price" },
                          style: {
                            fontFamily: PLAYFAIR,
                            fontSize: "20px",
                            fontWeight: 600,
                            textColor: AMBER,
                            whiteSpace: "nowrap",
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      // ── Footer ────────────────────────────────────────────────────────────
      {
        id: "restaurant-footer",
        kind: "container",
        props: {
          layout: "row",
          align: "center",
          responsive: { mobile: { layout: "stack", align: "start" } },
          style: {
            width: "100%",
            maxWidthFree: "1200px",
            justifyContent: "space-between",
            paddingTop: "48px",
            paddingRight: "44px",
            paddingBottom: "48px",
            paddingLeft: "44px",
            gap: "16px",
            boxShadow: `inset 0 1px 0 0 ${LINE}`,
          },
        },
        children: [
          {
            id: "restaurant-footer-brand",
            kind: "paragraph",
            props: {
              text: "Casa Lumbre · Mexico City",
              style: {
                fontFamily: PLAYFAIR,
                fontSize: "16px",
                letterSpacing: "0.04em",
                textColor: MUTED,
              },
            },
          },
          {
            id: "restaurant-footer-hours",
            kind: "paragraph",
            props: {
              text: "Tue–Sun · 1pm – 11pm · Colonia Roma Norte",
              style: {
                align: "right",
                fontFamily: INTER,
                fontSize: "14px",
                textColor: MUTED,
                opacity: 0.72,
                responsive: { mobile: { align: "left" } },
              },
            },
          },
        ],
      },
    ],
  },
];

export const restaurantDesign: PageDesign = {
  id: "restaurant",
  title: "Restaurant & menu landing page",
  label: "Restaurant & menu",
  description:
    "A contemporary restaurant landing page: a Playfair Display name over a full-bleed food hero, a two-column kitchen-story split, a hand-set menu with live pricing, and a reservation CTA.",
  archetype: "restaurant",
  tree: restaurantTree,
  dataSources,
};
