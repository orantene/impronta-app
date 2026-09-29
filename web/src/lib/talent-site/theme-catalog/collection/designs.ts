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
import { SERVICES_CATALOG_DEFAULT_PROPS } from "@/lib/site-admin/builder-node/services-catalog-defaults";
import { styleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";
import { TALENT_ASK_HREF } from "@/lib/talent-site/contact-channels";
import type { BuiltinDesignEntry } from "../builtins/types";
import type { DesignPayload } from "../types";
import {
  aboutBlock,
  buildKitStandardShell,
  faqBlock,
  portfolioBlock,
  portfolioChaptersBlock,
  reviewsBlock,
  visitBlock,
  compCardBlock,
  statementFooterBlock,
  heroCentered,
  heroCover,
  heroMasthead,
  heroSplit,
  stampKitSection,
  type KitIdFactory,
} from "../section-kit";

function seqIds(prefix: string): KitIdFactory {
  let n = 0;
  return () => `${prefix}-${(n += 1)}`;
}

function deferYear(node: BuilderNode): BuilderNode {
  const props = (node.props ?? {}) as Record<string, unknown>;
  const children = "children" in node && Array.isArray(node.children) ? node.children : null;
  const isCopyright = props.layerLabel === "Copyright" && typeof props.text === "string";
  return {
    ...node,
    props: isCopyright
      ? { ...props, text: (props.text as string).replace(/©\s*\d{4}\b/, "© {{year}}") }
      : props,
    ...(children ? { children: children.map(deferYear) } : {}),
  } as BuilderNode;
}

/**
 * Every Design wears the standard talent header (`site_header`): logo when
 * the site has one, nav, ES/EN switch and the primary CTA, with the platform's
 * own mobile menu. The bare kit header dropped all of these.
 */
function shell(
  makeId: KitIdFactory,
  opts: {
    navChrome?: import("@/lib/site-admin/nav-chrome").NavChromeStyle;
    navLinks?: ReadonlyArray<{ label: string; href: string }>;
  } = {},
) {
  return buildKitStandardShell(makeId, {
    displayName: "{{displayName}}",
    year: "{{year}}",
    ...(opts.navChrome ? { navChrome: opts.navChrome } : {}),
    ...(opts.navLinks ? { navLinks: opts.navLinks } : {}),
  }).map(deferYear);
}

type CatalogOpts = {
  label: string;
  eyebrow: string;
  title: string;
  layout: "rows" | "cards" | "grid" | "compact_list" | "rate_card" | "editorial" | "featured";
  categoryNav: "pills" | "tabs" | "rail" | "jump_strip" | "sections" | "accordion" | "none";
  stylePreset: "clean" | "editorial" | "compact" | "image_led";
  photoRadius: "square" | "soft" | "round";
  density: "comfortable" | "compact";
  rowCtaVariant: "outline" | "solid";
  showPhoto: boolean;
  showDescription?: boolean;
  showDelivery?: boolean;
  columns?: 1 | 2 | 3;
  search?: boolean;
  band?: boolean;
};

function servicesSection(makeId: KitIdFactory, o: CatalogOpts): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: stampKitSection("services", {
      layout: "stack",
      gap: "m",
      align: "start",
      layerLabel: o.label,
      style: {
        maxWidth: "wide",
        paddingY: "l",
        paddingX: "m",
        ...(o.band ? { backgroundColor: styleTokenRef("color.surface-raised") } : {}),
      },
      responsive: { mobile: { layout: "stack" } },
    }),
    children: [
      {
        id: makeId(),
        kind: "services_catalog",
        props: {
          ...SERVICES_CATALOG_DEFAULT_PROPS,
          layout: o.layout,
          categoryNav: o.categoryNav,
          eyebrow: o.eyebrow,
          title: o.title,
          stylePreset: o.stylePreset,
          photoRadius: o.photoRadius,
          density: o.density,
          rowCtaVariant: o.rowCtaVariant,
          showPrice: true,
          showDuration: true,
          showPhoto: o.showPhoto,
          showStats: false,
          ...(o.showDescription !== undefined ? { showDescription: o.showDescription } : {}),
          ...(o.showDelivery !== undefined ? { showDelivery: o.showDelivery } : {}),
          ...(o.columns ? { columns: o.columns } : {}),
          ...(o.search ? { enableCatalogSearch: true } : {}),
          mobileBar: "float",
          useWebsiteTheme: true,
          showAskLink: true,
          emptyMessage: "No services are published yet.",
        },
      } as BuilderNode,
    ],
  } as BuilderNode;
}

/** Contact + FAQ bound to `talent_faq_items`, like Maison, with per-design copy. */
function contactSection(
  makeId: KitIdFactory,
  o: { heading: string; faqHeading: string; center?: boolean; band?: boolean },
): BuilderNode {
  // Shared FAQ preset stamps contact; keep a short lead heading for Designs
  // that still want an Ask + FAQ band in one slot.
  const base = faqBlock(makeId, {
    heading: o.faqHeading,
    center: o.center,
    band: o.band,
    ask: true,
  });
  const kids = "children" in base && Array.isArray(base.children) ? base.children : [];
  return {
    ...base,
    props: {
      ...(base.props as Record<string, unknown>),
      layerLabel: "Contact & FAQ",
    },
    children: [
      {
        id: makeId(),
        kind: "heading",
        props: {
          text: o.heading,
          level: 2,
          style: { size: "xl", ...(o.center ? { align: "center" } : {}) },
        },
      },
      ...kids,
    ],
  } as BuilderNode;
}

