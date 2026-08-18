/**
 * shared-divisions.ts — shared tokens + section helpers for the five DIVISION
 * landing pages of the Impronta rebuild (W4b):
 *
 *   fashion-models · hosts-promoters · performers · music-djs · chefs-culinary
 *
 * COORDINATION NOTE: the core-pages workstream (W4a) owns `shared.ts` in this
 * directory. To avoid a parallel-agent merge conflict this file deliberately
 * does NOT import from or extend shared.ts — any token that logically belongs
 * there is defined locally here and the integrator may dedupe later.
 *
 * Design language (binding): Noir & Or — dark editorial ground, warm-gold
 * accent, oversized serif display headlines, generous negative space,
 * reveal-on-view motion. Mirrors the flagship page design
 * (src/lib/site-admin/builder-node/page-designs/impronta.ts): every color/font
 * is `token:`-bound so the pages re-skin with the tenant theme.
 *
 * IMAGERY: no real images are picked here. Every image src is an IMAGE_SLOT()
 * placeholder (`slot://impronta-rebuild/<name>`) that W5's curation module
 * resolves to real media_assets URLs. Alt text IS real and ships as written.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { styleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";

// ── palette (token-bound; duplicates impronta.ts constants by design) ────────
export const INK = styleTokenRef("color.background");
export const SURFACE = styleTokenRef("color.surface-raised");
export const GOLD = styleTokenRef("color.primary");
export const GOLD_BRIGHT = styleTokenRef("color.accent");
export const TEXT = styleTokenRef("color.ink");
export const MUTED = styleTokenRef("color.muted");
export const HAIRLINE = styleTokenRef("color.line");
export const CARD = styleTokenRef("color.surface-raised");
export const SERIF = styleTokenRef("typography.heading-font-family");
export const SANS = styleTokenRef("typography.body-font-family");

/** Gold radial wash for conversion bands (matches the flagship CTA panels). */
export const GOLD_GLOW =
  "radial-gradient(60% 70% at 50% 18%, rgba(201,162,39,0.16), rgba(201,162,39,0) 62%)";

/** Scroll-driven entrance shared by every section band (flagship RISE). */
export const RISE = {
  animationPreset: "rise" as const,
  animationTrigger: "scroll" as const,
  animationDuration: "0.9s",
  animationEasing: "smooth" as const,
};

// ── image slots (resolved to real media_assets by W5 curation) ───────────────
export const IMAGE_SLOT_PREFIX = "slot://impronta-rebuild/";

/** Clearly-marked placeholder src for an image node. W5 resolves it later. */
export function IMAGE_SLOT(name: string): string {
  return `${IMAGE_SLOT_PREFIX}${name}`;
}

// ── page contract ────────────────────────────────────────────────────────────
export interface DivisionSeo {
  meta_title: string;
  meta_description: string;
  og_title: string;
  og_description: string;
  /** Always `/p/<slug>`. */
  canonical_url: string;
  noindex: boolean;
  include_in_sitemap: boolean;
}

export interface DivisionPage {
  /** Page slug under /p/. (Models is `fashion-models`: /models is reserved.) */
  slug: string;
  /** Short human name for the division. */
  title: string;
  /** MULTI-ROOT BuilderNode tree (top-level array of band containers). */
  tree: BuilderNode[];
  seo: DivisionSeo;
  /** Every IMAGE_SLOT name used on the page, for the W5 curation manifest. */
  imageSlots: string[];
}

/**
 * Cross-linking registry — the division landing pages that are LIVE.
 *
 * `chefs-culinary` is authored but on owner hold (zero tagged talent, so the
 * page would render only its empty state). It is deliberately absent here: it
 * is linked from every other division page plus About and Become a Model, and
 * leaving it in produced dead `/p/chefs-culinary` links across six pages.
 * Re-add the entry in the same commit that lifts the hold in
 * `seed-pages.ts` (`HELD_PAGE_SLUGS`) — the seeder's no-dead-links test fails
 * if these two ever disagree.
 */
export const DIVISIONS: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: "fashion-models", label: "Fashion Models" },
  { slug: "hosts-promoters", label: "Hosts & Promoters" },
  { slug: "performers", label: "Performers" },
  { slug: "music-djs", label: "Music & DJs" },
];

// ── text primitives ──────────────────────────────────────────────────────────
export function eyebrow(
  id: string,
  text: string,
  align: "left" | "center" = "center",
): BuilderNode {
  return {
    id,
    kind: "paragraph",
    props: {
      text,
      layerLabel: "Eyebrow",
      style: {
        fontFamily: SERIF,
        fontSize: "12px",
        fontWeight: 600,
        letterSpacing: "0.32em",
        textTransform: "uppercase",
        textColor: GOLD,
        marginBottomFree: "14px",
        align,
      },
    },
  };
}

