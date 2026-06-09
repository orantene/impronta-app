/* eslint-disable max-lines -- hand-authored page-design BuilderNode tree (data); inherently large, like the other page-designs. */
import type { BuilderNode } from "../types";
import type { BuilderNodeRenderDataSources } from "../render";
import type { PageDesign } from "./types";
import { buildTalentDisciplineDecomposedSection } from "../talent-discipline-freeform";
import { buildFeaturedTalentDecomposedSection, gridOnlyFeaturedTalentConfig } from "../featured-talent-freeform";
import { buildLocationDiscoveryDecomposedSection, gridOnlyLocationDiscoveryConfig } from "../location-discovery-freeform";
import { FRAUNCES, CINZEL, INTER } from "./tokens";

/**
 * IMPRONTA — the flagship tenant homepage, rebuilt freeform.
 *
 * A faithful freeform recreation of the Impronta Models home (the v11-features
 * prototype + the live section-slot page): a dark, editorial models-&-image
 * agency site on a near-black canvas with a single warm-gold accent, a
 * high-contrast Fraunces display serif over Inter body, and Cinzel small-caps
 * eyebrows. The hero stage + Featured Talent show REAL represented roster
 * portraits (never placeholder boxes); the discipline rail uses a licensed
 * editorial set pending a first-party shoot (see the `disciplines` note).
 *
 * Sections: a search-first hero (freeform Title / Search Form / CTAs / chips) →
 * "Discover premium talent" stage-card hero → talent-by-discipline rail →
 * featured talent → markets / "Local faces" (real `location_discovery` Tulala
 * component, roster-derived live counts) → a clear process with a connected
 * step rail → "an agency, not a directory" pillars (per-pillar icons) → talent
 * join CTA → final inquiry CTA. Authored as freeform primitives, P3 repeaters,
 * and real `section_embed`s so every block is selectable, restyleable, and
 * movable in the builder — and the interactive moments are REAL, not faked.
 *
 * Real-component decisions (Wave-2 flagship pass — see builder audit
 * 2026-06-02):
 *   - The hero search row is a native GET form (`action=/directory`, field `q`) as
 *     freeform layers — not a monolithic `hero_search` section_embed (so Title,
 *     Search Form, and buttons are separate layers in Page Structure).
 *   - The "markets map" is now a real `location_discovery` section_embed
 *     (source: roster_cities → live per-city counts + featured-market panel,
 *     real /directory links). The registered map visual is the section's own
 *     token-driven editorial map (NOT the legacy home Google-Maps LocationMap,
 *     which is only wired into the removed home-storefront data path and is not
 *     a registered embeddable section — rebuilding it as one is out of scope per
 *     notes/map-component-findings.md "do NOT rebuild the map").
 *   - The hero-2 "discovery form" is REMOVED: the directory route accepts
 *     ?q=/?location=/?tax= only — there is no ?type=/?market= param — so a
 *     two-select form would carry dead params. The stage cards + a real
 *     "Explore the directory" CTA replace it (honest, no decorative inputs).
 *   - Motion: every section band rises on scroll (animationPreset:"rise" +
 *     animationTrigger:"scroll"); prefers-reduced-motion is honoured by the
 *     static renderer sheet.
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

// Real represented Impronta talent (public media-public bucket) for the hero
// stage cards — actual roster portraits, not stock. The Featured Talent section
// below pulls the same roster live (manualProfileCodes). All three resolve to a
// real uploaded asset today (verified in prod 2026-06-02: tina = a `card`
// variant; anto + nalea = `gallery` variants — both render). If these three ever
// rotate, pick roster profiles that have an approved media asset so the stage
// never shows a broken image.
const TALENT = {
  anto: "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/42b0d16f-de76-49f3-bc98-f80b5bba377d/gallery/ac0412e7-c608-4b68-bc0d-13af97790fd3.jpg",
  tina: "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/1da42501-2e82-4af4-83cd-5bb97ec64718/card/ef913606-660b-4661-857f-bde4c67784e9.webp",
  nalea: "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/72033ce0-e8be-4e22-8981-1caa52c3207d/gallery/346ce0a8-ea98-4acb-9c56-df1cb6eaeff3.jpg",
} as const;

const dataSources: BuilderNodeRenderDataSources = {
  collections: {
    // impronta_disciplines and impronta_featured were removed: the discipline
    // discipline rail is a container + freeform title + grid-only talent_type_grid embed,
    // and featured talent is a section_embed of featured_talent (live roster).
    // impronta_markets was removed: the markets panel is now a real
    // location_discovery section_embed (roster-derived counts), not a repeater.
    // impronta_pillars was removed: the three pillars are now explicit static
    // cards so each can carry its own tailored icon (a repeater can't vary the
    // icon enum per item) — see the `pillars` section below.
    impronta_steps: [
      { id: "s1", num: "01", title: "Tell us the brief", detail: "Market, dates, the look you need." },
      { id: "s2", num: "02", title: "We shortlist options", detail: "A shortlist tailored to your project." },
      { id: "s3", num: "03", title: "Confirm talent", detail: "You choose. We secure availability." },
      { id: "s4", num: "04", title: "Coordinate the booking", detail: "Local coordination, contracts, logistics." },
    ],
  },
};

// Scroll-driven entrance shared by every section band — the band rises into
// place as it enters the viewport (Impronta was the only page-design with 0
// motion). Pure CSS scroll-timeline (animation-timeline:view()); the static
// renderer sheet disables it under prefers-reduced-motion. Mirrors the
// agency/editorial/studio designs' band reveal.
const RISE = {
  animationPreset: "rise" as const,
  animationTrigger: "scroll" as const,
  animationDuration: "0.9s",
  animationEasing: "smooth" as const,
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

// Gold-glow radial wash — a centred warm bloom for the conversion bands
// (Join + Final CTA), matching the prototype's lit CTA panels.
const GOLD_GLOW =
  "radial-gradient(60% 70% at 50% 18%, rgba(201,162,39,0.16), rgba(201,162,39,0) 62%)";

const band = (
  id: string,
  background: string,
  children: BuilderNode[],
  opts: { borderTop?: boolean; glow?: boolean } = {},
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
      ...(opts.glow ? { backgroundImage: GOLD_GLOW } : {}),
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
      props: { layout: "stack", style: { width: "100%", maxWidthFree: "1220px", gap: "40px", ...RISE } },
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

/** Decomposed hero search — each row is its own builder layer (not one Tulala embed). */
function improntaHeroSearchLayers(): BuilderNode[] {
  return [
    {
      id: "impronta-hf-eyebrow",
      kind: "paragraph",
      props: {
        text: "Models & Image Agency",
        layerLabel: "Intro Text",
        style: {
          fontFamily: CINZEL,
          fontSize: "12px",
          fontWeight: 600,
          letterSpacing: "0.32em",
          textTransform: "uppercase",
          textColor: GOLD,
          align: "center",
          marginBottomFree: "14px",
        },
      },
    },
    {
      id: "impronta-hf-title",
      kind: "heading",
      props: {
        text: "Find the right talent for your brief.",
        level: 1,
        layerLabel: "Title",
        style: {
          fontFamily: FRAUNCES,
          fontSize: "clamp(2.8rem, 7vw, 6.4rem)",
          lineHeight: "1.02",
          fontWeight: 500,
          letterSpacing: "-0.015em",
          textColor: TEXT,
          textTransform: "uppercase",
          textWrap: "balance",
          align: "center",
          marginBottomFree: "0px",
          responsive: { tablet: { fontSize: "48px" }, mobile: { fontSize: "36px" } },
        },
      },
    },
    {
      id: "impronta-hf-sub",
      kind: "paragraph",
      props: {
        text: "Search the directory by role, location or fit — agency-managed, no direct contact.",
        layerLabel: "Subtitle",
        style: {
          fontFamily: INTER,
          fontSize: "17px",
          lineHeight: "1.62",
          textColor: MUTED,
          align: "center",
          marginTopFree: "22px",
          maxWidthFree: "640px",
          marginLeftFree: "auto",
          marginRightFree: "auto",
        },
      },
    },
    {
      id: "impronta-hf-search",
      kind: "form",
      props: {
        action: "/directory",
        method: "get",
        layerLabel: "Search Form",
        fields: [
          {
            id: "impronta-hf-q",
            name: "q",
            type: "text",
            label: "Search",
            placeholder: "Bilingual hosts for a product launch in Tulum…",
            required: false,
          },
          {
            id: "impronta-hf-submit",
            name: "submit",
            type: "submit",
            label: "Search",
          },
        ],
        style: {
          maxWidthFree: "640px",
          marginLeftFree: "auto",
          marginRightFree: "auto",
          width: "100%",
          marginTopFree: "28px",
        },
      },
    },
    {
      id: "impronta-hf-actions",
      kind: "container",
      props: {
        layout: "row",
        align: "center",
        layerLabel: "Button Group",
        responsive: { mobile: { layout: "stack", align: "stretch" } },
        style: {
          marginTopFree: "24px",
          gap: "16px",
          justifyContent: "center",
        },
      },
      children: [
        goldButton("impronta-hf-inquiry", "Start an Inquiry", "/inquiry"),
        lineButton("impronta-hf-apply", "Apply as talent →", "/join"),
      ],
    },
    {
      id: "impronta-hf-chips",
      kind: "container",
      props: {
        layout: "row",
        align: "center",
        layerLabel: "Location Chips",
        style: { marginTopFree: "20px", gap: "10px", flexWrap: "wrap", justifyContent: "center" },
      },
      children: [
        lineButton("impronta-hf-chip-rm", "Riviera Maya", "/directory"),
        lineButton("impronta-hf-chip-cdmx", "Mexico City", "/directory"),
        lineButton("impronta-hf-chip-ba", "Buenos Aires", "/directory"),
      ],
    },
    {
      id: "impronta-hf-stat",
      kind: "paragraph",
      props: {
        text: "27+ represented talent · agency-managed end to end",
        layerLabel: "Stats Text",
        style: {
          fontFamily: INTER,
          fontSize: "13px",
          textColor: FAINT,
          align: "center",
          marginTopFree: "18px",
        },
      },
    },
  ];
}

