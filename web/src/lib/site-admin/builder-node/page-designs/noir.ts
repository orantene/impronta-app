import type { BuilderNode } from "../types";
import { pageDesignPhoto } from "./photos";
import type { BuilderNodeRenderDataSources } from "../render";
import type { PageDesign } from "./types";
import { FRAUNCES, INTER } from "./tokens";

/**
 * ARCHETYPE 7 — Studio noir (dark, dramatic).
 *
 * The dark counterpart to the light "Creative studio": a near-black canvas, a
 * huge Fraunces statement set in bone, a single warm-gold accent, a full-bleed
 * cinematic band, and a contact-sheet work grid that glows against the ink. It
 * gives the picker a deliberate light↔dark pair so a tenant can pick a mood, not
 * just a layout. Distinct from the production agency (Playfair masthead, credits
 * + a pricing table) — this is moodier, image-led, and type-minimal: ink + gold,
 * Fraunces over Inter, fewer words at a bigger scale.
 *
 * Exercises the stack: Fraunces + Inter registry faces, REAL photography, a P3
 * repeater (bound to `noir_work`, hover lift), a rich_text statement with an
 * {accent} gold run + a safe inline link, a scroll entrance on the work grid,
 * hover/transition on CTAs, and a responsive grid that collapses on mobile.
 */

const INK = "#100f0d";
const PANEL = "#17140f";
const BONE = "#efe7d9";
const MUTED = "rgba(239,231,217,0.62)";
const GOLD = "#cda349";
const LINE = "rgba(239,231,217,0.12)";

const dataSources: BuilderNodeRenderDataSources = {
  collections: {
    noir_work: [
      { id: "n1", imageUrl: pageDesignPhoto("vocalistPortrait"), title: "Nocturne", tag: "Film + Sound" },
      { id: "n2", imageUrl: pageDesignPhoto("directorPortrait"), title: "The Edit", tag: "Art Direction" },
      { id: "n3", imageUrl: pageDesignPhoto("studioScene"), title: "On Set", tag: "Campaign" },
    ],
  },
};

