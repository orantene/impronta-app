import type { BuilderNode } from "../types";
import { pageDesignPhoto } from "./photos";
import type { BuilderNodeRenderDataSources } from "../render";
import type { PageDesign } from "./types";
import { BRICOLAGE, MANROPE } from "./tokens";

/**
 * ARCHETYPE 5 — Hospitality / live-event (a music + sessions festival).
 *
 * Reference intent: the homepage of a contemporary live festival — a full-bleed
 * cinematic hero photograph under a dark warm scrim, a characterful BRICOLAGE
 * GROTESQUE poster display over a clean MANROPE body, a full-bleed cinematic
 * band, a portrait lineup grid that scroll-reveals into place, a programme note
 * with a link + a detail row, and a pass-tier pricing table. Warm aubergine/
 * charcoal canvas with a hot coral accent — high-energy and distinct from the
 * cold near-black SaaS page and the ink/bone creative studio.
 *
 * Genuinely distinct from the other four archetypes: editorial is a quiet
 * portfolio, saas is a dark product UI, agency is a studio contact sheet, the
 * store is a light retail surface — this is an EVENT marketing page (full-bleed
 * cinematic hero, dated headline, a performer lineup, pass tiers, a venue note),
 * an idiom none of the others touch, on a font pairing none of them use.
 *
 * Exercises the P1–P3 stack: Bricolage Grotesque + Manrope registry faces (the
 * GOOGLE-source path of the font bridge — proven loaded by the capture font
 * self-check, no system fallback), REAL photography throughout (a full-bleed
 * backgroundImage hero + a cinematic band + a portrait lineup), a P3 REPEATER
 * for the lineup (bound to `festival_lineup` with field bindings + per-slot
 * container queries + a hover-lift), a rich_text programme note with an {accent}
 * run and a safe inline link, a P2 pricing_table for pass tiers, the `nav` node
 * (desktop inline links + mobile hamburger), a scroll-reveal on the lineup
 * (proven by the `reveal` motion frame), a lineup-card hover-lift (proven by the
 * `hover` frame), and a responsive layout that collapses to a single column.
 */

const PHOTO = {
  hero: pageDesignPhoto("studioScene"),
  cinematic: pageDesignPhoto("serviceProsScene"),
  pA: pageDesignPhoto("vocalistPortrait"),
  pB: pageDesignPhoto("directorPortrait"),
  pC: pageDesignPhoto("serviceProsScene"),
  pD: pageDesignPhoto("studioDesk"),
};

const dataSources: BuilderNodeRenderDataSources = {
  collections: {
    festival_lineup: [
      { id: "a1", imageUrl: PHOTO.pA, name: "Mara Lune", discipline: "Live vocals", slot: "Fri · Patio Stage" },
      { id: "a2", imageUrl: PHOTO.pB, name: "Sol Vega", discipline: "Direction + AV", slot: "Sat · The Hall" },
      { id: "a3", imageUrl: PHOTO.pC, name: "Casa Muna", discipline: "Ensemble", slot: "Sat · Garden" },
      { id: "a4", imageUrl: PHOTO.pD, name: "Studio North", discipline: "Late session", slot: "Sun · Basement" },
    ],
  },
};

const CANVAS = "#181016";
const BAND = "#211521";
const CREAM = "#f6efe6";
const MUTE = "rgba(246,239,230,0.72)";
const CORAL = "#ff6a3d";
const HAIR = "rgba(246,239,230,0.16)";

/** An image-free detail stat (kept image-free so the note band can sit deep on
 *  a tall mobile page without tripping the harness lazy-image decode wait). */
