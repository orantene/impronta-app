import type { BuilderNode } from "../types";
import { pageDesignPhoto } from "./photos";
import type { BuilderNodeRenderDataSources } from "../render";
import type { PageDesign } from "./types";
import { FRAUNCES, INTER } from "./tokens";

/**
 * ARCHETYPE 10 — Personal brand / coach landing page.
 *
 * Reference intent: a confident, action-oriented personal-brand page for a
 * coach, consultant, or solo practitioner — warm sage-white canvas with a single
 * bold forest-green accent, a full-bleed Fraunces statement hero with a
 * half-image half-copy split, a "what I do" three-card grid, a scrolling
 * testimonial row (P3 repeater bound to `coach_testimonials`), and a one-line
 * contact / book-a-call CTA. Human, approachable, not corporate.
 *
 * Deliberately distinct from the studio and editorial archetypes: that pair is
 * for creative practices and visual work; this is for knowledge-services personas
 * (coaching / consulting / speaking). Different copy mode (first-person, direct,
 * outcome-oriented), a portrait-first hero, and a testimonial section none of
 * the others use.
 *
 * Exercises the P1–P3 stack: Fraunces + Inter registry faces, REAL photography
 * (portrait + studio scene), a P3 REPEATER for testimonials (field bindings +
 * hover lift), a rich_text "who I work with" with an {accent} run, scroll-driven
 * entrance on the testimonials, hover/transition on CTAs, and responsive layout
 * that collapses cleanly to a single column on mobile.
 */

const CANVAS = "#f8f5f0";
const OFF_WHITE = "#fdfcf9";
const INK = "#1c1c1c";
const MUTED = "#6b6562";
const FOREST = "#2d6a4f";
const SAGE = "#74b796";
const LINE = "rgba(28,28,28,0.10)";

const PHOTO = {
  portrait: pageDesignPhoto("directorPortrait"),
  working: pageDesignPhoto("studioDesk"),
  workshop: pageDesignPhoto("serviceProsScene"),
};

const dataSources: BuilderNodeRenderDataSources = {
  collections: {
    coach_testimonials: [
      { id: "t1", quote: "Working with Sam changed how I think about leadership entirely. Six months in, the results speak for themselves.", name: "Ana Torres", title: "VP Product, Fintech startup" },
      { id: "t2", quote: "I came in with a career pivot problem and left with a roadmap. The clarity I gained was worth every session.", name: "Marco Irizarry", title: "Director, Design Practice" },
      { id: "t3", quote: "Sam has a rare gift for cutting through noise and finding the real question. My whole team noticed the difference.", name: "Pilar Mendez", title: "Founder, Casa Muna" },
    ],
  },
};

function serviceCard(id: string, icon: string, heading: string, body: string): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "stack",
      style: {
        gap: "14px",
        paddingTop: "32px",
        paddingRight: "32px",
        paddingBottom: "32px",
        paddingLeft: "32px",
        borderRadius: "6px",
        backgroundColor: OFF_WHITE,
        borderColor: LINE,
        borderWidth: "1px",
        borderStyle: "solid",
        boxShadow: "0 2px 16px rgba(28,28,28,0.06)",
        transitionProperty: "box-shadow, transform",
        transitionDuration: "200ms",
        transitionTimingFunction: "ease",
        hover: {
          boxShadow: "0 12px 36px rgba(28,28,28,0.12)",
          translate: "0 -4px",
        },
      },
    },
    children: [
      {
        id: `${id}-icon`,
        kind: "paragraph",
        props: {
          text: icon,
          style: {
            fontSize: "28px",
            marginBottomFree: "0px",
          },
        },
      },
      {
        id: `${id}-heading`,
        kind: "heading",
        props: {
          text: heading,
          level: 3,
          style: {
            fontFamily: FRAUNCES,
            fontSize: "24px",
            fontWeight: 600,
            lineHeight: "1.1",
            textColor: INK,
            marginBottomFree: "0px",
          },
        },
      },
      {
        id: `${id}-body`,
        kind: "paragraph",
        props: {
          text: body,
          style: {
            fontFamily: INTER,
            fontSize: "15px",
            lineHeight: "1.62",
            textColor: MUTED,
          },
        },
      },
    ],
  };
}