export function sectionTitle(
  id: string,
  text: string,
  align: "left" | "center" = "center",
): BuilderNode {
  return {
    id,
    kind: "heading",
    props: {
      text,
      level: 2 as const,
      layerLabel: "Title",
      style: {
        fontFamily: SERIF,
        fontSize: "44px",
        lineHeight: "1.06",
        fontWeight: 500,
        letterSpacing: "-0.01em",
        textColor: TEXT,
        textWrap: "balance",
        marginBottomFree: "0px",
        align,
        responsive: { mobile: { fontSize: "31px" } },
      },
    },
  };
}

/** Second heading line rendered in the gold italic accent (flagship pattern). */
export function sectionTitleAccent(
  id: string,
  text: string,
  align: "left" | "center" = "center",
): BuilderNode {
  return {
    id,
    kind: "heading",
    props: {
      text,
      level: 2 as const,
      layerLabel: "Title line 2 (accent)",
      style: {
        fontFamily: SERIF,
        fontSize: "44px",
        lineHeight: "1.06",
        fontWeight: 500,
        fontStyle: "italic",
        letterSpacing: "-0.01em",
        textColor: GOLD_BRIGHT,
        textWrap: "balance",
        marginBottomFree: "0px",
        align,
        responsive: { mobile: { fontSize: "31px" } },
      },
    },
  };
}

export function lead(
  id: string,
  text: string,
  align: "left" | "center" = "center",
): BuilderNode {
  return {
    id,
    kind: "paragraph",
    props: {
      text,
      layerLabel: "Lead",
      style: {
        fontFamily: SANS,
        fontSize: "17px",
        lineHeight: "1.62",
        textColor: MUTED,
        marginTopFree: "18px",
        maxWidthFree: "640px",
        align,
        ...(align === "center"
          ? { marginLeftFree: "auto", marginRightFree: "auto" }
          : {}),
      },
    },
  };
}

// ── buttons ──────────────────────────────────────────────────────────────────
export function goldButton(id: string, label: string, href: string): BuilderNode {
  return {
    id,
    kind: "button",
    props: {
      label,
      href,
      tone: "primary",
      style: {
        fontFamily: SANS,
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
        hover: {
          backgroundColor: GOLD_BRIGHT,
          translate: "0 -2px",
          boxShadow: "0 16px 40px rgba(201,162,39,0.28)",
        },
      },
    },
  };
}

export function lineButton(id: string, label: string, href: string): BuilderNode {
  return {
    id,
    kind: "button",
    props: {
      label,
      href,
      tone: "secondary",
      style: {
        fontFamily: SANS,
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
  };
}

// ── band scaffolding ─────────────────────────────────────────────────────────
export function band(
  id: string,
  children: BuilderNode[],
  opts: { borderTop?: boolean; glow?: boolean; label?: string } = {},
): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "stack",
      align: "center",
      ...(opts.label ? { layerLabel: opts.label } : {}),
      style: {
        width: "100%",
        maxWidthFree: "100%",
        paddingTop: "92px",
        paddingRight: "32px",
        paddingBottom: "92px",
        paddingLeft: "32px",
        gap: "0px",
        backgroundColor: INK,
        ...(opts.glow ? { backgroundImage: GOLD_GLOW } : {}),
        textColor: TEXT,
        ...(opts.borderTop
          ? {
              borderColor: HAIRLINE,
              borderWidth: "1px 0px 0px 0px",
              borderStyle: "solid",
            }
          : {}),
        responsive: {
          mobile: {
            paddingTop: "60px",
            paddingBottom: "60px",
            paddingRight: "20px",
            paddingLeft: "20px",
          },
        },
      },
    },
    children: [
      {
        id: `${id}-wrap`,
        kind: "container",
        props: {
          layout: "stack",
          style: { width: "100%", maxWidthFree: "1220px", gap: "40px", ...RISE },
        },
        children,
      },
    ],
  };
}

export function centerHead(
  id: string,
  eyebrowText: string,
  titleText: string,
  leadText?: string,
): BuilderNode {
  return {
    id: `${id}-head`,
    kind: "container",
    props: {
      layout: "stack",
      align: "center",
      layerLabel: "Section Head",
      style: {
        width: "100%",
        maxWidthFree: "760px",
        marginLeftFree: "auto",
        marginRightFree: "auto",
        gap: "0px",
        align: "center",
      },
    },
    children: [
      eyebrow(`${id}-eyebrow`, eyebrowText),
      sectionTitle(`${id}-title`, titleText),
      ...(leadText ? [lead(`${id}-lead`, leadText)] : []),
    ],
  };
}

