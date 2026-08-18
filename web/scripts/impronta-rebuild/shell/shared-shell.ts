/**
 * Impronta freeform SHELL — shared tokens + helpers for the header / footer
 * landmark trees (Noir & Or, matching the 13 rebuilt pages).
 *
 * OWNERSHIP: this file belongs to the HEADER lane. The footer lane owns
 * `shared-footer.ts` and imports from here; it must not edit this file.
 *
 * Everything colour-bearing goes through the `styleTokenRef` palette from
 * `../shared` (resolved at render time to `var(--token-…, fallback)`, so the
 * tenant theme cascades and every token carries a literal fallback). The only
 * literal colours below are the translucency layers a token cannot express
 * (frosted glass, hairlines over glass).
 */
import type { BuilderNode, BuilderNodeStyle } from "@/lib/site-admin/builder-node/types";

export {
  INK,
  SURFACE,
  GOLD,
  GOLD_BRIGHT,
  TEXT,
  MUTED,
  HAIRLINE,
  SERIF,
  SANS,
  IMAGE_SLOT,
} from "../shared";

import { GOLD, GOLD_BRIGHT, MUTED, SANS, TEXT } from "../shared";

// ── contact / social identity (source: owner-provided, do not invent) ────────

export const SHELL_WHATSAPP_HREF = "https://wa.me/529843170816";
export const SHELL_WHATSAPP_DISPLAY = "+52 984 317 0816";
export const SHELL_EMAIL = "impronta.talento@gmail.com";
export const SHELL_INSTAGRAM_URL = "https://www.instagram.com/impronta_models";
export const SHELL_TIKTOK_URL = "https://www.tiktok.com/@impronta12";

// ── shell surfaces ───────────────────────────────────────────────────────────

/**
 * Translucent noir ground for the frosted sticky bar. A theme token cannot
 * carry alpha, so this is the one deliberate literal — it reads as the Noir
 * ink (#0d0b09 family) at 78% over whatever scrolls beneath the glass.
 */
export const SHELL_GLASS_BG = "rgba(13,11,9,0.78)";

/** Slightly deeper ground for the slim utility row (it sits on page top, unfrosted). */
export const SHELL_UTILITY_BG = "rgba(13,11,9,0.92)";

/** Warm-ivory hairline that stays visible over the glass (color.line is opaque-on-noir). */
export const SHELL_HAIRLINE_RGBA = "rgba(244,238,226,0.16)";

/**
 * One-sided hairline. `BuilderNodeStyle` borders are all-sides, so a single
 * edge rule uses an inset box-shadow (one declaration, zero layout cost).
 */
export function shellHairline(edge: "top" | "bottom"): string {
  return `inset 0 ${edge === "top" ? "1px" : "-1px"} 0 ${SHELL_HAIRLINE_RGBA}`;
}

/**
 * The frosted sticky-bar style fragment (pattern lifted from
 * page-designs/saas.ts): translucent noir + backdrop blur + sticky pinning.
 * Spread it into the main bar's style, then layer bar-specific keys on top.
 */
export const SHELL_FROSTED_STICKY: BuilderNodeStyle = {
  stickyAnchor: "top",
  zIndex: 60,
  backgroundColor: SHELL_GLASS_BG,
  backdropFilter: "blur(18px)",
};

// ── shell text + link primitives ─────────────────────────────────────────────

/** Small utility-row text (announcement line). */
export function shellUtilityText(id: string, text: string, layerLabel: string): BuilderNode {
  return {
    id,
    kind: "paragraph",
    props: {
      text,
      layerLabel,
      style: {
        fontFamily: SANS,
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        textColor: MUTED,
        marginTopFree: "0px",
        marginBottomFree: "0px",
      },
    },
  };
}

/**
 * A plain text link as its OWN node (operator can click one link on canvas).
 * `button` is the only href-bearing leaf, so the chip is stripped via style.
 */
export function shellTextLink(
  id: string,
  label: string,
  href: string,
  extra: BuilderNodeStyle = {},
): BuilderNode {
  return {
    id,
    kind: "button",
    props: {
      label,
      href,
      tone: "secondary",
      layerLabel: "Link",
      style: {
        backgroundColor: "rgba(0,0,0,0)",
        borderWidth: "0px",
        borderRadius: "0px",
        paddingTop: "0px",
        paddingBottom: "0px",
        paddingLeft: "0px",
        paddingRight: "0px",
        fontFamily: SANS,
        fontSize: "12px",
        fontWeight: 600,
        letterSpacing: "0.08em",
        textColor: MUTED,
        transitionProperty: "color",
        transitionDuration: "180ms",
        transitionTimingFunction: "ease",
        hover: { color: GOLD_BRIGHT },
        ...extra,
      },
    },
  };
}

/** Compact gold CTA sized for a shell bar (the page-scale goldButton is taller). */
export function shellGoldCta(id: string, label: string, href: string): BuilderNode {
  return {
    id,
    kind: "button",
    props: {
      label,
      href,
      tone: "primary",
      layerLabel: "Shell CTA",
      style: {
        fontFamily: SANS,
        fontSize: "12px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        backgroundColor: GOLD,
        textColor: "#1a1407",
        borderColor: GOLD,
        borderWidth: "1px",
        borderStyle: "solid",
        paddingTop: "10px",
        paddingBottom: "10px",
        paddingLeft: "18px",
        paddingRight: "18px",
        borderRadius: "2px",
        whiteSpace: "nowrap",
        transitionProperty: "background-color, box-shadow",
        transitionDuration: "200ms",
        transitionTimingFunction: "ease",
        hover: {
          backgroundColor: GOLD_BRIGHT,
          boxShadow: "0 10px 28px rgba(201,162,39,0.28)",
        },
        responsive: {
          mobile: {
            paddingLeft: "12px",
            paddingRight: "12px",
            fontSize: "11px",
          },
        },
      },
    },
  };
}

/** Re-exported for shell trees that set nav link colours. */
export const SHELL_NAV_TEXT = TEXT;


// ── locale hrefs ─────────────────────────────────────────────────────────────

/**
 * Prefix every INTERNAL href in a tree with the locale segment.
 *
 * English is this tenant's unprefixed default, so `/p/about` is correct there
 * and `/es/p/about` is correct on the Spanish site. Authoring the trees from
 * one structural builder means both locales carry the same bare hrefs -- which
 * shipped a Spanish header whose every link dropped the visitor back into
 * English. The pages themselves were fine (`/es/p/about` renders Spanish); only
 * the links were wrong, so nothing surfaced as an error.
 *
 * Left alone: absolute URLs, `mailto:`/`tel:`/`wa.me`, in-page anchors, and
 * anything already carrying the prefix (so this is idempotent).
 */
export function localizeHref(href: string, locale: string): string {
  if (locale === "en") return href;
  if (!href.startsWith("/")) return href;
  const prefix = `/${locale}`;
  if (href === prefix || href.startsWith(`${prefix}/`)) return href;
  return href === "/" ? prefix : `${prefix}${href}`;
}

/** Deep-map `localizeHref` over every href a shell node can carry. */
export function localizeTreeHrefs<T>(nodes: readonly T[], locale: string): T[] {
  if (locale === "en") return nodes as T[];
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] =
        key === "href" && typeof value === "string"
          ? localizeHref(value, locale)
          : walk(value);
    }
    return out;
  };
  return nodes.map((n) => walk(n) as T);
}
