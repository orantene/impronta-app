/**
 * Theme collection v1 — five beauty-fit Designs composed ONLY from the talent
 * section kit and the Design node allow-list (`validate.ts`). Each is a
 * different composition of the same shared pieces (hero variant, section
 * order, services_catalog layout / nav / preset, gallery mode, spacing and
 * type rhythm); none adds a theme-only renderer. Colours stay token refs, so
 * the talent's own palette (Look or custom colours) carries across a switch.
 *
 * Mockup sources (Theme Review artifacts): Maison v2 = the Rosé proposal,
 * Solace, Mono, Frame, Folio. Gaps vs the mockups are listed per design in
 * `COLLECTION_DESIGN_GAPS` (missing shared widgets / header nav styles as
 * listed per design).
 *
 * Gated with Maison: `isMaisonCatalogSlug` treats every collection slug as
 * flag-owned, so only `TALENT_MAISON_THEME_ENABLED` talents see them.
 */
import type { BuiltinDesignEntry } from "../builtins/types";
import type { DesignPayload } from "../types";
import {
  aboutBlock,
  portfolioBlock,
  portfolioChaptersBlock,
  contentsBlock,
  compCardBlock,
  statementFooterBlock,
  heroCentered,
  heroCover,
  heroMasthead,
  heroSplit,
} from "../section-kit";

import {
  contactSection,
  seqIds,
  servicesSection,
  shell,
  tuneHeading,
} from "./design-parts";
import { buildMaisonV2Payload } from "./maison-v2";

export { buildMaisonV2Payload };

// ── Solace ───────────────────────────────────────────────────────────────────
// Calm full-bleed cover, a centered short intro, services as an unhurried
// editorial single column, a two-column image pair, centered contact.
export function buildSolacePayload(): DesignPayload {
  const id = seqIds("solace");
  const hero = tuneHeading(heroCover(id, { accent: false }), {
    fontWeight: 300,
    letterSpacing: "-0.01em",
  });
  return {
    shellTree: shell(id, {
      navChrome: "overlay",
      navLinks: [
        { label: "About", href: "#about" },
        { label: "Sessions", href: "#services" },
        { label: "Space", href: "#gallery" },
        { label: "Contact", href: "#contact" },
      ],
    }),
    homeTree: [
      hero,
      aboutBlock(id, { align: "center", accent: false }),
      servicesSection(id, {
        label: "Sessions",
        eyebrow: "Sessions",
        title: "Take your time",
        layout: "editorial",
        categoryNav: "none",
        stylePreset: "editorial",
        photoRadius: "round",
        density: "comfortable",
        rowCtaVariant: "outline",
        showPhoto: true,
        columns: 1,
      }),
      portfolioBlock(id, { layout: "grid", columns: 2, heading: "The space" }),
      contactSection(id, { heading: "When you are ready", faqHeading: "Before your session", center: true }),
    ],
  };
}

// ── Mono ─────────────────────────────────────────────────────────────────────
// One statement, one list, one action: centered type-only hero, a compact
// searchable price list straight after it, a short FAQ; no gallery.
export function buildMonoPayload(): DesignPayload {
  const id = seqIds("mono");
  const hero = tuneHeading(heroCentered(id, { chips: false, accent: true }), {
    size: "display",
    fontWeight: 800,
    letterSpacing: "-0.03em",
  });
  return {
    shellTree: shell(id),
    homeTree: [
      hero,
      servicesSection(id, {
        label: "Price list",
        eyebrow: "Prices",
        title: "Pick a service, pick a time",
        layout: "compact_list",
        categoryNav: "pills",
        stylePreset: "compact",
        photoRadius: "square",
        density: "compact",
        rowCtaVariant: "solid",
        showPhoto: false,
        search: true,
      }),
      contactSection(id, { heading: "Questions?", faqHeading: "Good to know" }),
      aboutBlock(id, { align: "start", accent: false }),
    ],
  };
}