// ── hero (full-bleed lifestyle photography, per-division) ────────────────────
export interface DivisionHeroInput {
  prefix: string;
  imageSlot: string;
  imageAlt: string;
  eyebrowText: string;
  /** Display line 1 (ink). */
  line1: string;
  /** Display line 2 (gold italic accent). */
  line2: string;
  sub: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
}

export function divisionHero(input: DivisionHeroInput): BuilderNode {
  const p = input.prefix;
  const displayStyle = {
    fontFamily: SERIF,
    fontSize: "clamp(2.8rem, 7vw, 6.2rem)",
    lineHeight: "1.02",
    fontWeight: 500,
    letterSpacing: "-0.015em",
    textTransform: "uppercase" as const,
    textWrap: "balance" as const,
    align: "center" as const,
    marginBottomFree: "0px",
    responsive: { tablet: { fontSize: "48px" }, mobile: { fontSize: "36px" } },
  };
  return {
    id: `${p}-hero`,
    kind: "container",
    props: {
      layout: "stack",
      align: "center",
      layerLabel: "Hero (full-bleed)",
      style: {
        width: "100%",
        maxWidthFree: "none",
        position: "relative",
        overflow: "hidden",
        gap: "0px",
        paddingTop: "0px",
        paddingRight: "0px",
        paddingBottom: "0px",
        paddingLeft: "0px",
        minHeight: "min(92vh,860px)",
        backgroundColor: INK,
        justifyContent: "center",
        alignItems: "center",
        responsive: { mobile: { minHeight: "min(88vh,680px)" } },
      },
    },
    children: [
      {
        id: `${p}-hero-image`,
        kind: "image",
        props: {
          src: IMAGE_SLOT(input.imageSlot),
          alt: input.imageAlt,
          priority: true,
          layerLabel: "Hero photograph",
          style: {
            position: "absolute",
            top: "0px",
            left: "0px",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            zIndex: 0,
          },
        },
      },
      {
        id: `${p}-hero-scrim`,
        kind: "container",
        props: {
          layout: "stack",
          layerLabel: "Scrim",
          style: {
            position: "absolute",
            top: "0px",
            left: "0px",
            width: "100%",
            height: "100%",
            zIndex: 1,
            pointerEvents: "none",
            backgroundColor: INK,
            backgroundImage:
              "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.72) 100%)",
            opacity: 0.92,
          },
        },
        children: [],
      },
      {
        id: `${p}-hero-content`,
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          layerLabel: "Hero content",
          style: {
            position: "relative",
            zIndex: 2,
            width: "100%",
            maxWidthFree: "980px",
            marginLeftFree: "auto",
            marginRightFree: "auto",
            gap: "0px",
            align: "center",
            paddingTop: "140px",
            paddingBottom: "120px",
            paddingLeft: "32px",
            paddingRight: "32px",
            textColor: TEXT,
            ...RISE,
            responsive: {
              mobile: {
                paddingTop: "96px",
                paddingBottom: "72px",
                paddingLeft: "20px",
                paddingRight: "20px",
              },
            },
          },
        },
        children: [
          eyebrow(`${p}-hero-eyebrow`, input.eyebrowText),
          {
            id: `${p}-hero-line1`,
            kind: "heading",
            props: {
              text: input.line1,
              level: 1,
              layerLabel: "Title line 1",
              style: { ...displayStyle, textColor: TEXT },
            },
          },
          {
            id: `${p}-hero-line2`,
            kind: "heading",
            props: {
              text: input.line2,
              level: 1,
              layerLabel: "Title line 2 (accent)",
              style: {
                ...displayStyle,
                fontStyle: "italic",
                textColor: GOLD_BRIGHT,
              },
            },
          },
          lead(`${p}-hero-sub`, input.sub),
          {
            id: `${p}-hero-actions`,
            kind: "container",
            props: {
              layout: "row",
              align: "center",
              layerLabel: "Hero actions",
              responsive: { mobile: { layout: "stack", align: "stretch" } },
              style: { marginTopFree: "30px", gap: "16px", justifyContent: "center" },
            },
            children: [
              goldButton(
                `${p}-hero-primary`,
                input.primary.label,
                input.primary.href,
              ),
              lineButton(
                `${p}-hero-secondary`,
                input.secondary.label,
                input.secondary.href,
              ),
            ],
          },
        ],
      },
    ],
  };
}

