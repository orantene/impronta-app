import type { BuilderNode } from "../../../src/lib/site-admin/builder-node/types";
import { fidelityPhotoSrc } from "../fixtures";
import type { BuilderNodeRenderDataSources, FidelityDesign } from "../html";
import { PLAYFAIR, RALEWAY } from "./tokens";

/**
 * ARCHETYPE 3 — Creative production agency.
 *
 * Reference intent: a fashion/film production studio's site — a magazine
 * masthead hero on near-black, a full-bleed cinematic band, a "selected work"
 * grid that reads like a contact sheet, and a three-tier engagement table.
 * Distinct from the editorial portfolio (single artist, asymmetric split) and
 * the SaaS landing (dark glass UI): alternating ink/bone bands, a Playfair
 * Display masthead over Raleway body, and a five-card work grid.
 *
 * Exercises the P1–P3 stack: Playfair Display + Raleway registry faces, REAL
 * photography throughout, a P3 REPEATER for the five-card work grid (bound to
 * `agency_work` with field bindings + per-slot container queries + a hover
 * lift), a rich_text manifesto with an {accent} run and a safe inline link, a
 * P2 pricing_table for engagement tiers, hover/transition on CTAs, and a
 * responsive grid that collapses to one column on mobile.
 */

const dataSources: BuilderNodeRenderDataSources = {
  collections: {
    agency_work: [
      { id: "w1", imageUrl: fidelityPhotoSrc("studioScene"), title: "At Home, On Air", client: "Tulala Originals", discipline: "Film + Sound" },
      { id: "w2", imageUrl: fidelityPhotoSrc("directorPortrait"), title: "The Direction Issue", client: "Atelier North", discipline: "Creative Direction" },
      { id: "w3", imageUrl: fidelityPhotoSrc("vocalistPortrait"), title: "Sessions", client: "Independent Artists", discipline: "Music + Performance" },
      { id: "w4", imageUrl: fidelityPhotoSrc("serviceProsScene"), title: "The Service Issue", client: "Casa Muna", discipline: "Campaign + Editorial" },
      { id: "w5", imageUrl: fidelityPhotoSrc("studioDesk"), title: "Studio Notes", client: "In-House", discipline: "Brand + Web" },
    ],
  },
};