// ── Frame ────────────────────────────────────────────────────────────────────
// Identity first (split hero, image-heavy 30-70), then the work as a dense
// contact sheet (W-12), services as cards.
export function buildFramePayload(): DesignPayload {
  const id = seqIds("frame");
  const hero = tuneHeading(
    heroSplit(id, { ratio: "40-60", chips: false, accent: false, eyebrow: true, minHeight: "56vh" }),
    { textTransform: "uppercase", letterSpacing: "0.02em" },
  );
  return {
    shellTree: shell(id, {
      navChrome: "filter_bar",
      navLinks: [
        { label: "Work", href: "#gallery" },
        { label: "Book", href: "#services" },
        { label: "Contact", href: "#contact" },
        { label: "About", href: "#about" },
      ],
    }),
    homeTree: [
      hero,
      portfolioBlock(id, { layout: "contact_sheet", columns: 4, heading: "Work", showCaptions: true }),
      servicesSection(id, {
        label: "Sessions and prices",
        eyebrow: "Book",
        title: "Sessions and prices",
        layout: "cards",
        categoryNav: "tabs",
        stylePreset: "clean",
        photoRadius: "square",
        density: "compact",
        rowCtaVariant: "solid",
        showPhoto: true,
        columns: 3,
      }),
      contactSection(id, { heading: "Book a session", faqHeading: "Questions" }),
      aboutBlock(id, { align: "start", accent: false }),
    ],
  };
}

// ── Folio ────────────────────────────────────────────────────────────────────
// Magazine masthead (giant stacked words + B&W cover), Contents index,
// the book as shared W-12 chapter blocks (sticky numeral + title + credit,
// 1 large + 2 smaller), shared comp-card measure strip, a rate card of rows,
// and a shared statement footer (statement / credit / contact).
export function buildFolioPayload(): DesignPayload {
  const id = seqIds("folio");
  const hero = heroMasthead(id, {
    lines: ["{{displayName}}"],
    splitWords: true,
    subline: "{{primaryTypeLabel}}",
    showCover: true,
    coverFilter: "bw",
    coverSrc: "{{headshotUrl}}",
  });
  return {
    shellTree: shell(id, {
      navChrome: "chapter_dots",
      navLinks: [
        { label: "Work", href: "#gallery" },
        { label: "About", href: "#about" },
        { label: "Rates", href: "#services" },
        { label: "Contact", href: "#contact" },
      ],
    }),
    homeTree: [
      hero,
      contentsBlock(id, {
        heading: "Contents",
        showNumbers: true,
        numberStyle: "roman",
        items: [
          { label: "Editorial", anchor: "chapter-1" },
          { label: "Lookbook", anchor: "chapter-2" },
          { label: "Portraits", anchor: "chapter-3" },
          { label: "About", anchor: "about" },
          { label: "Measures", anchor: "comp_card" },
          { label: "Rates", anchor: "services" },
          { label: "Contact", anchor: "contact" },
        ],
      }),
      portfolioChaptersBlock(id, [
        {
          chapterNumber: 1,
          heading: "Editorial",
          creditLine: "Studio session",
          showCaptions: true,
          limit: 6,
          anchorId: "chapter-1",
        },
        {
          chapterNumber: 2,
          heading: "Lookbook",
          creditLine: "Seasonal story",
          showCaptions: true,
          limit: 6,
          anchorId: "chapter-2",
        },
        {
          chapterNumber: 3,
          heading: "Portraits",
          creditLine: "Natural light",
          showCaptions: true,
          limit: 6,
          anchorId: "chapter-3",
        },
      ]),
      aboutBlock(id, { align: "start", accent: false }),
      compCardBlock(id, {
        layout: "strip_with_details",
        showFullDetails: true,
        minMeasures: 4,
      }),
      servicesSection(id, {
        label: "Rate card",
        eyebrow: "Booking",
        title: "Rate card",
        layout: "rate_card",
        categoryNav: "sections",
        stylePreset: "editorial",
        photoRadius: "square",
        density: "compact",
        rowCtaVariant: "outline",
        showPhoto: false,
        showDescription: false,
        showDelivery: true,
      }),
      contactSection(id, { heading: "Next issue", faqHeading: "Questions" }),
      statementFooterBlock(id, {
        statement:
          "Available for editorial, campaign, and portrait commissions.",
        creditLine: "{{displayName}}",
        // Seed key: rendered per booking mode + locale by design-label-locale.
        contactLine: "Inquire for bookings",
        align: "center",
        showRule: true,
      }),
    ],
  };
}

