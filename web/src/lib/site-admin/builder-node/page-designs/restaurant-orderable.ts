import type { BuilderNode } from "../types";
import { pageDesignPhoto } from "./photos";
import type { PageDesign } from "./types";
import { INTER, PLAYFAIR } from "./tokens";

/**
 * Restaurant landing page whose menu section uses a live `menu_board` node
 * (workspace-owned orderable items) instead of the decorative `menu_items`
 * repeater on the display-only restaurant design.
 *
 * TEMPLATED ON THE TENANT, NOT ON A FIXTURE. This design is the page-less
 * fallback every `restaurant` preset renders (`default-storefront-template.ts`),
 * so every string a visitor reads is either the tenant's own fact through the
 * starter-personalisation vocabulary (`{{business.name}}`, `{{business.tagline}}`,
 * `{{business.city}}`; the last two strip when absent) or neutral copy that
 * asserts nothing about the business. A real restaurant in Glew rendered as
 * "CASA LUMBRE · Modern Mexican Kitchen · Mexico City" with a chef it does not
 * have; that fiction is gone and a render test pins it out.
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

const PHOTO = {
  hero: pageDesignPhoto("serviceProsScene"),
};

const restaurantOrderableTree: BuilderNode[] = [
  {
    id: "restaurant-orderable-page",
    kind: "container",
    props: {
      layout: "stack",
      style: { width: "100%", maxWidthFree: "100%", gap: "0px", backgroundColor: MAHOGANY },
    },
    children: [
      // ── Hero ──────────────────────────────────────────────────────────────
      {
        id: "restaurant-orderable-hero",
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
            id: "restaurant-orderable-hero-bg",
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
            id: "restaurant-orderable-hero-scrim",
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
            id: "restaurant-orderable-hero-content",
            kind: "container",
            props: {
              layout: "stack",
              align: "center",
              style: {
                position: "relative",
                zIndex: 2,
                width: "100%",
                maxWidthFree: "100%",
                // The platform chrome carries the name, the nav and Reserve. The
                // design used to draw a second header row here ("CASA LUMBRE ·
                // MENU · STORY · ORDER") under the real one, so a tenant page
                // wore two stacked headers. One header: the hero opens with
                // breathing room instead of a nav row.
                paddingTop: "140px",
                paddingRight: "44px",
                paddingBottom: "96px",
                paddingLeft: "44px",
                responsive: { mobile: { paddingRight: "24px", paddingLeft: "24px", paddingTop: "80px", paddingBottom: "64px" } },
              },
            },
            children: [
              {
                id: "restaurant-orderable-eyebrow",
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
                id: "restaurant-orderable-headline",
                kind: "heading",
                props: {
                  text: "{{business.name}}",
                  level: 1,
                  style: {
                    align: "center",
                    fontFamily: PLAYFAIR,
                    fontSize: "96px",
                    lineHeight: "0.92",
                    letterSpacing: "-0.01em",
                    textColor: CREAM,
                    maxWidthFree: "1000px",
                    textWrap: "balance",
                    responsive: { tablet: { fontSize: "68px" }, mobile: { fontSize: "44px" } },
                  },
                },
              },
              {
                id: "restaurant-orderable-sub",
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
                id: "restaurant-orderable-cta",
                kind: "button",
                props: {
                  label: "Browse the menu",
                  href: "#menu",
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
        id: "restaurant-orderable-story",
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
            id: "restaurant-orderable-story-inner",
            kind: "split",
            props: {
              ratio: "60-40",
              gap: "l",
              collapseOnMobile: true,
              style: { width: "100%", maxWidthFree: "1200px", alignItems: "center" },
            },
            children: [
              {
                id: "restaurant-orderable-story-copy",
                kind: "container",
                props: { layout: "stack", style: { gap: "22px" } },
                children: [
                  {
                    id: "restaurant-orderable-story-kicker",
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
                    id: "restaurant-orderable-story-heading",
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
                    id: "restaurant-orderable-story-body",
                    kind: "rich_text",
                    props: {
                      text: "Order from the {accent}live menu{/accent} below, or come by.",
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
                id: "restaurant-orderable-story-photo-slot",
                kind: "container",
                props: {
                  layout: "stack",
                  layerLabel: "Your photo",
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
                children: [],
              },
            ],
          },
        ],
      },
      // ── Orderable menu (menu_board) ─────────────────────────────────────────
      {
        id: "restaurant-orderable-menu",
        kind: "container",
        // C11 — the target of this design's `#menu` primary button. Before
        // anchorId existed the renderer emitted no DOM `id` at all, so that
        // button was INERT on every tenant that picked this design. Set on the
        // node BASE, not in props: props is a per-kind discriminated union that
        // does not declare it, while BuilderNodeBase does. validate mirrors it
        // into props on the next pass, so both paths still agree.
        anchorId: "menu",
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
            id: "restaurant-orderable-menu-inner",
            kind: "container",
            props: {
              layout: "stack",
              style: { width: "100%", maxWidthFree: "800px", gap: "24px" },
            },
            children: [
              {
                id: "restaurant-orderable-menu-kicker",
                kind: "paragraph",
                props: {
                  text: "Order now",
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
                id: "restaurant-orderable-menu-board",
                kind: "menu_board",
                props: {
                  title: "Tonight's selection",
                  subtitle: "Choose what you want and send the order.",
                  emptyMessage: "Menu items are not published yet.",
                  style: {
                    width: "100%",
                    maxWidthFree: "100%",
                    fontFamily: INTER,
                    textColor: CREAM,
                  },
                },
              },
            ],
          },
        ],
      },
      // ── Footer ────────────────────────────────────────────────────────────
    ],
  },
];

export const restaurantOrderableDesign: PageDesign = {
  id: "restaurant-orderable",
  title: "Restaurant & menu (orderable) landing page",
  label: "Restaurant & menu (orderable)",
  description:
    "A restaurant landing page with a Playfair Display hero, kitchen-story split, and a live menu_board for workspace orderable items.",
  archetype: "restaurant",
  tree: restaurantOrderableTree,
};