const agencyTree: BuilderNode[] = [
  {
    id: "agency-page",
    kind: "container",
    props: {
      layout: "stack",
      style: { width: "100%", maxWidthFree: "100%", gap: "0px", backgroundColor: "#efeae1" },
    },
    children: [
      // ── Masthead hero (ink) ───────────────────────────────────────────────
      {
        id: "agency-hero",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            minHeight: "760px",
            paddingTop: "28px",
            paddingRight: "44px",
            paddingBottom: "92px",
            paddingLeft: "44px",
            gap: "22px",
            backgroundColor: "#15120e",
            textColor: "#f3ece0",
            responsive: { mobile: { paddingRight: "22px", paddingLeft: "22px", paddingBottom: "64px" } },
          },
        },
        children: [
          {
            id: "agency-nav",
            kind: "container",
            props: {
              layout: "row",
              align: "center",
              style: {
                width: "100%",
                maxWidthFree: "1280px",
                justifyContent: "space-between",
                gap: "18px",
                marginBottomFree: "70px",
                responsive: { mobile: { marginBottomFree: "40px" } },
              },
            },
            children: [
              {
                id: "agency-brand",
                kind: "paragraph",
                props: {
                  text: "STUDIO MERIDIAN",
                  style: { fontFamily: RALEWAY, fontSize: "13px", fontWeight: 700, letterSpacing: "0.22em", textColor: "#f3ece0" },
                },
              },
              {
                id: "agency-nav-links",
                kind: "paragraph",
                props: {
                  text: "Work · Studio · Contact",
                  style: {
                    align: "right",
                    fontFamily: RALEWAY,
                    fontSize: "12px",
                    fontWeight: 600,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    textColor: "rgba(243,236,224,0.64)",
                    responsive: { mobile: { visibility: "hidden" } },
                  },
                },
              },
            ],
          },
          {
            id: "agency-eyebrow",
            kind: "paragraph",
            props: {
              text: "A creative production studio",
              style: {
                align: "center",
                fontFamily: RALEWAY,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                textColor: "#c79a5e",
              },
            },
          },
          {
            id: "agency-masthead",
            kind: "heading",
            props: {
              text: "We make the work that makes the brand.",
              level: 1,
              style: {
                align: "center",
                fontFamily: PLAYFAIR,
                fontSize: "88px",
                lineHeight: "0.98",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                textColor: "#f6efe4",
                maxWidthFree: "1080px",
                textWrap: "balance",
                marginBottomFree: "0px",
                responsive: { tablet: { fontSize: "64px" }, mobile: { fontSize: "40px" } },
              },
            },
          },
          {
            id: "agency-manifesto",
            kind: "rich_text",
            props: {
              text: "Film, photography, and brand systems for people with {accent}something true to say{/accent}. We direct, produce, and finish in-house — selected work below, or [request the full index](/index).",
              style: {
                fontFamily: RALEWAY,
                fontSize: "18px",
                lineHeight: "1.62",
                textColor: "rgba(243,236,224,0.78)",
                maxWidthFree: "620px",
                align: "center",
              },
            },
          },
          {
            id: "agency-hero-cta",
            kind: "button",
            props: {
              label: "Request the index",
              href: "/index",
              tone: "primary",
              style: {
                fontFamily: RALEWAY,
                fontSize: "14px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                marginTopFree: "8px",
                backgroundColor: "#e7dcc8",
                textColor: "#15120e",
                borderColor: "#e7dcc8",
                borderWidth: "1px",
                borderStyle: "solid",
                transitionProperty: "background-color, transform, box-shadow",
                transitionDuration: "220ms",
                transitionTimingFunction: "ease",
                hover: { backgroundColor: "#f6efe4", scale: "1.04", boxShadow: "0 16px 38px rgba(0,0,0,0.4)" },
              },
            },
          },
        ],
      },
      // ── Full-bleed cinematic band ─────────────────────────────────────────
      {
        id: "agency-cinematic",
        kind: "image",
        props: {
          src: fidelityPhotoSrc("studioScene"),
          alt: "Production crew at work across a loft studio",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            aspectRatioFree: "2.4",
            objectFit: "cover",
            objectPosition: "center",
            borderRadius: "0px",
            responsive: { mobile: { aspectRatioFree: "1.4" } },
          },
        },
      },
      // ── Selected work (P3 repeater, bone) ─────────────────────────────────
      {
        id: "agency-work",
        kind: "container",
        props: {
          layout: "stack",
          style: {
            width: "100%",
            maxWidthFree: "1280px",
            gap: "30px",
            paddingTop: "100px",
            paddingRight: "44px",
            paddingBottom: "100px",
            paddingLeft: "44px",
            // Scroll-driven entrance for the "selected work" contact sheet — it
            // rises into place as it enters the viewport. Captured as
            // agency-1440-reveal so the Motion axis is frame-proven (was 3.0,
            // built-but-uncaptured; this gives agency a 2nd proven behavior
            // alongside the hero-CTA hover).
            animationPreset: "rise",
            animationTrigger: "scroll",
            animationDuration: "1s",
            responsive: { mobile: { paddingRight: "22px", paddingLeft: "22px", paddingTop: "68px", paddingBottom: "68px" } },
          },
        },
        children: [
          {
            id: "agency-work-head",
            kind: "container",
            props: {
              layout: "row",
              align: "end",
              responsive: { mobile: { layout: "stack", align: "start" } },
              style: { width: "100%", maxWidthFree: "100%", justifyContent: "space-between", gap: "12px" },
            },
            children: [
              {
                id: "agency-work-title",
                kind: "heading",
                props: {
                  text: "Selected work",
                  level: 2,
                  style: { fontFamily: PLAYFAIR, fontSize: "44px", fontWeight: 600, letterSpacing: "-0.01em", textColor: "#15120e", marginBottomFree: "0px", responsive: { mobile: { fontSize: "32px" } } },
                },
              },
              {
                id: "agency-work-note",
                kind: "paragraph",
                props: {
                  text: "2024 — 2026",
                  style: { fontFamily: RALEWAY, fontSize: "13px", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", textColor: "#8a7c69" },
                },
              },
            ],
          },
          {
            id: "agency-work-grid",
            kind: "container",
            props: {
              layout: "grid",
              columns: 3,
              gap: "m",
              responsive: { tablet: { columns: 3 }, mobile: { columns: 1 } },
              dataBinding: { sourceKey: "agency_work", mode: "bound", repeat: true, maxItems: 6 },
              style: { width: "100%", maxWidthFree: "100%", gap: "22px" },
            },
            children: [
              {
                id: "agency-work-card",
                kind: "container",
                props: {
                  layout: "stack",
                  style: {
                    gap: "12px",
                    containerType: "inline-size",
                    containerName: "work-card",
                    // Transition the `translate` property the hover actually sets
                    // (was "transform" → the lift jumped instantly). Settled end
                    // state is identical under animations:"disabled", so the
                    // agency-1440-hover golden is unchanged; this only makes the
                    // live hover-lift ease smoothly, matching editorial's card.
                    transitionProperty: "translate",
                    transitionDuration: "240ms",
                    transitionTimingFunction: "ease",
                    hover: { translate: "0 -6px" },
                  },
                },
                children: [
                  {
                    id: "agency-work-image",
                    kind: "image",
                    props: {
                      src: fidelityPhotoSrc("studioScene"),
                      alt: "Selected work",
                      fieldBindings: { src: "imageUrl", alt: "title" },
                      style: {
                        width: "100%",
                        aspectRatio: "4:3",
                        objectFit: "cover",
                        objectPosition: "center",
                        borderRadius: "2px",
                        boxShadow: "0 16px 44px rgba(21,18,14,0.16)",
                      },
                    },
                  },
                  {
                    id: "agency-work-card-title",
                    kind: "heading",
                    props: {
                      text: "{{title}}",
                      level: 3,
                      fieldBindings: { text: "title" },
                      style: {
                        fontFamily: PLAYFAIR,
                        fontSize: "24px",
                        fontWeight: 600,
                        lineHeight: "1.1",
                        textColor: "#1a160f",
                        marginBottomFree: "0px",
                        containerQueries: { mobile: { fontSize: "21px" } },
                      },
                    },
                  },
                  {
                    id: "agency-work-card-meta",
                    kind: "paragraph",
                    props: {
                      text: "{{client}} · {{discipline}}",
                      fieldBindings: { text: "client" },
                      style: { fontFamily: RALEWAY, fontSize: "13px", letterSpacing: "0.04em", textColor: "#7d7060" },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      // ── Engagement pricing (ink) ──────────────────────────────────────────
      {
        id: "agency-pricing-section",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            gap: "14px",
            paddingTop: "96px",
            paddingRight: "28px",
            paddingBottom: "104px",
            paddingLeft: "28px",
            backgroundColor: "#15120e",
            textColor: "#f3ece0",
          },
        },
        children: [
          {
            id: "agency-pricing-eyebrow",
            kind: "paragraph",
            props: {
              text: "How we work together",
              style: { align: "center", fontFamily: RALEWAY, fontSize: "12px", fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", textColor: "#c79a5e" },
            },
          },
          {
            id: "agency-pricing-heading",
            kind: "heading",
            props: {
              text: "Engagements",
              level: 2,
              style: { align: "center", fontFamily: PLAYFAIR, fontSize: "48px", fontWeight: 600, letterSpacing: "-0.01em", textColor: "#f6efe4", marginBottomFree: "20px", responsive: { mobile: { fontSize: "34px" } } },
            },
          },
          {
            id: "agency-pricing",
            kind: "pricing_table",
            props: {
              style: { fontFamily: RALEWAY, maxWidthFree: "1100px" },
              tiers: [
                {
                  id: "project",
                  name: "Project",
                  description: "One campaign, end to end",
                  price: "from $8k",
                  period: "/ project",
                  ctaLabel: "Start a project",
                  ctaHref: "/start",
                  features: [
                    { label: "Direction + production", included: true },
                    { label: "4–6 week sprint", included: true },
                    { label: "Finishing in-house", included: true },
                    { label: "12-month usage license", included: true },
                  ],
                },
                {
                  id: "retainer",
                  name: "Retainer",
                  description: "Ongoing creative partner",
                  price: "from $6k",
                  period: "/ month",
                  ctaLabel: "Book a call",
                  ctaHref: "/call",
                  highlighted: true,
                  features: [
                    { label: "Dedicated team", included: true },
                    { label: "Quarterly planning", included: true },
                    { label: "Priority production slots", included: true },
                    { label: "Always-on direction", included: true },
                  ],
                },
                {
                  id: "partner",
                  name: "Partner",
                  description: "Embedded studio",
                  price: "Custom",
                  ctaLabel: "Talk to a partner",
                  ctaHref: "/contact",
                  features: [
                    { label: "Brand stewardship", included: true },
                    { label: "Unlimited scope", included: true },
                    { label: "Board-level reviews", included: true },
                    { label: "Named creative lead", included: true },
                  ],
                },
              ],
            },
          },
        ],
      },
      // ── Footer (bone) ─────────────────────────────────────────────────────
      {
        id: "agency-footer",
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
            paddingRight: "44px",
            paddingBottom: "44px",
            paddingLeft: "44px",
            gap: "14px",
          },
        },
        children: [
          {
            id: "agency-footer-brand",
            kind: "paragraph",
            props: {
              text: "Studio Meridian",
              style: { fontFamily: PLAYFAIR, fontSize: "18px", textColor: "#1a160f" },
            },
          },
          {
            id: "agency-footer-copy",
            kind: "paragraph",
            props: {
              text: "Film · Photography · Brand — Mexico City & Lisbon",
              style: { align: "right", fontFamily: RALEWAY, fontSize: "14px", textColor: "#7d7060", responsive: { mobile: { align: "left" } } },
            },
          },
        ],
      },
    ],
  },
];

export const agencyDesign: FidelityDesign = {
  id: "agency",
  title: "Creative production agency",
  tree: agencyTree,
  dataSources,
};
