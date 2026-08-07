import type { BuilderNode } from "../types";
import { pageDesignPhoto } from "./photos";
import type { BuilderNodeRenderDataSources } from "../render";
import type { PageDesign } from "./types";
import { FRAUNCES, INTER } from "./tokens";

/**
 * ARCHETYPE 6 — Creative studio (light).
 *
 * Reference intent: a warm, type-forward studio / personal-brand site — a
 * generous cream canvas, a big Fraunces statement headline (NO dark masthead), a
 * wide signature band, a three-up "what we make" grid on faint cards, a P3
 * REPEATER "selected work" contact sheet, a single clay quote band, and a calm
 * contact CTA. Deliberately distinct from the production agency (near-black
 * masthead, credits + pricing) and the editorial portfolio (single artist,
 * asymmetric split): airy bone with ONE clay accent, Fraunces over Inter, and a
 * lot of whitespace — the "less is better" end of the template range.
 *
 * Exercises the stack: Fraunces + Inter registry faces, REAL photography, a P3
 * repeater (bound to `studio_work` with field bindings + a hover lift), a
 * rich_text manifesto with an {accent} run + a safe inline link, a scroll
 * entrance on the work grid, hover/transition on CTAs, and a responsive grid
 * that collapses to one column on mobile.
 */

const CREAM = "#f6f1e9";
const PAPER = "#fbf8f2";
const INK = "#221d17";
const MUTED = "#6f6557";
const CLAY = "#b15a37";
const LINE = "rgba(34,29,23,0.10)";

const dataSources: BuilderNodeRenderDataSources = {
  collections: {
    studio_work: [
      { id: "s1", imageUrl: pageDesignPhoto("studioDesk"), title: "Casa Muna", tag: "Brand + Web" },
      { id: "s2", imageUrl: pageDesignPhoto("directorPortrait"), title: "Atelier North", tag: "Art Direction" },
      { id: "s3", imageUrl: pageDesignPhoto("serviceProsScene"), title: "Field Notes", tag: "Campaign" },
    ],
  },
};