// Search-first hero — freeform layers inside the dark editorial band (gold radial
// wash + Fraunces/Cinzel/Inter). Connected blocks below (discipline rail, featured
// talent, markets) stay as `section_embed`s where live roster data is required.
const heroFind: BuilderNode = {
  id: "impronta-hero-find",
  kind: "container",
  props: {
    layout: "stack",
    align: "center",
    style: {
      width: "100%",
      maxWidthFree: "100%",
      paddingTop: "104px",
      paddingRight: "32px",
      paddingBottom: "84px",
      paddingLeft: "32px",
      gap: "0px",
      backgroundColor: INK,
      backgroundImage:
        "radial-gradient(120% 80% at 50% 0%, rgba(201,162,39,0.10), rgba(201,162,39,0) 60%), linear-gradient(180deg,#090b0f 0%,#07090c 100%)",
      textColor: TEXT,
      responsive: { mobile: { paddingTop: "76px", paddingBottom: "60px", paddingRight: "20px", paddingLeft: "20px" } },
    },
  },
  children: [
    {
      id: "impronta-hero-find-wrap",
      kind: "container",
      props: { layout: "stack", align: "center", style: { width: "100%", maxWidthFree: "920px", gap: "0px", align: "center", ...RISE } },
      children: improntaHeroSearchLayers(),
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
            // Real entry points for the CLIENT. The fake two-select "discovery
            // form" was removed: the /directory route filters on ?q=/?location=
            // /?tax= only — there is no ?type=/?market= param — so styled selects
            // would carry dead params. The hero_search bar above is the real
            // query surface + the talent-apply path; this second hero is
            // client-facing, so it sends people into the full directory or
            // straight to an inquiry (the talent CTA lives in the Join band).
            {
              id: "impronta-hc-actions",
              kind: "container",
              props: { layout: "row", align: "center", responsive: { mobile: { layout: "stack", align: "stretch" } }, style: { marginTopFree: "30px", gap: "16px" } },
              children: [
                goldButton("impronta-hc-explore", "Explore the directory", "/directory"),
                {
                  id: "impronta-hc-inquire",
                  kind: "button",
                  props: {
                    label: "Start an Inquiry →",
                    href: "/inquiry",
                    tone: "secondary",
                    style: { fontFamily: INTER, fontSize: "14px", fontWeight: 600, textColor: GOLD_BRIGHT, backgroundColor: "rgba(0,0,0,0)", letterSpacing: "0.02em", paddingTop: "14px", paddingBottom: "14px", hover: { color: GOLD } },
                  },
                },
              ],
            },
          ],
        },
        // stage cards — overlapping stacked portraits (rotation + negative gutters + depth)
        {
          id: "impronta-hc-stage",
          kind: "container",
          props: { layout: "row", align: "center", style: { gap: "0px", maxWidthFree: "560px", justifyContent: "center", paddingTop: "24px", paddingBottom: "24px" } },
          children: [
            {
              id: "impronta-hc-stage-l",
              kind: "image",
              props: { src: TALENT.nalea, alt: "Nalea", style: { width: "158px", aspectRatioFree: "0.72", objectFit: "cover", objectPosition: "center top", borderRadius: "6px", rotate: "-5deg", marginTopFree: "44px", marginRightFree: "-38px", zIndex: 1, boxShadow: "0 24px 60px rgba(0,0,0,0.55)", borderColor: "rgba(255,255,255,0.08)", borderWidth: "1px", borderStyle: "solid" } },
            },
            {
              id: "impronta-hc-stage-main",
              kind: "container",
              props: { layout: "stack", align: "center", style: { gap: "12px", zIndex: 3 } },
              children: [
                { id: "impronta-hc-stage-tab", kind: "paragraph", props: { text: "SELECTED", style: { fontFamily: CINZEL, fontSize: "10px", letterSpacing: "0.24em", textColor: "#1a1407", backgroundColor: GOLD, paddingTop: "4px", paddingBottom: "4px", paddingLeft: "12px", paddingRight: "12px", borderRadius: "2px" } } },
                { id: "impronta-hc-stage-img", kind: "image", props: { src: TALENT.anto, alt: "Anto", style: { width: "256px", aspectRatioFree: "0.74", objectFit: "cover", objectPosition: "center top", borderRadius: "6px", boxShadow: "0 36px 80px rgba(0,0,0,0.65)", borderColor: HAIRLINE, borderWidth: "1px", borderStyle: "solid" } } },
                { id: "impronta-hc-stage-name", kind: "paragraph", props: { text: "Anto", style: { fontFamily: FRAUNCES, fontSize: "20px", textColor: TEXT, align: "center", marginBottomFree: "0px" } } },
                { id: "impronta-hc-stage-role", kind: "paragraph", props: { text: "Commercial Model · Playa del Carmen", style: { fontFamily: INTER, fontSize: "12px", letterSpacing: "0.08em", textColor: FAINT, align: "center" } } },
              ],
            },
            {
              id: "impronta-hc-stage-r",
              kind: "image",
              props: { src: TALENT.tina, alt: "Tina", style: { width: "158px", aspectRatioFree: "0.72", objectFit: "cover", objectPosition: "center top", borderRadius: "6px", rotate: "5deg", marginTopFree: "44px", marginLeftFree: "-38px", zIndex: 1, boxShadow: "0 24px 60px rgba(0,0,0,0.55)", borderColor: "rgba(255,255,255,0.08)", borderWidth: "1px", borderStyle: "solid" } },
            },
          ],
        },
      ],
    },
  ],
};

