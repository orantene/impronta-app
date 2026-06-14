/* eslint-disable max-lines -- hand-authored page-design BuilderNode tree (data); inherently large, like the other page-designs. */
import type { BuilderNode } from "../types";
import type { BuilderNodeRenderDataSources } from "../render";
import type { PageDesign } from "./types";
import { buildTalentDisciplineDecomposedSection } from "../talent-discipline-freeform";
import { buildFeaturedTalentDecomposedSection, gridOnlyFeaturedTalentConfig } from "../featured-talent-freeform";
import { styleTokenRef } from "../style-token-bindings";

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
 * Sections (2026 "Casting Issue" recompose — design-kit §3, MULTI-ROOT):
 * a search-first hero (freeform Title / Search Form / CTAs / chips) → discipline
 * marquee → featured-talent roster mosaic → talent-by-discipline rail → full-bleed
 * Plate I ("the runway") → Statement ("the Impronta way") → Best-for occasion
 * link list → a clear process with a connected step rail → inquiry-as-a-sentence
 * CTA → stats band → full-bleed Plate II ("the room") → talent join CTA → final
 * inquiry CTA. The header (§3.1) and footer (§3.13) live in the site_shell, not
 * in this body tree. The tree is a MULTI-ROOT array of section nodes (no single
 * wrapping root container) so the editor renders it without the empty-recovery
 * quirk. Authored as freeform primitives, P3 repeaters, and real `section_embed`s
 * so every block is selectable, restyleable, and movable in the builder.
 *
 * DROPPED from the previous build (not in the kit's 13 sections): the
 * "Discover premium talent" stage-card hero (heroClassic), the markets /
 * "Local faces" `location_discovery` section, and the "An agency, not a
 * directory" pillars section.
 *
 * Real-component decisions (Wave-2 flagship pass — see builder audit
 * 2026-06-02):
 *   - The hero search row is a native GET form (`action=/directory`, field `q`) as
 *     freeform layers — not a monolithic `hero_search` section_embed (so Title,
 *     Search Form, and buttons are separate layers in Page Structure).
 *   - The new Casting-Issue sections (marquee, two full-bleed plates, statement,
 *     best-for link list, inquiry-sentence, stats) are real `section_embed`s /
 *     freeform containers authored directly from the design kit (§3); every
 *     color/font is `token:`-bound so the page re-skins per tenant theme.
 *   - Motion: every section band rises on scroll (animationPreset:"rise" +
 *     animationTrigger:"scroll"); prefers-reduced-motion is honoured by the
 *     static renderer sheet.
 */

// ── palette ──────────────────────────────────────────────────────────────────
// Palette is bound to THEME TOKENS via the `token:` sentinel (styleTokenRef →
// var(--token-...)) so colors follow the tenant's theme (platform default →
// Editorial-Noir black/gold) instead of being hardcoded. Whole-prop color
// values only (backgroundColor/textColor/borderColor) — gradients like
// GOLD_GLOW stay literal because the sentinel is not resolved mid-string.
const INK = styleTokenRef("color.background"); // page canvas
const SURFACE = styleTokenRef("color.surface-raised"); // alternating band
const GOLD = styleTokenRef("color.primary");
const GOLD_BRIGHT = styleTokenRef("color.accent");
const TEXT = styleTokenRef("color.ink");
const MUTED = styleTokenRef("color.muted");
const FAINT = styleTokenRef("color.muted");
const HAIRLINE = styleTokenRef("color.line");
const CARD = styleTokenRef("color.surface-raised");
const CARD_BORDER = styleTokenRef("color.line");
// Fonts follow the theme's heading/body presets (display serif / body sans).
const FRAUNCES = styleTokenRef("typography.heading-font-family");
const CINZEL = styleTokenRef("typography.heading-font-family");
const INTER = styleTokenRef("typography.body-font-family");

// NOTE: the hero stage-card portrait set (TALENT) was removed with the dropped
// heroClassic "Discover premium talent" hero — the Casting-Issue hero is the
// search-first heroFind (§3.2). The Featured Talent section still pulls the same
// roster live via manualProfileCodes below.

const dataSources: BuilderNodeRenderDataSources = {
  collections: {
    // impronta_disciplines / impronta_featured / impronta_markets / impronta_pillars
    // were all removed: the discipline rail is a grid-only talent_type_grid embed,
    // featured talent is a featured_talent embed (live roster), and the markets +
    // pillars sections were dropped in the Casting-Issue recompose (§3). Only the
    // process-step sequence remains as an inline repeater collection.
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

// "Best for" occasion row — an editorial draw-underline link button. The label
// (incl. its trailing "  →") and layerLabel vary per occasion; every style value
// is identical to the authored Casting-Issue nodes (token-bound throughout).
const bestForRow = (slug: string, label: string, layerLabel: string): BuilderNode => ({
  id: `impronta-best-for-row-${slug}`,
  kind: "button",
  props: {
    label,
    href: "/directory",
    tone: "secondary",
    layerLabel,
    style: {
      fontFamily: "token:typography.heading-font-family",
      fontSize: "22px",
      fontWeight: 400,
      letterSpacing: "-0.01em",
      textColor: "token:color.muted",
      backgroundColor: "rgba(0,0,0,0)",
      borderColor: "token:color.line",
      borderWidth: "0px 0px 1px 0px",
      borderStyle: "solid",
      borderRadius: "0px",
      width: "100%",
      paddingTop: "22px",
      paddingBottom: "22px",
      paddingLeft: "0px",
      paddingRight: "0px",
      align: "left",
      justifyContent: "space-between",
      alignItems: "center",
      transitionProperty: "color, border-color, padding-left",
      transitionDuration: "240ms",
      transitionTimingFunction: "ease",
      hover: { color: "token:color.accent", borderColor: "token:color.accent" },
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
        "radial-gradient(120% 80% at 50% 0%, rgba(201,162,39,0.10), rgba(201,162,39,0) 60%), linear-gradient(180deg,var(--token-color-surface-raised) 0%,var(--token-color-background) 100%)",
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

// NOTE: the "Local faces / markets" location_discovery section was DROPPED in the
// 2026 Casting-Issue recompose — it is not one of the kit's 13 sections (§3).
// Its imports (buildLocationDiscoveryDecomposedSection, gridOnlyLocationDiscoveryConfig)
// and the WARM band-color constant were removed with it.

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
                    backgroundColor: SURFACE,
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
                    boxShadow: "0 0 0 6px var(--token-color-background)",
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

// NOTE: the "Why Impronta" pillars section (verified profiles / local
// coordination / booking support) was DROPPED in the 2026 Casting-Issue
// recompose — it is not one of the kit's 13 sections (§3). Its `pillarCard`
// helper was removed with it; the human-promise message it carried now lives in
// the new Statement section (§3.6).

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
        { id: "impronta-final-h", kind: "heading", props: { text: "The right talent is one search away.", level: 2, style: { fontFamily: FRAUNCES, fontSize: "44px", lineHeight: "1.06", fontWeight: 500, letterSpacing: "-0.01em", textColor: TEXT, textWrap: "balance", align: "center", marginBottomFree: "0px", responsive: { mobile: { fontSize: "30px" } } } } },
        { id: "impronta-final-p", kind: "paragraph", props: { text: "Tell us the brief and your market. We'll match the right talent — a coordinator replies personally.", style: { fontFamily: INTER, fontSize: "17px", lineHeight: "1.6", textColor: MUTED, marginTopFree: "18px", align: "center", maxWidthFree: "560px" } } },
        { id: "impronta-final-actions", kind: "container", props: { layout: "row", align: "center", responsive: { mobile: { layout: "stack" } }, style: { gap: "18px", marginTopFree: "30px", justifyContent: "center" } }, children: [goldButton("impronta-final-cta", "Browse the roster", "/directory"), lineButton("impronta-final-explore", "Start an inquiry", "/inquiry")] },
      ],
    },
  ],
  { borderTop: true, glow: true },
);

// ── Casting-Issue new sections (design-kit §3) ─────────────────────────────────
// Authored verbatim from the freshly-built section nodes for the 2026 "Casting
// Issue" home (web/docs/impronta-home-2026-design-kit.md §3). Each keeps its
// `token:` style refs so it re-skins per tenant theme. The two full-bleed plates
// carry their own `containerWidth:"full-bleed"` / `fullBleed:true` presentation;
// Plate I is additionally wrapped in a full-bleed host container so it breaks the
// page container even when the tree's section sits inside a max-width column.

// §3.3 — Discipline marquee (NEW).
const marquee: BuilderNode = {
  id: "impronta-marquee",
  kind: "section_embed",
  props: {
    sectionTypeKey: "marquee",
    layerLabel: "Discipline Marquee",
    config: {
      items: [
        { text: "Models", href: "/directory" },
        { text: "Hostesses", href: "/directory" },
        { text: "Dancers", href: "/directory" },
        { text: "Brand Ambassadors", href: "/directory" },
        { text: "Performers", href: "/directory" },
        { text: "Promotional", href: "/directory" },
      ],
      speed: "slow",
      direction: "left",
      separator: "diamond",
      variant: "text",
      presentation: {
        background: "espresso",
        containerWidth: "full-bleed",
        paddingTop: "tight",
        paddingBottom: "tight",
        dividerTop: "thin-line",
        animation: { entry: "fade", reducedMotion: "respect" },
        customCss:
          ".site-marquee { background: var(--token-color-background, #0a0a0a); border-top: 1px solid var(--token-color-line, #1f1f22); border-bottom: 1px solid var(--token-color-line, #1f1f22); } .site-marquee__link, .site-marquee__item > span:not(.site-marquee__sep) { color: var(--token-color-ink, #f4f4f5); font-family: var(--site-heading-font, inherit); font-style: italic; text-decoration: none; } .site-marquee__sep { color: var(--token-color-accent, #d4af37); } .site-marquee__sep::before { content: '\\2726'; } .site-marquee__sep { font-size: 0; } .site-marquee__sep::before { font-size: 1rem; }",
      },
    },
  },
};

// §3.5 — Full-bleed plate I ("the runway") (NEW). Wrapped in a full-bleed host so
// the cta_banner plate breaks out of the page container at any nesting depth.
const plate1: BuilderNode = {
  id: "impronta-plate-1-host",
  kind: "container",
  props: {
    layerLabel: "Plate I — The Runway (full-bleed host)",
    layout: "stack",
    align: "stretch",
    // Full-bleed host: a `container` carries no `presentation` field (that's a
    // section/section_embed prop), so the source JSON's
    // presentation:{containerWidth:"full-bleed",fullBleed:true,…} is expressed
    // via `style` — full width, no max-width clamp, no padding. The embedded
    // cta_banner child still sets its OWN full-bleed presentation in config, so
    // the plate breaks out of the page column. gap:"none" → free escape "0px"
    // (the container gap enum is only s|m|l; single-child host, so cosmetic).
    style: { width: "100%", maxWidthFree: "none", gap: "0px", paddingTop: "0px", paddingBottom: "0px", paddingLeft: "0px", paddingRight: "0px", backgroundColor: "token:color.background" },
  },
  children: [
    {
      id: "impronta-plate-1",
      kind: "section_embed",
      props: {
        sectionTypeKey: "cta_banner",
        layerLabel: "Plate I — The Runway",
        config: {
          eyebrow: "I.",
          headline: "She doesn't walk the runway. She decides where it leads.",
          variant: "centered-overlay",
          bandTone: "espresso",
          insetCard: false,
          backgroundImageUrl: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=2000&q=80",
          backgroundImageAlt: "Model on an editorial runway under low light",
          overlayOpacity: 55,
          presentation: {
            containerWidth: "full-bleed",
            fullBleed: true,
            background: "espresso",
            paddingTop: "editorial",
            paddingBottom: "editorial",
            align: "center",
            textTone: "on-dark",
            overlayColor: "token:color.background",
            overlayOpacity: 0.55,
            animation: { scroll: "parallax-soft", reducedMotion: "respect" },
            parallaxIntensity: 0.4,
            customCss:
              ".site-cta-banner .site-eyebrow, .site-cta-banner .site-eyebrow > span { color: var(--token-color-accent, #d4af37); opacity: 0.14; font-family: var(--site-heading-font, inherit); font-style: italic; font-size: clamp(5rem, 16vw, 13rem); line-height: 0.85; letter-spacing: 0; }\n.site-cta-banner__headline { color: var(--token-color-ink, #f4f4f5); font-family: var(--site-heading-font, inherit); font-style: italic; font-weight: 300; }",
          },
        },
      },
    },
  ],
};

// §3.6 — Statement: the Impronta way (NEW, image_copy_alternating).
const statement: BuilderNode = {
  id: "impronta-statement",
  kind: "section_embed",
  props: {
    sectionTypeKey: "image_copy_alternating",
    layerLabel: "Statement — the Impronta way",
    config: {
      variant: "editorial-alternating",
      imageRatio: "4/5",
      gap: "airy",
      items: [
        {
          eyebrow: "The Impronta way",
          title: "We do not list faces. We {accent}stand behind them.{/accent}",
          italicTagline: "Every name on this roster is someone we have met, vetted, and chosen to represent — a promise, not a profile.",
          body: "Anyone can build a directory. We built an agency. Before a face reaches your shortlist it has been reviewed, its availability confirmed, its rates and rights agreed. When you book through Impronta, a real coordinator is answerable for every detail — from the first reply to the wrap of the shoot.",
          imageUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=72&w=1200&h=1500",
          imageAlt: "Editorial black-and-white portrait of a model lit against a dark studio backdrop.",
          iconKey: "sparkle",
          listItems: ["Reviewed, agency-approved talent", "Confirmed availability before you ask", "Rates, usage & logistics handled for you"],
          side: "image-left",
        },
      ],
      presentation: {
        background: "canvas",
        textTone: "ink",
        align: "left",
        paddingTop: "editorial",
        paddingBottom: "editorial",
        containerWidth: "standard",
        dividerTop: "thin-line",
        animation: { entry: "fade-up", reducedMotion: "respect" },
      },
    },
  },
};

// §3.7 — Best for: find talent by occasion (NEW, freeform link rows).
const bestFor: BuilderNode = {
  id: "impronta-best-for",
  kind: "container",
  props: {
    layout: "stack",
    align: "center",
    layerLabel: "Best for — find talent by occasion",
    style: {
      width: "100%",
      maxWidthFree: "100%",
      paddingTop: "92px",
      paddingRight: "32px",
      paddingBottom: "92px",
      paddingLeft: "32px",
      gap: "0px",
      backgroundColor: "token:color.background",
      textColor: "token:color.ink",
      borderColor: "token:color.line",
      borderWidth: "1px 0px 0px 0px",
      borderStyle: "solid",
      responsive: { mobile: { paddingTop: "60px", paddingBottom: "60px", paddingRight: "20px", paddingLeft: "20px" } },
    },
  },
  children: [
    {
      id: "impronta-best-for-wrap",
      kind: "container",
      props: {
        layout: "stack",
        layerLabel: "Container",
        style: { width: "100%", maxWidthFree: "1220px", gap: "40px", animationPreset: "rise", animationTrigger: "scroll", animationDuration: "0.9s", animationEasing: "smooth" },
      },
      children: [
        {
          id: "impronta-best-for-head",
          kind: "container",
          props: { layout: "stack", align: "start", layerLabel: "Section Head", style: { gap: "0px", maxWidthFree: "640px" } },
          children: [
            {
              id: "impronta-best-for-eyebrow",
              kind: "paragraph",
              props: {
                text: "Best for",
                layerLabel: "Intro Text",
                style: { fontFamily: "token:typography.heading-font-family", fontSize: "12px", fontWeight: 600, letterSpacing: "0.32em", textTransform: "uppercase", textColor: "token:color.accent", marginBottomFree: "14px", align: "left" },
              },
            },
            {
              id: "impronta-best-for-title",
              kind: "heading",
              props: {
                text: "Find talent by occasion.",
                level: 2,
                layerLabel: "Title",
                style: { fontFamily: "token:typography.heading-font-family", fontSize: "46px", lineHeight: "1.04", fontWeight: 500, letterSpacing: "-0.01em", textColor: "token:color.ink", textWrap: "balance", marginBottomFree: "0px", align: "left", responsive: { mobile: { fontSize: "32px" } } },
              },
            },
            {
              id: "impronta-best-for-sub",
              kind: "paragraph",
              props: {
                text: "Whatever the brief, there is a roster for it — agency-managed end to end.",
                layerLabel: "Subtitle",
                style: { fontFamily: "token:typography.body-font-family", fontSize: "17px", lineHeight: "1.6", textColor: "token:color.muted", marginTopFree: "18px", align: "left", maxWidthFree: "560px" },
              },
            },
          ],
        },
        {
          id: "impronta-best-for-grid",
          kind: "container",
          props: {
            layout: "grid",
            columns: 3,
            gap: "m",
            layerLabel: "Occasion Rows",
            responsive: { tablet: { columns: 2 }, mobile: { columns: 1 } },
            style: { width: "100%", maxWidthFree: "100%", gap: "0px 48px" },
          },
          children: [
            bestForRow("fashion", "Fashion Campaigns  →", "Fashion Campaigns"),
            bestForRow("product", "Product Launches  →", "Product Launches"),
            bestForRow("runway", "Runway & Showroom  →", "Runway & Showroom"),
            bestForRow("corporate", "Corporate & Galas  →", "Corporate & Galas"),
            bestForRow("tradeshows", "Trade Shows  →", "Trade Shows"),
            bestForRow("hospitality", "Hospitality & VIP  →", "Hospitality & VIP"),
            bestForRow("luxury", "Luxury Brand Shoots  →", "Luxury Brand Shoots"),
            bestForRow("automotive", "Automotive & Tech  →", "Automotive & Tech"),
            bestForRow("music", "Music & Performance  →", "Music & Performance"),
          ],
        },
      ],
    },
  ],
};

// §3.9a — Inquiry-as-a-sentence (NEW, cta_banner minimal-band).
const inquirySentence: BuilderNode = {
  id: "impronta-inquiry-sentence",
  kind: "section_embed",
  props: {
    sectionTypeKey: "cta_banner",
    layerLabel: "Inquiry — say it in a sentence",
    config: {
      headline: "Tell us who you’re looking for — the rest is ours to handle.",
      reassurance: "No account needed · replies within 24h",
      variant: "minimal-band",
      bandTone: "espresso",
      insetCard: false,
      primaryCta: { label: "Start an inquiry", href: "/inquiry" },
      secondaryCta: { label: "Browse the roster", href: "/directory" },
      nodePresentation: {
        headline: { align: "center", textColor: "token:color.ink" },
        primaryCta: { textColor: "token:color.accent" },
        secondaryCta: { textColor: "token:color.accent" },
      },
      presentation: {
        background: "espresso",
        containerWidth: "narrow",
        align: "center",
        paddingTop: "editorial",
        paddingBottom: "editorial",
        animation: { scroll: "reveal-stagger", reducedMotion: "respect" },
      },
    },
  },
};

// §3.9b — Stats band (NEW).
const stats: BuilderNode = {
  id: "impronta-stats",
  kind: "section_embed",
  props: {
    sectionTypeKey: "stats",
    layerLabel: "Stats band",
    config: {
      eyebrow: "By the numbers",
      items: [
        { value: "101", label: "Talents" },
        { value: "12", label: "Cities" },
        { value: "<24h", label: "First reply" },
        { value: "100%", label: "Agency-managed" },
      ],
      variant: "row",
      align: "center",
      presentation: {
        background: "espresso",
        containerWidth: "standard",
        paddingTop: "editorial",
        paddingBottom: "editorial",
        dividerTop: "thin-line",
        animation: { entry: "fade-up", reducedMotion: "respect" },
      },
    },
  },
};

// §3.10 — Full-bleed plate II ("the room") (NEW).
const plate2: BuilderNode = {
  id: "impronta-plate-2",
  kind: "section_embed",
  props: {
    sectionTypeKey: "cta_banner",
    layerLabel: "Plate II — The room",
    config: {
      eyebrow: "II.",
      headline: "Behind every face, a room of people answerable for every detail.",
      backgroundImageUrl: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=2400&q=80",
      backgroundImageAlt: "An atelier of people at work behind the scenes, softly out of focus",
      overlayOpacity: 62,
      variant: "centered-overlay",
      bandTone: "espresso",
      insetCard: false,
      presentation: {
        containerWidth: "full-bleed",
        fullBleed: true,
        background: "espresso",
        align: "center",
        paddingTop: "editorial",
        paddingBottom: "editorial",
        overlayColor: "token:color.background",
        animation: { scroll: "parallax-soft", reducedMotion: "respect" },
        customCss:
          ".site-eyebrow > span { font-family: var(--site-heading-font, inherit); font-style: italic; font-weight: 300; font-size: clamp(3.5rem, 9vw, 7rem); line-height: 1; letter-spacing: 0.02em; color: var(--token-color-accent, #d4af37); opacity: 0.18; display: block; margin-bottom: 0.5rem; } .site-cta-banner__headline { font-family: var(--site-heading-font, inherit); font-style: italic; font-weight: 300; color: var(--token-color-ink, #f4f4f5); max-width: 22ch; margin-inline: auto; text-wrap: balance; } .site-cta-banner__shell { min-height: clamp(60vh, 78vh, 820px); display: flex; align-items: center; }",
      },
    },
  },
};

// MULTI-ROOT tree (design-kit §3 order). NOT wrapped in a single root container,
// so the editor renders it without the empty-recovery quirk. Header (§3.1) and
// footer (§3.13) live in the site_shell, not in this body tree.
// Order: Hero → Marquee → Roster mosaic (featured) → Browse-by-discipline →
// Plate I → Statement → Best-for → How-it-works → Inquiry sentence → Stats →
// Plate II → For-talent → Closing CTA.
const improntaTree: BuilderNode[] = [
  heroFind,
  marquee,
  featured,
  disciplines,
  plate1,
  statement,
  bestFor,
  process,
  inquirySentence,
  stats,
  plate2,
  join,
  finalCta,
];

export const improntaDesign: PageDesign = {
  id: "impronta",
  title: "Impronta — Models & Image Agency",
  label: "Impronta agency",
  description:
    "The Impronta Models flagship home, freeform (2026 Casting Issue): a dark editorial models-&-image agency site with a warm-gold accent — a directory-search hero, a discipline marquee, a featured-talent roster, browse-by-discipline, two full-bleed editorial plates, an agency statement, find-by-occasion, the process, a stats band, and inquiry/talent CTAs.",
  archetype: "agency",
  tree: improntaTree,
  dataSources,
};
