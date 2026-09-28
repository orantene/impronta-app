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
 * `COLLECTION_DESIGN_GAPS` (missing shared widgets: W-12 portfolio, W-14
 * reviews, W-10 words, marquee/filmstrip, header nav styles).
 *
 * Gated with Maison: `isMaisonCatalogSlug` treats every collection slug as
 * flag-owned, so only `TALENT_MAISON_THEME_ENABLED` talents see them.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { SERVICES_CATALOG_DEFAULT_PROPS } from "@/lib/site-admin/builder-node/services-catalog-defaults";
import { styleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";
import { CONTACT_LAYER, TALENT_ASK_HREF } from "@/lib/talent-site/contact-channels";
import type { BuiltinDesignEntry } from "../builtins/types";
import type { DesignPayload } from "../types";
import {
  aboutBlock,
  buildKitShell,
  portfolioBlock,
  heroCentered,
  heroCover,
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

function shell(makeId: KitIdFactory, opts: { align?: "space-between" | "center"; rule?: boolean }) {
  return buildKitShell(makeId, {
    displayName: "{{displayName}}",
    year: "{{year}}",
    headerAlign: opts.align ?? "space-between",
    headerPaddingY: "m",
    headerRule: opts.rule ?? false,
  }).map(deferYear);
}

type CatalogOpts = {
  label: string;
  eyebrow: string;
  title: string;
  layout: "rows" | "cards" | "grid" | "compact_list" | "editorial" | "featured";
  categoryNav: "pills" | "tabs" | "rail" | "jump_strip" | "sections" | "accordion" | "none";
  stylePreset: "clean" | "editorial" | "compact" | "image_led";
  photoRadius: "square" | "soft" | "round";
  density: "comfortable" | "compact";
  rowCtaVariant: "outline" | "solid";
  showPhoto: boolean;
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
  const align = o.center ? ({ align: "center" } as const) : {};
  return {
    id: makeId(),
    kind: "container",
    props: stampKitSection("contact", {
      layout: "stack",
      gap: "l",
      align: o.center ? "center" : "stretch",
      layerLabel: "Contact & FAQ",
      style: {
        maxWidth: o.center ? "reading" : "wide",
        paddingY: "l",
        paddingX: "m",
        marginBottom: "l",
        ...(o.band ? { backgroundColor: styleTokenRef("color.surface-raised") } : {}),
      },
      responsive: { mobile: { layout: "stack" } },
    }),
    children: [
      {
        id: makeId(),
        kind: "heading",
        props: { text: o.heading, level: 2, style: { size: "xl", ...align } },
      },
      {
        id: makeId(),
        kind: "button",
        props: {
          label: CONTACT_LAYER.ask,
          href: TALENT_ASK_HREF,
          tone: "primary",
          layerLabel: CONTACT_LAYER.ask,
        },
      },
      {
        id: makeId(),
        kind: "heading",
        props: { text: o.faqHeading, level: 3, style: { size: "lg", marginTop: "m", ...align }, layerLabel: "FAQ heading" },
      },
      {
        id: makeId(),
        kind: "accordion",
        props: { allowMultiple: true, layerLabel: "FAQ", bindSource: "talent_faq_items" },
        children: [],
      } as BuilderNode,
    ],
  } as BuilderNode;
}

/** Retune the kit hero's name heading (size / spacing / case) without a new node kind. */
function tuneHeading(node: BuilderNode, style: Record<string, unknown>): BuilderNode {
  const children = "children" in node && Array.isArray(node.children) ? node.children : null;
  const props = (node.props ?? {}) as Record<string, unknown>;
  const isName = node.kind === "heading" && props.text === "{{displayName}}";
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
// Split hero (60-40, image right), recent work BEFORE the menu, the menu as
// image-led rows with a sticky category rail (chips on phone), about, then
// visit + FAQ on a soft band.
export function buildMaisonV2Payload(): DesignPayload {
  const id = seqIds("maison-v2");
  const hero = tuneHeading(
    heroSplit(id, { ratio: "50-50", chips: false, accent: true, eyebrow: true, minHeight: "64vh" }),
    { size: "display", letterSpacing: "-0.02em" },
  );
  return {
    shellTree: shell(id, { rule: true }),
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
      aboutBlock(id, { align: "start", accent: true }),
      contactSection(id, { heading: "Before your visit", faqHeading: "Questions", band: true }),
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
    shellTree: shell(id, { align: "center" }),
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
    shellTree: shell(id, { rule: true }),
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
    shellTree: shell(id, { rule: true }),
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
// Magazine cover (full-bleed, uppercase masthead name), the book as a
// staggered two-column masonry, a rate card of rows grouped by section.
export function buildFolioPayload(): DesignPayload {
  const id = seqIds("folio");
  const hero = tuneHeading(heroCover(id, { accent: false }), {
    size: "display",
    textTransform: "uppercase",
    letterSpacing: "-0.04em",
  });
  return {
    shellTree: shell(id, { rule: true }),
    homeTree: [
      hero,
      portfolioBlock(id, { layout: "masonry", columns: 2, heading: "The book" }),
      aboutBlock(id, { align: "start", accent: false }),
      servicesSection(id, {
        label: "Rate card",
        eyebrow: "Booking",
        title: "Rate card",
        layout: "rows",
        categoryNav: "sections",
        stylePreset: "editorial",
        photoRadius: "square",
        density: "comfortable",
        rowCtaVariant: "outline",
        showPhoto: false,
      }),
      contactSection(id, { heading: "Next issue", faqHeading: "Questions" }),
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
  "maison-v2": ["W-14 bound reviews", "next-free-time chip (app)"],
  solace: ["overlay menu nav style", "W-10 rotating word", "studio/villa hero toggle (app)"],
  mono: ["no-nav header style", "inline 3-tap slot picker (app)"],
  frame: ["W-12 contact sheet tag filter and loupe", "filter-bar header style"],
  folio: ["W-12 project-story chapters", "W-11 C2 contents page", "W-10 W3 stacked masthead"],
};