function entry(
  slug: string,
  title: string,
  summary: string,
  category: BuiltinDesignEntry["category"],
  tags: string[],
  sort: number,
  buildPayload: () => DesignPayload,
): BuiltinDesignEntry {
  return {
    kind: "design",
    slug,
    title,
    summary,
    category,
    tags,
    required_talent_tier: "talent_basic",
    sort_order: sort,
    is_new_until: null,
    preview: {},
    buildPayload,
  };
}

export const COLLECTION_DESIGNS: readonly BuiltinDesignEntry[] = [
  entry(
    "maison-v2",
    "Maison v2",
    "Split hero, recent work first, an image-led menu and a soft visit band. The next version of Maison.",
    "editorial",
    ["beauty", "menu", "image-led"],
    6,
    buildMaisonV2Payload,
  ),
  entry(
    "solace",
    "Solace",
    "Calm and spacious: a full-bleed cover, a short intro and services in one unhurried column.",
    "minimal",
    ["calm", "wellness", "beauty"],
    7,
    buildSolacePayload,
  ),
  entry(
    "mono",
    "Mono",
    "One statement and a fast price list. Built for clients who already know what they want.",
    "minimal",
    ["fast", "price-list", "beauty"],
    8,
    buildMonoPayload,
  ),
  entry(
    "frame",
    "Frame",
    "Your work first: a portrait split hero, a dense work grid, then services as cards.",
    "creator",
    ["portfolio", "grid", "beauty"],
    9,
    buildFramePayload,
  ),
  entry(
    "folio",
    "Folio",
    "Magazine cover with your name as the masthead, a staggered book of work and a rate card.",
    "editorial",
    ["magazine", "portfolio", "beauty"],
    10,
    buildFolioPayload,
  ),
];

export const COLLECTION_DESIGN_SLUGS: ReadonlySet<string> = new Set(
  COLLECTION_DESIGNS.map((d) => d.slug),
);

export function isCollectionDesignSlug(slug: string): boolean {
  return COLLECTION_DESIGN_SLUGS.has(slug.trim().toLowerCase());
}

/** Spanish summaries for the gallery cards (en lives on each entry). */
export const COLLECTION_DESIGN_SUMMARY_ES: Readonly<Record<string, string>> = {
  "maison-v2":
    "Portada dividida, trabajos recientes primero, un menú con fotos y una franja suave para tu visita. La nueva versión de Maison.",
  solace: "Tranquilo y amplio: portada a todo lo ancho, una presentación breve y servicios en una sola columna sin prisa.",
  mono: "Una frase y una lista de precios rápida. Para clientes que ya saben lo que quieren.",
  frame: "Tu trabajo primero: portada con retrato, una cuadrícula de trabajos y servicios en tarjetas.",
  folio: "Portada de revista con tu nombre como cabecera, un libro de trabajos y una tarifa clara.",
};

/** What each design still needs from shared widgets (mockup → today). */
export const COLLECTION_DESIGN_GAPS: Readonly<Record<string, readonly string[]>> = {
  "maison-v2": [],
  solace: ["W-10 rotating word", "studio/villa hero toggle (app)"],
  mono: ["no-nav header style", "inline 3-tap slot picker (app)"],
  frame: ["W-12 contact sheet tag filter and loupe"],
  folio: [],
};