const studioTree: BuilderNode[] = [
  {
    id: "studio-page",
    kind: "container",
    props: {
      layout: "stack",
      style: { width: "100%", maxWidthFree: "100%", gap: "0px", backgroundColor: CREAM },
    },
    children: [
      // ── Hero (cream, type-forward) ────────────────────────────────────────
      {
        id: "studio-hero",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            paddingTop: "26px",
            paddingRight: "44px",
            paddingBottom: "84px",
            paddingLeft: "44px",
            gap: "22px",
            backgroundColor: CREAM,
            textColor: INK,
            responsive: { mobile: { paddingRight: "22px", paddingLeft: "22px", paddingBottom: "56px" } },
          },
        },
        children: [
          {
            id: "studio-nav",
            kind: "container",
            props: {
              layout: "row",
              align: "center",
              style: {
                width: "100%",
                maxWidthFree: "1200px",
                justifyContent: "space-between",
                gap: "18px",
                marginBottomFree: "84px",
                responsive: { mobile: { marginBottomFree: "52px" } },
              },
            },
            children: [
              {
                id: "studio-brand",
                kind: "paragraph",
                props: {
                  text: "ATELIER SOL",
                  style: { fontFamily: INTER, fontSize: "13px", fontWeight: 700, letterSpacing: "0.22em", textColor: INK },
                },
              },
              {
                id: "studio-nav-links",
                kind: "paragraph",
                props: {
                  text: "Work · Studio · Contact",
                  style: {
                    align: "right",
                    fontFamily: INTER,
                    fontSize: "12px",
                    fontWeight: 600,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    textColor: MUTED,
                    responsive: { mobile: { visibility: "hidden" } },
                  },
                },
              },
            ],
          },
          {
            id: "studio-eyebrow",
            kind: "paragraph",
            props: {
              text: "Independent creative studio",
              style: {
                align: "center",
                fontFamily: INTER,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                textColor: CLAY,
              },
            },
          },
          {
            id: "studio-headline",
            kind: "heading",
            props: {
              text: "Design that feels inevitable.",
              level: 1,
              style: {
                align: "center",
                fontFamily: FRAUNCES,
                fontSize: "92px",
                lineHeight: "0.98",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                textColor: INK,
                maxWidthFree: "1040px",
                textWrap: "balance",
                marginBottomFree: "0px",
                responsive: { tablet: { fontSize: "66px" }, mobile: { fontSize: "42px" } },
              },
            },
          },
          {
            id: "studio-manifesto",
            kind: "rich_text",
            props: {
              text: "A small studio for brands that want {accent}fewer, better things{/accent}. Strategy, identity, and websites, made with care and shipped end to end. [See selected work](/work).",
              style: {
                fontFamily: INTER,
                fontSize: "19px",
                lineHeight: "1.62",
                textColor: MUTED,
                maxWidthFree: "600px",
                align: "center",
              },
            },
          },
          {
            id: "studio-hero-cta",
            kind: "button",
            props: {
              label: "Start a project",
              href: "/start",
              tone: "primary",
              style: {
                fontFamily: INTER,
                fontSize: "14px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                marginTopFree: "10px",
                backgroundColor: CLAY,
                textColor: "#fbf6ef",
                borderColor: CLAY,
                borderWidth: "1px",
                borderStyle: "solid",
                transitionProperty: "background-color, transform, box-shadow",
                transitionDuration: "220ms",
                transitionTimingFunction: "ease",
                hover: { backgroundColor: "#9c4b2b", scale: "1.04", boxShadow: "0 16px 36px rgba(177,90,55,0.34)" },
              },
            },
          },
        ],
      },
      // ── Signature band ────────────────────────────────────────────────────
      {
        id: "studio-signature",
        kind: "image",
        props: {
          src: pageDesignPhoto("studioDesk"),
          alt: "Three creatives reviewing prints and a laptop at a studio desk",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            aspectRatioFree: "2.5",
            objectFit: "cover",
            objectPosition: "center",
            borderRadius: "0px",
            responsive: { mobile: { aspectRatioFree: "1.4" } },
          },
        },
      },
      // ── What we make (3-up faint cards) ───────────────────────────────────
      {
        id: "studio-make",
        kind: "container",
        props: {
          layout: "stack",
          style: {
            width: "100%",
            maxWidthFree: "1200px",
            gap: "30px",
            paddingTop: "100px",
            paddingRight: "44px",
            paddingBottom: "40px",
            paddingLeft: "44px",
            responsive: { mobile: { paddingRight: "22px", paddingLeft: "22px", paddingTop: "68px" } },
          },
        },
        children: [
          {
            id: "studio-make-eyebrow",
            kind: "paragraph",
            props: {
              text: "What we make",
              style: { fontFamily: INTER, fontSize: "12px", fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", textColor: CLAY },
            },
          },
          {
            id: "studio-make-heading",
            kind: "heading",
            props: {
              text: "A few things, done properly.",
              level: 2,
              style: { fontFamily: FRAUNCES, fontSize: "46px", fontWeight: 600, letterSpacing: "-0.01em", textColor: INK, maxWidthFree: "760px", marginBottomFree: "8px", responsive: { mobile: { fontSize: "32px" } } },
            },
          },
          {
            id: "studio-make-grid",
            kind: "container",
            props: {
              layout: "grid",
              columns: 3,
              gap: "m",
              style: {
                width: "100%",
                maxWidthFree: "100%",
                gap: "20px",
                responsive: { tablet: { gridTemplateColumns: "repeat(2,minmax(0,1fr))" } },
              },
            },
            children: [
              {
                id: "studio-make-card-1",
                kind: "container",
                props: {
                  layout: "stack",
                  style: {
                    gap: "10px",
                    paddingTop: "26px",
                    paddingRight: "24px",
                    paddingBottom: "28px",
                    paddingLeft: "24px",
                    backgroundColor: PAPER,
                    borderColor: LINE,
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderRadius: "14px",
                  },
                },
                children: [
                  { id: "studio-make-1-n", kind: "paragraph", props: { text: "01", style: { fontFamily: FRAUNCES, fontSize: "22px", fontWeight: 600, textColor: CLAY } } },
                  { id: "studio-make-1-t", kind: "heading", props: { text: "Brand systems", level: 3, style: { fontFamily: FRAUNCES, fontSize: "24px", fontWeight: 600, textColor: INK, marginBottomFree: "0px" } } },
                  { id: "studio-make-1-b", kind: "paragraph", props: { text: "Identity, voice, and the rules that keep it whole as you grow.", style: { fontFamily: INTER, fontSize: "15px", lineHeight: "1.6", textColor: MUTED } } },
                ],
              },
              {
                id: "studio-make-card-2",
                kind: "container",
                props: {
                  layout: "stack",
                  style: {
                    gap: "10px",
                    paddingTop: "26px",
                    paddingRight: "24px",
                    paddingBottom: "28px",
                    paddingLeft: "24px",
                    backgroundColor: PAPER,
                    borderColor: LINE,
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderRadius: "14px",
                  },
                },
                children: [
                  { id: "studio-make-2-n", kind: "paragraph", props: { text: "02", style: { fontFamily: FRAUNCES, fontSize: "22px", fontWeight: 600, textColor: CLAY } } },
                  { id: "studio-make-2-t", kind: "heading", props: { text: "Websites", level: 3, style: { fontFamily: FRAUNCES, fontSize: "24px", fontWeight: 600, textColor: INK, marginBottomFree: "0px" } } },
                  { id: "studio-make-2-b", kind: "paragraph", props: { text: "Fast, editorial sites you can edit yourself, built to last.", style: { fontFamily: INTER, fontSize: "15px", lineHeight: "1.6", textColor: MUTED } } },
                ],
              },
              {
                id: "studio-make-card-3",
                kind: "container",
                props: {
                  layout: "stack",
                  style: {
                    gap: "10px",
                    paddingTop: "26px",
                    paddingRight: "24px",
                    paddingBottom: "28px",
                    paddingLeft: "24px",
                    backgroundColor: PAPER,
                    borderColor: LINE,
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderRadius: "14px",
                  },
                },
                children: [
                  { id: "studio-make-3-n", kind: "paragraph", props: { text: "03", style: { fontFamily: FRAUNCES, fontSize: "22px", fontWeight: 600, textColor: CLAY } } },
                  { id: "studio-make-3-t", kind: "heading", props: { text: "Art direction", level: 3, style: { fontFamily: FRAUNCES, fontSize: "24px", fontWeight: 600, textColor: INK, marginBottomFree: "0px" } } },
                  { id: "studio-make-3-b", kind: "paragraph", props: { text: "Photography and campaigns that look like no one else's.", style: { fontFamily: INTER, fontSize: "15px", lineHeight: "1.6", textColor: MUTED } } },
                ],
              },
            ],
          },
        ],
      },
      // ── Selected work (P3 repeater) ───────────────────────────────────────
      {
        id: "studio-work",
        kind: "container",
        props: {
          layout: "stack",
          style: {
            width: "100%",
            maxWidthFree: "1200px",
            gap: "26px",
            paddingTop: "60px",
            paddingRight: "44px",
            paddingBottom: "100px",
            paddingLeft: "44px",
            animationPreset: "rise",
            animationTrigger: "scroll",
            animationDuration: "1s",
            responsive: { mobile: { paddingRight: "22px", paddingLeft: "22px", paddingBottom: "68px" } },
          },
        },
        children: [
          {
            id: "studio-work-head",
            kind: "container",
            props: {
              layout: "row",
              align: "end",
              responsive: { mobile: { layout: "stack", align: "start" } },
              style: { width: "100%", maxWidthFree: "100%", justifyContent: "space-between", gap: "12px" },
            },
            children: [
              { id: "studio-work-title", kind: "heading", props: { text: "Selected work", level: 2, style: { fontFamily: FRAUNCES, fontSize: "44px", fontWeight: 600, letterSpacing: "-0.01em", textColor: INK, marginBottomFree: "0px", responsive: { mobile: { fontSize: "32px" } } } } },
              { id: "studio-work-note", kind: "paragraph", props: { text: "2024 to 2026", style: { fontFamily: INTER, fontSize: "13px", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", textColor: MUTED } } },
            ],
          },
          {
            id: "studio-work-rule",
            kind: "divider",
            props: { style: { backgroundColor: "rgba(177,90,55,0.5)", height: "1px", marginTopFree: "2px", marginBottomFree: "6px" } },
          },
          {
            id: "studio-work-grid",
            kind: "container",
            props: {
              layout: "grid",
              columns: 3,
              gap: "m",
              dataBinding: { sourceKey: "studio_work", mode: "bound", repeat: true, maxItems: 6 },
              style: {
                width: "100%",
                maxWidthFree: "100%",
                gap: "22px",
                responsive: { tablet: { gridTemplateColumns: "repeat(2,minmax(0,1fr))" } },
              },
            },
            children: [
              {
                id: "studio-work-card",
                kind: "container",
                props: {
                  layout: "stack",
                  style: {
                    gap: "12px",
                    containerType: "inline-size",
                    containerName: "studio-work-card",
                    transitionProperty: "translate",
                    transitionDuration: "240ms",
                    transitionTimingFunction: "ease",
                    hover: { translate: "0 -6px" },
                  },
                },
                children: [
                  {
                    id: "studio-work-image",
                    kind: "image",
                    props: {
                      src: pageDesignPhoto("studioDesk"),
                      alt: "Selected work",
                      fieldBindings: { src: "imageUrl", alt: "title" },
                      style: {
                        width: "100%",
                        aspectRatio: "4:3",
                        objectFit: "cover",
                        objectPosition: "center",
                        borderRadius: "12px",
                        boxShadow: "0 16px 44px rgba(34,29,23,0.14)",
                      },
                    },
                  },
                  {
                    id: "studio-work-card-title",
                    kind: "heading",
                    props: {
                      text: "{{title}}",
                      level: 3,
                      fieldBindings: { text: "title" },
                      style: { fontFamily: FRAUNCES, fontSize: "23px", fontWeight: 600, lineHeight: "1.1", textColor: INK, marginBottomFree: "0px", containerQueries: { mobile: { fontSize: "20px" } } },
                    },
                  },
                  {
                    id: "studio-work-card-tag",
                    kind: "paragraph",
                    props: {
                      text: "{{tag}}",
                      fieldBindings: { text: "tag" },
                      style: { fontFamily: INTER, fontSize: "13px", letterSpacing: "0.04em", textColor: MUTED },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      // ── Quote band (clay) ─────────────────────────────────────────────────
      {
        id: "studio-quote",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            gap: "18px",
            paddingTop: "104px",
            paddingRight: "28px",
            paddingBottom: "104px",
            paddingLeft: "28px",
            backgroundColor: CLAY,
            backgroundImage: "radial-gradient(80% 60% at 50% 0%, rgba(255,255,255,0.10), rgba(255,255,255,0) 60%), linear-gradient(180deg,#b66039 0%,#a4502d 100%)",
            textColor: "#fbf2ea",
          },
        },
        children: [
          {
            id: "studio-quote-text",
            kind: "rich_text",
            props: {
              text: "“They made us look like {accent}the studio we always wanted to be{/accent}, and made the whole thing feel easy.”",
              style: { fontFamily: FRAUNCES, fontSize: "40px", lineHeight: "1.2", fontWeight: 600, letterSpacing: "-0.01em", textColor: "#fdf6f0", maxWidthFree: "920px", align: "center", responsive: { mobile: { fontSize: "27px" } } },
            },
          },
          {
            id: "studio-quote-by",
            kind: "paragraph",
            props: {
              text: "Mara Quintero · Founder, Casa Muna",
              style: { align: "center", fontFamily: INTER, fontSize: "13px", fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", textColor: "rgba(251,242,234,0.78)" },
            },
          },
        ],
      },
      // ── Contact CTA (cream) ───────────────────────────────────────────────
      {
        id: "studio-cta",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            gap: "16px",
            paddingTop: "104px",
            paddingRight: "28px",
            paddingBottom: "104px",
            paddingLeft: "28px",
            backgroundColor: CREAM,
            textColor: INK,
          },
        },
        children: [
          {
            id: "studio-cta-heading",
            kind: "heading",
            props: {
              text: "Let's make something good.",
              level: 2,
              style: { align: "center", fontFamily: FRAUNCES, fontSize: "62px", fontWeight: 600, letterSpacing: "-0.02em", textColor: INK, maxWidthFree: "900px", textWrap: "balance", marginBottomFree: "4px", responsive: { mobile: { fontSize: "38px" } } },
            },
          },
          {
            id: "studio-cta-sub",
            kind: "paragraph",
            props: {
              text: "Tell us what you're working on. We reply within a day.",
              style: { align: "center", fontFamily: INTER, fontSize: "18px", lineHeight: "1.6", textColor: MUTED, maxWidthFree: "520px" },
            },
          },
          {
            id: "studio-cta-button",
            kind: "button",
            props: {
              label: "Say hello",
              href: "/contact",
              tone: "primary",
              style: {
                fontFamily: INTER,
                fontSize: "14px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                marginTopFree: "8px",
                backgroundColor: INK,
                textColor: CREAM,
                borderColor: INK,
                borderWidth: "1px",
                borderStyle: "solid",
                transitionProperty: "background-color, transform, box-shadow",
                transitionDuration: "220ms",
                transitionTimingFunction: "ease",
                hover: { backgroundColor: "#3a3128", scale: "1.04", boxShadow: "0 16px 36px rgba(34,29,23,0.28)" },
              },
            },
          },
        ],
      },
      // ── Footer (cream) ────────────────────────────────────────────────────
      {
        id: "studio-footer",
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
            paddingRight: "44px",
            paddingBottom: "48px",
            paddingLeft: "44px",
            gap: "14px",
            borderColor: LINE,
            borderWidth: "1px 0px 0px 0px",
            borderStyle: "solid",
          },
        },
        children: [
          { id: "studio-footer-brand", kind: "paragraph", props: { text: "Atelier Sol", style: { fontFamily: FRAUNCES, fontSize: "18px", textColor: INK } } },
          { id: "studio-footer-copy", kind: "paragraph", props: { text: "Brand · Web · Art direction, Mexico City", style: { align: "right", fontFamily: INTER, fontSize: "14px", textColor: MUTED, responsive: { mobile: { align: "left" } } } } },
        ],
      },
    ],
  },
];

export const studioDesign: PageDesign = {
  id: "studio",
  title: "Creative studio",
  label: "Creative studio",
  description:
    "A warm, light studio brand: a Fraunces statement hero, a what-we-make trio, a selected-work grid, a clay quote, and a calm contact call-to-action.",
  archetype: "studio",
  tree: studioTree,
  dataSources,
};