// ── editorial split (portrait beside the division promise) ───────────────────
export interface EditorialSplitInput {
  prefix: string;
  imageSlot: string;
  imageAlt: string;
  eyebrowText: string;
  line1: string;
  line2: string;
  tagline: string;
  body: string;
  listLabel: string;
  bullets: string[];
  /** Put the image on the right instead of the left. */
  flip?: boolean;
}

function bulletRow(prefix: string, n: number, text: string): BuilderNode {
  return {
    id: `${prefix}-bullet-${n}`,
    kind: "container",
    props: {
      layout: "row",
      align: "center",
      layerLabel: `Item ${n}`,
      style: {
        width: "100%",
        gap: "16px",
        paddingTop: "14px",
        paddingBottom: "14px",
        borderColor: HAIRLINE,
        borderWidth: "0px 0px 1px 0px",
        borderStyle: "solid",
      },
    },
    children: [
      {
        id: `${prefix}-bullet-mark-${n}`,
        kind: "container",
        props: {
          layout: "stack",
          layerLabel: "Bullet",
          style: {
            width: "8px",
            height: "8px",
            borderColor: GOLD_BRIGHT,
            borderWidth: "1px",
            borderStyle: "solid",
            borderRadius: "0px",
          },
        },
        children: [],
      },
      {
        id: `${prefix}-bullet-text-${n}`,
        kind: "paragraph",
        props: {
          text,
          layerLabel: `Item ${n} text`,
          style: {
            fontFamily: SANS,
            fontSize: "15px",
            lineHeight: "1.5",
            textColor: TEXT,
            marginBottomFree: "0px",
            align: "left",
          },
        },
      },
    ],
  };
}

export function editorialSplit(input: EditorialSplitInput): BuilderNode {
  const p = input.prefix;
  const media: BuilderNode = {
    id: `${p}-split-media`,
    kind: "container",
    props: { layout: "stack", layerLabel: "Photograph", style: { width: "100%" } },
    children: [
      {
        id: `${p}-split-image`,
        kind: "image",
        props: {
          src: IMAGE_SLOT(input.imageSlot),
          alt: input.imageAlt,
          layerLabel: "Editorial photograph",
          style: {
            width: "100%",
            aspectRatioFree: "0.8",
            objectFit: "cover",
            objectPosition: "center top",
            borderRadius: "4px",
            boxShadow: "0 40px 110px rgba(0,0,0,0.45)",
          },
        },
      },
    ],
  };
  const copy: BuilderNode = {
    id: `${p}-split-copy`,
    kind: "container",
    props: {
      layout: "stack",
      align: "start",
      layerLabel: "Copy",
      style: { gap: "0px", maxWidthFree: "640px" },
    },
    children: [
      eyebrow(`${p}-split-eyebrow`, input.eyebrowText, "left"),
      sectionTitle(`${p}-split-title-1`, input.line1, "left"),
      sectionTitleAccent(`${p}-split-title-2`, input.line2, "left"),
      {
        id: `${p}-split-tagline`,
        kind: "paragraph",
        props: {
          text: input.tagline,
          layerLabel: "Gold tagline",
          style: {
            fontFamily: SERIF,
            fontSize: "19px",
            lineHeight: "1.5",
            fontStyle: "italic",
            fontWeight: 400,
            textColor: GOLD,
            marginTopFree: "22px",
            align: "left",
            maxWidthFree: "560px",
          },
        },
      },
      {
        id: `${p}-split-body`,
        kind: "paragraph",
        props: {
          text: input.body,
          layerLabel: "Body",
          style: {
            fontFamily: SANS,
            fontSize: "16px",
            lineHeight: "1.62",
            textColor: MUTED,
            marginTopFree: "18px",
            align: "left",
            maxWidthFree: "560px",
          },
        },
      },
      {
        id: `${p}-split-list`,
        kind: "container",
        props: {
          layout: "stack",
          align: "start",
          layerLabel: "List",
          style: {
            gap: "0px",
            marginTopFree: "32px",
            width: "100%",
            maxWidthFree: "560px",
          },
        },
        children: [
          {
            id: `${p}-split-list-label`,
            kind: "paragraph",
            props: {
              text: input.listLabel,
              layerLabel: "List label",
              style: {
                fontFamily: SERIF,
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.32em",
                textTransform: "uppercase",
                textColor: GOLD_BRIGHT,
                marginBottomFree: "16px",
                align: "left",
              },
            },
          },
          ...input.bullets.map((text, i) => bulletRow(`${p}-split`, i + 1, text)),
        ],
      },
    ],
  };
  return band(
    `${p}-editorial`,
    [
      {
        id: `${p}-split`,
        kind: "split",
        props: {
          ratio: input.flip ? "60-40" : "40-60",
          gap: "l",
          collapseOnMobile: true,
          layerLabel: "Image + Copy",
          style: { width: "100%", maxWidthFree: "100%", alignItems: "center" },
        },
        children: input.flip ? [copy, media] : [media, copy],
      },
    ],
    { borderTop: true, label: "Editorial split" },
  );
}

