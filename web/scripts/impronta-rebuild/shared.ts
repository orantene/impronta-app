/**
 * Impronta website rebuild — shared design system for the page trees under
 * `scripts/impronta-rebuild/pages/`.
 *
 * Noir & Or: dark editorial ground, warm-gold accent, oversized serif display
 * headlines, generous negative space, reveal-on-view motion. The visual
 * language mirrors the flagship freeform home
 * (`src/lib/site-admin/builder-node/page-designs/impronta.ts`): every color and
 * font is `token:`-bound so the pages re-skin with the tenant theme.
 *
 * IMAGE SLOTS — these trees never hard-pick photos. Every image src (and every
 * full-bleed background) is an `IMAGE_SLOT("<page>-<purpose>")` placeholder URL
 * that workstream W5's curation module resolves to real `media_assets` URLs
 * before seeding. `collectImageSlots(tree)` returns the slot list for a tree so
 * the resolver (and the validation test) can enumerate them.
 *
 * This module is deliberately ADDITIVE and GENERIC — a sibling workstream
 * (W4b, division pages) shares this directory. Add helpers; do not repurpose
 * or break existing exports.
 */
import type {
  BuilderFormField,
  BuilderNode,
} from "@/lib/site-admin/builder-node/types";
import { styleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";

// ── SEO / page model ─────────────────────────────────────────────────────────

export interface ImprontaPageSeo {
  meta_title: string;
  meta_description: string;
  og_title: string;
  og_description: string;
  /** Path-style canonical (`/p/<slug>`); the seeder resolves the host. */
  canonical_url: string;
  noindex: boolean;
  include_in_sitemap: boolean;
  /** JSON-LD payload (home only: Organization schema). */
  json_ld?: Record<string, unknown>;
}

export interface ImprontaRebuildPage {
  slug: string;
  /** Admin-facing page title. */
  title: string;
  seo: ImprontaPageSeo;
  tree: BuilderNode[];
}

// ── owner-confirm business facts ─────────────────────────────────────────────
// OWNER-CONFIRM: no verified public inbox exists in the repo. The seeder /
// integrator must confirm this address with the owner before go-live (flagged
// in DESIGN-BLOCKERS.md). No phone number is invented anywhere; the phone/
// WhatsApp channel stays off the site until the owner supplies one.
export const CONTACT_EMAIL = "hello@improntamodels.com";

// ── image slots ──────────────────────────────────────────────────────────────

export const IMAGE_SLOT_PREFIX = "slot://impronta-rebuild/";

/** Placeholder media URL for W5's curation module to resolve. */
export function IMAGE_SLOT(name: string): string {
  return `${IMAGE_SLOT_PREFIX}${name}`;
}

/** CSS background-image value carrying a slot (also resolvable by W5). */
export function IMAGE_SLOT_BG(name: string): string {
  return `url('${IMAGE_SLOT(name)}')`;
}

/** Every slot name referenced by a tree (image srcs + CSS backgrounds). */
export function collectImageSlots(tree: BuilderNode[]): string[] {
  const found = new Set<string>();
  const fromString = (value: string) => {
    let cursor = value.indexOf(IMAGE_SLOT_PREFIX);
    while (cursor !== -1) {
      const start = cursor + IMAGE_SLOT_PREFIX.length;
      const rest = value.slice(start);
      const end = rest.search(/['")\s]/);
      found.add(end === -1 ? rest : rest.slice(0, end));
      cursor = value.indexOf(IMAGE_SLOT_PREFIX, start);
    }
  };
  const walkValue = (value: unknown): void => {
    if (typeof value === "string") {
      fromString(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walkValue);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(walkValue);
    }
  };
  tree.forEach((node) => walkValue(node));
  return [...found].sort();
}

// ── palette (token-bound; follows the tenant theme) ──────────────────────────

export const INK = styleTokenRef("color.background");
export const SURFACE = styleTokenRef("color.surface-raised");
export const GOLD = styleTokenRef("color.primary");
export const GOLD_BRIGHT = styleTokenRef("color.accent");
export const TEXT = styleTokenRef("color.ink");
export const MUTED = styleTokenRef("color.muted");

/**
 * Body copy that sits ON a photograph or video.
 *
 * Not a token: the token palette's muted grey is calibrated for text on a dark
 * PANEL, and the whole problem here is that media is not a panel — a bright
 * video frame swallows it. This is a fixed warm white so the copy holds
 * whatever passes underneath it, with a shadow doing the rest.
 */
export const OVER_MEDIA_TEXT = "rgba(244,238,226,0.94)";
export const OVER_MEDIA_SHADOW = "0 1px 12px rgba(6,6,10,0.75)";
export const HAIRLINE = styleTokenRef("color.line");
export const CARD = styleTokenRef("color.surface-raised");
export const CARD_BORDER = styleTokenRef("color.line");
export const SERIF = styleTokenRef("typography.heading-font-family");
export const SANS = styleTokenRef("typography.body-font-family");

/** Gold radial wash for conversion bands. */
export const GOLD_GLOW =
  "radial-gradient(60% 70% at 50% 18%, rgba(201,162,39,0.16), rgba(201,162,39,0) 62%)";

/** Scroll-driven band entrance (reduced-motion is honoured by the renderer). */
export const RISE = {
  animationPreset: "rise" as const,
  animationTrigger: "scroll" as const,
  animationDuration: "0.9s",
  animationEasing: "smooth" as const,
};

// ── typography primitives ────────────────────────────────────────────────────

type Align = "left" | "center" | "right";

/** Small-caps gold eyebrow line. */
export function eyebrow(id: string, text: string, align: Align = "center"): BuilderNode {
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
        align,
        marginBottomFree: "14px",
      },
    },
  };
}

