import type { BuilderNode } from "../types";
import type { BuilderNodeRenderDataSources } from "../render";
import type { PageDesign } from "./types";
import { FRAUNCES, CINZEL, INTER } from "./tokens";

/**
 * IMPRONTA — the flagship tenant homepage, rebuilt freeform.
 *
 * A faithful freeform recreation of the Impronta Models home (the v11-features
 * prototype + the live section-slot page): a dark, editorial models-&-image
 * agency site on a near-black canvas with a single warm-gold accent, a
 * high-contrast Fraunces display serif over Inter body, Cinzel small-caps
 * eyebrows, and REAL agency photography throughout (no placeholder boxes).
 *
 * Sections: directory-search hero → "Discover premium talent" split hero →
 * talent-by-discipline rail → featured talent → markets / "Local faces" →
 * a clear process → "an agency, not a directory" pillars → talent join CTA →
 * final inquiry CTA → footer. Authored as freeform primitives + P3 repeaters
 * so every block is selectable, restyleable, and movable in the builder.
 */

// ── palette ──────────────────────────────────────────────────────────────────
const INK = "#07090c"; // page canvas
const SURFACE = "#0b0f14"; // alternating band
const WARM = "#0d0a07"; // warm dark band (markets)
const GOLD = "#c9a227";
const GOLD_BRIGHT = "#e3c873";
const TEXT = "#f4eee2";
const MUTED = "rgba(244,238,226,0.66)";
const FAINT = "rgba(244,238,226,0.42)";
const HAIRLINE = "rgba(201,162,39,0.22)";
const CARD = "rgba(255,255,255,0.035)";
const CARD_BORDER = "rgba(244,238,226,0.10)";

const PHOTO = {
  runway: "/marketing/photos/mk-models-runway.jpg",
  party: "/marketing/photos/mk-models-party.jpg",
  hosts: "/marketing/photos/mk-hosts-restaurant.jpg",
  perform: "/marketing/photos/mk-hero-perform.jpg",
  service: "/marketing/photos/mk-hero-service.jpg",
  business: "/marketing/photos/mk-hero-business.jpg",
  audienceTalent: "/marketing/photos/mk-audience-talent.jpg",
  audienceHub: "/marketing/photos/mk-audience-hub.jpg",
  singer: "/marketing/photos/independent-singer-booking.jpg",
  servicePros: "/marketing/photos/service-pros-lifestyle.jpg",
} as const;

const dataSources: BuilderNodeRenderDataSources = {
  collections: {
    impronta_disciplines: [
      { id: "d1", imageUrl: PHOTO.runway, name: "Models", blurb: "Editorial, runway & commercial" },
      { id: "d2", imageUrl: PHOTO.hosts, name: "Hosts & Promo", blurb: "Brand ambassadors & activations" },
      { id: "d3", imageUrl: PHOTO.business, name: "Chefs & Culinary", blurb: "Private chefs & culinary talent" },
      { id: "d4", imageUrl: PHOTO.perform, name: "Performers", blurb: "Dancers, aerial & live acts" },
      { id: "d5", imageUrl: PHOTO.service, name: "Wellness & Beauty", blurb: "Stylists, MUA & wellness" },
      { id: "d6", imageUrl: PHOTO.singer, name: "Music & DJs", blurb: "DJs, vocalists & ensembles" },
      { id: "d7", imageUrl: PHOTO.servicePros, name: "Photo, Video & Creative", blurb: "Photographers & directors" },
    ],
    impronta_featured: [
      { id: "f1", imageUrl: PHOTO.runway, name: "Sofía R.", role: "Editorial · Tulum" },
      { id: "f2", imageUrl: PHOTO.business, name: "Marco V.", role: "Host · Mexico City" },
      { id: "f3", imageUrl: PHOTO.party, name: "Lucía M.", role: "Model · Riviera Maya" },
      { id: "f4", imageUrl: PHOTO.perform, name: "Diego A.", role: "Performer · Buenos Aires" },
    ],
    impronta_steps: [
      { id: "s1", num: "01", title: "Tell us the brief", detail: "Market, dates, the look you need." },
      { id: "s2", num: "02", title: "We shortlist options", detail: "A shortlist tailored to your project." },
      { id: "s3", num: "03", title: "Confirm talent", detail: "You choose. We secure availability." },
      { id: "s4", num: "04", title: "Coordinate the booking", detail: "Local coordination, contracts, logistics." },
    ],
    impronta_pillars: [
      { id: "p1", title: "Verified profiles", detail: "Every talent is reviewed and verified before you ever see them." },
      { id: "p2", title: "Local coordination", detail: "A real team on the ground in every market — international reach, local execution." },
      { id: "p3", title: "Booking support", detail: "Contracts, usage and logistics — managed end to end." },
    ],
    impronta_markets: [
      { id: "m1", name: "Riviera Maya", status: "Featured market" },
      { id: "m2", name: "Mexico City", status: "Active" },
      { id: "m3", name: "Buenos Aires", status: "Active" },
      { id: "m4", name: "Los Angeles", status: "Coming soon" },
      { id: "m5", name: "Madrid", status: "Coming soon" },
    ],
  },
};