/** Retune the kit hero's name heading (size / spacing / case) without a new node kind. */
function tuneHeading(node: BuilderNode, style: Record<string, unknown>): BuilderNode {
  const children = "children" in node && Array.isArray(node.children) ? node.children : null;
  const props = (node.props ?? {}) as Record<string, unknown>;
  const text = typeof props.text === "string" ? props.text : "";
  const isName =
    node.kind === "heading" &&
    (text === "{{displayName}}" || text.includes("{{displayName}}"));
  return {
    ...node,
    props: isName ? { ...props, style: { ...((props.style as object) ?? {}), ...style } } : props,
    ...(children ? { children: children.map((c) => tuneHeading(c, style)) } : {}),
  } as BuilderNode;
}

function askButton(makeId: KitIdFactory, label: string): BuilderNode {
  return {
    id: makeId(),
    kind: "button",
    props: { label, href: TALENT_ASK_HREF, tone: "secondary", layerLabel: label },
  } as BuilderNode;
}

function withChild(node: BuilderNode, child: BuilderNode): BuilderNode {
  // Append into the hero's text column (first container child) when present.
  const kids = "children" in node && Array.isArray(node.children) ? node.children : [];
  const idx = kids.findIndex((k) => k.kind === "container" || k.kind === "reveal");
  if (idx < 0) return { ...node, children: [...kids, child] } as BuilderNode;
  const col = kids[idx] as BuilderNode & { children?: BuilderNode[] };
  const next = [...kids];
  next[idx] = { ...col, children: [...(col.children ?? []), child] } as BuilderNode;
  return { ...node, children: next } as BuilderNode;
}

// ── Maison v2 (Rosé proposal) ────────────────────────────────────────────────
// Split hero with desktop inset photo, Bodoni italic name (typography token),
// next-free chip (slots API), recent work BEFORE the menu, the menu as
// image-led rows with a sticky category rail (chips on phone), split about,
// visit facts band, FAQ, then live-bound reviews quote cards.
export function buildMaisonV2Payload(): DesignPayload {
  const id = seqIds("maison-v2");
  const hero = tuneHeading(
    heroSplit(id, {
      ratio: "50-50",
      chips: false,
      accent: true,
      eyebrow: true,
      minHeight: "64vh",
      inset: true,
      italicAccent: true,
      nextFreeChip: true,
    }),
    { size: "display", letterSpacing: "-0.02em" },
  );
  return {
    shellTree: shell(id),
    homeTree: [
      withChild(hero, askButton(id, "Ask about a service")),
      portfolioBlock(id, { layout: "filmstrip", heading: "Recent work", showCaptions: true }),
      servicesSection(id, {
        label: "Menu",
        eyebrow: "The menu",
        title: "Services {i}and prices{/i}",
        layout: "rows",
        categoryNav: "rail",
        stylePreset: "image_led",
        photoRadius: "soft",
        density: "comfortable",
        rowCtaVariant: "outline",
        showPhoto: true,
      }),
      aboutBlock(id, {
        align: "start",
        accent: true,
        layout: "split",
        greeting: "Hello, I'm {{displayName}}",
        showFacts: false,
      }),
      visitBlock(id, {
        layout: "split",
        heading: "Your visit",
        titleAccent: "visit",
        band: true,
      }),
      faqBlock(id, {
        heading: "Before your appointment",
        center: true,
        ask: true,
      }),
      reviewsBlock(id, {
        layout: "row",
        heading: "What clients say",
        eyebrow: "Reviews",
        autoplayMs: 5500,
      }),
    ],
  };
}

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
// "Next issue." page. Every block is a shared widget in its magazine edition.
export const FOLIO_CHAPTER_SEEDS = [
  { heading: "Selected work", creditLine: "From the studio" },
  { heading: "Details", creditLine: "Up close" },
  { heading: "Portraits", creditLine: "Natural light" },
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
              mastRight: "{{locationLine}}",
              bio: "{{bio}}",
              // Seed key: rendered per booking mode + locale by design-label-locale.
              ctaLabel: "Book a session",
              ctaHref: TALENT_ASK_HREF,
              bookLabel: "See the book",
              bookHref: "#chapter-1",
              contentsTitle: "In this issue",
              contents: [
                ...FOLIO_CHAPTER_SEEDS.map((c, i) => ({
                  label: c.heading,
                  anchor: `chapter-${i + 1}`,
                  credit: c.creditLine,
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
        { label: "Work", href: "#gallery" },
        { label: "About", href: "#about" },
        { label: "Rates", href: "#services" },
        { label: "Contact", href: "#contact" },
      ],
    }),
    homeTree: [
      magazine(fullBleed(heroWithSpread)),
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
          }),
        ),
      ),
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
      aboutBlock(id, { align: "start", accent: false }),
      faqBlock(id, { heading: "Questions", ask: true }),
      magazine(
        fullBleed(
          statementFooterBlock(id, {
            statement: "Next issue.",
            creditLine: "{{displayName}}",
            contactLine: "Write to me and I will reply with dates and prices.",
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
              ctaLabel: "Book a session",
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