export interface HeadingLineOptions {
  level?: 1 | 2 | 3 | 4;
  align?: Align;
  /** Gold italic accent line (the second line of a stacked headline). */
  accent?: boolean;
  size?: "display" | "section" | "card";
  layerLabel?: string;
  maxWidth?: string;
}

/** One line of a (possibly stacked) serif display headline. */
export function headingLine(
  id: string,
  text: string,
  opts: HeadingLineOptions = {},
): BuilderNode {
  const size = opts.size ?? "section";
  const fontSize =
    size === "display"
      ? "clamp(2.8rem, 6.6vw, 5.8rem)"
      : size === "section"
        ? "clamp(2rem, 3.6vw, 2.9rem)"
        : "clamp(1.35rem, 2.2vw, 1.7rem)";
  return {
    id,
    kind: "heading",
    props: {
      text,
      level: opts.level ?? (size === "display" ? 1 : 2),
      layerLabel: opts.layerLabel ?? (opts.accent ? "Headline (accent)" : "Headline"),
      style: {
        fontFamily: SERIF,
        fontSize,
        lineHeight: size === "display" ? "1.02" : "1.06",
        fontWeight: size === "card" ? 500 : 500,
        letterSpacing: "-0.015em",
        ...(opts.accent ? { fontStyle: "italic" as const, textColor: GOLD_BRIGHT } : { textColor: TEXT }),
        textWrap: "balance",
        align: opts.align ?? "center",
        marginBottomFree: "0px",
        ...(opts.maxWidth ? { maxWidthFree: opts.maxWidth } : {}),
      },
    },
  };
}

export interface ParagraphOptions {
  align?: Align;
  maxWidth?: string;
  marginTop?: string;
  size?: "lead" | "body" | "small";
  /**
   * `over-media` is the one that matters on a photograph or video: the muted
   * token is a grey chosen for a dark PANEL, and over a bright video frame it
   * disappears. Text on media gets warm white and a shadow instead.
   */
  tone?: "muted" | "ink" | "faint" | "over-media";
  layerLabel?: string;
}

/** Body / lead copy paragraph. */
export function copy(id: string, text: string, opts: ParagraphOptions = {}): BuilderNode {
  const size = opts.size ?? "body";
  return {
    id,
    kind: "paragraph",
    props: {
      text,
      layerLabel: opts.layerLabel ?? "Body",
      style: {
        fontFamily: SANS,
        fontSize: size === "lead" ? "17px" : size === "body" ? "16px" : "13px",
        lineHeight: size === "small" ? "1.55" : "1.62",
        textColor:
          opts.tone === "ink"
            ? TEXT
            : opts.tone === "over-media"
              ? OVER_MEDIA_TEXT
              : MUTED,
        // A shadow only where there is media underneath: over a flat panel it
        // would just muddy the type.
        ...(opts.tone === "over-media" ? { textShadow: OVER_MEDIA_SHADOW } : {}),
        align: opts.align ?? "center",
        ...(opts.maxWidth ? { maxWidthFree: opts.maxWidth } : {}),
        ...(opts.align === "center" && opts.maxWidth
          ? { marginLeftFree: "auto", marginRightFree: "auto" }
          : {}),
        marginTopFree: opts.marginTop ?? "16px",
      },
    },
  };
}

// ── buttons ──────────────────────────────────────────────────────────────────

/** Solid gold primary CTA. */
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

/** Hairline outline secondary CTA. */
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

/** Editorial draw-underline link row (full-width hairline list link). */
export function linkRow(id: string, label: string, href: string): BuilderNode {
  return {
    id,
    kind: "button",
    props: {
      label: `${label}  →`,
      href,
      tone: "secondary",
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
        transitionProperty: "color, border-color",
        transitionDuration: "240ms",
        transitionTimingFunction: "ease",
        hover: { color: GOLD_BRIGHT, borderColor: GOLD_BRIGHT },
      },
    },
  };
}

/** Horizontal CTA row that stacks on mobile. */
export function ctaRow(id: string, buttons: BuilderNode[], align: Align = "center"): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "row",
      align: "center",
      layerLabel: "Actions",
      responsive: { mobile: { layout: "stack", align: "stretch" } },
      style: {
        gap: "16px",
        marginTopFree: "28px",
        justifyContent: align === "left" ? "flex-start" : "center",
      },
    },
    children: buttons,
  };
}

// ── section shells ───────────────────────────────────────────────────────────

export interface BandOptions {
  borderTop?: boolean;
  glow?: boolean;
  background?: string;
  layerLabel?: string;
  paddingY?: { desktop: string; mobile: string };
}