// ── use-case grid ────────────────────────────────────────────────────────────
export interface UseCaseGridInput {
  prefix: string;
  eyebrowText: string;
  title: string;
  leadText?: string;
  columns: 2 | 3 | 4;
  items: Array<{ kicker: string; title: string; body: string }>;
}

export function buildUseCaseGrid(input: UseCaseGridInput): BuilderNode {
  const p = input.prefix;
  return band(
    `${p}-usecases`,
    [
      centerHead(`${p}-usecases`, input.eyebrowText, input.title, input.leadText),
      {
        id: `${p}-usecases-grid`,
        kind: "container",
        props: {
          layout: "grid",
          columns: input.columns,
          gap: "m",
          layerLabel: "Use cases",
          responsive: { tablet: { columns: 2 }, mobile: { columns: 1 } },
          style: { width: "100%", maxWidthFree: "100%", gap: "24px" },
        },
        children: input.items.map((item, i) => ({
          id: `${p}-usecase-${i + 1}`,
          kind: "container" as const,
          props: {
            layout: "stack" as const,
            align: "start" as const,
            layerLabel: item.title,
            style: {
              gap: "0px",
              backgroundColor: CARD,
              borderColor: HAIRLINE,
              borderWidth: "1px",
              borderStyle: "solid" as const,
              borderRadius: "6px",
              paddingTop: "34px",
              paddingBottom: "34px",
              paddingLeft: "30px",
              paddingRight: "30px",
              transitionProperty: "border-color, transform",
              transitionDuration: "240ms",
              transitionTimingFunction: "ease",
              hover: { borderColor: GOLD, translate: "0 -4px" },
            },
          },
          children: [
            {
              id: `${p}-usecase-${i + 1}-kicker`,
              kind: "paragraph" as const,
              props: {
                text: item.kicker,
                layerLabel: "Kicker",
                style: {
                  fontFamily: SERIF,
                  fontSize: "12px",
                  fontWeight: 600,
                  letterSpacing: "0.28em",
                  textTransform: "uppercase" as const,
                  textColor: GOLD_BRIGHT,
                  marginBottomFree: "14px",
                  align: "left" as const,
                },
              },
            },
            {
              id: `${p}-usecase-${i + 1}-title`,
              kind: "heading" as const,
              props: {
                text: item.title,
                level: 3,
                layerLabel: "Card title",
                style: {
                  fontFamily: SERIF,
                  fontSize: "22px",
                  lineHeight: "1.15",
                  fontWeight: 500,
                  textColor: TEXT,
                  marginBottomFree: "0px",
                  align: "left" as const,
                },
              },
            },
            {
              id: `${p}-usecase-${i + 1}-body`,
              kind: "paragraph" as const,
              props: {
                text: item.body,
                layerLabel: "Card body",
                style: {
                  fontFamily: SANS,
                  fontSize: "15px",
                  lineHeight: "1.6",
                  textColor: MUTED,
                  marginTopFree: "12px",
                  align: "left" as const,
                },
              },
            },
          ],
        })),
      },
    ],
    { borderTop: true, label: "Use cases" },
  );
}

// ── occasion link rows (editorial draw-underline rows → /directory) ──────────
export interface LinkRowsInput {
  prefix: string;
  eyebrowText: string;
  title: string;
  leadText?: string;
  rows: string[];
}