// ── shared style helpers ──────────────────────────────────────────────────────
const eyebrow = (text: string): BuilderNode => ({
  id: `eb-${text.replace(/\W+/g, "-").toLowerCase()}`,
  kind: "paragraph",
  props: {
    text,
    style: {
      fontFamily: CINZEL,
      fontSize: "12px",
      fontWeight: 600,
      letterSpacing: "0.32em",
      textTransform: "uppercase",
      textColor: GOLD,
      marginBottomFree: "14px",
    },
  },
});

const sectionTitle = (text: string, id: string): BuilderNode => ({
  id,
  kind: "heading",
  props: {
    text,
    level: 2,
    style: {
      fontFamily: FRAUNCES,
      fontSize: "46px",
      lineHeight: "1.04",
      fontWeight: 500,
      letterSpacing: "-0.01em",
      textColor: TEXT,
      marginBottomFree: "0px",
      textWrap: "balance",
      responsive: { mobile: { fontSize: "32px" } },
    },
  },
});

const band = (
  id: string,
  background: string,
  children: BuilderNode[],
  opts: { borderTop?: boolean } = {},
): BuilderNode => ({
  id,
  kind: "container",
  props: {
    layout: "stack",
    align: "center",
    style: {
      width: "100%",
      maxWidthFree: "100%",
      paddingTop: "92px",
      paddingRight: "32px",
      paddingBottom: "92px",
      paddingLeft: "32px",
      gap: "0px",
      backgroundColor: background,
      textColor: TEXT,
      ...(opts.borderTop
        ? { borderColor: HAIRLINE, borderWidth: "1px 0px 0px 0px", borderStyle: "solid" }
        : {}),
      responsive: { mobile: { paddingTop: "60px", paddingBottom: "60px", paddingRight: "20px", paddingLeft: "20px" } },
    },
  },
  children: [
    {
      id: `${id}-wrap`,
      kind: "container",
      props: { layout: "stack", style: { width: "100%", maxWidthFree: "1220px", gap: "40px" } },
      children,
    },
  ],
});

const centerHead = (id: string, eb: string, title: string, lead?: string): BuilderNode => ({
  id: `${id}-head`,
  kind: "container",
  props: {
    layout: "stack",
    align: "center",
    style: { width: "100%", maxWidthFree: "720px", marginLeftFree: "auto", marginRightFree: "auto", gap: "0px", align: "center" },
  },
  children: [
    eyebrow(eb),
    sectionTitle(title, `${id}-title`),
    ...(lead
      ? [
          {
            id: `${id}-lead`,
            kind: "paragraph" as const,
            props: {
              text: lead,
              style: {
                fontFamily: INTER,
                fontSize: "17px",
                lineHeight: "1.6",
                textColor: MUTED,
                marginTopFree: "18px",
                align: "center" as const,
                maxWidthFree: "640px",
              },
            },
          },
        ]
      : []),
  ],
});

const goldButton = (id: string, label: string, href: string): BuilderNode => ({
  id,
  kind: "button",
  props: {
    label,
    href,
    tone: "primary",
    style: {
      fontFamily: INTER,
      fontSize: "14px",
      fontWeight: 700,
      letterSpacing: "0.04em",
      backgroundColor: GOLD,
      textColor: "#1a1407",
      borderColor: GOLD,
      borderWidth: "1px",
      borderStyle: "solid",
      paddingTop: "14px",
      paddingBottom: "14px",
      paddingLeft: "26px",
      paddingRight: "26px",
      borderRadius: "2px",
      transitionProperty: "background-color, transform, box-shadow",
      transitionDuration: "200ms",
      transitionTimingFunction: "ease",
      hover: { backgroundColor: GOLD_BRIGHT, translate: "0 -2px", boxShadow: "0 16px 40px rgba(201,162,39,0.28)" },
    },
  },
});