/** Full-width dark band with a centered max-width column and rise-on-scroll. */
export function band(id: string, children: BuilderNode[], opts: BandOptions = {}): BuilderNode {
  const padDesktop = opts.paddingY?.desktop ?? "96px";
  const padMobile = opts.paddingY?.mobile ?? "60px";
  return {
    id,
    kind: "container",
    props: {
      layout: "stack",
      align: "center",
      layerLabel: opts.layerLabel,
      style: {
        width: "100%",
        maxWidthFree: "100%",
        paddingTop: padDesktop,
        paddingRight: "32px",
        paddingBottom: padDesktop,
        paddingLeft: "32px",
        gap: "0px",
        backgroundColor: opts.background ?? INK,
        ...(opts.glow ? { backgroundImage: GOLD_GLOW } : {}),
        textColor: TEXT,
        ...(opts.borderTop
          ? { borderColor: HAIRLINE, borderWidth: "1px 0px 0px 0px", borderStyle: "solid" }
          : {}),
        responsive: {
          mobile: {
            paddingTop: padMobile,
            paddingBottom: padMobile,
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
          layerLabel: "Container",
          style: { width: "100%", maxWidthFree: "1220px", gap: "40px", ...RISE },
        },
        children,
      },
    ],
  };
}

/** Centered section head: eyebrow + headline (+ optional lead). */
export function centerHead(
  idPrefix: string,
  eb: string,
  title: string,
  lead?: string,
): BuilderNode {
  return {
    id: `${idPrefix}-head`,
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
      eyebrow(`${idPrefix}-eyebrow`, eb),
      headingLine(`${idPrefix}-title`, title, { size: "section", align: "center" }),
      ...(lead
        ? [copy(`${idPrefix}-lead`, lead, { align: "center", maxWidth: "640px", size: "lead", marginTop: "18px" })]
        : []),
    ],
  };
}

/** Left-aligned section head: eyebrow + headline (+ optional lead). */
export function leftHead(
  idPrefix: string,
  eb: string,
  title: string,
  lead?: string,
): BuilderNode {
  return {
    id: `${idPrefix}-head`,
    kind: "container",
    props: {
      layout: "stack",
      align: "start",
      layerLabel: "Section Head",
      style: { gap: "0px", maxWidthFree: "720px" },
    },
    children: [
      eyebrow(`${idPrefix}-eyebrow`, eb, "left"),
      headingLine(`${idPrefix}-title`, title, { size: "section", align: "left" }),
      ...(lead
        ? [copy(`${idPrefix}-lead`, lead, { align: "left", maxWidth: "600px", size: "lead", marginTop: "18px" })]
        : []),
    ],
  };
}

// ── heroes & full-bleed plates ───────────────────────────────────────────────

export interface PageHeroOptions {
  /** Small-caps line above the headline. */
  eyebrowText: string;
  /** First headline line (ink). */
  line1: string;
  /** Second headline line (gold italic). Optional. */
  line2?: string;
  sub: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
  /** Full-bleed background image slot; omit for the gradient-only hero. */
  imageSlot?: string;
  imageAlt?: string;
  /** Small reassurance line under the CTAs. */
  footnote?: string;
  compact?: boolean;
  /**
   * Moving background: a YouTube URL painted behind the hero's content.
   *
   * `imageSlot` STAYS REQUIRED alongside it and keeps doing its job. The still
   * is the poster, the reduced-motion fallback, and what a visitor sees while
   * the embed loads or if it never does — so the hero is never a black box on a
   * slow connection, and a visitor who asked their system for less motion gets
   * the photograph rather than nothing.
   */
  videoUrl?: string;
}

/**
 * Full-bleed editorial page hero. With `imageSlot`: photographic cover + scrim.
 * Without: the flagship's gold-wash gradient over the dark canvas.
 */