export function linkRows(input: LinkRowsInput): BuilderNode {
  const p = input.prefix;
  return band(
    `${p}-occasions`,
    [
      {
        id: `${p}-occasions-headwrap`,
        kind: "container",
        props: {
          layout: "stack",
          align: "start",
          layerLabel: "Section Head",
          style: { gap: "0px", maxWidthFree: "640px" },
        },
        children: [
          eyebrow(`${p}-occasions-eyebrow`, input.eyebrowText, "left"),
          sectionTitle(`${p}-occasions-title`, input.title, "left"),
          ...(input.leadText
            ? [lead(`${p}-occasions-lead`, input.leadText, "left")]
            : []),
        ],
      },
      {
        id: `${p}-occasions-grid`,
        kind: "container",
        props: {
          layout: "grid",
          columns: 3,
          gap: "m",
          layerLabel: "Occasion rows",
          responsive: { tablet: { columns: 2 }, mobile: { columns: 1 } },
          style: { width: "100%", maxWidthFree: "100%", gap: "0px 48px" },
        },
        children: input.rows.map((label, i) => ({
          id: `${p}-occasion-${i + 1}`,
          kind: "button" as const,
          props: {
            label: `${label}  →`,
            href: "/directory",
            tone: "secondary" as const,
            layerLabel: label,
            style: {
              fontFamily: SERIF,
              fontSize: "22px",
              fontWeight: 400,
              letterSpacing: "-0.01em",
              textColor: MUTED,
              backgroundColor: "rgba(0,0,0,0)",
              borderColor: HAIRLINE,
              borderWidth: "0px 0px 1px 0px",
              borderStyle: "solid" as const,
              borderRadius: "0px",
              width: "100%",
              paddingTop: "22px",
              paddingBottom: "22px",
              paddingLeft: "0px",
              paddingRight: "0px",
              align: "left" as const,
              justifyContent: "space-between" as const,
              alignItems: "center" as const,
              transitionProperty: "color, border-color",
              transitionDuration: "240ms",
              transitionTimingFunction: "ease",
              hover: { color: GOLD_BRIGHT, borderColor: GOLD_BRIGHT },
            },
          },
        })),
      },
    ],
    { borderTop: true, label: "Occasions" },
  );
}

// ── stats band ───────────────────────────────────────────────────────────────
export interface StatBandInput {
  prefix: string;
  eyebrowText: string;
  cells: Array<{ value: string; label: string }>;
}

export function statBand(input: StatBandInput): BuilderNode {
  const p = input.prefix;
  return band(
    `${p}-stats`,
    [
      eyebrow(`${p}-stats-eyebrow`, input.eyebrowText),
      {
        id: `${p}-stats-row`,
        kind: "container",
        props: {
          layout: "grid",
          columns: input.cells.length > 3 ? 4 : 3,
          gap: "m",
          layerLabel: "Stat row",
          responsive: { tablet: { columns: 2 }, mobile: { columns: 1 } },
          style: { width: "100%", maxWidthFree: "100%", gap: "0px" },
        },
        children: input.cells.map((cell, i) => ({
          id: `${p}-stat-${i + 1}`,
          kind: "container" as const,
          props: {
            layout: "stack" as const,
            align: "center" as const,
            layerLabel: `Stat: ${cell.label}`,
            style: {
              gap: "10px",
              align: "center" as const,
              paddingTop: "16px",
              paddingBottom: "16px",
              paddingLeft: "32px",
              paddingRight: "32px",
              ...(i > 0
                ? {
                    borderColor: GOLD_BRIGHT,
                    borderWidth: "0px 0px 0px 1px",
                    borderStyle: "solid" as const,
                  }
                : {}),
              responsive: {
                mobile: {
                  ...(i > 0 ? { borderWidth: "0px" } : {}),
                  paddingLeft: "0px",
                  paddingRight: "0px",
                  paddingTop: "24px",
                  paddingBottom: "24px",
                },
              },
            },
          },
          children: [
            {
              id: `${p}-stat-${i + 1}-value`,
              kind: "heading" as const,
              props: {
                text: cell.value,
                level: 3,
                layerLabel: "Value",
                style: {
                  fontFamily: SERIF,
                  fontSize: "clamp(2.75rem, 5vw, 4rem)",
                  lineHeight: "1",
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                  textColor: GOLD_BRIGHT,
                  align: "center" as const,
                  marginBottomFree: "0px",
                },
              },
            },
            {
              id: `${p}-stat-${i + 1}-label`,
              kind: "paragraph" as const,
              props: {
                text: cell.label,
                layerLabel: "Label",
                style: {
                  fontFamily: SANS,
                  fontSize: "12px",
                  fontWeight: 600,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase" as const,
                  textColor: MUTED,
                  align: "center" as const,
                  marginTopFree: "0px",
                },
              },
            },
          ],
        })),
      },
    ],
    { borderTop: true, label: "Stats band" },
  );
}

// ── full-bleed photographic plate (banner break with a statement line) ───────
export interface PlateInput {
  prefix: string;
  imageSlot: string;
  imageAlt: string;
  line: string;
  /** Faint oversized numeral/glyph behind the line (optional). */
  numeral?: string;
}