function detailStat(id: string, value: string, label: string): BuilderNode {
  return {
    id,
    kind: "container",
    props: { layout: "stack", style: { gap: "6px", responsive: { mobile: { align: "center" } } } },
    children: [
      {
        id: `${id}-value`,
        kind: "heading",
        props: {
          text: value,
          level: 3,
          style: { fontFamily: BRICOLAGE, fontSize: "26px", fontWeight: 700, letterSpacing: "-0.01em", textColor: CORAL, marginBottomFree: "0px" },
        },
      },
      {
        id: `${id}-label`,
        kind: "paragraph",
        props: {
          text: label,
          style: { fontFamily: MANROPE, fontSize: "14px", fontWeight: 500, textColor: MUTE, responsive: { mobile: { align: "center" } } },
        },
      },
    ],
  };
}

const festivalTree: BuilderNode[] = [
  {
    id: "festival-page",
    kind: "container",
    props: {
      layout: "stack",
      style: { width: "100%", maxWidthFree: "100%", gap: "0px", backgroundColor: CANVAS, textColor: CREAM },
    },
    children: [
      // ── Full-bleed cinematic hero (backgroundImage + dark scrim) ────────────
      {
        id: "festival-hero",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            minHeight: "880px",
            paddingTop: "26px",
            paddingRight: "40px",
            paddingBottom: "84px",
            paddingLeft: "40px",
            gap: "0px",
            backgroundColor: CANVAS,
            backgroundImage:
              "linear-gradient(180deg, rgba(24,16,22,0.46) 0%, rgba(24,16,22,0.64) 52%, rgba(24,16,22,0.92) 100%), url('" +
              PHOTO.hero +
              "')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            textColor: CREAM,
            responsive: { mobile: { paddingRight: "20px", paddingLeft: "20px", minHeight: "720px", paddingBottom: "56px" } },
          },
        },
        children: [
          // Nav node (desktop inline + mobile hamburger), overlaid on the hero.
          {
            id: "festival-nav",
            kind: "nav",
            props: {
              brand: "SEÑAL",
              brandHref: "/",
              collapseAt: "mobile",
              menuLabel: "Menu",
              ariaLabel: "Primary",
              links: [
                { id: "n1", label: "Lineup", href: "?inquiry=open" },
                { id: "n2", label: "Schedule", href: "?inquiry=open" },
                { id: "n3", label: "Passes", href: "?inquiry=open" },
                { id: "n4", label: "Venue", href: "?inquiry=open" },
              ],
              style: {
                width: "100%",
                maxWidthFree: "1280px",
                fontFamily: MANROPE,
                fontSize: "13px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textColor: CREAM,
                marginBottomFree: "120px",
                responsive: { mobile: { marginBottomFree: "72px" } },
              },
            },
          },
          {
            id: "festival-hero-eyebrow",
            kind: "paragraph",
            props: {
              text: "Sept 12–14, 2026 · Mexico City",
              style: {
                align: "center",
                fontFamily: MANROPE,
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "0.26em",
                textTransform: "uppercase",
                textColor: CORAL,
              },
            },
          },
          {
            id: "festival-hero-title",
            kind: "heading",
            props: {
              text: "SEÑAL",
              level: 1,
              style: {
                align: "center",
                fontFamily: BRICOLAGE,
                fontSize: "168px",
                lineHeight: "0.9",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                textColor: CREAM,
                marginTopFree: "14px",
                marginBottomFree: "0px",
                textWrap: "balance",
                responsive: { tablet: { fontSize: "120px" }, mobile: { fontSize: "74px" } },
              },
            },
          },
          {
            id: "festival-hero-sub",
            kind: "heading",
            props: {
              text: "A live sessions festival",
              level: 2,
              style: {
                align: "center",
                fontFamily: BRICOLAGE,
                fontSize: "30px",
                lineHeight: "1.1",
                fontWeight: 600,
                letterSpacing: "0em",
                textColor: CREAM,
                marginTopFree: "10px",
                marginBottomFree: "0px",
                responsive: { mobile: { fontSize: "22px" } },
              },
            },
          },
          {
            id: "festival-hero-line",
            kind: "paragraph",
            props: {
              text: "Mara Lune · Sol Vega · Casa Muna · Studio North · + 20 more",
              style: {
                align: "center",
                fontFamily: MANROPE,
                fontSize: "16px",
                fontWeight: 500,
                letterSpacing: "0.02em",
                textColor: MUTE,
                marginTopFree: "20px",
                maxWidthFree: "680px",
              },
            },
          },
          {
            id: "festival-hero-cta",
            kind: "button",
            props: {
              label: "Get passes",
              href: "?inquiry=open",
              tone: "primary",
              style: {
                fontFamily: MANROPE,
                fontSize: "15px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                marginTopFree: "26px",
                backgroundColor: CORAL,
                textColor: "#1a0b06",
                borderColor: CORAL,
                borderWidth: "1px",
                borderStyle: "solid",
                paddingTop: "15px",
                paddingBottom: "15px",
                paddingLeft: "34px",
                paddingRight: "34px",
                transitionProperty: "background-color, transform, box-shadow",
                transitionDuration: "200ms",
                transitionTimingFunction: "ease",
                hover: {
                  backgroundColor: "#ff8358",
                  scale: "1.04",
                  boxShadow: "0 18px 44px rgba(255,106,61,0.46)",
                },
              },
            },
          },
        ],
      },
      // ── Full-bleed cinematic band (kept HIGH so its image loads eagerly at
      //    mobile — deep below-the-fold images never enter the lazy-load range
      //    on a tall 390px page and would hang the harness `img.decode()` wait) ─
      {
        id: "festival-cinematic",
        kind: "image",
        props: {
          src: PHOTO.cinematic,
          alt: "The festival in full swing across the old printworks",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            aspectRatioFree: "2.6",
            objectFit: "cover",
            objectPosition: "center",
            borderRadius: "0px",
            responsive: { mobile: { aspectRatioFree: "1.5" } },
          },
        },
      },
      // ── Lineup (P3 repeater, scroll-reveal + hover-lift cards) ──────────────
      {
        id: "festival-lineup",
        kind: "container",
        props: {
          layout: "stack",
          style: {
            width: "100%",
            maxWidthFree: "1280px",
            gap: "30px",
            paddingTop: "104px",
            paddingRight: "40px",
            paddingBottom: "100px",
            paddingLeft: "40px",
            // Scroll-driven entrance for the lineup — rises into place as it
            // enters the viewport. Captured as festival-1440-reveal so the Motion
            // axis is frame-proven (settled at full opacity/position, not stuck
            // at opacity:0), alongside the lineup-card hover-lift.
            animationPreset: "rise",
            animationTrigger: "scroll",
            animationRepeat: "once",
            animationDuration: "1s",
            responsive: { mobile: { paddingRight: "20px", paddingLeft: "20px", paddingTop: "68px", paddingBottom: "68px" } },
          },
        },
        children: [
          {
            id: "festival-lineup-head",
            kind: "container",
            props: {
              layout: "row",
              align: "end",
              responsive: { mobile: { layout: "stack", align: "start" } },
              style: { width: "100%", maxWidthFree: "100%", justifyContent: "space-between", gap: "12px" },
            },
            children: [
              {
                id: "festival-lineup-title",
                kind: "heading",
                props: {
                  text: "The lineup",
                  level: 2,
                  style: {
                    fontFamily: BRICOLAGE,
                    fontSize: "56px",
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    textColor: CREAM,
                    marginBottomFree: "0px",
                    responsive: { mobile: { fontSize: "38px" } },
                  },
                },
              },
              {
                id: "festival-lineup-note",
                kind: "paragraph",
                props: {
                  text: "Three stages · Three nights",
                  style: {
                    fontFamily: MANROPE,
                    fontSize: "13px",
                    fontWeight: 600,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    textColor: CORAL,
                  },
                },
              },
            ],
          },
          {
            id: "festival-lineup-grid",
            kind: "container",
            props: {
              layout: "grid",
              columns: 4,
              gap: "m",
              responsive: { tablet: { columns: 2 }, mobile: { columns: 1 } },
              dataBinding: { sourceKey: "festival_lineup", mode: "bound", repeat: true, maxItems: 4 },
              style: { width: "100%", maxWidthFree: "100%", gap: "20px" },
            },
            children: [
              {
                id: "festival-lineup-card",
                kind: "container",
                props: {
                  layout: "stack",
                  style: {
                    gap: "12px",
                    containerType: "inline-size",
                    containerName: "lineup-card",
                    // Lineup-card hover-lift — captured as festival-1440-hover so
                    // the Motion axis is proven by a real state change (translate
                    // settles to its hovered end state), alongside the scroll-
                    // reveal. Transitions `translate` so the live lift eases.
                    transitionProperty: "translate",
                    transitionDuration: "240ms",
                    transitionTimingFunction: "ease",
                    hover: { translate: "0 -6px" },
                  },
                },
                children: [
                  {
                    id: "festival-lineup-image",
                    kind: "image",
                    props: {
                      src: PHOTO.pA,
                      alt: "Performer portrait",
                      fieldBindings: { src: "imageUrl", alt: "name" },
                      style: {
                        width: "100%",
                        aspectRatio: "3:4",
                        objectFit: "cover",
                        objectPosition: "center top",
                        borderRadius: "3px",
                        boxShadow: "0 18px 48px rgba(0,0,0,0.42)",
                      },
                    },
                  },
                  {
                    id: "festival-lineup-name",
                    kind: "heading",
                    props: {
                      text: "{{name}}",
                      level: 3,
                      fieldBindings: { text: "name" },
                      style: {
                        fontFamily: BRICOLAGE,
                        fontSize: "24px",
                        fontWeight: 600,
                        lineHeight: "1.05",
                        textColor: CREAM,
                        marginBottomFree: "0px",
                        containerQueries: { mobile: { fontSize: "21px" } },
                      },
                    },
                  },
                  {
                    id: "festival-lineup-discipline",
                    kind: "paragraph",
                    props: {
                      text: "{{discipline}}",
                      fieldBindings: { text: "discipline" },
                      style: {
                        fontFamily: MANROPE,
                        fontSize: "14px",
                        fontWeight: 500,
                        textColor: MUTE,
                        marginBottomFree: "0px",
                      },
                    },
                  },
                  {
                    id: "festival-lineup-slot",
                    kind: "paragraph",
                    props: {
                      text: "{{slot}}",
                      fieldBindings: { text: "slot" },
                      style: {
                        fontFamily: MANROPE,
                        fontSize: "12px",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        textColor: CORAL,
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      // ── Programme note (rich_text + safe link) + detail row ─────────────────
      {
        id: "festival-note-section",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            gap: "44px",
            paddingTop: "92px",
            paddingRight: "40px",
            paddingBottom: "96px",
            paddingLeft: "40px",
            backgroundColor: BAND,
            responsive: { mobile: { paddingRight: "20px", paddingLeft: "20px" } },
          },
        },
        children: [
          {
            id: "festival-note",
            kind: "rich_text",
            props: {
              text: "Three nights of {accent}live sessions{/accent} across an old printworks, intimate sets, late ensembles, and one basement that never quite closes. Doors at 7pm; full set times land two weeks out. Read the [festival guide](/guide) before you go.",
              style: {
                align: "center",
                fontFamily: MANROPE,
                fontSize: "22px",
                lineHeight: "1.6",
                fontWeight: 500,
                textColor: CREAM,
                maxWidthFree: "780px",
              },
            },
          },
          {
            id: "festival-detail-row",
            kind: "container",
            props: {
              layout: "row",
              align: "start",
              responsive: { mobile: { layout: "stack", align: "center" } },
              style: {
                width: "100%",
                maxWidthFree: "900px",
                justifyContent: "space-between",
                gap: "28px",
                paddingTop: "34px",
                borderColor: HAIR,
                borderWidth: "1px",
                borderStyle: "solid",
                borderRadius: "0px",
              },
            },
            children: [
              detailStat("festival-detail-1", "3 stages", "Patio · Hall · Basement"),
              detailStat("festival-detail-2", "20+ acts", "Across three nights"),
              detailStat("festival-detail-3", "Doors 7pm", "Last set past 2am"),
              detailStat("festival-detail-4", "18+", "Bring ID"),
            ],
          },
        ],
      },
      // ── Passes (P2 pricing_table) ───────────────────────────────────────────
      {
        id: "festival-passes-section",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            gap: "12px",
            paddingTop: "92px",
            paddingRight: "40px",
            paddingBottom: "104px",
            paddingLeft: "40px",
            backgroundColor: CANVAS,
            responsive: { mobile: { paddingRight: "20px", paddingLeft: "20px" } },
          },
        },
        children: [
          {
            id: "festival-passes-eyebrow",
            kind: "paragraph",
            props: {
              text: "Passes",
              style: {
                align: "center",
                fontFamily: MANROPE,
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "0.26em",
                textTransform: "uppercase",
                textColor: CORAL,
              },
            },
          },
          {
            id: "festival-passes-heading",
            kind: "heading",
            props: {
              text: "Pick your pass",
              level: 2,
              style: {
                align: "center",
                fontFamily: BRICOLAGE,
                fontSize: "52px",
                fontWeight: 700,
                letterSpacing: "-0.01em",
                textColor: CREAM,
                marginBottomFree: "20px",
                responsive: { mobile: { fontSize: "34px" } },
              },
            },
          },
          {
            id: "festival-passes",
            kind: "pricing_table",
            props: {
              style: { fontFamily: MANROPE, maxWidthFree: "1100px" },
              tiers: [
                {
                  id: "day",
                  name: "Day pass",
                  description: "One night, all stages",
                  price: "$89",
                  period: "/ night",
                  ctaLabel: "Buy day pass",
                  ctaHref: "/passes/day",
                  features: [
                    { label: "Single-night entry", included: true },
                    { label: "All three stages", included: true },
                    { label: "Re-entry", included: true },
                    { label: "Lounge access", included: false },
                  ],
                },
                {
                  id: "festival",
                  name: "Festival",
                  description: "All three nights",
                  price: "$149",
                  period: "/ weekend",
                  ctaLabel: "Buy festival pass",
                  ctaHref: "/passes/festival",
                  highlighted: true,
                  features: [
                    { label: "Three-night entry", included: true },
                    { label: "All three stages", included: true },
                    { label: "Priority lanes", included: true },
                    { label: "Lounge access", included: true },
                  ],
                },
                {
                  id: "patron",
                  name: "Patron",
                  description: "Festival + the extras",
                  price: "$320",
                  period: "/ weekend",
                  ctaLabel: "Become a patron",
                  ctaHref: "/passes/patron",
                  features: [
                    { label: "Everything in Festival", included: true },
                    { label: "Backstage sessions", included: true },
                    { label: "Limited print + tote", included: true },
                    { label: "Named in the programme", included: true },
                  ],
                },
              ],
            },
          },
        ],
      },
      // ── Footer ──────────────────────────────────────────────────────────────
      {
        id: "festival-footer",
        kind: "container",
        props: {
          layout: "row",
          align: "center",
          responsive: { mobile: { layout: "stack", align: "start" } },
          style: {
            width: "100%",
            maxWidthFree: "1280px",
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
            id: "festival-footer-brand",
            kind: "paragraph",
            props: {
              text: "SEÑAL",
              style: { fontFamily: BRICOLAGE, fontSize: "20px", fontWeight: 700, letterSpacing: "0.02em", textColor: CREAM },
            },
          },
          {
            id: "festival-footer-copy",
            kind: "paragraph",
            props: {
              text: "Sept 12–14, 2026 · An old printworks, Mexico City",
              style: {
                align: "right",
                fontFamily: MANROPE,
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

export const festivalDesign: PageDesign = {
  id: "festival",
  title: "Live sessions festival",
  label: "Live event",
  description:
    "A cinematic live-event page: a characterful display masthead, a poster hero, a lineup grid, a set-times schedule, and a ticket call-to-action.",
  archetype: "festival",
  tree: festivalTree,
  dataSources,
};