export function pageHero(idPrefix: string, opts: PageHeroOptions): BuilderNode {
  const buttons: BuilderNode[] = [];
  if (opts.primary) buttons.push(goldButton(`${idPrefix}-cta-primary`, opts.primary.label, opts.primary.href));
  if (opts.secondary) buttons.push(lineButton(`${idPrefix}-cta-secondary`, opts.secondary.label, opts.secondary.href));

  const inner: BuilderNode[] = [
    eyebrow(`${idPrefix}-eyebrow`, opts.eyebrowText),
    headingLine(`${idPrefix}-line1`, opts.line1, {
      size: "display",
      level: 1,
      align: "center",
      layerLabel: "Title line 1",
    }),
    ...(opts.line2
      ? [
          headingLine(`${idPrefix}-line2`, opts.line2, {
            size: "display",
            level: 1,
            align: "center",
            accent: true,
            layerLabel: "Title line 2 (accent)",
          }),
        ]
      : []),
    copy(`${idPrefix}-sub`, opts.sub, {
      align: "center",
      maxWidth: "660px",
      size: "lead",
      marginTop: "22px",
      // The hero always sits on a photograph or the video, so its body copy is
      // over-media by definition — this is the line the owner could not read.
      tone: "over-media",
    }),
    ...(buttons.length > 0 ? [ctaRow(`${idPrefix}-actions`, buttons)] : []),
    ...(opts.footnote
      ? [
          copy(`${idPrefix}-footnote`, opts.footnote, {
            align: "center",
            size: "small",
            marginTop: "18px",
            layerLabel: "Reassurance",
            tone: "over-media",
          }),
        ]
      : []),
  ];

  const padTop = opts.compact ? "104px" : "148px";
  const padBottom = opts.compact ? "84px" : "132px";

  return {
    id: `${idPrefix}-hero`,
    kind: "container",
    props: {
      layout: "stack",
      align: "center",
      layerLabel: "Hero",
      // The container already knows how to paint a moving background: the
      // renderer rebuilds a privacy-preserving nocookie embed from the video id
      // and never uses a pasted URL as an iframe src. Absent ⇒ no wrapper, no
      // data attribute, no extra CSS — the photographic hero is byte-identical.
      ...(opts.videoUrl
        ? {
            backgroundMedia: {
              source: "youtube" as const,
              src: opts.videoUrl,
              // The scrim below is layered for a PHOTO. Video is busier and
              // moves, so copy needs a touch more protection than a still does.
              // 58 was calibrated against a still photograph. Video moves, and
              // its bright frames are what made the sub-copy vanish; 66 holds
              // the type without flattening the footage.
              overlay: 66,
              overlayColor: "#06060a",
              focalPoint: "center",
            },
          }
        : {}),
      style: {
        width: "100%",
        maxWidthFree: "100%",
        position: "relative",
        overflow: "hidden",
        paddingTop: padTop,
        paddingRight: "32px",
        paddingBottom: padBottom,
        paddingLeft: "32px",
        gap: "0px",
        backgroundColor: INK,
        backgroundImage: opts.imageSlot
          ? // Scrim tuned against the REAL curated photography (checked in the
            // browser): the first pass used a 0.55 mid-stop, and on a
            // bright, high-key frame the body copy under the headline washed
            // out to near-unreadable. Three layers now: a soft vignette to
            // hold the edges, a vertical scrim that stays dark through the
            // copy band (~35-70%), then the photo.
            // Balanced in the browser across BOTH extremes of the curated set:
            // strong enough that copy stays legible on a bright, high-key frame,
            // light enough that an already-dark editorial frame does not crush
            // to flat black. The vignette carries the edge contrast so the
            // vertical scrim can stay lighter through the copy band.
            `radial-gradient(120% 100% at 50% 32%, rgba(6,6,8,0.00) 0%, rgba(6,6,8,0.45) 100%), ` +
            `linear-gradient(180deg, rgba(6,6,8,0.68) 0%, rgba(6,6,8,0.40) 30%, rgba(6,6,8,0.52) 62%, rgba(6,6,8,0.88) 100%), ` +
            `${IMAGE_SLOT_BG(opts.imageSlot)}`
          : "radial-gradient(120% 80% at 50% 0%, rgba(201,162,39,0.10), rgba(201,162,39,0) 60%), linear-gradient(180deg,var(--token-color-surface-raised) 0%,var(--token-color-background) 100%)",
        ...(opts.imageSlot
          ? {
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat" as const,
            }
          : {}),
        textColor: TEXT,
        responsive: {
          mobile: {
            paddingTop: "88px",
            paddingBottom: "64px",
            paddingRight: "20px",
            paddingLeft: "20px",
          },
        },
      },
    },
    children: [
      {
        id: `${idPrefix}-hero-wrap`,
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          layerLabel: "Hero content",
          style: {
            width: "100%",
            maxWidthFree: "940px",
            gap: "0px",
            align: "center",
            position: "relative",
            zIndex: 2,
            ...RISE,
          },
        },
        children: inner,
      },
    ],
  };
}

export interface PlateOptions {
  imageSlot: string;
  imageAlt: string;
  /** Oversized faint serif numeral or word behind the line. */
  numeral: string;
  line: string;
  minHeight?: string;
}

/**
 * Full-bleed editorial plate: cover photo + gradient scrim + faint numeral over
 * a single italic statement line. Used as a banner break between sections.
 */
export function fullBleedPlate(idPrefix: string, opts: PlateOptions): BuilderNode {
  const minH = opts.minHeight ?? "min(72vh,720px)";
  return {
    id: `${idPrefix}-plate`,
    kind: "container",
    props: {
      layout: "stack",
      align: "center",
      layerLabel: "Editorial plate",
      style: {
        width: "100%",
        maxWidthFree: "100%",
        minHeight: minH,
        paddingTop: "0px",
        paddingRight: "0px",
        paddingBottom: "0px",
        paddingLeft: "0px",
        position: "relative",
        overflow: "hidden",
        backgroundColor: INK,
      },
    },
    children: [
      {
        id: `${idPrefix}-plate-image`,
        kind: "image",
        props: {
          src: IMAGE_SLOT(opts.imageSlot),
          alt: opts.imageAlt,
          layerLabel: "Plate background",
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
        id: `${idPrefix}-plate-scrim`,
        kind: "container",
        props: {
          layout: "stack",
          layerLabel: "Scrim",
          style: {
            position: "absolute",
            top: "0px",
            left: "0px",
            width: "100%",
            // Without this the container base class caps the scrim at
            // 1120px, LEFT-aligned — the darkening covered the left half of
            // the plate and the statement line sat on raw photograph. The
            // image spans the full bleed; the scrim must too.
            maxWidthFree: "100%",
            height: "100%",
            zIndex: 1,
            backgroundImage:
              "linear-gradient(180deg, rgba(6,6,8,0.72) 0%, rgba(6,6,8,0.86) 100%)",
          },
        },
        children: [],
      },
      {
        id: `${idPrefix}-plate-content`,
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          layerLabel: "Numeral & line",
          style: {
            position: "relative",
            zIndex: 2,
            width: "100%",
            maxWidthFree: "920px",
            marginLeftFree: "auto",
            marginRightFree: "auto",
            gap: "0px",
            align: "center",
            minHeight: minH,
            justifyContent: "center",
            alignItems: "center",
            paddingTop: "92px",
            paddingRight: "44px",
            paddingBottom: "92px",
            paddingLeft: "44px",
            ...RISE,
            responsive: {
              mobile: {
                paddingTop: "60px",
                paddingBottom: "60px",
                paddingRight: "24px",
                paddingLeft: "24px",
              },
            },
          },
        },
        children: [
          {
            id: `${idPrefix}-plate-numeral`,
            kind: "heading",
            props: {
              text: opts.numeral,
              level: 2,
              layerLabel: "Numeral",
              style: {
                fontFamily: SERIF,
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: "clamp(3.5rem, 9vw, 7rem)",
                lineHeight: "1",
                letterSpacing: "0.02em",
                textColor: GOLD_BRIGHT,
                opacity: 0.18,
                align: "center",
                marginBottomFree: "8px",
              },
            },
          },
          {
            id: `${idPrefix}-plate-line`,
            kind: "heading",
            props: {
              text: opts.line,
              level: 2,
              layerLabel: "Statement line",
              style: {
                fontFamily: SERIF,
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: "clamp(1.8rem, 4.2vw, 3rem)",
                lineHeight: "1.14",
                letterSpacing: "-0.01em",
                textColor: TEXT,
                align: "center",
                textWrap: "balance",
                maxWidthFree: "24ch",
                marginLeftFree: "auto",
                marginRightFree: "auto",
                marginBottomFree: "0px",
              },
            },
          },
        ],
      },
    ],
  };
}