// Talent by discipline — freeform header layers + grid-only talent_type_grid embed.
// IMAGERY (P2-VERIFY-DATA): licensed Unsplash placeholders per discipline until
// first-party editorial assets exist.
const disciplines: BuilderNode = buildTalentDisciplineDecomposedSection({
  rootId: "impronta-disciplines",
  eyebrow: "The roster",
  headline: "Talent, by discipline",
  seeAllLabel: "See all",
  seeAllHref: "/directory",
  embedConfig: {
    mode: "manual",
    items: [
      { href: "/directory", icon: "◑", label: "Models", featured: true, imageAlt: "Studio portrait of a model with long blonde hair and a sheer black top.", imageUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=72&w=1200&h=1500", description: "Editorial, runway & commercial" },
      { href: "/directory", icon: "✦", label: "Hosts & Promo", imageAlt: "Confetti falling over a crowded live event.", imageUrl: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&q=72&w=1200&h=760", description: "Brand ambassadors & activations" },
      { href: "/directory", icon: "✷", label: "Chefs & Culinary", imageAlt: "Chef plating food in a professional kitchen.", imageUrl: "https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&q=72&w=1200&h=760", description: "Private chefs & catering" },
      { href: "/directory", icon: "♪", label: "Performers", imageAlt: "Singer performing into a microphone through stage smoke.", imageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&q=72&w=1200&h=760", description: "Dancers, acts & entertainers" },
      { href: "/directory", icon: "❀", label: "Wellness & Beauty", imageAlt: "Close-up beauty portrait showing dramatic eye makeup.", imageUrl: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&q=72&w=1200&h=760", description: "Hair, makeup & wellness" },
      { href: "/directory", icon: "♫", label: "Music & DJs", imageAlt: "Musicians performing on a dark stage with concert lights.", imageUrl: "https://images.unsplash.com/photo-1499364615650-ec38552f4f34?auto=format&fit=crop&q=72&w=1200&h=760", description: "DJs, bands & live music" },
      { href: "/directory", icon: "◉", label: "Photo, Video & Creative", imageAlt: "Camera equipment and lighting set up for a creative shoot.", imageUrl: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&q=72&w=1200&h=760", description: "Photographers & creatives" },
    ],
    maxItems: 7,
    cardRatio: "16/9",
    showCta: true,
    ctaLabel: "Explore",
    showImages: true,
    showDescriptions: true,
    showCardIcons: true,
    showRailControls: true,
    mobileLayout: "horizontal-scroll",
    desktopLayout: "featured-pod-rail",
    textPosition: "overlay-bottom",
    imageOverlayStrength: "strong",
    presentation: {
      background: "espresso",
      dividerTop: "thin-line",
      paddingTop: "editorial",
      paddingBottom: "editorial",
      animation: { entry: "fade-up", reducedMotion: "respect" },
    },
  },
});

// Featured talent — REAL represented roster, decomposed into freeform header
// layers + a grid-only `featured_talent` section_embed. The freeform layers
// (Intro Text "Selected" / Title "FEATURED TALENT" / See All Link) are now
// editable builder nodes; the embed renders talent cards only (headless mode).
//
// CODES VERIFIED (P2-VERIFY-DATA, 2026-06-02): all six resolve to live, active,
// featured profiles — TAL-00036 Anto, TAL-00033 Tina, TAL-00034 Nalea,
// TAL-00031 Lanco, TAL-00035 Annher, TAL-00037 Asia. Three (Lanco/Tina/Asia)
// have a `card` image; the other three are gallery-only — the component's
// resolver falls back across card → public_watermarked → gallery, so all six
// render an image today. Uploading dedicated card crops for Nalea/Annher/Anto
// is a polish follow-up, not an empty-state risk.
const featured: BuilderNode = buildFeaturedTalentDecomposedSection({
  rootId: "impronta-featured",
  eyebrow: "Selected",
  headline: "FEATURED TALENT",
  subheadline: "",
  seeAllLabel: "Explore Talent",
  seeAllHref: "/directory",
  embedConfig: gridOnlyFeaturedTalentConfig({
    limit: 4,
    variant: "grid",
    showCity: true,
    showName: true,
    showBadge: false,
    cardChrome: "v11-noir",
    requestCta: { href: "/contact", label: "Request" },
    sourceMode: "manual_pick",
    actionStyle: "outline-duo",
    cardVariant: "editorial",
    headerAlign: "center",
    layoutPreset: "v11-showcase",
    presentation: { align: "center", background: "canvas", dividerTop: "thin-line", paddingTop: "editorial", paddingBottom: "editorial", containerWidth: "wide", animation: { entry: "fade-up", reducedMotion: "respect" } },
    showLanguages: true,
    columnsDesktop: 4,
    emptyStateText: "Featured profiles appear here as talent are added to the roster.",
    imageTreatment: "cinematic",
    showPrimaryType: true,
    showAvailability: true,
    showBookmarkIcon: true,
    showSecondaryType: true,
    manualProfileCodes: ["TAL-00036", "TAL-00033", "TAL-00034", "TAL-00031", "TAL-00035", "TAL-00037"],
    parentCategoryDisplay: false,
  }),
});

// Local faces / markets — a REAL `location_discovery` Tulala component,
// decomposed into freeform header layers + a grid-only `location_discovery`
// section_embed. The freeform layers (Intro Text / Title / Subtitle / See All
// Link) are now editable builder nodes; the embed renders the map/grid only
// (headless mode — SectionHead suppressed by blank eyebrow/headline/subheadline).
//
// source = "manual" (not "roster_cities") on purpose: roster_cities dumps the
// raw residence cities of roster talent (all flagged "active") and would lose
// both the featured Riviera Maya emphasis and the LA/Madrid expansion narrative.
// Counts are left unset rather than fabricated — the Component only renders a
// per-market count when one is supplied, so nothing fake shows; an operator can
// switch this to roster_cities or add real counts in the section's own editor.
//
// The dark WARM band wrapper (id "impronta-markets") is preserved; the
// decomposed section (rootId "impronta-markets-embed") lives inside it.
const markets: BuilderNode = band(
  "impronta-markets",
  WARM,
  [
    buildLocationDiscoveryDecomposedSection({
      rootId: "impronta-markets-embed",
      eyebrow: "Talent network",
      headline: "Local faces, international reach.",
      subheadline:
        "Starting with Riviera Maya, expanding across Mexico City, Buenos Aires, and other creative markets — international reach with a real team in every market.",
      seeAllLabel: "Browse the directory",
      seeAllHref: "/directory",
      embedConfig: gridOnlyLocationDiscoveryConfig({
        source: "manual",
        items: [
          { label: "Riviera Maya", region: "Mexico", href: "/directory", featured: true, status: "active" },
          { label: "Mexico City", region: "Mexico", href: "/directory", status: "active" },
          { label: "Buenos Aires", region: "Argentina", href: "/directory", status: "active" },
          { label: "Los Angeles", region: "United States", href: "/directory", status: "coming_soon" },
          { label: "Madrid", region: "Spain", href: "/directory", status: "coming_soon" },
        ],
        maxItems: 8,
        showCount: false,
        showMap: true,
        // The live interactive map with talent-profile photos orbiting each
        // city pin (sources live roster cities + featured talent; the manual
        // items above remain as the editorial fallback if no live data).
        mapStyle: "talent_orbit",
        layout: "grid",
        emptyStateText: "Markets appear here as talent join the roster across our cities.",
        presentation: { background: "espresso", align: "center", dividerTop: "thin-line", paddingTop: "none", paddingBottom: "none", animation: { entry: "fade-up", reducedMotion: "respect" } },
      }),
    }),
  ],
);

// Process — a connected step rail. Each step is a numbered disc sitting on a
// shared gold hairline (the disc overlaps a top rule that runs the width of each
// card, reading as one continuous rail across the four steps), with the title +
// detail beneath. Driven by the impronta_steps repeater (a genuine sequence).
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
      style: { width: "100%", maxWidthFree: "100%", gap: "24px", responsive: { tablet: { gridTemplateColumns: "repeat(2,minmax(0,1fr))" } } },
    },
    children: [
      {
        id: "impronta-proc-card",
        kind: "container",
        props: { layout: "stack", style: { gap: "16px" } },
        children: [
          // Rail row: a numbered gold disc on a top hairline that spans the card
          // — the discs line up across the four cards into one connected rail.
          {
            id: "impronta-proc-rail",
            kind: "container",
            props: {
              layout: "row",
              align: "center",
              style: { width: "100%", borderColor: HAIRLINE, borderWidth: "1px 0px 0px 0px", borderStyle: "solid", paddingTop: "20px" },
            },
            children: [
              {
                id: "impronta-proc-num",
                kind: "paragraph",
                props: {
                  text: "{{num}}",
                  fieldBindings: { text: "num" },
                  style: {
                    fontFamily: FRAUNCES,
                    fontSize: "18px",
                    fontWeight: 500,
                    textColor: GOLD,
                    backgroundColor: "#0d100b",
                    borderColor: GOLD,
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderRadius: "999px",
                    width: "46px",
                    height: "46px",
                    align: "center",
                    lineHeight: "44px",
                    marginTopFree: "-43px",
                    marginBottomFree: "0px",
                    boxShadow: "0 0 0 6px #07090c",
                  },
                },
              },
            ],
          },
          { id: "impronta-proc-title", kind: "heading", props: { text: "{{title}}", level: 3, fieldBindings: { text: "title" }, style: { fontFamily: FRAUNCES, fontSize: "19px", fontWeight: 500, textColor: TEXT, marginBottomFree: "0px" } } },
          { id: "impronta-proc-detail", kind: "paragraph", props: { text: "{{detail}}", fieldBindings: { text: "detail" }, style: { fontFamily: INTER, fontSize: "14px", lineHeight: "1.55", textColor: MUTED } } },
        ],
      },
    ],
  },
]);

// Pillars (an agency, not a directory). Explicit static cards (NOT a repeater)
// so each pillar carries its own tailored icon — verification, location, and
// booking — instead of one shared ✓. Icons are real `icon` builder nodes from
// the icon registry (check / map_pin / calendar), the closest registered analogs
// to the prototype's shield / pin / contract marks.
const pillarCard = (
  idx: string,
  icon: "check" | "map_pin" | "calendar",
  title: string,
  detail: string,
): BuilderNode => ({
  id: `impronta-pil-${idx}`,
  kind: "container",
  props: { layout: "stack", style: { gap: "14px", backgroundColor: CARD, borderColor: CARD_BORDER, borderWidth: "1px", borderStyle: "solid", borderRadius: "6px", paddingTop: "28px", paddingBottom: "28px", paddingLeft: "24px", paddingRight: "24px" } },
  children: [
    {
      id: `impronta-pil-${idx}-mark`,
      kind: "container",
      props: {
        layout: "stack",
        align: "center",
        style: { width: "44px", height: "44px", backgroundColor: "rgba(201,162,39,0.12)", borderColor: HAIRLINE, borderWidth: "1px", borderStyle: "solid", borderRadius: "999px", justifyContent: "center", align: "center" },
      },
      children: [
        {
          id: `impronta-pil-${idx}-icon`,
          kind: "icon",
          props: { icon, size: "sm", label: title, style: { textColor: GOLD_BRIGHT } },
        },
      ],
    },
    { id: `impronta-pil-${idx}-title`, kind: "heading", props: { text: title, level: 3, style: { fontFamily: FRAUNCES, fontSize: "21px", fontWeight: 500, textColor: TEXT, marginBottomFree: "0px" } } },
    { id: `impronta-pil-${idx}-detail`, kind: "paragraph", props: { text: detail, style: { fontFamily: INTER, fontSize: "14px", lineHeight: "1.55", textColor: MUTED } } },
  ],
});

const pillars: BuilderNode = band("impronta-pillars", SURFACE, [
  centerHead("impronta-pil", "Why Impronta", "An agency, not a directory", "Every booking is supported by real coordination, local knowledge, and reviewed, agency-approved talent — in every market we operate."),
  {
    id: "impronta-pil-grid",
    kind: "container",
    props: {
      layout: "grid",
      columns: 3,
      gap: "m",
      style: { width: "100%", maxWidthFree: "100%", gap: "20px", responsive: { mobile: { gridTemplateColumns: "repeat(1,minmax(0,1fr))" } } },
    },
    children: [
      pillarCard("verified", "check", "Verified profiles", "Every talent is reviewed and verified before you ever see them."),
      pillarCard("local", "map_pin", "Local coordination", "A real team on the ground in every market — international reach, local execution."),
      pillarCard("booking", "calendar", "Booking support", "Contracts, usage and logistics — managed end to end."),
    ],
  },
]);

// Join (talent CTA) — gold-glow radial band.
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
], { glow: true });

// Final CTA — gold-glow radial band.
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
  { borderTop: true, glow: true },
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
