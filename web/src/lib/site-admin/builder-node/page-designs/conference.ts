import type { BuilderNode } from "../types";
import { pageDesignPhoto } from "./photos";
import type { BuilderNodeRenderDataSources } from "../render";
import type { PageDesign } from "./types";
import { GEIST, GEIST_MONO, INTER } from "./tokens";

/**
 * ARCHETYPE 9 — Event / conference landing page.
 *
 * Reference intent: a modern tech or creative-industry conference homepage —
 * an electric cobalt/indigo canvas with a bright electric-lime accent, a huge
 * Geist display headline, a speaker lineup grid (P3 repeater), a schedule band,
 * and a ticket-tier CTA. Clean, high-information density, distinctly professional
 * but not corporate-cold.
 *
 * Deliberately distinct from the festival archetype: that's a live-music event
 * (warm aubergine, Bricolage Grotesque poster typography, full-bleed cinematic);
 * this is a knowledge/industry conference (cool cobalt, Geist sans, speaker bios,
 * a readable schedule, ticket tiers). Different idiom, different audience.
 *
 * Exercises the P1–P3 stack: Geist + Geist Mono + Inter registry faces, REAL
 * photography for the speaker grid, a P3 REPEATER bound to `conf_speakers` with
 * field bindings + a hover lift, a rich_text "why attend" with an {accent} run +
 * safe inline link, a scroll-driven entrance on the speaker grid, hover/transition
 * on the ticket CTA, and a responsive grid that collapses to one column on mobile.
 */

const NAVY = "#050d1e";
const PANEL = "#0b1630";
const SKY = "#d9ecff";
const MUTED = "rgba(217,236,255,0.62)";
const LIME = "#a8f53d";
const COBALT = "#2a6bff";
const LINE = "rgba(217,236,255,0.12)";

const PHOTO = {
  hero: pageDesignPhoto("studioDesk"),
  spA: pageDesignPhoto("vocalistPortrait"),
  spB: pageDesignPhoto("directorPortrait"),
  spC: pageDesignPhoto("studioScene"),
  spD: pageDesignPhoto("serviceProsScene"),
};

const dataSources: BuilderNodeRenderDataSources = {
  collections: {
    conf_speakers: [
      { id: "sp1", imageUrl: PHOTO.spA, name: "Mara Lune", role: "Creative Director", company: "Studio North" },
      { id: "sp2", imageUrl: PHOTO.spB, name: "Diego Vega", role: "Head of Product", company: "Tulala" },
      { id: "sp3", imageUrl: PHOTO.spC, name: "Cleo Park", role: "Founder", company: "Field Works" },
      { id: "sp4", imageUrl: PHOTO.spD, name: "Anya Morel", role: "Lead Engineer", company: "Atelier Digital" },
    ],
  },
};

function scheduleRow(id: string, time: string, title: string, speaker: string): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "row",
      align: "center",
      responsive: { mobile: { layout: "stack" } },
      style: {
        width: "100%",
        gap: "24px",
        paddingTop: "20px",
        paddingBottom: "20px",
        boxShadow: `inset 0 -1px 0 0 ${LINE}`,
        transitionProperty: "background-color",
        transitionDuration: "160ms",
        transitionTimingFunction: "ease",
        hover: { backgroundColor: "rgba(217,236,255,0.04)" },
      },
    },
    children: [
      {
        id: `${id}-time`,
        kind: "paragraph",
        props: {
          text: time,
          style: {
            fontFamily: GEIST_MONO,
            fontSize: "13px",
            fontWeight: 500,
            textColor: LIME,
            minWidth: "90px",
            whiteSpace: "nowrap",
          },
        },
      },
      {
        id: `${id}-title`,
        kind: "heading",
        props: {
          text: title,
          level: 4,
          style: {
            fontFamily: GEIST,
            fontSize: "17px",
            fontWeight: 600,
            textColor: SKY,
            marginBottomFree: "0px",
          },
        },
      },
      {
        id: `${id}-speaker`,
        kind: "paragraph",
        props: {
          text: speaker,
          style: {
            fontFamily: INTER,
            fontSize: "14px",
            textColor: MUTED,
            marginLeftFree: "auto",
            whiteSpace: "nowrap",
          },
        },
      },
    ],
  };
}