// ── repeated components ──────────────────────────────────────────────────────

/** Hairline-divided list row with a small gold square bullet. */
export function bulletRow(id: string, text: string): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "row",
      align: "center",
      layerLabel: "List item",
      style: {
        width: "100%",
        gap: "16px",
        // Explicit: live QA caught these rows packing RIGHT (markers adrift
        // mid-row, ragged-left text) from an inherited alignment. Pin the
        // packing direction rather than trusting the cascade.
        justifyContent: "flex-start",
        paddingTop: "14px",
        paddingBottom: "14px",
        borderColor: HAIRLINE,
        borderWidth: "0px 0px 1px 0px",
        borderStyle: "solid",
      },
    },
    children: [
      {
        id: `${id}-bullet`,
        kind: "container",
        props: {
          layout: "stack",
          layerLabel: "Bullet",
          style: {
            // A HOLLOW square reads as an unticked checkbox — on a list of
            // things the agency guarantees, that is the opposite of the
            // meaning. Filled and turned 45deg it is the same diamond the
            // marquee uses between division names, so the page has one
            // bullet vocabulary instead of two.
            width: "7px",
            height: "7px",
            backgroundColor: GOLD_BRIGHT,
            borderRadius: "1px",
            rotate: "45deg",
            flexShrink: 0,
            marginTopFree: "1px",
          },
        },
        children: [],
      },
      {
        id: `${id}-text`,
        kind: "paragraph",
        props: {
          text,
          layerLabel: "Item text",
          style: {
            fontFamily: SANS,
            fontSize: "15px",
            lineHeight: "1.5",
            flexGrow: 1,
            textColor: TEXT,
            marginBottomFree: "0px",
            marginTopFree: "0px",
            align: "left",
          },
        },
      },
    ],
  };
}

/** Big gold value over an uppercase muted label (stats band cell). */
export function statCell(
  id: string,
  value: string,
  label: string,
  leftRule: boolean,
): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "stack",
      align: "center",
      layerLabel: `Stat, ${label}`,
      style: {
        gap: "10px",
        align: "center",
        paddingTop: "16px",
        paddingBottom: "16px",
        paddingLeft: "32px",
        paddingRight: "32px",
        ...(leftRule
          ? { borderColor: GOLD_BRIGHT, borderWidth: "0px 0px 0px 1px", borderStyle: "solid" }
          : {}),
        responsive: {
          mobile: {
            ...(leftRule ? { borderWidth: "0px" } : {}),
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
        id: `${id}-value`,
        kind: "heading",
        props: {
          text: value,
          level: 3,
          layerLabel: "Value",
          style: {
            fontFamily: SERIF,
            fontSize: "clamp(2.75rem, 5vw, 4rem)",
            lineHeight: "1",
            fontWeight: 500,
            letterSpacing: "-0.01em",
            textColor: GOLD_BRIGHT,
            align: "center",
            marginBottomFree: "0px",
          },
        },
      },
      {
        id: `${id}-label`,
        kind: "paragraph",
        props: {
          text: label,
          layerLabel: "Label",
          style: {
            fontFamily: SANS,
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            textColor: MUTED,
            align: "center",
            marginTopFree: "0px",
          },
        },
      },
    ],
  };
}