const coachTree: BuilderNode[] = [
  {
    id: "coach-page",
    kind: "container",
    props: {
      layout: "stack",
      style: { width: "100%", maxWidthFree: "100%", gap: "0px", backgroundColor: CANVAS },
    },
    children: [
      // ── Hero ──────────────────────────────────────────────────────────────
      {
        id: "coach-hero",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            paddingTop: "0px",
            paddingRight: "0px",
            paddingBottom: "0px",
            paddingLeft: "0px",
            backgroundColor: CANVAS,
          },
        },
        children: [
          {
            id: "coach-nav",
            kind: "container",
            props: {
              layout: "row",
              align: "center",
              style: {
                width: "100%",
                maxWidthFree: "1200px",
                justifyContent: "space-between",
                paddingTop: "28px",
                paddingRight: "44px",
                paddingBottom: "28px",
                paddingLeft: "44px",
                boxShadow: `inset 0 -1px 0 0 ${LINE}`,
                responsive: { mobile: { paddingRight: "24px", paddingLeft: "24px" } },
              },
            },
            children: [
              {
                id: "coach-brand",
                kind: "paragraph",
                props: {
                  text: "Sam Rivera",
                  style: {
                    fontFamily: FRAUNCES,
                    fontSize: "20px",
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                    textColor: INK,
                  },
                },
              },
              {
                id: "coach-nav-cta",
                kind: "button",
                props: {
                  label: "Book a call",
                  href: "/book",
                  tone: "primary",
                  style: {
                    fontFamily: INTER,
                    fontSize: "14px",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    backgroundColor: FOREST,
                    textColor: "#ffffff",
                    borderRadius: "4px",
                    paddingTop: "10px",
                    paddingBottom: "10px",
                    paddingLeft: "22px",
                    paddingRight: "22px",
                    transitionProperty: "background-color, transform",
                    transitionDuration: "180ms",
                    transitionTimingFunction: "ease",
                    hover: { backgroundColor: "#235740", scale: "1.02" },
                  },
                },
              },
            ],
          },
          {
            id: "coach-hero-split",
            kind: "split",
            props: {
              ratio: "50-50",
              collapseOnMobile: true,
              style: {
                width: "100%",
                maxWidthFree: "100%",
                minHeight: "700px",
                alignItems: "stretch",
                responsive: { mobile: { minHeight: "auto" } },
              },
            },
            children: [
              {
                id: "coach-hero-copy",
                kind: "container",
                props: {
                  layout: "stack",
                  style: {
                    gap: "24px",
                    paddingTop: "80px",
                    paddingRight: "48px",
                    paddingBottom: "80px",
                    paddingLeft: "64px",
                    justifyContent: "center",
                    responsive: {
                      mobile: {
                        paddingTop: "48px",
                        paddingRight: "24px",
                        paddingBottom: "48px",
                        paddingLeft: "24px",
                      },
                    },
                  },
                },
                children: [
                  {
                    id: "coach-eyebrow",
                    kind: "paragraph",
                    props: {
                      text: "Executive Coach · Leadership Advisor",
                      style: {
                        fontFamily: INTER,
                        fontSize: "13px",
                        fontWeight: 700,
                        letterSpacing: "0.2em",
                        textTransform: "uppercase",
                        textColor: FOREST,
                      },
                    },
                  },
                  {
                    id: "coach-headline",
                    kind: "heading",
                    props: {
                      text: "Clarity for the decisions that define your work",
                      level: 1,
                      style: {
                        fontFamily: FRAUNCES,
                        fontSize: "72px",
                        lineHeight: "0.96",
                        letterSpacing: "-0.01em",
                        textColor: INK,
                        maxWidthFree: "560px",
                        textWrap: "balance",
                        responsive: { tablet: { fontSize: "52px" }, mobile: { fontSize: "40px" } },
                      },
                    },
                  },
                  {
                    id: "coach-body",
                    kind: "rich_text",
                    props: {
                      text: "I work with founders, directors, and team leads who are {accent}smart but stuck{/accent}, people who know what they want but can't quite see how to get there. A structured conversation changes that. [More about my practice](/about).",
                      style: {
                        fontFamily: INTER,
                        fontSize: "18px",
                        lineHeight: "1.68",
                        textColor: MUTED,
                        maxWidthFree: "480px",
                      },
                    },
                  },
                  {
                    id: "coach-hero-cta",
                    kind: "button",
                    props: {
                      label: "Book a free discovery call",
                      href: "/book",
                      tone: "primary",
                      style: {
                        fontFamily: INTER,
                        fontSize: "16px",
                        fontWeight: 700,
                        letterSpacing: "0.01em",
                        backgroundColor: FOREST,
                        textColor: "#ffffff",
                        borderRadius: "4px",
                        paddingTop: "16px",
                        paddingBottom: "16px",
                        paddingLeft: "36px",
                        paddingRight: "36px",
                        alignSelf: "start",
                        transitionProperty: "background-color, transform, box-shadow",
                        transitionDuration: "200ms",
                        transitionTimingFunction: "ease",
                        hover: {
                          backgroundColor: "#235740",
                          scale: "1.03",
                          boxShadow: `0 20px 52px rgba(45,106,79,0.30)`,
                        },
                      },
                    },
                  },
                ],
              },
              {
                id: "coach-hero-image",
                kind: "image",
                props: {
                  src: PHOTO.portrait,
                  alt: "Sam Rivera, executive coach",
                  style: {
                    width: "100%",
                    height: "100%",
                    minHeight: "560px",
                    objectFit: "cover",
                    objectPosition: "center top",
                    responsive: { mobile: { minHeight: "360px" } },
                  },
                },
              },
            ],
          },
        ],
      },
      // ── Services grid ─────────────────────────────────────────────────────
      {
        id: "coach-services",
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
            backgroundColor: CANVAS,
            responsive: { mobile: { paddingRight: "24px", paddingLeft: "24px" } },
          },
        },
        children: [
          {
            id: "coach-services-inner",
            kind: "container",
            props: { layout: "stack", style: { width: "100%", maxWidthFree: "1100px", gap: "32px" } },
            children: [
              {
                id: "coach-services-heading",
                kind: "heading",
                props: {
                  text: "How I can help",
                  level: 2,
                  style: {
                    fontFamily: FRAUNCES,
                    fontSize: "56px",
                    lineHeight: "1.04",
                    letterSpacing: "-0.01em",
                    textColor: INK,
                    responsive: { mobile: { fontSize: "38px" } },
                  },
                },
              },
              {
                id: "coach-services-grid",
                kind: "container",
                props: {
                  layout: "grid",
                  columns: 3,
                  gap: "m",
                  responsive: { tablet: { columns: 2 }, mobile: { columns: 1 } },
                  style: { width: "100%", maxWidthFree: "100%", gap: "20px" },
                },
                children: [
                  serviceCard(
                    "coach-svc-1",
                    "🧭",
                    "Executive coaching",
                    "One-to-one sessions for senior leaders facing high-stakes decisions, team dynamics, or a meaningful career inflection.",
                  ),
                  serviceCard(
                    "coach-svc-2",
                    "🗺",
                    "Strategy advising",
                    "Half- or full-day working sessions to map a clear path forward, where you are, where you want to be, and what stands between them.",
                  ),
                  serviceCard(
                    "coach-svc-3",
                    "🎤",
                    "Speaking & workshops",
                    "Keynotes and facilitated workshops on leadership, decision-making, and the psychology of high performance.",
                  ),
                ],
              },
            ],
          },
        ],
      },
      // ── Testimonials (P3 repeater) ─────────────────────────────────────────
      {
        id: "coach-testimonials",
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
            backgroundColor: OFF_WHITE,
            boxShadow: `inset 0 1px 0 0 ${LINE}`,
            animationPreset: "rise",
            animationTrigger: "scroll",
            animationRepeat: "once",
            animationDuration: "0.9s",
            responsive: { mobile: { paddingRight: "24px", paddingLeft: "24px" } },
          },
        },
        children: [
          {
            id: "coach-testimonials-inner",
            kind: "container",
            props: { layout: "stack", style: { width: "100%", maxWidthFree: "1100px", gap: "28px" } },
            children: [
              {
                id: "coach-testimonials-kicker",
                kind: "paragraph",
                props: {
                  text: "What clients say",
                  style: {
                    fontFamily: INTER,
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.26em",
                    textTransform: "uppercase",
                    textColor: FOREST,
                  },
                },
              },
              {
                id: "coach-testimonials-grid",
                kind: "container",
                props: {
                  layout: "grid",
                  columns: 3,
                  gap: "m",
                  responsive: { tablet: { columns: 2 }, mobile: { columns: 1 } },
                  dataBinding: { sourceKey: "coach_testimonials", mode: "bound", repeat: true, maxItems: 3 },
                  style: { width: "100%", maxWidthFree: "100%", gap: "20px" },
                },
                children: [
                  {
                    id: "coach-testimonial-card",
                    kind: "container",
                    props: {
                      layout: "stack",
                      style: {
                        gap: "18px",
                        paddingTop: "32px",
                        paddingRight: "32px",
                        paddingBottom: "32px",
                        paddingLeft: "32px",
                        borderRadius: "6px",
                        backgroundColor: CANVAS,
                        borderColor: LINE,
                        borderWidth: "1px",
                        borderStyle: "solid",
                        containerType: "inline-size",
                        containerName: "testimonial-card",
                        transitionProperty: "box-shadow, transform",
                        transitionDuration: "200ms",
                        transitionTimingFunction: "ease",
                        hover: {
                          boxShadow: "0 12px 36px rgba(28,28,28,0.10)",
                          translate: "0 -4px",
                        },
                      },
                    },
                    children: [
                      {
                        id: "coach-testimonial-quote-mark",
                        kind: "paragraph",
                        props: {
                          text: "“",
                          style: {
                            fontFamily: FRAUNCES,
                            fontSize: "48px",
                            lineHeight: "1",
                            textColor: SAGE,
                            marginBottomFree: "-8px",
                          },
                        },
                      },
                      {
                        id: "coach-testimonial-quote",
                        kind: "paragraph",
                        props: {
                          text: "{{quote}}",
                          fieldBindings: { text: "quote" },
                          style: {
                            fontFamily: FRAUNCES,
                            fontSize: "18px",
                            lineHeight: "1.5",
                            fontStyle: "italic",
                            textColor: INK,
                          },
                        },
                      },
                      {
                        id: "coach-testimonial-rule",
                        kind: "divider",
                        props: {
                          style: {
                            width: "40px",
                            height: "2px",
                            backgroundColor: SAGE,
                            marginTopFree: "4px",
                            marginBottomFree: "0px",
                          },
                        },
                      },
                      {
                        id: "coach-testimonial-name",
                        kind: "paragraph",
                        props: {
                          text: "{{name}}",
                          fieldBindings: { text: "name" },
                          style: {
                            fontFamily: INTER,
                            fontSize: "14px",
                            fontWeight: 700,
                            textColor: INK,
                            marginBottomFree: "2px",
                          },
                        },
                      },
                      {
                        id: "coach-testimonial-title",
                        kind: "paragraph",
                        props: {
                          text: "{{title}}",
                          fieldBindings: { text: "title" },
                          style: {
                            fontFamily: INTER,
                            fontSize: "13px",
                            textColor: MUTED,
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
        id: "coach-footer",
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
            id: "coach-footer-brand",
            kind: "paragraph",
            props: {
              text: "Sam Rivera · Executive Coach",
              style: {
                fontFamily: FRAUNCES,
                fontSize: "16px",
                letterSpacing: "0.01em",
                textColor: MUTED,
              },
            },
          },
          {
            id: "coach-footer-cta",
            kind: "paragraph",
            props: {
              text: "sam@samrivera.co · Available for new engagements",
              style: {
                align: "right",
                fontFamily: INTER,
                fontSize: "14px",
                textColor: MUTED,
                opacity: 0.8,
                responsive: { mobile: { align: "left" } },
              },
            },
          },
        ],
      },
    ],
  },
];

export const coachDesign: PageDesign = {
  id: "coach",
  title: "Personal brand & coach landing page",
  label: "Personal brand / coach",
  description:
    "A personal-brand page for a coach or consultant: a Fraunces portrait-first hero, a three-up services grid, a testimonial repeater, and a book-a-call CTA.",
  archetype: "coach",
  tree: coachTree,
  dataSources,
};