export function fullBleedPlate(input: PlateInput): BuilderNode {
  const p = input.prefix;
  return {
    id: `${p}-plate`,
    kind: "container",
    props: {
      layout: "stack",
      align: "center",
      layerLabel: "Full-bleed plate",
      style: {
        width: "100%",
        maxWidthFree: "none",
        position: "relative",
        overflow: "hidden",
        gap: "0px",
        paddingTop: "0px",
        paddingRight: "0px",
        paddingBottom: "0px",
        paddingLeft: "0px",
        minHeight: "min(72vh,720px)",
        backgroundColor: INK,
        justifyContent: "center",
        alignItems: "center",
        responsive: { mobile: { minHeight: "min(70vh,540px)" } },
      },
    },
    children: [
      {
        id: `${p}-plate-image`,
        kind: "image",
        props: {
          src: IMAGE_SLOT(input.imageSlot),
          alt: input.imageAlt,
          layerLabel: "Plate photograph",
          style: {
            position: "absolute",
            top: "0px",
            left: "0px",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            zIndex: 0,
          },
        },
      },
      {
        id: `${p}-plate-scrim`,
        kind: "container",
        props: {
          layout: "stack",
          layerLabel: "Scrim",
          style: {
            position: "absolute",
            top: "0px",
            left: "0px",
            width: "100%",
            height: "100%",
            zIndex: 1,
            pointerEvents: "none",
            backgroundColor: INK,
            backgroundImage:
              "linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.62) 100%)",
            opacity: 0.9,
          },
        },
        children: [],
      },
      {
        id: `${p}-plate-content`,
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          layerLabel: "Statement",
          style: {
            position: "relative",
            zIndex: 2,
            width: "100%",
            maxWidthFree: "980px",
            marginLeftFree: "auto",
            marginRightFree: "auto",
            gap: "0px",
            align: "center",
            paddingTop: "110px",
            paddingBottom: "110px",
            paddingLeft: "32px",
            paddingRight: "32px",
            justifyContent: "center",
            alignItems: "center",
            ...RISE,
            responsive: {
              mobile: {
                paddingTop: "72px",
                paddingBottom: "72px",
                paddingLeft: "20px",
                paddingRight: "20px",
              },
            },
          },
        },
        children: [
          ...(input.numeral
            ? [
                {
                  id: `${p}-plate-numeral`,
                  kind: "heading" as const,
                  props: {
                    text: input.numeral,
                    level: 2 as const,
                    layerLabel: "Numeral",
                    style: {
                      fontFamily: SERIF,
                      fontStyle: "italic" as const,
                      fontWeight: 300,
                      fontSize: "clamp(3.5rem, 9vw, 7rem)",
                      lineHeight: "1",
                      letterSpacing: "0.02em",
                      textColor: GOLD_BRIGHT,
                      opacity: 0.18,
                      align: "center" as const,
                      marginBottomFree: "8px",
                    },
                  },
                },
              ]
            : []),
          {
            id: `${p}-plate-line`,
            kind: "heading",
            props: {
              text: input.line,
              level: 2 as const,
              layerLabel: "Statement line",
              style: {
                fontFamily: SERIF,
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: "clamp(1.8rem, 4.2vw, 3.2rem)",
                lineHeight: "1.14",
                letterSpacing: "-0.01em",
                textColor: TEXT,
                align: "center",
                textWrap: "balance",
                maxWidthFree: "880px",
                marginLeftFree: "auto",
                marginRightFree: "auto",
                marginBottomFree: "0px",
                responsive: { mobile: { fontSize: "1.6rem" } },
              },
            },
          },
        ],
      },
    ],
  };
}

// ── LIVE ROSTER (directory section_embed scoped by discipline) ───────────────
export interface RosterSectionInput {
  prefix: string;
  eyebrowText: string;
  title: string;
  leadText?: string;
  /**
   * Live `taxonomy_terms.slug` values (parent_category or talent_type). The
   * directory engine expands parent terms down to the tagged leaf talent_types
   * (see src/lib/directory/taxonomy-tenant-safety.ts), so a single parent slug
   * scopes the grid to the whole division. Slugs sourced from the live
   * parent_category map in roster-type-groups.ts — VERIFY against
   * taxonomy_terms before publish: an unknown slug is silently dropped and an
   * all-unknown list would render the roster UNSCOPED.
   */
  talentTypeKeys: string[];
  emptyStateText: string;
}

/**
 * Freeform header + a `directory` section_embed with
 * `scope: "by_talent_type"` — a genuinely FILTERED live roster (the same
 * mechanism behind /p/our-fashion-models). Chrome is pared down to a roster
 * band: no AI band, no sidebar, no top filter bar, no result count.
 */
