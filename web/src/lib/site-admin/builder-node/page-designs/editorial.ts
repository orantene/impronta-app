import type { BuilderNode } from "../types";
import { pageDesignPhoto } from "./photos";
import type { BuilderNodeRenderDataSources } from "../render";
import type { PageDesign } from "./types";
import { FRAUNCES, INTER } from "./tokens";

/**
 * ARCHETYPE 1 — Editorial single-artist photography portfolio.
 *
 * Reference intent: a luxury commissioned-photographer's site in the vein of a
 * print fashion book — oversized Fraunces serif display, quiet uppercase Inter
 * navigation, a warm cream/ink palette, an asymmetric hero with a full-bleed
 * portrait and an overlapping detail crop, a restrained "selected series"
 * triptych, and one dark scroll-reveal statement.
 *
 * Exercises the P1–P3 stack: Fraunces + Inter registry faces (font bridge),
 * REAL photography (no placeholders), a P3 REPEATER for the series triptych
 * (bound to `editorial_series` with field bindings + per-slot container
 * queries), a rich_text artist statement with an {accent} run and a safe inline
 * link, a hover/transition on the hero CTA, a scroll-driven entrance animation,
 * and a responsive layout that collapses cleanly to mobile.
 */

const PHOTO = {
  vocalist: pageDesignPhoto("vocalistPortrait"),
  studioScene: pageDesignPhoto("studioScene"),
  director: pageDesignPhoto("directorPortrait"),
  serviceScene: pageDesignPhoto("serviceProsScene"),
};

const dataSources: BuilderNodeRenderDataSources = {
  collections: {
    editorial_series: [
      { id: "s1", imageUrl: PHOTO.vocalist, title: "Sessions", place: "Mexico City", year: "2026" },
      { id: "s2", imageUrl: PHOTO.studioScene, title: "At Home, On Air", place: "CDMX", year: "2026" },
      { id: "s3", imageUrl: PHOTO.director, title: "The Index", place: "Lisbon", year: "2025" },
    ],
  },
};