const lineButton = (id: string, label: string, href: string): BuilderNode => ({
  id,
  kind: "button",
  props: {
    label,
    href,
    tone: "secondary",
    style: {
      fontFamily: INTER,
      fontSize: "14px",
      fontWeight: 600,
      letterSpacing: "0.04em",
      backgroundColor: "rgba(0,0,0,0)",
      textColor: TEXT,
      borderColor: "rgba(244,238,226,0.32)",
      borderWidth: "1px",
      borderStyle: "solid",
      paddingTop: "14px",
      paddingBottom: "14px",
      paddingLeft: "26px",
      paddingRight: "26px",
      borderRadius: "2px",
      transitionProperty: "border-color, color",
      transitionDuration: "200ms",
      transitionTimingFunction: "ease",
      hover: { borderColor: GOLD, color: GOLD_BRIGHT },
    },
  },
});

// ── sections ──────────────────────────────────────────────────────────────────

const heroFind: BuilderNode = {
  id: "impronta-hero-find",
  kind: "container",
  props: {
    layout: "stack",
    align: "center",
    style: {
      width: "100%",
      maxWidthFree: "100%",
      paddingTop: "120px",
      paddingRight: "32px",
      paddingBottom: "104px",
      paddingLeft: "32px",
      gap: "0px",
      backgroundColor: INK,
      backgroundImage:
        "radial-gradient(120% 80% at 50% 0%, rgba(201,162,39,0.10), rgba(201,162,39,0) 60%), linear-gradient(180deg,#090b0f 0%,#07090c 100%)",
      textColor: TEXT,
      responsive: { mobile: { paddingTop: "84px", paddingBottom: "72px", paddingRight: "20px", paddingLeft: "20px" } },
    },
  },
  children: [
    {
      id: "impronta-hero-find-wrap",
      kind: "container",
      props: { layout: "stack", align: "center", style: { width: "100%", maxWidthFree: "880px", gap: "0px", align: "center" } },
      children: [
        eyebrow("Models & Image Agency"),
        {
          id: "impronta-hf-title",
          kind: "heading",
          props: {
            text: "Find the right talent for your brief.",
            level: 1,
            style: {
              fontFamily: FRAUNCES,
              fontSize: "76px",
              lineHeight: "1.0",
              fontWeight: 500,
              letterSpacing: "-0.015em",
              textColor: TEXT,
              maxWidthFree: "880px",
              textWrap: "balance",
              marginBottomFree: "0px",
              responsive: { tablet: { fontSize: "58px" }, mobile: { fontSize: "40px" } },
            },
          },
        },
        {
          id: "impronta-hf-sub",
          kind: "paragraph",
          props: {
            text: "Search the directory by role, location or fit — agency-managed, no direct contact.",
            style: { fontFamily: INTER, fontSize: "18px", lineHeight: "1.6", textColor: MUTED, marginTopFree: "20px", align: "center", maxWidthFree: "560px" },
          },
        },
        // search bar
        {
          id: "impronta-hf-search",
          kind: "container",
          props: {
            layout: "row",
            align: "center",
            style: {
              width: "100%",
              maxWidthFree: "620px",
              marginTopFree: "34px",
              gap: "0px",
              backgroundColor: CARD,
              borderColor: CARD_BORDER,
              borderWidth: "1px",
              borderStyle: "solid",
              borderRadius: "4px",
              paddingTop: "8px",
              paddingBottom: "8px",
              paddingLeft: "18px",
              paddingRight: "8px",
              justifyContent: "space-between",
            },
          },
          children: [
            {
              id: "impronta-hf-search-ph",
              kind: "paragraph",
              props: { text: "Bilingual hosts for a product launch in Tulum…", style: { fontFamily: INTER, fontSize: "15px", textColor: FAINT, align: "left" } },
            },
            goldButton("impronta-hf-search-btn", "Search", "/directory"),
          ],
        },
        {
          id: "impronta-hf-actions",
          kind: "container",
          props: { layout: "row", align: "center", responsive: { mobile: { layout: "stack" } }, style: { gap: "22px", marginTopFree: "26px", justifyContent: "center" } },
          children: [
            goldButton("impronta-hf-cta", "Start an Inquiry", "/inquiry"),
            {
              id: "impronta-hf-apply",
              kind: "button",
              props: {
                label: "Apply as talent →",
                href: "/join",
                tone: "secondary",
                style: { fontFamily: INTER, fontSize: "14px", fontWeight: 600, textColor: GOLD_BRIGHT, backgroundColor: "rgba(0,0,0,0)", letterSpacing: "0.02em", hover: { color: GOLD } },
              },
            },
          ],
        },
        {
          id: "impronta-hf-cities",
          kind: "paragraph",
          props: {
            text: "Riviera Maya   ·   Mexico City   ·   Buenos Aires   ·   More cities coming",
            style: { fontFamily: INTER, fontSize: "13px", fontWeight: 600, letterSpacing: "0.06em", textColor: FAINT, marginTopFree: "40px", align: "center" },
          },
        },
        {
          id: "impronta-hf-trust",
          kind: "rich_text",
          props: {
            text: "{accent}120+{/accent} represented talent · agency-managed from inquiry to confirmation",
            style: { fontFamily: INTER, fontSize: "13px", textColor: MUTED, marginTopFree: "12px", align: "center", accentColor: GOLD_BRIGHT },
          },
        },
      ],
    },
  ],
};