export function divisionRosterSection(input: RosterSectionInput): BuilderNode {
  const p = input.prefix;
  return band(
    `${p}-roster`,
    [
      {
        id: `${p}-roster-head`,
        kind: "container",
        props: {
          layout: "row",
          align: "center",
          layerLabel: "Section Head",
          responsive: { mobile: { layout: "stack", align: "start" } },
          style: {
            width: "100%",
            gap: "16px",
            justifyContent: "space-between",
            alignItems: "flex-end",
          },
        },
        children: [
          {
            id: `${p}-roster-headcopy`,
            kind: "container",
            props: {
              layout: "stack",
              align: "start",
              layerLabel: "Head copy",
              style: { gap: "0px", maxWidthFree: "640px" },
            },
            children: [
              eyebrow(`${p}-roster-eyebrow`, input.eyebrowText, "left"),
              sectionTitle(`${p}-roster-title`, input.title, "left"),
              ...(input.leadText
                ? [lead(`${p}-roster-lead`, input.leadText, "left")]
                : []),
            ],
          },
          lineButton(`${p}-roster-seeall`, "See the full roster →", "/directory"),
        ],
      },
      {
        id: `${p}-roster-embed`,
        kind: "section_embed",
        props: {
          sectionTypeKey: "directory",
          layerLabel: "Live roster (filtered)",
          config: {
            showHeading: false,
            entityLabel: "talent",
            scope: "by_talent_type",
            talentTypeKeys: input.talentTypeKeys,
            pagination: "load_more",
            pageSize: 8,
            columnsDesktop: 4,
            columnsTablet: 3,
            columnsMobile: 1,
            containerWidth: "boxed",
            background: "plain",
            aiMode: "off",
            topBarMode: "none",
            sidebarShow: false,
            filterSearchBox: false,
            sortControlShow: false,
            showResultCount: false,
            showActiveChips: false,
            emptyStateText: input.emptyStateText,
            presentation: {},
          },
        },
      },
    ],
    { borderTop: true, label: "Live roster" },
  );
}

// ── cross-division links ─────────────────────────────────────────────────────
export function divisionsCrossLinks(prefix: string, currentSlug: string): BuilderNode {
  const others = DIVISIONS.filter((d) => d.slug !== currentSlug);
  return band(
    `${prefix}-divisions`,
    [
      centerHead(
        `${prefix}-divisions`,
        "The agency",
        "Explore the other divisions",
      ),
      {
        id: `${prefix}-divisions-row`,
        kind: "container",
        props: {
          layout: "row",
          align: "center",
          layerLabel: "Division links",
          style: {
            gap: "14px",
            flexWrap: "wrap",
            justifyContent: "center",
            width: "100%",
          },
        },
        children: others.map((d) =>
          lineButton(`${prefix}-divisions-${d.slug}`, d.label, `/p/${d.slug}`),
        ),
      },
    ],
    { borderTop: true, label: "Other divisions" },
  );
}

// ── closing inquiry CTA ──────────────────────────────────────────────────────
export interface ClosingCtaInput {
  prefix: string;
  eyebrowText: string;
  line1: string;
  line2: string;
  sub: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
}

export function closingCta(input: ClosingCtaInput): BuilderNode {
  const p = input.prefix;
  return band(
    `${p}-closing`,
    [
      {
        id: `${p}-closing-inner`,
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          layerLabel: "Closing CTA",
          style: {
            width: "100%",
            maxWidthFree: "780px",
            marginLeftFree: "auto",
            marginRightFree: "auto",
            gap: "0px",
            align: "center",
          },
        },
        children: [
          eyebrow(`${p}-closing-eyebrow`, input.eyebrowText),
          sectionTitle(`${p}-closing-line1`, input.line1),
          sectionTitleAccent(`${p}-closing-line2`, input.line2),
          lead(`${p}-closing-sub`, input.sub),
          {
            id: `${p}-closing-actions`,
            kind: "container",
            props: {
              layout: "row",
              align: "center",
              layerLabel: "Actions",
              responsive: { mobile: { layout: "stack" } },
              style: { gap: "18px", marginTopFree: "30px", justifyContent: "center" },
            },
            children: [
              goldButton(`${p}-closing-primary`, input.primary.label, input.primary.href),
              lineButton(
                `${p}-closing-secondary`,
                input.secondary.label,
                input.secondary.href,
              ),
            ],
          },
        ],
      },
    ],
    { borderTop: true, glow: true, label: "Closing CTA" },
  );
}