const editorialTree: BuilderNode[] = [
  {
    id: "editorial-page",
    kind: "container",
    props: {
      layout: "stack",
      style: { width: "100%", maxWidthFree: "100%", gap: "0px", backgroundColor: "#f3efe7" },
    },
    children: [
      // ── Hero ──────────────────────────────────────────────────────────────
      {
        id: "editorial-hero",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            minHeight: "900px",
            paddingTop: "30px",
            paddingRight: "44px",
            paddingBottom: "96px",
            paddingLeft: "44px",
            backgroundColor: "#ece2d4",
            // Restrained depth on a deliberately flat archetype: a soft warm
            // light from the upper-left + a gentle vertical tonal deepening,
            // both inside the cream/terracotta palette. Reads as material
            // (the band is no longer one flat fill) without introducing glass
            // or a foreign hue. Proven in editorial-1440.png.
            backgroundImage:
              "radial-gradient(115% 80% at 16% 8%, #f4ece0 0%, rgba(244,236,224,0) 56%), linear-gradient(180deg,#ece2d4 0%,#e2d6c3 100%)",
            position: "relative",
            overflow: "hidden",
            responsive: { mobile: { paddingRight: "22px", paddingLeft: "22px", paddingBottom: "60px" } },
          },
        },
        children: [
          {
            id: "editorial-nav",
            kind: "container",
            props: {
              layout: "row",
              align: "center",
              style: {
                width: "100%",
                maxWidthFree: "1280px",
                justifyContent: "space-between",
                gap: "18px",
                marginBottomFree: "84px",
                responsive: { mobile: { marginBottomFree: "48px" } },
              },
            },
            children: [
              {
                id: "editorial-brand",
                kind: "paragraph",
                props: {
                  text: "MARA LUNE",
                  style: {
                    fontFamily: FRAUNCES,
                    fontSize: "20px",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    textColor: "#2a221b",
                  },
                },
              },
              {
                id: "editorial-nav-links",
                kind: "paragraph",
                props: {
                  text: "Series · Campaigns · Index",
                  style: {
                    align: "right",
                    fontFamily: INTER,
                    fontSize: "12px",
                    fontWeight: 600,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    textColor: "#6d6155",
                    responsive: { mobile: { visibility: "hidden" } },
                  },
                },
              },
            ],
          },
          {
            id: "editorial-hero-split",
            kind: "split",
            props: {
              ratio: "40-60",
              gap: "l",
              collapseOnMobile: true,
              style: { width: "100%", maxWidthFree: "1280px", alignItems: "center" },
            },
            children: [
              {
                id: "editorial-copy",
                kind: "container",
                props: { layout: "stack", style: { zIndex: 2, gap: "22px" } },
                children: [
                  {
                    id: "editorial-kicker",
                    kind: "paragraph",
                    props: {
                      text: "Editorial · Portrait · Campaign",
                      style: {
                        fontFamily: INTER,
                        fontSize: "12px",
                        fontWeight: 700,
                        letterSpacing: "0.26em",
                        textTransform: "uppercase",
                        textColor: "#9a4a36",
                      },
                    },
                  },
                  {
                    id: "editorial-headline",
                    kind: "heading",
                    props: {
                      text: "Light for people who know how to hold it",
                      level: 1,
                      style: {
                        fontFamily: FRAUNCES,
                        fontSize: "92px",
                        lineHeight: "0.9",
                        letterSpacing: "-0.02em",
                        textColor: "#1b1713",
                        marginBottomFree: "0px",
                        maxWidthFree: "700px",
                        textWrap: "balance",
                        responsive: { tablet: { fontSize: "70px" }, mobile: { fontSize: "46px" } },
                      },
                    },
                  },
                  {
                    id: "editorial-statement",
                    kind: "rich_text",
                    props: {
                      text: "Commissioned portraits and campaign work made with {accent}slow, available light{/accent}, unhurried sittings, honest skin, real rooms. Selected series below, or [read the full index](/index).",
                      style: {
                        fontFamily: INTER,
                        fontSize: "19px",
                        lineHeight: "1.62",
                        textColor: "#5d5247",
                        maxWidthFree: "520px",
                      },
                    },
                  },
                  {
                    id: "editorial-cta",
                    kind: "button",
                    props: {
                      label: "View the series",
                      href: "?inquiry=open",
                      tone: "secondary",
                      style: {
                        fontFamily: INTER,
                        fontSize: "14px",
                        letterSpacing: "0.04em",
                        backgroundColor: "transparent",
                        textColor: "#1b1713",
                        borderColor: "#1b1713",
                        borderWidth: "1px",
                        borderStyle: "solid",
                        transitionProperty: "background-color, color, transform, box-shadow",
                        transitionDuration: "220ms",
                        transitionTimingFunction: "ease",
                        hover: {
                          backgroundColor: "#1b1713",
                          color: "#f3ede5",
                          scale: "1.03",
                          boxShadow: "0 18px 40px rgba(27,23,19,0.24)",
                        },
                      },
                    },
                  },
                ],
              },
              {
                id: "editorial-hero-media",
                kind: "container",
                props: {
                  layout: "stack",
                  style: {
                    minHeight: "640px",
                    position: "relative",
                    maxWidthFree: "760px",
                    overflow: "visible",
                    responsive: { mobile: { minHeight: "460px" } },
                  },
                },
                children: [
                  {
                    id: "editorial-hero-image",
                    kind: "image",
                    props: {
                      src: PHOTO.vocalist,
                      alt: "Vocalist photographed in warm available light",
                      style: {
                        width: "100%",
                        aspectRatioFree: "0.8",
                        objectFit: "cover",
                        objectPosition: "center top",
                        borderRadius: "2px",
                        boxShadow: "0 40px 110px rgba(27,23,19,0.24)",
                      },
                    },
                  },
                  {
                    id: "editorial-overlap-image",
                    kind: "image",
                    props: {
                      // A calmer single-subject crop (not the crowded loft) so the
                      // inset reads as a deliberate detail print, not a busy second
                      // scene fighting the portrait.
                      src: PHOTO.director,
                      alt: "Detail crop from a studio session",
                      style: {
                        position: "absolute",
                        // Bottom edge sits flush with the portrait's bottom edge
                        // (deliberate alignment, not a floating mid-crop) and a
                        // cleaner, smaller right overhang. A cream matting border
                        // separates it from the portrait behind so the two photos
                        // read as composed, not collided. Proven in editorial-1440.png.
                        right: "-40px",
                        bottom: "0px",
                        width: "39%",
                        aspectRatio: "3:4",
                        objectFit: "cover",
                        objectPosition: "center",
                        borderRadius: "2px",
                        borderColor: "#f3efe7",
                        borderWidth: "8px",
                        borderStyle: "solid",
                        boxShadow: "0 30px 64px rgba(27,23,19,0.32)",
                        responsive: { mobile: { right: "-6px", bottom: "0px", width: "46%", borderWidth: "5px" } },
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      // ── Selected series (P3 repeater) ─────────────────────────────────────
      {
        id: "editorial-series",
        kind: "container",
        props: {
          layout: "stack",
          style: {
            width: "100%",
            maxWidthFree: "1280px",
            gap: "24px",
            // Tighter hero→triptych transition (was 104px) so the gallery follows
            // the hero without a dead vertical gap. Proven in editorial-1440.png.
            paddingTop: "64px",
            paddingRight: "48px",
            paddingBottom: "76px",
            paddingLeft: "48px",
            // Layered tonal panel: the gallery sits on a faint warm shelf a shade
            // deeper than the page cream, with a whisper of contact shadow. Adds
            // material depth/variety to the flat archetype without a foreign hue.
            backgroundImage: "linear-gradient(180deg,#f1e9dd 0%,#e8ddca 100%)",
            borderRadius: "4px",
            boxShadow: "0 32px 90px rgba(27,23,19,0.07)",
            marginTopFree: "12px",
            responsive: { mobile: { paddingRight: "22px", paddingLeft: "22px", paddingTop: "48px", paddingBottom: "56px" } },
          },
        },
        children: [
          {
            id: "editorial-series-label",
            kind: "paragraph",
            props: {
              text: "Selected series",
              style: {
                fontFamily: INTER,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.26em",
                textTransform: "uppercase",
                textColor: "#9a4a36",
              },
            },
          },
          {
            // Short terracotta rule — makes the accent hue do structural work
            // (a deliberate section marker) rather than only tinting eyebrows.
            id: "editorial-series-rule",
            kind: "divider",
            props: {
              style: {
                width: "52px",
                height: "2px",
                backgroundColor: "#9a4a36",
                marginTopFree: "0px",
                marginBottomFree: "4px",
              },
            },
          },
          {
            id: "editorial-series-grid",
            kind: "container",
            props: {
              layout: "grid",
              columns: 3,
              gap: "m",
              responsive: { tablet: { columns: 3 }, mobile: { columns: 1 } },
              dataBinding: { sourceKey: "editorial_series", mode: "bound", repeat: true, maxItems: 3 },
              style: { width: "100%", maxWidthFree: "100%", gap: "20px" },
            },
            children: [
              {
                id: "editorial-series-card",
                kind: "container",
                props: {
                  layout: "stack",
                  style: {
                    gap: "12px",
                    containerType: "inline-size",
                    containerName: "series-card",
                    // Tasteful hover-lift — editorial's 2nd motion behaviour
                    // (alongside the hero-CTA hover + the dark scroll-reveal).
                    // Captured as editorial-1440-cardlift so the Motion axis is
                    // proven by more than a single behaviour. Transitions the
                    // `translate` property the hover sets (settled end state read
                    // under animations:"disabled").
                    transitionProperty: "translate",
                    transitionDuration: "240ms",
                    transitionTimingFunction: "ease",
                    hover: { translate: "0 -6px" },
                  },
                },
                children: [
                  {
                    id: "editorial-series-image",
                    kind: "image",
                    props: {
                      src: PHOTO.vocalist,
                      alt: "Series photograph",
                      fieldBindings: { src: "imageUrl", alt: "title" },
                      style: {
                        width: "100%",
                        aspectRatio: "3:4",
                        objectFit: "cover",
                        objectPosition: "center top",
                        borderRadius: "2px",
                        boxShadow: "0 18px 48px rgba(27,23,19,0.16)",
                      },
                    },
                  },
                  {
                    id: "editorial-series-title",
                    kind: "heading",
                    props: {
                      text: "{{title}}",
                      level: 3,
                      fieldBindings: { text: "title" },
                      style: {
                        fontFamily: FRAUNCES,
                        fontSize: "26px",
                        lineHeight: "1.05",
                        textColor: "#1f1a15",
                        marginBottomFree: "0px",
                        // Slot-aware: when this card's column is narrow (mobile
                        // grid, or any tight slot ≤640px) the title eases down a
                        // step via a container query rather than a viewport one.
                        containerQueries: { mobile: { fontSize: "22px" } },
                      },
                    },
                  },
                  {
                    id: "editorial-series-meta",
                    kind: "paragraph",
                    props: {
                      text: "{{place}}, {{year}}",
                      fieldBindings: { text: "place" },
                      style: {
                        fontFamily: INTER,
                        fontSize: "13px",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        textColor: "#857667",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      // ── Dark scroll-reveal statement ──────────────────────────────────────
      {
        id: "editorial-reveal",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            paddingTop: "120px",
            paddingRight: "32px",
            paddingBottom: "120px",
            paddingLeft: "32px",
            // Was 64px — too large a void above the statement band. Tightened so
            // the reveal reads as the page's closing note, not a detached slab.
            marginTopFree: "24px",
            backgroundColor: "#191512",
            // Whisper of depth on the ink band: a faint warm light bleeding from
            // the top edge + a vertical deepening, so the statement band has
            // material rather than a single flat ink fill. Proven in
            // editorial-1440.png (and -reveal once settled).
            backgroundImage:
              "radial-gradient(90% 62% at 50% 0%, rgba(198,169,140,0.12), rgba(198,169,140,0) 56%), linear-gradient(180deg,#1d1813 0%,#151009 100%)",
            animationPreset: "rise",
            animationTrigger: "scroll",
            animationRepeat: "once",
            animationDuration: "1s",
          },
        },
        children: [
          {
            id: "editorial-reveal-kicker",
            kind: "paragraph",
            props: {
              text: "On the work",
              style: {
                align: "center",
                fontFamily: INTER,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                textColor: "#c6a98c",
              },
            },
          },
          {
            id: "editorial-reveal-heading",
            kind: "heading",
            props: {
              text: "A photograph should remember the room it was made in.",
              level: 2,
              style: {
                align: "center",
                fontFamily: FRAUNCES,
                fontSize: "58px",
                lineHeight: "1.04",
                letterSpacing: "-0.01em",
                textColor: "#f5efe6",
                maxWidthFree: "900px",
                textWrap: "balance",
                responsive: { mobile: { fontSize: "34px" } },
              },
            },
          },
        ],
      },
      // ── Footer ────────────────────────────────────────────────────────────
      {
        id: "editorial-footer",
        kind: "container",
        props: {
          layout: "row",
          align: "center",
          responsive: { mobile: { layout: "stack", align: "start" } },
          style: {
            width: "100%",
            maxWidthFree: "1280px",
            justifyContent: "space-between",
            paddingTop: "46px",
            paddingRight: "44px",
            paddingBottom: "46px",
            paddingLeft: "44px",
            gap: "16px",
          },
        },
        children: [
          {
            id: "editorial-footer-brand",
            kind: "paragraph",
            props: {
              text: "Mara Lune, 2026",
              style: {
                fontFamily: FRAUNCES,
                fontSize: "16px",
                letterSpacing: "0.02em",
                textColor: "#34291f",
              },
            },
          },
          {
            id: "editorial-footer-copy",
            kind: "paragraph",
            props: {
              text: "Commissioned portraits, campaign direction, and moving image.",
              style: {
                align: "right",
                fontFamily: INTER,
                fontSize: "14px",
                textColor: "#6a5f54",
                responsive: { mobile: { align: "left" } },
              },
            },
          },
        ],
      },
    ],
  },
];

export const editorialDesign: PageDesign = {
  id: "editorial",
  title: "Editorial photography portfolio",
  label: "Editorial portfolio",
  description:
    "A single-artist photography portfolio: oversized serif display, an asymmetric full-bleed hero, a selected-series triptych, and a dark scroll-reveal statement.",
  archetype: "editorial",
  tree: editorialTree,
  dataSources,
};
