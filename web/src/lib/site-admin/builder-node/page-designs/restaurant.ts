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
// The primary button fill: EMBER darkened in hue until cream text clears the
// 4.5:1 text floor (cream on EMBER is 3.53:1, large-text only). Kickers and
// rules keep EMBER; a button carries text, so it carries this.
const EMBER_BUTTON = "#ab5024";
const AMBER = "#e0923a";
const LINE = "rgba(245,237,224,0.14)";

const PHOTO = {
  hero: pageDesignPhoto("serviceProsScene"),
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
              // PLACEHOLDER, by ruling (CEO, 2026-09-05): a stock kitchen scene stays
              // until the owner clears their own photos, because a bare hero is
              // worse than a placeholder kitchen and the swap is one image. The
              // layer name says so to whoever opens the page in the builder.
              layerLabel: "Placeholder photo: replace with the owner's own",
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
                // One header: the platform chrome carries name, nav and Reserve;
                // the design's own nav row is gone, so the hero opens with room.
                paddingTop: "140px",
                paddingRight: "44px",
                paddingBottom: "96px",
                paddingLeft: "44px",
                responsive: { mobile: { paddingRight: "24px", paddingLeft: "24px", paddingTop: "80px", paddingBottom: "64px" } },
              },
            },
            children: [
              {
                id: "restaurant-eyebrow",
                kind: "paragraph",
                props: {
                  text: "{{business.city}}",
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
                  text: "{{business.name}}",
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
                  text: "{{business.tagline}}",
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
                  href: "?inquiry=open",
                  tone: "primary",
                  style: {
                    fontFamily: INTER,
                    fontSize: "15px",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    backgroundColor: EMBER_BUTTON,
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
                      text: "Reserve a table below, or come by. {accent}The menu changes when the produce does.{/accent} [Read the full story](/story)",
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
                // THE TENANT'S OWN PHOTO SLOT, empty until the owner supplies one.
                // This was a stock portrait from the design photo set, a chef nobody is,
                // on every page-less restaurant. The brief's rule: no real photo, then the
                // charcoal ground and type, never a placeholder and never a stranger's
                // face on a family restaurant. The slot keeps the split's footprint so the
                // layout does not flinch when the photo arrives; the operator drops an
                // image node into it.
                id: "restaurant-story-photo-slot",
                kind: "container",
                props: {
                  layout: "stack",
                  align: "center",
                  layerLabel: "Designed absence: the name in the display face until the owner's photo arrives",
                  style: {
                    width: "100%",
                    aspectRatioFree: "0.82",
                    objectFit: "cover",
                    objectPosition: "center top",
                    borderRadius: "2px",
                    boxShadow: `0 40px 100px rgba(10,5,3,0.52)`,
                    backgroundColor: PANEL,
                    minHeight: "320px",
                  },
                },
                children: [
                  {
                    // The designed absence (CEO + Creative Director, 2026-09-05):
                    // charcoal ground with the tenant's own name set in the display
                    // face, never a label that says "photo" and never a stranger's
                    // face. The personaliser writes the name; the owner's photo
                    // replaces this node when it arrives.
                    id: "restaurant-story-photo-slot-name",
                    kind: "heading",
                    props: {
                      text: "{{business.name}}",
                      level: 2,
                      style: {
                        align: "center",
                        size: "lg",
                        fontFamily: PLAYFAIR,
                        lineHeight: "1.1",
                        letterSpacing: "0.02em",
                        textColor: CREAM,
                        textWrap: "balance",
                        paddingTop: "40px",
                        paddingRight: "24px",
                        paddingBottom: "40px",
                        paddingLeft: "24px",
                      },
                    },
                  },
                ],
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
            animationRepeat: "once",
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
    ],
  },
];

export const restaurantDesign: PageDesign = {
  id: "restaurant",
  title: "Restaurant & menu (display-only) landing page",
  label: "Restaurant & menu (display)",
  description:
    "A contemporary restaurant landing page with a Playfair Display name, kitchen-story split, and a decorative display-only menu (not connected to workspace orders).",
  archetype: "restaurant",
  tree: restaurantTree,
  dataSources,
};
