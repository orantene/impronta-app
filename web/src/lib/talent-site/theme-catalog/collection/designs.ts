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
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { TALENT_ASK_HREF } from "@/lib/talent-site/contact-channels";
import type { BuiltinDesignEntry } from "../builtins/types";
import type { DesignPayload } from "../types";
import { FOLIO_STYLE_TOKEN_DEFAULTS } from "./folio-defaults";
import {
  aboutBlock,
  portfolioBlock,
  portfolioChaptersBlock,
  contentsBlock,
  compCardBlock,
  faqBlock,
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
import { buildWithAuthoredOverlay } from "./authored";
import { seedI18nPayload } from "../seed-i18n";
import { buildGridlinePayload } from "./gridline";
import { buildMaisonV2Payload } from "./maison-v2";

export { buildGridlinePayload, buildMaisonV2Payload };

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
// A printed issue (Folio proposal): mast line, the name across the full width,
// a B&W cover beside the bio, square CTAs and the "In this issue" index; then
// chapters (sticky italic numeral, 1 large + 2 captioned plates), the inverted
// comp card strip, a rate card of ruled rows, About, and the closing
// Folio magazine edition: cover masthead + contents + chapters + measures +
// rate card + statement footer. Every block is a shared widget in its magazine edition.
export const FOLIO_CHAPTER_SEEDS = [
  {
    heading: "Selected work",
    creditLine: "",
    tocCredit: "",
  },
  {
    heading: "More work",
    creditLine: "",
    tocCredit: "",
  },
] as const;

function magazine(node: BuilderNode): BuilderNode {
  const children = "children" in node && Array.isArray(node.children) ? node.children : null;
  const props = (node.props ?? {}) as Record<string, unknown>;
  const leafKinds = new Set(["masthead", "contents", "portfolio", "comp_card", "statement_footer"]);
  return {
    ...node,
    props: leafKinds.has(node.kind) ? { ...props, edition: "magazine" } : props,
    ...(children ? { children: children.map(magazine) } : {}),
  } as BuilderNode;
}

/** Edge-to-edge band: the magazine blocks own their gutters. */
function fullBleed(node: BuilderNode): BuilderNode {
  const props = (node.props ?? {}) as Record<string, unknown>;
  const style = (props.style ?? {}) as Record<string, unknown>;
  const rest = { ...style };
  delete rest.minHeight;
  return {
    ...node,
    props: { ...props, gap: "s", style: { ...rest, maxWidth: "full", paddingY: "none", paddingX: "none" } },
  } as BuilderNode;
}

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
  const heroKids = "children" in hero && Array.isArray(hero.children) ? hero.children : [];
  const heroWithSpread = {
    ...hero,
    children: heroKids.map((k) =>
      k.kind === "masthead"
        ? ({
            ...k,
            props: {
              ...(k.props as Record<string, unknown>),
              coverLine: "{{primaryTypeLabel}}",
              // TH02: the italic serif line over the cover photo (30px, the cover's first body text).
              coverStatement: "",
              mastRight: "{{locationLine}}",
              bio: "{{bio}}",
              // Folio artifact cover CTA is Consultar (inquiry), not mode-swapped Book.
              ctaLabel: "Consultar",
              ctaHref: TALENT_ASK_HREF,
              bookLabel: "See the book",
              bookHref: "#chapter-1",
              contentsTitle: "In this issue",
              contents: [
                ...FOLIO_CHAPTER_SEEDS.map((c, i) => ({
                  label: c.heading,
                  anchor: `chapter-${i + 1}`,
                  credit: c.tocCredit,
                })),
                { label: "Rates", anchor: "services", credit: "Rates and dates" },
              ],
            },
          } as BuilderNode)
        : k,
    ),
  } as BuilderNode;
  return {
    shellTree: shell(id, {
      navChrome: "top_bar",
      navLinks: [
        ...FOLIO_CHAPTER_SEEDS.map((c, i) => ({ label: c.heading, href: `#chapter-${i + 1}` })),
        { label: "Rates", href: "#services" },
      ],
      // Folio artifact header CTA reads Consultar (inquiry), not Inquire/Escríbeme.
      primaryCtaLabel: "Consultar",
    }),
    tokenDefaults: { ...FOLIO_STYLE_TOKEN_DEFAULTS },
    homeTree: [
      magazine(fullBleed(heroWithSpread)),
      magazine(
        fullBleed(
          contentsBlock(id, {
            heading: "Contents",
            showNumbers: true,
            numberStyle: "roman",
            items: [
              ...FOLIO_CHAPTER_SEEDS.map((c, i) => ({
                label: c.heading,
                anchor: `chapter-${i + 1}`,
                credit: c.tocCredit,
              })),
              { label: "Rates", anchor: "services", credit: "Rates and dates" },
            ],
          }),
        ),
      ),
      magazine(
        fullBleed(
          portfolioChaptersBlock(
            id,
            FOLIO_CHAPTER_SEEDS.map((c, i) => ({
              chapterNumber: i + 1,
              heading: c.heading,
              creditLine: c.creditLine,
              showCaptions: true,
              limit: 3,
              anchorId: `chapter-${i + 1}`,
            })),
          ),
        ),
      ),
      magazine(
        fullBleed(
          compCardBlock(id, {
            layout: "strip_with_details",
            heading: "Measures · Comp card",
            showFullDetails: true,
            minMeasures: 4,
            // Comp strip: height · suit · shoe · languages.
            measures: [
              { fieldKey: "physical.height_cm", enabled: true, labelEn: "Height cm", labelEs: "Estatura cm" },
              { fieldKey: "physical.suit_size", enabled: true, labelEn: "Suit", labelEs: "Saco" },
              {
                fieldKey: "physical.shoe_size_eu",
                enabled: true,
                labelEn: "Shoe",
                labelEs: "Calzado",
              },
              { fieldKey: "languages", enabled: true, labelEn: "Languages", labelEs: "Idiomas" },
            ],
          }),
        ),
      ),
      magazine(
        fullBleed(
          servicesSection(id, {
            label: "Booking",
            eyebrow: "",
            title: "Rates",
            subtitle: "",
            layout: "rate_card",
            categoryNav: "none",
            stylePreset: "editorial",
            photoRadius: "square",
            density: "compact",
            rowCtaVariant: "outline",
            showPhoto: false,
            showDescription: false,
            showDelivery: false,
            showCategory: true,
            // Magazine shell is already full-bleed; clear AUD-042's 1120 child cap
            // so the Rates column can use the desktop band.
            contentWidth: "full",
          }),
        ),
      ),
      faqBlock(id, { heading: "Questions", ask: true }),
      magazine(
        fullBleed(
          statementFooterBlock(id, {
            statement: "Next issue.",
            // Design-owned defaults carry no talent claim: the demo fixtures fill these
            // through the site-copy mechanism (demos/folio-site-copy.ts).
            creditLine: "",
            contactLine: "",
            align: "start",
            showRule: true,
          }),
        ),
      ),
    ].map((n) =>
      n.kind === "container" && Array.isArray((n as { children?: unknown }).children)
        ? withFooterCta(n)
        : n,
    ),
    // Release (Folio parity): TH02 has no About page. It leaves the default page and stays a block
    // a talent can add; a talent who already has it keeps it (see the release note module).
    optionalBlocks: [aboutBlock(id, { align: "start", accent: false })],
  };
}