/** Numbered process step (serif numeral, title, detail) on a top hairline. */
export function processStep(
  id: string,
  num: string,
  title: string,
  detail: string,
  /**
   * Optional image above the numeral.
   *
   * A four-step explanation of how a website works is abstract by nature —
   * "save the ones you like" means nothing until you have seen the thing being
   * saved. A small real frame per step does the explaining that the sentence
   * cannot. Omitted, the step renders exactly as it always has.
   */
  imageSlot?: { slot: string; alt: string },
): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "stack",
      align: "start",
      layerLabel: `Step ${num}`,
      style: {
        gap: "12px",
        paddingTop: "24px",
        borderColor: HAIRLINE,
        borderWidth: "1px 0px 0px 0px",
        borderStyle: "solid",
      },
    },
    children: [
      ...(imageSlot
        ? [
            {
              id: `${id}-image`,
              kind: "image" as const,
              props: {
                src: IMAGE_SLOT(imageSlot.slot),
                alt: imageSlot.alt,
                layerLabel: "Step image",
                style: {
                  width: "100%",
                  maxWidthFree: "100%",
                  aspectRatioFree: "4 / 3",
                  objectFit: "cover" as const,
                  objectPosition: "center",
                  borderRadius: "3px",
                  marginBottomFree: "4px",
                },
              },
            },
          ]
        : []),
      {
        id: `${id}-num`,
        kind: "paragraph",
        props: {
          text: num,
          layerLabel: "Number",
          style: {
            fontFamily: SERIF,
            fontStyle: "italic",
            fontSize: "30px",
            fontWeight: 400,
            textColor: GOLD_BRIGHT,
            marginBottomFree: "0px",
            marginTopFree: "0px",
            align: "left",
          },
        },
      },
      {
        id: `${id}-title`,
        kind: "heading",
        props: {
          text: title,
          level: 3,
          layerLabel: "Step title",
          style: {
            fontFamily: SERIF,
            fontSize: "19px",
            fontWeight: 500,
            textColor: TEXT,
            marginBottomFree: "0px",
            align: "left",
          },
        },
      },
      {
        id: `${id}-detail`,
        kind: "paragraph",
        props: {
          text: detail,
          layerLabel: "Step detail",
          style: {
            fontFamily: SANS,
            fontSize: "14px",
            lineHeight: "1.55",
            textColor: MUTED,
            marginTopFree: "0px",
            align: "left",
          },
        },
      },
    ],
  };
}

/** Hairline-bordered feature card (title + copy, optional link). */
export function featureCard(
  id: string,
  title: string,
  text: string,
  link?: { label: string; href: string },
): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "stack",
      align: "start",
      layerLabel: title,
      style: {
        gap: "12px",
        backgroundColor: CARD,
        borderColor: CARD_BORDER,
        borderWidth: "1px",
        borderStyle: "solid",
        borderRadius: "6px",
        paddingTop: "30px",
        paddingBottom: "30px",
        paddingLeft: "28px",
        paddingRight: "28px",
        transitionProperty: "border-color, transform",
        transitionDuration: "240ms",
        transitionTimingFunction: "ease",
        hover: { borderColor: GOLD, translate: "0 -3px" },
      },
    },
    children: [
      {
        id: `${id}-title`,
        kind: "heading",
        props: {
          text: title,
          level: 3,
          layerLabel: "Card title",
          style: {
            fontFamily: SERIF,
            fontSize: "21px",
            fontWeight: 500,
            textColor: TEXT,
            marginBottomFree: "0px",
            align: "left",
          },
        },
      },
      {
        id: `${id}-text`,
        kind: "paragraph",
        props: {
          text,
          layerLabel: "Card copy",
          style: {
            fontFamily: SANS,
            fontSize: "15px",
            lineHeight: "1.6",
            textColor: MUTED,
            marginTopFree: "0px",
            align: "left",
          },
        },
      },
      ...(link
        ? [
            {
              id: `${id}-link`,
              kind: "button" as const,
              props: {
                label: `${link.label} →`,
                href: link.href,
                tone: "secondary" as const,
                layerLabel: "Card link",
                style: {
                  fontFamily: SANS,
                  fontSize: "13px",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase" as const,
                  textColor: GOLD,
                  backgroundColor: "rgba(0,0,0,0)",
                  paddingTop: "6px",
                  paddingBottom: "0px",
                  paddingLeft: "0px",
                  paddingRight: "0px",
                  borderRadius: "0px",
                  hover: { color: GOLD_BRIGHT },
                },
              },
            },
          ]
        : []),
    ],
  };
}

/**
 * Editorial photo tile with a bottom overlay caption — the division /
 * category tile. The whole tile links via its overlay button.
 */