const conferenceTree: BuilderNode[] = [
  {
    id: "conference-page",
    kind: "container",
    props: {
      layout: "stack",
      style: { width: "100%", maxWidthFree: "100%", gap: "0px", backgroundColor: NAVY },
    },
    children: [
      // ── Hero ──────────────────────────────────────────────────────────────
      {
        id: "conference-hero",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            minHeight: "840px",
            paddingTop: "0px",
            paddingRight: "44px",
            paddingBottom: "100px",
            paddingLeft: "44px",
            position: "relative",
            overflow: "hidden",
            backgroundImage: `radial-gradient(120% 90% at 50% 100%, rgba(42,107,255,0.20), rgba(42,107,255,0) 64%), linear-gradient(180deg,${NAVY} 0%,${PANEL} 100%)`,
            responsive: { mobile: { paddingRight: "24px", paddingLeft: "24px", paddingBottom: "64px" } },
          },
        },
        children: [
          {
            id: "conference-nav",
            kind: "container",
            props: {
              layout: "row",
              align: "center",
              style: {
                width: "100%",
                maxWidthFree: "1200px",
                justifyContent: "space-between",
                paddingTop: "32px",
                paddingBottom: "32px",
                marginBottomFree: "100px",
                boxShadow: `inset 0 -1px 0 0 ${LINE}`,
                responsive: { mobile: { marginBottomFree: "60px" } },
              },
            },
            children: [
              {
                id: "conference-brand",
                kind: "paragraph",
                props: {
                  text: "SIGNAL 2026",
                  style: {
                    fontFamily: GEIST,
                    fontSize: "18px",
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    textColor: SKY,
                  },
                },
              },
              {
                id: "conference-nav-links",
                kind: "paragraph",
                props: {
                  text: "Speakers · Schedule · Tickets",
                  style: {
                    fontFamily: INTER,
                    fontSize: "13px",
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    textColor: MUTED,
                    responsive: { mobile: { visibility: "hidden" } },
                  },
                },
              },
            ],
          },
          {
            id: "conference-date-badge",
            kind: "paragraph",
            props: {
              text: "28–30 October 2026 · Mexico City",
              style: {
                align: "center",
                fontFamily: GEIST_MONO,
                fontSize: "13px",
                fontWeight: 500,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                textColor: LIME,
                marginBottomFree: "20px",
              },
            },
          },
          {
            id: "conference-headline",
            kind: "heading",
            props: {
              text: "Build what\nmatters next.",
              level: 1,
              style: {
                align: "center",
                fontFamily: GEIST,
                fontSize: "110px",
                fontWeight: 900,
                lineHeight: "0.88",
                letterSpacing: "-0.04em",
                textColor: SKY,
                maxWidthFree: "1100px",
                textWrap: "balance",
                responsive: { tablet: { fontSize: "72px" }, mobile: { fontSize: "50px" } },
              },
            },
          },
          {
            id: "conference-sub",
            kind: "rich_text",
            props: {
              text: "Three days of talks, workshops, and open sessions for the people {accent}actually shipping the future{/accent} — product, design, engineering, and strategy. [See what's in store](/program).",
              style: {
                align: "center",
                fontFamily: INTER,
                fontSize: "19px",
                lineHeight: "1.62",
                textColor: MUTED,
                maxWidthFree: "620px",
                marginTopFree: "28px",
              },
            },
          },
          {
            id: "conference-hero-ctas",
            kind: "container",
            props: {
              layout: "row",
              align: "center",
              responsive: { mobile: { layout: "stack" } },
              style: {
                justifyContent: "center",
                gap: "14px",
                marginTopFree: "40px",
              },
            },
            children: [
              {
                id: "conference-cta-primary",
                kind: "button",
                props: {
                  label: "Get your ticket",
                  href: "/tickets",
                  tone: "primary",
                  style: {
                    fontFamily: GEIST,
                    fontSize: "15px",
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    backgroundColor: LIME,
                    textColor: NAVY,
                    borderRadius: "4px",
                    paddingTop: "14px",
                    paddingBottom: "14px",
                    paddingLeft: "32px",
                    paddingRight: "32px",
                    transitionProperty: "background-color, transform, box-shadow",
                    transitionDuration: "180ms",
                    transitionTimingFunction: "ease",
                    hover: {
                      backgroundColor: "#beff5a",
                      scale: "1.03",
                      boxShadow: `0 20px 52px rgba(168,245,61,0.30)`,
                    },
                  },
                },
              },
              {
                id: "conference-cta-secondary",
                kind: "button",
                props: {
                  label: "View programme",
                  href: "/program",
                  tone: "secondary",
                  style: {
                    fontFamily: GEIST,
                    fontSize: "15px",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    backgroundColor: "transparent",
                    textColor: SKY,
                    borderColor: LINE,
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderRadius: "4px",
                    paddingTop: "14px",
                    paddingBottom: "14px",
                    paddingLeft: "32px",
                    paddingRight: "32px",
                    transitionProperty: "border-color, background-color",
                    transitionDuration: "180ms",
                    transitionTimingFunction: "ease",
                    hover: {
                      borderColor: "rgba(217,236,255,0.40)",
                      backgroundColor: "rgba(217,236,255,0.06)",
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      // ── Speakers (P3 repeater) ─────────────────────────────────────────────
      {
        id: "conference-speakers",
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
            id: "conference-speakers-inner",
            kind: "container",
            props: { layout: "stack", style: { width: "100%", maxWidthFree: "1200px", gap: "24px" } },
            children: [
              {
                id: "conference-speakers-kicker",
                kind: "paragraph",
                props: {
                  text: "Speakers",
                  style: {
                    fontFamily: INTER,
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.26em",
                    textTransform: "uppercase",
                    textColor: LIME,
                  },
                },
              },
              {
                id: "conference-speakers-heading",
                kind: "heading",
                props: {
                  text: "Who's taking the stage",
                  level: 2,
                  style: {
                    fontFamily: GEIST,
                    fontSize: "56px",
                    fontWeight: 800,
                    lineHeight: "1.02",
                    letterSpacing: "-0.02em",
                    textColor: SKY,
                    responsive: { mobile: { fontSize: "36px" } },
                  },
                },
              },
              {
                id: "conference-speakers-grid",
                kind: "container",
                props: {
                  layout: "grid",
                  columns: 4,
                  gap: "m",
                  responsive: { tablet: { columns: 2 }, mobile: { columns: 1 } },
                  dataBinding: { sourceKey: "conf_speakers", mode: "bound", repeat: true, maxItems: 4 },
                  style: { width: "100%", maxWidthFree: "100%", gap: "20px" },
                },
                children: [
                  {
                    id: "conference-speaker-card",
                    kind: "container",
                    props: {
                      layout: "stack",
                      style: {
                        gap: "14px",
                        paddingTop: "20px",
                        paddingRight: "20px",
                        paddingBottom: "20px",
                        paddingLeft: "20px",
                        borderRadius: "6px",
                        backgroundColor: "rgba(217,236,255,0.05)",
                        borderColor: LINE,
                        borderWidth: "1px",
                        borderStyle: "solid",
                        containerType: "inline-size",
                        containerName: "speaker-card",
                        transitionProperty: "background-color, border-color, transform",
                        transitionDuration: "200ms",
                        transitionTimingFunction: "ease",
                        hover: {
                          backgroundColor: "rgba(42,107,255,0.10)",
                          borderColor: "rgba(168,245,61,0.28)",
                          translate: "0 -4px",
                        },
                      },
                    },
                    children: [
                      {
                        id: "conference-speaker-photo",
                        kind: "image",
                        props: {
                          src: PHOTO.spA,
                          alt: "Speaker photo",
                          fieldBindings: { src: "imageUrl", alt: "name" },
                          style: {
                            width: "100%",
                            aspectRatio: "1:1",
                            objectFit: "cover",
                            objectPosition: "center top",
                            borderRadius: "4px",
                          },
                        },
                      },
                      {
                        id: "conference-speaker-name",
                        kind: "heading",
                        props: {
                          text: "{{name}}",
                          level: 3,
                          fieldBindings: { text: "name" },
                          style: {
                            fontFamily: GEIST,
                            fontSize: "18px",
                            fontWeight: 700,
                            textColor: SKY,
                            marginBottomFree: "2px",
                            containerQueries: { mobile: { fontSize: "16px" } },
                          },
                        },
                      },
                      {
                        id: "conference-speaker-role",
                        kind: "paragraph",
                        props: {
                          text: "{{role}}",
                          fieldBindings: { text: "role" },
                          style: {
                            fontFamily: INTER,
                            fontSize: "13px",
                            textColor: MUTED,
                          },
                        },
                      },
                      {
                        id: "conference-speaker-company",
                        kind: "paragraph",
                        props: {
                          text: "{{company}}",
                          fieldBindings: { text: "company" },
                          style: {
                            fontFamily: GEIST_MONO,
                            fontSize: "12px",
                            letterSpacing: "0.06em",
                            textColor: LIME,
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
      // ── Schedule ──────────────────────────────────────────────────────────
      {
        id: "conference-schedule",
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
            backgroundImage: `linear-gradient(180deg, ${PANEL} 0%, ${NAVY} 100%)`,
            responsive: { mobile: { paddingRight: "24px", paddingLeft: "24px" } },
          },
        },
        children: [
          {
            id: "conference-schedule-inner",
            kind: "container",
            props: { layout: "stack", style: { width: "100%", maxWidthFree: "900px", gap: "0px" } },
            children: [
              {
                id: "conference-schedule-kicker",
                kind: "paragraph",
                props: {
                  text: "Day one · 28 October",
                  style: {
                    fontFamily: INTER,
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.26em",
                    textTransform: "uppercase",
                    textColor: LIME,
                    marginBottomFree: "8px",
                  },
                },
              },
              {
                id: "conference-schedule-heading",
                kind: "heading",
                props: {
                  text: "Programme highlights",
                  level: 2,
                  style: {
                    fontFamily: GEIST,
                    fontSize: "48px",
                    fontWeight: 800,
                    lineHeight: "1.04",
                    letterSpacing: "-0.02em",
                    textColor: SKY,
                    marginBottomFree: "32px",
                    responsive: { mobile: { fontSize: "32px" } },
                  },
                },
              },
              scheduleRow("sch-1", "09:00", "Opening Keynote — The next ten years", "Mara Lune"),
              scheduleRow("sch-2", "10:30", "Design Systems at Scale", "Diego Vega"),
              scheduleRow("sch-3", "12:00", "AI in the Creative Loop", "Cleo Park"),
              scheduleRow("sch-4", "14:30", "Shipping Products That Last", "Anya Morel"),
              scheduleRow("sch-5", "16:00", "Open Workshop — From Prototype to Prod", "All speakers"),
            ],
          },
        ],
      },
      // ── Footer ────────────────────────────────────────────────────────────
      {
        id: "conference-footer",
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
            id: "conference-footer-brand",
            kind: "paragraph",
            props: {
              text: "Signal 2026",
              style: {
                fontFamily: GEIST,
                fontSize: "16px",
                fontWeight: 700,
                textColor: MUTED,
              },
            },
          },
          {
            id: "conference-footer-location",
            kind: "paragraph",
            props: {
              text: "28–30 October · Mexico City Convention Centre",
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

export const conferenceDesign: PageDesign = {
  id: "conference",
  title: "Event & conference landing page",
  label: "Event & conference",
  description:
    "A modern conference homepage: a cobalt/indigo canvas with lime accents, a bold Geist display hero, a speaker grid, a programme schedule, and dual ticket CTAs.",
  archetype: "conference",
  tree: conferenceTree,
  dataSources,
};