const heroClassic: BuilderNode = {
  id: "impronta-hero-classic",
  kind: "container",
  props: {
    layout: "stack",
    align: "center",
    style: { width: "100%", maxWidthFree: "100%", paddingTop: "40px", paddingRight: "32px", paddingBottom: "100px", paddingLeft: "32px", gap: "0px", backgroundColor: INK, textColor: TEXT, borderColor: HAIRLINE, borderWidth: "1px 0px 0px 0px", borderStyle: "solid", responsive: { mobile: { paddingRight: "20px", paddingLeft: "20px", paddingBottom: "64px" } } },
  },
  children: [
    {
      id: "impronta-hc-grid",
      kind: "container",
      props: {
        layout: "row",
        align: "center",
        responsive: { tablet: { layout: "stack" }, mobile: { layout: "stack" } },
        style: { width: "100%", maxWidthFree: "1220px", gap: "56px", paddingTop: "70px", justifyContent: "space-between" },
      },
      children: [
        {
          id: "impronta-hc-copy",
          kind: "container",
          props: { layout: "stack", style: { maxWidthFree: "560px", gap: "0px" } },
          children: [
            {
              id: "impronta-hc-title",
              kind: "heading",
              props: {
                text: "Discover premium talent across destination cities.",
                level: 1,
                style: { fontFamily: FRAUNCES, fontSize: "60px", lineHeight: "1.02", fontWeight: 500, letterSpacing: "-0.015em", textColor: TEXT, textWrap: "balance", marginBottomFree: "0px", responsive: { tablet: { fontSize: "48px" }, mobile: { fontSize: "36px" } } },
              },
            },
            {
              id: "impronta-hc-sub",
              kind: "paragraph",
              props: {
                text: "Premium models, hosts, performers and creators for events, productions and brand experiences — Riviera Maya, Mexico City, Buenos Aires & beyond.",
                style: { fontFamily: INTER, fontSize: "17px", lineHeight: "1.62", textColor: MUTED, marginTopFree: "22px" },
              },
            },
            // discovery form card
            {
              id: "impronta-hc-form",
              kind: "container",
              props: {
                layout: "stack",
                style: { marginTopFree: "30px", gap: "14px", backgroundColor: CARD, borderColor: CARD_BORDER, borderWidth: "1px", borderStyle: "solid", borderRadius: "6px", paddingTop: "20px", paddingBottom: "20px", paddingLeft: "20px", paddingRight: "20px", maxWidthFree: "520px" },
              },
              children: [
                {
                  id: "impronta-hc-form-label",
                  kind: "paragraph",
                  props: { text: "Find talent for your event, production or brand", style: { fontFamily: CINZEL, fontSize: "11px", letterSpacing: "0.2em", textTransform: "uppercase", textColor: FAINT } },
                },
                {
                  id: "impronta-hc-form-row",
                  kind: "container",
                  props: { layout: "row", align: "end", responsive: { mobile: { layout: "stack", align: "stretch" } }, style: { gap: "12px" } },
                  children: [
                    {
                      id: "impronta-hc-f1",
                      kind: "container",
                      props: { layout: "stack", style: { gap: "6px", width: "100%" } },
                      children: [
                        { id: "impronta-hc-f1-l", kind: "paragraph", props: { text: "Looking for", style: { fontFamily: INTER, fontSize: "11px", textColor: FAINT, textTransform: "uppercase", letterSpacing: "0.1em" } } },
                        { id: "impronta-hc-f1-v", kind: "paragraph", props: { text: "All talent ▾", style: { fontFamily: INTER, fontSize: "15px", textColor: TEXT, backgroundColor: "rgba(255,255,255,0.04)", borderColor: CARD_BORDER, borderWidth: "1px", borderStyle: "solid", borderRadius: "3px", paddingTop: "10px", paddingBottom: "10px", paddingLeft: "12px", paddingRight: "12px" } } },
                      ],
                    },
                    {
                      id: "impronta-hc-f2",
                      kind: "container",
                      props: { layout: "stack", style: { gap: "6px", width: "100%" } },
                      children: [
                        { id: "impronta-hc-f2-l", kind: "paragraph", props: { text: "Market", style: { fontFamily: INTER, fontSize: "11px", textColor: FAINT, textTransform: "uppercase", letterSpacing: "0.1em" } } },
                        { id: "impronta-hc-f2-v", kind: "paragraph", props: { text: "All markets ▾", style: { fontFamily: INTER, fontSize: "15px", textColor: TEXT, backgroundColor: "rgba(255,255,255,0.04)", borderColor: CARD_BORDER, borderWidth: "1px", borderStyle: "solid", borderRadius: "3px", paddingTop: "10px", paddingBottom: "10px", paddingLeft: "12px", paddingRight: "12px" } } },
                      ],
                    },
                    goldButton("impronta-hc-form-go", "Explore", "/directory"),
                  ],
                },
              ],
            },
          ],
        },
        // stage cards
        {
          id: "impronta-hc-stage",
          kind: "container",
          props: { layout: "row", align: "center", style: { gap: "16px", maxWidthFree: "560px", justifyContent: "center" } },
          children: [
            {
              id: "impronta-hc-stage-l",
              kind: "image",
              props: { src: PHOTO.party, alt: "Lucía M.", style: { width: "120px", aspectRatioFree: "0.7", objectFit: "cover", objectPosition: "center", borderRadius: "4px", marginTopFree: "40px", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" } },
            },
            {
              id: "impronta-hc-stage-main",
              kind: "container",
              props: { layout: "stack", align: "center", style: { gap: "10px" } },
              children: [
                { id: "impronta-hc-stage-tab", kind: "paragraph", props: { text: "SELECTED", style: { fontFamily: CINZEL, fontSize: "10px", letterSpacing: "0.24em", textColor: "#1a1407", backgroundColor: GOLD, paddingTop: "4px", paddingBottom: "4px", paddingLeft: "12px", paddingRight: "12px", borderRadius: "2px" } } },
                { id: "impronta-hc-stage-img", kind: "image", props: { src: PHOTO.runway, alt: "Sofía R.", style: { width: "260px", aspectRatioFree: "0.74", objectFit: "cover", objectPosition: "center top", borderRadius: "4px", boxShadow: "0 30px 70px rgba(0,0,0,0.6)" } } },
                { id: "impronta-hc-stage-name", kind: "paragraph", props: { text: "Sofía R.", style: { fontFamily: FRAUNCES, fontSize: "20px", textColor: TEXT, align: "center", marginBottomFree: "0px" } } },
                { id: "impronta-hc-stage-role", kind: "paragraph", props: { text: "Editorial · Tulum", style: { fontFamily: INTER, fontSize: "12px", letterSpacing: "0.08em", textColor: FAINT, align: "center" } } },
              ],
            },
            {
              id: "impronta-hc-stage-r",
              kind: "image",
              props: { src: PHOTO.hosts, alt: "Marco V.", style: { width: "120px", aspectRatioFree: "0.7", objectFit: "cover", objectPosition: "center", borderRadius: "4px", marginTopFree: "40px", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" } },
            },
          ],
        },
      ],
    },
  ],
};

// Talent by discipline (rail/grid repeater)
const disciplines: BuilderNode = band("impronta-disciplines", SURFACE, [
  {
    id: "impronta-disc-head",
    kind: "container",
    props: { layout: "row", align: "end", responsive: { mobile: { layout: "stack", align: "start" } }, style: { width: "100%", maxWidthFree: "100%", justifyContent: "space-between", gap: "16px" } },
    children: [
      { id: "impronta-disc-head-l", kind: "container", props: { layout: "stack", style: { gap: "0px" } }, children: [eyebrow("The roster"), sectionTitle("Talent, by discipline", "impronta-disc-title")] },
      { id: "impronta-disc-see", kind: "button", props: { label: "See all →", href: "/directory", tone: "secondary", style: { fontFamily: INTER, fontSize: "14px", fontWeight: 600, textColor: GOLD_BRIGHT, backgroundColor: "rgba(0,0,0,0)", hover: { color: GOLD } } } },
    ],
  },
  {
    id: "impronta-disc-grid",
    kind: "container",
    props: {
      layout: "grid",
      columns: 4,
      gap: "m",
      dataBinding: { sourceKey: "impronta_disciplines", mode: "bound", repeat: true, maxItems: 8 },
      style: { width: "100%", maxWidthFree: "100%", gap: "18px", responsive: { tablet: { gridTemplateColumns: "repeat(2,minmax(0,1fr))" } } },
    },
    children: [
      {
        id: "impronta-disc-card",
        kind: "container",
        props: { layout: "stack", style: { gap: "0px", borderRadius: "6px", overflow: "hidden", borderColor: CARD_BORDER, borderWidth: "1px", borderStyle: "solid", backgroundColor: CARD, containerType: "inline-size", transitionProperty: "translate, border-color", transitionDuration: "220ms", transitionTimingFunction: "ease", hover: { translate: "0 -6px", borderColor: HAIRLINE } } },
        children: [
          { id: "impronta-disc-card-img", kind: "image", props: { src: PHOTO.runway, alt: "Discipline", fieldBindings: { src: "imageUrl", alt: "name" }, style: { width: "100%", aspectRatio: "4:3", objectFit: "cover", objectPosition: "center" } } },
          {
            id: "impronta-disc-card-body",
            kind: "container",
            props: { layout: "stack", style: { gap: "4px", paddingTop: "16px", paddingBottom: "18px", paddingLeft: "16px", paddingRight: "16px" } },
            children: [
              { id: "impronta-disc-card-name", kind: "heading", props: { text: "{{name}}", level: 3, fieldBindings: { text: "name" }, style: { fontFamily: FRAUNCES, fontSize: "21px", fontWeight: 500, textColor: TEXT, marginBottomFree: "0px" } } },
              { id: "impronta-disc-card-blurb", kind: "paragraph", props: { text: "{{blurb}}", fieldBindings: { text: "blurb" }, style: { fontFamily: INTER, fontSize: "13px", textColor: MUTED } } },
            ],
          },
        ],
      },
    ],
  },
]);

// Featured talent
const featured: BuilderNode = band("impronta-featured", INK, [
  centerHead("impronta-feat", "Selected", "Featured talent"),
  {
    id: "impronta-feat-grid",
    kind: "container",
    props: {
      layout: "grid",
      columns: 4,
      gap: "m",
      dataBinding: { sourceKey: "impronta_featured", mode: "bound", repeat: true, maxItems: 4 },
      style: { width: "100%", maxWidthFree: "100%", gap: "20px", responsive: { tablet: { gridTemplateColumns: "repeat(2,minmax(0,1fr))" } } },
    },
    children: [
      {
        id: "impronta-feat-card",
        kind: "container",
        props: { layout: "stack", style: { gap: "0px", borderRadius: "6px", overflow: "hidden", borderColor: CARD_BORDER, borderWidth: "1px", borderStyle: "solid", backgroundColor: CARD, transitionProperty: "translate", transitionDuration: "220ms", transitionTimingFunction: "ease", hover: { translate: "0 -6px" } } },
        children: [
          { id: "impronta-feat-card-img", kind: "image", props: { src: PHOTO.runway, alt: "Talent", fieldBindings: { src: "imageUrl", alt: "name" }, style: { width: "100%", aspectRatio: "3:4", objectFit: "cover", objectPosition: "center top" } } },
          {
            id: "impronta-feat-card-body",
            kind: "container",
            props: { layout: "stack", style: { gap: "3px", paddingTop: "14px", paddingBottom: "16px", paddingLeft: "16px", paddingRight: "16px" } },
            children: [
              { id: "impronta-feat-card-name", kind: "heading", props: { text: "{{name}}", level: 3, fieldBindings: { text: "name" }, style: { fontFamily: FRAUNCES, fontSize: "20px", fontWeight: 500, textColor: TEXT, marginBottomFree: "0px" } } },
              { id: "impronta-feat-card-role", kind: "paragraph", props: { text: "{{role}}", fieldBindings: { text: "role" }, style: { fontFamily: INTER, fontSize: "12px", letterSpacing: "0.06em", textColor: GOLD_BRIGHT } } },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "impronta-feat-foot",
    kind: "container",
    props: { layout: "stack", align: "center", style: { width: "100%", marginTopFree: "12px" } },
    children: [{ id: "impronta-feat-explore", kind: "button", props: { label: "Explore Talent →", href: "/directory", tone: "secondary", style: { fontFamily: INTER, fontSize: "14px", fontWeight: 600, textColor: GOLD_BRIGHT, backgroundColor: "rgba(0,0,0,0)", hover: { color: GOLD } } } }],
  },
]);

// Local faces / markets
const markets: BuilderNode = band(
  "impronta-markets",
  WARM,
  [
    centerHead("impronta-mk", "Talent network", "Local faces, international reach.", "Starting with Riviera Maya, expanding across Mexico City, Buenos Aires, and other creative markets — international reach with a real team in every market."),
    {
      id: "impronta-mk-grid",
      kind: "container",
      props: {
        layout: "grid",
        columns: 4,
        gap: "m",
        dataBinding: { sourceKey: "impronta_markets", mode: "bound", repeat: true, maxItems: 5 },
        style: { width: "100%", maxWidthFree: "100%", gap: "14px", gridTemplateColumns: "repeat(5,minmax(0,1fr))", responsive: { tablet: { gridTemplateColumns: "repeat(2,minmax(0,1fr))" }, mobile: { gridTemplateColumns: "repeat(1,minmax(0,1fr))" } } },
      },
      children: [
        {
          id: "impronta-mk-card",
          kind: "container",
          props: { layout: "stack", align: "start", style: { gap: "8px", borderRadius: "6px", borderColor: HAIRLINE, borderWidth: "1px", borderStyle: "solid", backgroundColor: "rgba(201,162,39,0.04)", paddingTop: "20px", paddingBottom: "22px", paddingLeft: "18px", paddingRight: "18px", minHeight: "120px", justifyContent: "space-between" } },
          children: [
            { id: "impronta-mk-card-dot", kind: "paragraph", props: { text: "◆", style: { fontFamily: INTER, fontSize: "13px", textColor: GOLD } } },
            { id: "impronta-mk-card-name", kind: "heading", props: { text: "{{name}}", level: 3, fieldBindings: { text: "name" }, style: { fontFamily: FRAUNCES, fontSize: "22px", fontWeight: 500, textColor: TEXT, marginBottomFree: "0px" } } },
            { id: "impronta-mk-card-status", kind: "paragraph", props: { text: "{{status}}", fieldBindings: { text: "status" }, style: { fontFamily: INTER, fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", textColor: MUTED } } },
          ],
        },
      ],
    },
  ],
);

// Process
const process: BuilderNode = band("impronta-process", INK, [
  centerHead("impronta-proc", "How it works", "A clear, professional process"),
  {
    id: "impronta-proc-grid",
    kind: "container",
    props: {
      layout: "grid",
      columns: 4,
      gap: "m",
      dataBinding: { sourceKey: "impronta_steps", mode: "bound", repeat: true, maxItems: 4 },
      style: { width: "100%", maxWidthFree: "100%", gap: "20px", responsive: { tablet: { gridTemplateColumns: "repeat(2,minmax(0,1fr))" } } },
    },
    children: [
      {
        id: "impronta-proc-card",
        kind: "container",
        props: { layout: "stack", style: { gap: "10px", paddingTop: "24px", borderColor: HAIRLINE, borderWidth: "1px 0px 0px 0px", borderStyle: "solid" } },
        children: [
          { id: "impronta-proc-num", kind: "paragraph", props: { text: "{{num}}", fieldBindings: { text: "num" }, style: { fontFamily: FRAUNCES, fontSize: "30px", fontWeight: 500, textColor: GOLD } } },
          { id: "impronta-proc-title", kind: "heading", props: { text: "{{title}}", level: 3, fieldBindings: { text: "title" }, style: { fontFamily: FRAUNCES, fontSize: "19px", fontWeight: 500, textColor: TEXT, marginBottomFree: "0px" } } },
          { id: "impronta-proc-detail", kind: "paragraph", props: { text: "{{detail}}", fieldBindings: { text: "detail" }, style: { fontFamily: INTER, fontSize: "14px", lineHeight: "1.55", textColor: MUTED } } },
        ],
      },
    ],
  },
]);

// Pillars (an agency, not a directory)
const pillars: BuilderNode = band("impronta-pillars", SURFACE, [
  centerHead("impronta-pil", "Why Impronta", "An agency, not a directory", "Every booking is supported by real coordination, local knowledge, and reviewed, agency-approved talent — in every market we operate."),
  {
    id: "impronta-pil-grid",
    kind: "container",
    props: {
      layout: "grid",
      columns: 3,
      gap: "m",
      dataBinding: { sourceKey: "impronta_pillars", mode: "bound", repeat: true, maxItems: 3 },
      style: { width: "100%", maxWidthFree: "100%", gap: "20px", responsive: { mobile: { gridTemplateColumns: "repeat(1,minmax(0,1fr))" } } },
    },
    children: [
      {
        id: "impronta-pil-card",
        kind: "container",
        props: { layout: "stack", style: { gap: "12px", backgroundColor: CARD, borderColor: CARD_BORDER, borderWidth: "1px", borderStyle: "solid", borderRadius: "6px", paddingTop: "28px", paddingBottom: "28px", paddingLeft: "24px", paddingRight: "24px" } },
        children: [
          { id: "impronta-pil-mark", kind: "paragraph", props: { text: "✓", style: { fontFamily: INTER, fontSize: "18px", fontWeight: 700, textColor: GOLD, backgroundColor: "rgba(201,162,39,0.12)", borderRadius: "999px", width: "40px", height: "40px", align: "center", lineHeight: "40px" } } },
          { id: "impronta-pil-title", kind: "heading", props: { text: "{{title}}", level: 3, fieldBindings: { text: "title" }, style: { fontFamily: FRAUNCES, fontSize: "21px", fontWeight: 500, textColor: TEXT, marginBottomFree: "0px" } } },
          { id: "impronta-pil-detail", kind: "paragraph", props: { text: "{{detail}}", fieldBindings: { text: "detail" }, style: { fontFamily: INTER, fontSize: "14px", lineHeight: "1.55", textColor: MUTED } } },
        ],
      },
    ],
  },
]);

// Join (talent CTA)
const join: BuilderNode = band("impronta-join", INK, [
  {
    id: "impronta-join-card",
    kind: "container",
    props: { layout: "stack", align: "center", style: { width: "100%", maxWidthFree: "760px", marginLeftFree: "auto", marginRightFree: "auto", gap: "0px", align: "center", backgroundColor: CARD, borderColor: CARD_BORDER, borderWidth: "1px", borderStyle: "solid", borderRadius: "10px", paddingTop: "56px", paddingBottom: "56px", paddingLeft: "32px", paddingRight: "32px" } },
    children: [
      eyebrow("For talent"),
      { id: "impronta-join-h", kind: "heading", props: { text: "Are you a model, host, performer or creator?", level: 3, style: { fontFamily: FRAUNCES, fontSize: "34px", lineHeight: "1.1", fontWeight: 500, textColor: TEXT, textWrap: "balance", align: "center", marginBottomFree: "0px", responsive: { mobile: { fontSize: "26px" } } } } },
      { id: "impronta-join-p", kind: "paragraph", props: { text: "Build your agency-managed profile — availability, portfolio and rates in one place — and be considered for selected opportunities across our growing network of markets.", style: { fontFamily: INTER, fontSize: "16px", lineHeight: "1.6", textColor: MUTED, marginTopFree: "16px", align: "center", maxWidthFree: "560px" } } },
      { id: "impronta-join-actions", kind: "container", props: { layout: "row", align: "center", responsive: { mobile: { layout: "stack" } }, style: { gap: "18px", marginTopFree: "28px", justifyContent: "center" } }, children: [goldButton("impronta-join-cta", "Apply as Talent", "/join"), lineButton("impronta-join-login", "Talent Login →", "/login")] },
    ],
  },
]);

// Final CTA
const finalCta: BuilderNode = band(
  "impronta-final",
  INK,
  [
    {
      id: "impronta-final-inner",
      kind: "container",
      props: { layout: "stack", align: "center", style: { width: "100%", maxWidthFree: "780px", marginLeftFree: "auto", marginRightFree: "auto", gap: "0px", align: "center" } },
      children: [
        eyebrow("Start"),
        { id: "impronta-final-h", kind: "heading", props: { text: "Planning an event, shoot, activation, or private experience?", level: 2, style: { fontFamily: FRAUNCES, fontSize: "44px", lineHeight: "1.06", fontWeight: 500, letterSpacing: "-0.01em", textColor: TEXT, textWrap: "balance", align: "center", marginBottomFree: "0px", responsive: { mobile: { fontSize: "30px" } } } } },
        { id: "impronta-final-p", kind: "paragraph", props: { text: "Tell us the brief and your market. We'll match the right talent — a coordinator replies personally.", style: { fontFamily: INTER, fontSize: "17px", lineHeight: "1.6", textColor: MUTED, marginTopFree: "18px", align: "center", maxWidthFree: "560px" } } },
        { id: "impronta-final-actions", kind: "container", props: { layout: "row", align: "center", responsive: { mobile: { layout: "stack" } }, style: { gap: "18px", marginTopFree: "30px", justifyContent: "center" } }, children: [goldButton("impronta-final-cta", "Start an Inquiry", "/inquiry"), lineButton("impronta-final-explore", "Explore Talent", "/directory")] },
      ],
    },
  ],
  { borderTop: true },
);

const improntaTree: BuilderNode[] = [
  {
    id: "impronta-page",
    kind: "container",
    props: { layout: "stack", style: { width: "100%", maxWidthFree: "100%", gap: "0px", backgroundColor: INK } },
    children: [heroFind, heroClassic, disciplines, featured, markets, process, pillars, join, finalCta],
  },
];

export const improntaDesign: PageDesign = {
  id: "impronta",
  title: "Impronta — Models & Image Agency",
  label: "Impronta agency",
  description:
    "The Impronta Models flagship home, freeform: a dark editorial models-&-image agency site with a warm-gold accent, a directory-search hero, a discipline roster, featured talent, markets, process, and inquiry CTAs.",
  archetype: "agency",
  tree: improntaTree,
  dataSources,
};