export function photoTile(
  id: string,
  opts: {
    imageSlot: string;
    imageAlt: string;
    title: string;
    subtitle: string;
    href: string;
    aspect?: string;
  },
): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "stack",
      layerLabel: opts.title,
      style: {
        position: "relative",
        overflow: "hidden",
        borderRadius: "4px",
        // The typed prop again, now that the renderer honors ratio on every
        // kind (it used to drop it on containers, which is why this was a
        // customCss workaround and why three of these tiles rendered 0px).
        aspectRatioFree: opts.aspect ?? "0.78",
        responsive: { mobile: { aspectRatioFree: "4 / 5" } },
        backgroundColor: SURFACE,
        transitionProperty: "transform, box-shadow",
        transitionDuration: "300ms",
        transitionTimingFunction: "ease",
        hover: { translate: "0 -4px", boxShadow: "0 30px 70px rgba(0,0,0,0.5)" },
      },
    },
    children: [
      {
        id: `${id}-image`,
        kind: "image",
        props: {
          src: IMAGE_SLOT(opts.imageSlot),
          alt: opts.imageAlt,
          layerLabel: "Tile photo",
          style: {
            position: "absolute",
            top: "0px",
            left: "0px",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center top",
            zIndex: 0,
          },
        },
      },
      {
        id: `${id}-overlay`,
        kind: "container",
        props: {
          layout: "stack",
          align: "start",
          layerLabel: "Caption overlay",
          style: {
            position: "absolute",
            bottom: "0px",
            left: "0px",
            width: "100%",
            zIndex: 1,
            gap: "2px",
            paddingTop: "56px",
            paddingBottom: "20px",
            paddingLeft: "22px",
            paddingRight: "22px",
            // The dark has to arrive EARLIER than it did. Reaching 0.88 only
            // at 78% left the subtitle sitting in the pale part of the fade,
            // over white studio backdrops — which is why the owner could read
            // the titles and not the lines under them.
            backgroundImage:
              "linear-gradient(180deg, rgba(6,6,8,0) 0%, rgba(6,6,8,0.55) 42%, rgba(6,6,8,0.93) 100%)",
          },
        },
        children: [
          {
            id: `${id}-title`,
            kind: "heading",
            props: {
              text: opts.title,
              level: 3,
              layerLabel: "Tile title",
              style: {
                fontFamily: SERIF,
                fontSize: "22px",
                fontWeight: 500,
                textColor: TEXT,
                marginBottomFree: "0px",
                align: "left",
              },
            },
          },
          {
            id: `${id}-sub`,
            kind: "paragraph",
            props: {
              text: opts.subtitle,
              layerLabel: "Tile subtitle",
              style: {
                fontFamily: SANS,
                fontSize: "13px",
                lineHeight: "1.5",
                // On media, not on a panel — the muted token computes to a mid
                // grey that vanishes here. Warm white held back to 0.74 so it
                // still reads as secondary to the title.
                textColor: "rgba(244,238,226,0.74)",
                textShadow: OVER_MEDIA_SHADOW,
                marginTopFree: "0px",
                align: "left",
              },
            },
          },
          {
            id: `${id}-link`,
            kind: "button",
            props: {
              label: "Explore →",
              href: opts.href,
              tone: "secondary",
              layerLabel: "Tile link",
              style: {
                fontFamily: SANS,
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                textColor: GOLD_BRIGHT,
                backgroundColor: "rgba(0,0,0,0)",
                paddingTop: "10px",
                paddingBottom: "0px",
                paddingLeft: "0px",
                paddingRight: "0px",
                borderRadius: "0px",
                // The button base draws a border; on a caption this reads as a
                // cheap ad button sitting on the photograph. It is a text link
                // with an arrow, so it should look like one.
                borderWidth: "0px",
                textShadow: OVER_MEDIA_SHADOW,
                hover: { color: TEXT },
              },
            },
          },
        ],
      },
    ],
  };
}

/** Quote card for social proof rows. */
export function quoteCard(
  id: string,
  quote: string,
  attribution: string,
  context: string,
): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "stack",
      align: "start",
      layerLabel: `Quote, ${attribution}`,
      style: {
        gap: "18px",
        backgroundColor: CARD,
        borderColor: CARD_BORDER,
        borderWidth: "1px",
        borderStyle: "solid",
        borderRadius: "6px",
        paddingTop: "32px",
        paddingBottom: "32px",
        paddingLeft: "28px",
        paddingRight: "28px",
      },
    },
    children: [
      {
        id: `${id}-mark`,
        kind: "paragraph",
        props: {
          text: "“",
          layerLabel: "Quote mark",
          style: {
            fontFamily: SERIF,
            fontSize: "54px",
            lineHeight: "0.6",
            textColor: GOLD_BRIGHT,
            marginBottomFree: "0px",
            marginTopFree: "0px",
            align: "left",
          },
        },
      },
      {
        id: `${id}-quote`,
        kind: "paragraph",
        props: {
          text: quote,
          layerLabel: "Quote",
          style: {
            fontFamily: SERIF,
            fontStyle: "italic",
            fontSize: "17px",
            lineHeight: "1.55",
            fontWeight: 400,
            textColor: TEXT,
            marginTopFree: "0px",
            align: "left",
          },
        },
      },
      {
        id: `${id}-attribution`,
        kind: "paragraph",
        props: {
          text: `${attribution} · ${context}`,
          layerLabel: "Attribution",
          style: {
            fontFamily: SANS,
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            textColor: MUTED,
            marginTopFree: "0px",
            align: "left",
          },
        },
      },
    ],
  };
}

/** Responsive grid container (desktop N columns → tablet 2 → mobile 1). */
export function grid(
  id: string,
  columns: 2 | 3 | 4,
  children: BuilderNode[],
  opts: { gap?: string; layerLabel?: string } = {},
): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "grid",
      columns,
      gap: "m",
      layerLabel: opts.layerLabel ?? "Grid",
      responsive: {
        tablet: { columns: 2 },
        mobile: { layout: "stack", columns: 1 },
      },
      style: { width: "100%", maxWidthFree: "100%", gap: opts.gap ?? "24px" },
    },
    children,
  };
}

// ── FAQ ──────────────────────────────────────────────────────────────────────

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