/** The closing page carries the same primary CTA as the cover. */
function withFooterCta(node: BuilderNode): BuilderNode {
  const kids = "children" in node && Array.isArray(node.children) ? node.children : null;
  if (!kids) return node;
  return {
    ...node,
    children: kids.map((k) =>
      k.kind === "statement_footer"
        ? ({
            ...k,
            props: {
              ...(k.props as Record<string, unknown>),
              ctaLabel: "Consultar",
              ctaHref: TALENT_ASK_HREF,
            },
          } as BuilderNode)
        : k,
    ),
  } as BuilderNode;
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
    buildPayloadRaw: buildPayload,
    // Seeded copy ships es + en. Applied AFTER the authored overlay so the
    // raw payload keeps reproducing the editor snapshot hash (see seed-i18n.ts).
    buildPayload: () => seedI18nPayload(buildWithAuthoredOverlay(slug, buildPayload)),
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
  entry(
    "gridline",
    "Gridline",
    "A utility bar with a tap-to-call button, a spec-block hero, a task picker and a clear comparison of services. Built for trades that get called.",
    "bold",
    ["trades", "urgent", "price-matrix"],
    11,
    buildGridlinePayload,
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
  gridline:
    "Barra de utilidad con botón de llamada, portada con ficha técnica, un selector de tareas y una comparación clara de servicios. Para oficios que reciben llamadas.",
};

/** What each design still needs from shared widgets (mockup → today). */
export const COLLECTION_DESIGN_GAPS: Readonly<Record<string, readonly string[]>> = {
  "maison-v2": [],
  solace: ["W-10 rotating word", "studio/villa hero toggle (app)"],
  mono: ["no-nav header style", "inline 3-tap slot picker (app)"],
  frame: ["W-12 contact sheet tag filter and loupe"],
  folio: [],
  gridline: [],
};