const noirTree: BuilderNode[] = [
  {
    id: "noir-page",
    kind: "container",
    props: {
      layout: "stack",
      style: { width: "100%", maxWidthFree: "100%", gap: "0px", backgroundColor: INK },
    },
    children: [
      // ── Hero (ink, gold accent) ───────────────────────────────────────────
      {
        id: "noir-hero",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            minHeight: "780px",
            paddingTop: "26px",
            paddingRight: "44px",
            paddingBottom: "96px",
            paddingLeft: "44px",
            gap: "24px",
            backgroundColor: INK,
            backgroundImage:
              "radial-gradient(76% 54% at 50% 0%, rgba(205,163,73,0.13), rgba(205,163,73,0) 58%), linear-gradient(180deg,#15120d 0%,#0d0c0a 100%)",
            textColor: BONE,
            responsive: { mobile: { paddingRight: "22px", paddingLeft: "22px", paddingBottom: "64px" } },
          },
        },
        children: [
          {
            id: "noir-nav",
            kind: "container",
            props: {
              layout: "row",
              align: "center",
              style: {
                width: "100%",
                maxWidthFree: "1240px",
                justifyContent: "space-between",
                gap: "18px",
                marginBottomFree: "92px",
                responsive: { mobile: { marginBottomFree: "56px" } },
              },
            },
            children: [
              { id: "noir-brand", kind: "paragraph", props: { text: "STUDIO NOIR", style: { fontFamily: INTER, fontSize: "13px", fontWeight: 700, letterSpacing: "0.26em", textColor: BONE } } },
              { id: "noir-nav-links", kind: "paragraph", props: { text: "Work · Studio · Contact", style: { align: "right", fontFamily: INTER, fontSize: "12px", fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", textColor: MUTED, responsive: { mobile: { visibility: "hidden" } } } } },
            ],
          },
          {
            id: "noir-eyebrow",
            kind: "paragraph",
            props: {
              text: "Creative direction · since 2019",
              style: { align: "center", fontFamily: INTER, fontSize: "12px", fontWeight: 700, letterSpacing: "0.3em", textTransform: "uppercase", textColor: GOLD },
            },
          },
          {
            id: "noir-headline",
            kind: "heading",
            props: {
              text: "We make the things people remember.",
              level: 1,
              style: {
                align: "center",
                fontFamily: FRAUNCES,
                fontSize: "96px",
                lineHeight: "0.96",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                textColor: BONE,
                maxWidthFree: "1120px",
                textWrap: "balance",
                marginBottomFree: "0px",
                responsive: { tablet: { fontSize: "68px" }, mobile: { fontSize: "42px" } },
              },
            },
          },
          {
            id: "noir-sub",
            kind: "rich_text",
            props: {
              text: "A studio for brands with {accent}nerve{/accent}, film, photography, and identity, directed and finished in-house. [See the work](/work).",
              style: { fontFamily: INTER, fontSize: "19px", lineHeight: "1.6", textColor: MUTED, maxWidthFree: "600px", align: "center" },
            },
          },
          {
            id: "noir-hero-cta",
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
                marginTopFree: "12px",
                backgroundColor: GOLD,
                textColor: "#1a1407",
                borderColor: GOLD,
                borderWidth: "1px",
                borderStyle: "solid",
                transitionProperty: "background-color, transform, box-shadow",
                transitionDuration: "220ms",
                transitionTimingFunction: "ease",
                hover: { backgroundColor: "#e0b85a", scale: "1.04", boxShadow: "0 16px 40px rgba(205,163,73,0.32)" },
              },
            },
          },
        ],
      },
      // ── Full-bleed cinematic band ─────────────────────────────────────────
      {
        id: "noir-cinematic",
        kind: "image",
        props: {
          src: pageDesignPhoto("studioScene"),
          alt: "A studio crew at work across a loft set",
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
      // ── Selected work (P3 repeater, ink) ──────────────────────────────────
      {
        id: "noir-work",
        kind: "container",
        props: {
          layout: "stack",
          style: {
            width: "100%",
            maxWidthFree: "1240px",
            gap: "26px",
            paddingTop: "100px",
            paddingRight: "44px",
            paddingBottom: "100px",
            paddingLeft: "44px",
            animationPreset: "rise",
            animationTrigger: "scroll",
            animationDuration: "1s",
            responsive: { mobile: { paddingRight: "22px", paddingLeft: "22px", paddingTop: "68px", paddingBottom: "68px" } },
          },
        },
        children: [
          {
            id: "noir-work-head",
            kind: "container",
            props: {
              layout: "row",
              align: "end",
              responsive: { mobile: { layout: "stack", align: "start" } },
              style: { width: "100%", maxWidthFree: "100%", justifyContent: "space-between", gap: "12px" },
            },
            children: [
              { id: "noir-work-title", kind: "heading", props: { text: "Selected work", level: 2, style: { fontFamily: FRAUNCES, fontSize: "46px", fontWeight: 600, letterSpacing: "-0.01em", textColor: BONE, marginBottomFree: "0px", responsive: { mobile: { fontSize: "32px" } } } } },
              { id: "noir-work-note", kind: "paragraph", props: { text: "2024-2026", style: { fontFamily: INTER, fontSize: "13px", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", textColor: GOLD } } },
            ],
          },
          {
            id: "noir-work-rule",
            kind: "divider",
            props: { style: { backgroundColor: "rgba(205,163,73,0.5)", height: "1px", marginTopFree: "2px", marginBottomFree: "6px" } },
          },
          {
            id: "noir-work-grid",
            kind: "container",
            props: {
              layout: "grid",
              columns: 3,
              gap: "m",
              dataBinding: { sourceKey: "noir_work", mode: "bound", repeat: true, maxItems: 6 },
              style: {
                width: "100%",
                maxWidthFree: "100%",
                gap: "22px",
                responsive: { tablet: { gridTemplateColumns: "repeat(2,minmax(0,1fr))" } },
              },
            },
            children: [
              {
                id: "noir-work-card",
                kind: "container",
                props: {
                  layout: "stack",
                  style: {
                    gap: "12px",
                    containerType: "inline-size",
                    containerName: "noir-work-card",
                    transitionProperty: "translate",
                    transitionDuration: "240ms",
                    transitionTimingFunction: "ease",
                    hover: { translate: "0 -6px" },
                  },
                },
                children: [
                  {
                    id: "noir-work-image",
                    kind: "image",
                    props: {
                      src: pageDesignPhoto("studioScene"),
                      alt: "Selected work",
                      fieldBindings: { src: "imageUrl", alt: "title" },
                      style: {
                        width: "100%",
                        aspectRatio: "4:3",
                        objectFit: "cover",
                        objectPosition: "center",
                        borderRadius: "10px",
                        boxShadow: "0 18px 50px rgba(0,0,0,0.5)",
                      },
                    },
                  },
                  {
                    id: "noir-work-card-title",
                    kind: "heading",
                    props: {
                      text: "{{title}}",
                      level: 3,
                      fieldBindings: { text: "title" },
                      style: { fontFamily: FRAUNCES, fontSize: "23px", fontWeight: 600, lineHeight: "1.1", textColor: BONE, marginBottomFree: "0px", containerQueries: { mobile: { fontSize: "20px" } } },
                    },
                  },
                  {
                    id: "noir-work-card-tag",
                    kind: "paragraph",
                    props: {
                      text: "{{tag}}",
                      fieldBindings: { text: "tag" },
                      style: { fontFamily: INTER, fontSize: "13px", letterSpacing: "0.04em", textColor: GOLD },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      // ── Statement band (lifted panel + gold seam) ─────────────────────────
      {
        id: "noir-statement",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            gap: "18px",
            paddingTop: "108px",
            paddingRight: "28px",
            paddingBottom: "108px",
            paddingLeft: "28px",
            backgroundColor: PANEL,
            backgroundImage: "radial-gradient(70% 60% at 50% 0%, rgba(205,163,73,0.10), rgba(205,163,73,0) 60%), linear-gradient(180deg,#1a160f 0%,#120f0b 100%)",
            borderColor: "rgba(205,163,73,0.34)",
            borderWidth: "1px 0px 0px 0px",
            borderStyle: "solid",
            textColor: BONE,
          },
        },
        children: [
          {
            id: "noir-statement-text",
            kind: "rich_text",
            props: {
              text: "We don't do safe. We make work that earns {accent}a second look{/accent}, and a third.",
              style: { fontFamily: FRAUNCES, fontSize: "52px", lineHeight: "1.08", fontWeight: 600, letterSpacing: "-0.02em", textColor: BONE, maxWidthFree: "1000px", align: "center", responsive: { mobile: { fontSize: "32px" } } },
            },
          },
          {
            id: "noir-statement-by",
            kind: "paragraph",
            props: {
              text: "The studio, on the record",
              style: { align: "center", fontFamily: INTER, fontSize: "12px", fontWeight: 700, letterSpacing: "0.26em", textTransform: "uppercase", textColor: GOLD },
            },
          },
        ],
      },
      // ── Contact CTA (ink) ─────────────────────────────────────────────────
      {
        id: "noir-cta",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            gap: "16px",
            paddingTop: "108px",
            paddingRight: "28px",
            paddingBottom: "108px",
            paddingLeft: "28px",
            backgroundColor: INK,
            textColor: BONE,
          },
        },
        children: [
          {
            id: "noir-cta-heading",
            kind: "heading",
            props: {
              text: "Let's make something unforgettable.",
              level: 2,
              style: { align: "center", fontFamily: FRAUNCES, fontSize: "64px", fontWeight: 600, letterSpacing: "-0.02em", textColor: BONE, maxWidthFree: "960px", textWrap: "balance", marginBottomFree: "4px", responsive: { mobile: { fontSize: "38px" } } },
            },
          },
          {
            id: "noir-cta-sub",
            kind: "paragraph",
            props: {
              text: "Tell us what you're working on. We reply within a day.",
              style: { align: "center", fontFamily: INTER, fontSize: "18px", lineHeight: "1.6", textColor: MUTED, maxWidthFree: "520px" },
            },
          },
          {
            id: "noir-cta-button",
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
                backgroundColor: GOLD,
                textColor: "#1a1407",
                borderColor: GOLD,
                borderWidth: "1px",
                borderStyle: "solid",
                transitionProperty: "background-color, transform, box-shadow",
                transitionDuration: "220ms",
                transitionTimingFunction: "ease",
                hover: { backgroundColor: "#e0b85a", scale: "1.04", boxShadow: "0 16px 40px rgba(205,163,73,0.32)" },
              },
            },
          },
        ],
      },
      // ── Footer (ink) ──────────────────────────────────────────────────────
      {
        id: "noir-footer",
        kind: "container",
        props: {
          layout: "row",
          align: "center",
          responsive: { mobile: { layout: "stack", align: "start" } },
          style: {
            width: "100%",
            maxWidthFree: "1240px",
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
          { id: "noir-footer-brand", kind: "paragraph", props: { text: "Studio Noir", style: { fontFamily: FRAUNCES, fontSize: "18px", textColor: BONE } } },
          { id: "noir-footer-copy", kind: "paragraph", props: { text: "Film · Photography · Art direction, Mexico City", style: { align: "right", fontFamily: INTER, fontSize: "14px", textColor: MUTED, responsive: { mobile: { align: "left" } } } } },
        ],
      },
    ],
  },
];

export const noirDesign: PageDesign = {
  id: "noir",
  title: "Studio noir",
  label: "Studio noir",
  description:
    "A dark, dramatic creative studio: a near-black canvas with a warm-gold accent, a huge Fraunces statement hero, a cinematic band, a glowing work grid, and a bold on-the-record statement.",
  archetype: "noir",
  tree: noirTree,
  dataSources,
};