/** Accordion of question/answer items in the noir treatment. */
export function faqAccordion(id: string, entries: FaqEntry[]): BuilderNode {
  return {
    id,
    kind: "accordion",
    props: {
      allowMultiple: false,
      layerLabel: "FAQ",
      style: {
        width: "100%",
        maxWidthFree: "820px",
        marginLeftFree: "auto",
        marginRightFree: "auto",
        borderColor: HAIRLINE,
        borderWidth: "1px 0px 0px 0px",
        borderStyle: "solid",
      },
    },
    children: entries.map((entry) => ({
      id: entry.id,
      kind: "accordion_item" as const,
      props: {
        title: entry.question,
        style: {
          borderColor: HAIRLINE,
          borderWidth: "0px 0px 1px 0px",
          borderStyle: "solid",
          paddingTop: "8px",
          paddingBottom: "8px",
        },
      },
      children: [
        {
          id: `${entry.id}-answer`,
          kind: "paragraph" as const,
          props: {
            text: entry.answer,
            layerLabel: "Answer",
            style: {
              fontFamily: SANS,
              fontSize: "15px",
              lineHeight: "1.65",
              textColor: MUTED,
              align: "left" as const,
              marginTopFree: "0px",
              marginBottomFree: "8px",
            },
          },
        },
      ],
    })),
  };
}

// ── forms ────────────────────────────────────────────────────────────────────

/**
 * Internal lead form (POSTs to /api/cms/forms/submit). NOTE for the seeder:
 * `sectionId` must be set to a real `cms_sections` row id at seed time or the
 * internal action rejects the submission. It is intentionally omitted here.
 */
export function leadForm(
  id: string,
  fields: BuilderFormField[],
  opts: { layerLabel?: string; maxWidth?: string } = {},
): BuilderNode {
  return {
    id,
    kind: "form",
    props: {
      action: "internal",
      method: "post",
      honeypotName: "website",
      layerLabel: opts.layerLabel ?? "Lead form",
      fields,
      style: {
        width: "100%",
        maxWidthFree: opts.maxWidth ?? "620px",
        marginTopFree: "8px",
      },
    },
  };
}

// ── legal pages ──────────────────────────────────────────────────────────────

/** Numbered legal clause: serif heading + one or more body paragraphs. */
export function legalClause(
  id: string,
  title: string,
  paragraphs: string[],
): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "stack",
      align: "start",
      layerLabel: title,
      style: {
        gap: "12px",
        width: "100%",
        paddingTop: "28px",
        borderColor: HAIRLINE,
        borderWidth: "1px 0px 0px 0px",
        borderStyle: "solid",
      },
    },
    children: [
      {
        id: `${id}-title`,
        kind: "heading",
        props: {
          text: title,
          level: 2,
          layerLabel: "Clause title",
          style: {
            fontFamily: SERIF,
            fontSize: "24px",
            fontWeight: 500,
            letterSpacing: "-0.01em",
            textColor: TEXT,
            marginBottomFree: "0px",
            align: "left",
          },
        },
      },
      ...paragraphs.map((text, index) => ({
        id: `${id}-p${index + 1}`,
        kind: "paragraph" as const,
        props: {
          text,
          layerLabel: `Paragraph ${index + 1}`,
          style: {
            fontFamily: SANS,
            fontSize: "15px",
            lineHeight: "1.7",
            textColor: MUTED,
            marginTopFree: "0px",
            align: "left" as const,
          },
        },
      })),
    ],
  };
}

/** Template-notice banner for the legal drafts (owner review required). */
export function legalTemplateNotice(id: string, text: string): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "stack",
      align: "start",
      layerLabel: "Template notice",
      style: {
        width: "100%",
        backgroundColor: "rgba(201,162,39,0.08)",
        borderColor: GOLD,
        borderWidth: "1px",
        borderStyle: "solid",
        borderRadius: "4px",
        paddingTop: "18px",
        paddingBottom: "18px",
        paddingLeft: "22px",
        paddingRight: "22px",
      },
    },
    children: [
      {
        id: `${id}-text`,
        kind: "paragraph",
        props: {
          text,
          layerLabel: "Notice text",
          style: {
            fontFamily: SANS,
            fontSize: "14px",
            lineHeight: "1.6",
            textColor: TEXT,
            marginTopFree: "0px",
            align: "left",
          },
        },
      },
    ],
  };
}

// ── closing CTA band ─────────────────────────────────────────────────────────

export interface ClosingCtaOptions {
  eyebrowText: string;
  line1: string;
  line2?: string;
  sub: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}

/** Gold-glow closing conversion band. */
export function closingCta(idPrefix: string, opts: ClosingCtaOptions): BuilderNode {
  const buttons = [goldButton(`${idPrefix}-primary`, opts.primary.label, opts.primary.href)];
  if (opts.secondary) {
    buttons.push(lineButton(`${idPrefix}-secondary`, opts.secondary.label, opts.secondary.href));
  }
  return band(
    `${idPrefix}-band`,
    [
      {
        id: `${idPrefix}-inner`,
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
          eyebrow(`${idPrefix}-eyebrow`, opts.eyebrowText),
          headingLine(`${idPrefix}-line1`, opts.line1, { size: "section", align: "center", layerLabel: "Closing line 1" }),
          ...(opts.line2
            ? [
                headingLine(`${idPrefix}-line2`, opts.line2, {
                  size: "section",
                  align: "center",
                  accent: true,
                  layerLabel: "Closing line 2 (accent)",
                }),
              ]
            : []),
          copy(`${idPrefix}-sub`, opts.sub, { align: "center", maxWidth: "560px", size: "lead", marginTop: "18px" }),
          ctaRow(`${idPrefix}-actions`, buttons),
        ],
      },
    ],
    { borderTop: true, glow: true, layerLabel: "Closing CTA band" },
  );
}
