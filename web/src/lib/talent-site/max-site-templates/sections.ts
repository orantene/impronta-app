/**
 * Talent Max SITE — shared SECTION builders for the starter-template gallery.
 *
 * These emit token-driven `BuilderNode` sections (hero variants, about, services,
 * gallery, contact) the named templates compose. They reuse the SAME `{{token}}`
 * placeholders as the platform default (`default-talent-tree.ts`) so the caller's
 * `hydrateTalentTree()` fills them with the talent's real profile data — name,
 * tagline, bio, services, gallery, headshot, inquiry CTA. No lorem.
 *
 * The empty-prune helpers in `hydrateTalentTree` (empty service cards, empty Max
 * badge) operate on the SAME node SHAPES used here (cards with a single label,
 * the `default-talent-max-badge` container id), so a template that wants those
 * behaviours reuses the matching builder. Pure (injectable id factory).
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { MaxSiteTemplateIdFactory } from "./types";

const defaultIdFactory: MaxSiteTemplateIdFactory = () => crypto.randomUUID();

/** A pill chip whose only content is a `{{token}}` label — pruned when empty. */
function chip(
  makeId: MaxSiteTemplateIdFactory,
  token: string,
  accent?: string,
): BuilderNode {
  return {
    id: makeId(),
    kind: "card",
    props: {
      variant: "outline",
      style: {
        radius: "pill",
        paddingX: "m",
        paddingY: "s",
        ...(accent ? { borderColor: accent } : {}),
      },
    },
    children: [
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: token,
          style: { size: "sm", tone: "muted" },
        },
      },
    ],
  } as BuilderNode;
}

/** A single outline "service / focus" card carrying one `{{serviceN}}` label. */
function serviceCard(makeId: MaxSiteTemplateIdFactory, token: string): BuilderNode {
  return {
    id: makeId(),
    kind: "card",
    props: { variant: "outline" },
    children: [
      {
        id: makeId(),
        kind: "heading",
        props: { text: token, level: 3, style: { size: "md" } },
      },
    ],
  } as BuilderNode;
}

/** The discipline chip row (primary + up to three secondary types). */
function disciplineChips(
  makeId: MaxSiteTemplateIdFactory,
  accent?: string,
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: {
      layout: "row",
      gap: "s",
      align: "start",
      style: { flexWrap: "wrap", marginTop: "s" },
    },
    children: [
      chip(makeId, "{{primaryTypeLabel}}", accent),
      chip(makeId, "{{secondaryType1}}", accent),
      chip(makeId, "{{secondaryType2}}", accent),
      chip(makeId, "{{secondaryType3}}", accent),
    ],
  } as BuilderNode;
}

/** The primary inquiry CTA button (resolves to `{{inquireHref}}`). */
function inquiryCta(
  makeId: MaxSiteTemplateIdFactory,
  label = "Send an inquiry",
): BuilderNode {
  return {
    id: makeId(),
    kind: "button",
    props: {
      label,
      href: "{{inquireHref}}",
      tone: "primary",
      style: { marginTop: "s" },
    },
  } as BuilderNode;
}

// ── HERO variants ────────────────────────────────────────────────────────────

/**
 * SPLIT hero — copy on the left, headshot on the right (the default emphasis).
 * `eyebrow` toggles the small uppercase discipline line; `chips` toggles the
 * discipline-chip row. `ratio` lets a template skew the columns.
 */
export function heroSplit(
  makeId: MaxSiteTemplateIdFactory,
  opts: {
    ratio?: "50-50" | "40-60" | "60-40";
    eyebrow?: boolean;
    chips?: boolean;
    accent?: string;
    minHeight?: string;
  } = {},
): BuilderNode {
  const copy: BuilderNode = {
    id: makeId(),
    kind: "container",
    props: { layout: "stack", gap: "m", align: "start", style: { paddingY: "m" } },
    children: [
      ...(opts.eyebrow !== false
        ? [
            {
              id: makeId(),
              kind: "paragraph",
              props: {
                text: "{{primaryTypeLabel}}",
                style: {
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  size: "sm",
                  tone: "muted",
                  ...(opts.accent ? { textColor: opts.accent } : {}),
                },
              },
            } as BuilderNode,
          ]
        : []),
      {
        id: makeId(),
        kind: "heading",
        props: {
          text: "{{displayName}}",
          level: 1,
          style: { size: "xl", textWrap: "balance" },
        },
      },
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: "{{tagline}}",
          style: { size: "lg", tone: "muted", maxWidth: "reading" },
        },
      },
      ...(opts.chips !== false ? [disciplineChips(makeId, opts.accent)] : []),
      inquiryCta(makeId),
    ],
  } as BuilderNode;

  const image: BuilderNode = {
    id: makeId(),
    kind: "image",
    props: {
      src: "{{headshotUrl}}",
      alt: "{{displayName}}",
      priority: true,
      style: { radius: "lg", aspectRatio: "4:3", objectFit: "cover", width: "100%" },
    },
  } as BuilderNode;

  return {
    id: makeId(),
    kind: "split",
    props: {
      ratio: opts.ratio ?? "50-50",
      gap: "l",
      collapseOnMobile: true,
      layerLabel: "Hero",
      style: {
        maxWidth: "wide",
        paddingY: "l",
        paddingX: "m",
        alignItems: "center",
        minHeight: opts.minHeight ?? "70vh",
      },
    },
    children: [copy, image],
  } as BuilderNode;
}

/**
 * CENTERED hero — a single stacked, centered column (name + tagline + chips +
 * CTA) with NO headshot. Used by the MINIMAL template for a clean type-forward
 * landing.
 */
export function heroCentered(
  makeId: MaxSiteTemplateIdFactory,
  opts: { chips?: boolean; accent?: string } = {},
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      align: "center",
      layerLabel: "Hero",
      style: {
        maxWidth: "reading",
        paddingY: "l",
        paddingX: "m",
        minHeight: "60vh",
        justifyContent: "center",
      },
    },
    children: [
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: "{{primaryTypeLabel}}",
          style: {
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            size: "sm",
            tone: "muted",
            align: "center",
            ...(opts.accent ? { textColor: opts.accent } : {}),
          },
        },
      },
      {
        id: makeId(),
        kind: "heading",
        props: {
          text: "{{displayName}}",
          level: 1,
          style: { size: "xl", align: "center", textWrap: "balance" },
        },
      },
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: "{{tagline}}",
          style: { size: "lg", tone: "muted", align: "center", maxWidth: "reading" },
        },
      },
      ...(opts.chips !== false
        ? [
            {
              id: makeId(),
              kind: "container",
              props: {
                layout: "row",
                gap: "s",
                align: "center",
                style: { flexWrap: "wrap", marginTop: "s", justifyContent: "center" },
              },
              children: [
                chip(makeId, "{{primaryTypeLabel}}", opts.accent),
                chip(makeId, "{{secondaryType1}}", opts.accent),
                chip(makeId, "{{secondaryType2}}", opts.accent),
                chip(makeId, "{{secondaryType3}}", opts.accent),
              ],
            } as BuilderNode,
          ]
        : []),
      inquiryCta(makeId),
    ],
  } as BuilderNode;
}

/**
 * COVER hero — a full-bleed band painting the headshot as a cover background
 * with the name + tagline + CTA overlaid. Used by the BOLD template. The image
 * lives in the background (style.backgroundImage uses the `{{headshotUrl}}`
 * token) so there is no separate <img>; a dark scrim keeps the text legible.
 */
export function heroCover(
  makeId: MaxSiteTemplateIdFactory,
  opts: { accent?: string } = {},
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      align: "start",
      layerLabel: "Hero",
      style: {
        maxWidth: "full",
        paddingX: "l",
        paddingY: "l",
        minHeight: "82vh",
        justifyContent: "flex-end",
        backgroundImage:
          "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.72) 100%), url({{headshotUrl}})",
        backgroundSize: "cover",
        backgroundPosition: "center",
        textColor: "#ffffff",
      },
    },
    children: [
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: "{{primaryTypeLabel}}",
          style: {
            textTransform: "uppercase",
            letterSpacing: "0.22em",
            size: "sm",
            textColor: opts.accent ?? "#f4d58d",
          },
        },
      },
      {
        id: makeId(),
        kind: "heading",
        props: {
          text: "{{displayName}}",
          level: 1,
          style: { size: "xl", textColor: "#ffffff", textWrap: "balance" },
        },
      },
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: "{{tagline}}",
          style: { size: "lg", textColor: "rgba(255,255,255,0.85)", maxWidth: "reading" },
        },
      },
      {
        id: makeId(),
        kind: "button",
        props: {
          label: "Send an inquiry",
          href: "{{inquireHref}}",
          tone: "primary",
          style: { marginTop: "m" },
        },
      },
    ],
  } as BuilderNode;
}

// ── ABOUT ────────────────────────────────────────────────────────────────────

/** The About block — eyebrow + full bio + location + languages lines. */
export function aboutBlock(
  makeId: MaxSiteTemplateIdFactory,
  opts: { align?: "start" | "center"; accent?: string } = {},
): BuilderNode {
  const textAlign = opts.align === "center" ? "center" : undefined;
  return {
    id: makeId(),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      align: opts.align ?? "start",
      layerLabel: "About",
      style: { maxWidth: "reading", paddingY: "l", paddingX: "m", marginTop: "m" },
    },
    children: [
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: "About",
          style: {
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            size: "sm",
            tone: "muted",
            ...(textAlign ? { align: textAlign } : {}),
            ...(opts.accent ? { textColor: opts.accent } : {}),
          },
        },
      },
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: "{{richBio}}",
          style: { size: "lg", maxWidth: "reading", ...(textAlign ? { align: textAlign } : {}) },
        },
      },
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: "{{locationLine}}",
          style: { tone: "muted", size: "md", ...(textAlign ? { align: textAlign } : {}) },
        },
      },
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: "{{languagesLine}}",
          style: { tone: "muted", size: "md", ...(textAlign ? { align: textAlign } : {}) },
        },
      },
    ],
  } as BuilderNode;
}

// ── SERVICES / FOCUS ─────────────────────────────────────────────────────────

/**
 * Services & focus grid — three `{{serviceN}}` cards. Empty cards prune via
 * `hydrateTalentTree`'s `pruneEmptyServiceCards`. `columns` lets a template lay
 * the grid out 1–3 wide.
 */
export function servicesBlock(
  makeId: MaxSiteTemplateIdFactory,
  opts: { columns?: 1 | 2 | 3; heading?: string } = {},
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      align: "start",
      layerLabel: "Services",
      style: { maxWidth: "wide", paddingY: "l", paddingX: "m" },
    },
    children: [
      {
        id: makeId(),
        kind: "heading",
        props: { text: opts.heading ?? "Services & focus", level: 2, style: { size: "lg" } },
      },
      {
        id: makeId(),
        kind: "container",
        props: {
          layout: "grid",
          columns: opts.columns ?? 3,
          gap: "m",
          responsive: { mobile: { layout: "stack" } },
        },
        children: [
          serviceCard(makeId, "{{service1}}"),
          serviceCard(makeId, "{{service2}}"),
          serviceCard(makeId, "{{service3}}"),
        ],
      },
    ],
  } as BuilderNode;
}

// ── GALLERY ──────────────────────────────────────────────────────────────────

/** A single gallery image tile bound to `{{galleryN}}`. */
function galleryTile(makeId: MaxSiteTemplateIdFactory, index: number): BuilderNode {
  return {
    id: makeId(),
    kind: "image",
    props: {
      src: `{{gallery${index}}}`,
      alt: "{{displayName}}",
      style: { radius: "md", objectFit: "cover", width: "100%" },
    },
  } as BuilderNode;
}

/**
 * Gallery — `masonry` (staggered editorial) or a fixed `grid`. Six tiles bound
 * to `{{gallery0..5}}`; the renderer skips empty `src`s, so sparse galleries
 * degrade cleanly.
 */
export function galleryBlock(
  makeId: MaxSiteTemplateIdFactory,
  opts: { mode?: "masonry" | "grid"; columns?: 2 | 3 | 4; heading?: string } = {},
): BuilderNode {
  const tiles = [0, 1, 2, 3, 4, 5].map((i) => galleryTile(makeId, i));
  const grid: BuilderNode =
    opts.mode === "grid"
      ? ({
          id: makeId(),
          kind: "container",
          props: {
            layout: "grid",
            columns: opts.columns ?? 3,
            gap: "m",
            responsive: { mobile: { layout: "stack" } },
          },
          children: tiles,
        } as BuilderNode)
      : ({
          id: makeId(),
          kind: "masonry",
          props: { columns: opts.columns ?? 3, gap: "m" },
          children: tiles,
        } as BuilderNode);

  return {
    id: makeId(),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      align: "start",
      layerLabel: "Gallery",
      style: { maxWidth: "wide", paddingY: "l", paddingX: "m" },
    },
    children: [
      {
        id: makeId(),
        kind: "heading",
        props: { text: opts.heading ?? "Selected work", level: 2, style: { size: "lg" } },
      },
      grid,
    ],
  } as BuilderNode;
}

// ── CONTACT ──────────────────────────────────────────────────────────────────

/** The closing contact band — heading + copy + inquiry CTA, centered. */
export function contactBlock(
  makeId: MaxSiteTemplateIdFactory,
  opts: { heading?: string; copy?: string } = {},
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      align: "center",
      layerLabel: "Contact",
      style: {
        maxWidth: "reading",
        paddingY: "l",
        paddingX: "m",
        marginTop: "m",
        marginBottom: "l",
      },
    },
    children: [
      {
        id: makeId(),
        kind: "heading",
        props: {
          text: opts.heading ?? "Let's work together",
          level: 2,
          style: { size: "lg", align: "center" },
        },
      },
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: opts.copy ?? "Send an inquiry to start the conversation.",
          style: { tone: "muted", align: "center" },
        },
      },
      {
        id: makeId(),
        kind: "button",
        props: {
          label: "Send an inquiry",
          href: "{{inquireHref}}",
          tone: "primary",
          style: { marginTop: "s" },
        },
      },
    ],
  } as BuilderNode;
}

// ── SHELL ────────────────────────────────────────────────────────────────────

/**
 * Build a site shell (header brand slot + nav + footer) with optional style
 * overrides on the header/footer containers, so templates can vary the chrome
 * (centered vs. left, bordered, dark footer…) while keeping the SINGLE-brand
 * invariant the default shell enforces (logo image OR wordmark, never a nav
 * `brand` on top).
 */
export function buildShell(
  makeId: MaxSiteTemplateIdFactory,
  opts: {
    displayName: string;
    logoUrl?: string | null;
    homeHref?: string;
    headerAlign?: "start" | "center" | "space-between";
    headerStyle?: Record<string, unknown>;
    footerStyle?: Record<string, unknown>;
    footerTone?: "muted" | "default";
  },
): BuilderNode[] {
  const homeHref = opts.homeHref ?? "/";

  const brand: BuilderNode = opts.logoUrl
    ? ({
        id: makeId(),
        kind: "image",
        props: { src: opts.logoUrl, alt: opts.displayName, layerLabel: "Logo", priority: true },
      } as BuilderNode)
    : ({
        id: makeId(),
        kind: "heading",
        props: { text: opts.displayName, level: 2, layerLabel: "Wordmark" },
      } as BuilderNode);

  const headerJustify =
    opts.headerAlign === "center"
      ? "center"
      : opts.headerAlign === "space-between"
        ? "space-between"
        : "flex-start";

  const header: BuilderNode = {
    id: makeId(),
    kind: "container",
    props: {
      layout: "row",
      align: "center",
      gap: "m",
      layerLabel: "Header",
      style: { justifyContent: headerJustify, ...(opts.headerStyle ?? {}) },
    },
    children: [
      brand,
      {
        id: makeId(),
        kind: "nav",
        props: { ariaLabel: "Primary", links: [{ id: makeId(), label: "Home", href: homeHref }] },
      },
    ],
  } as BuilderNode;

  const footer: BuilderNode = {
    id: makeId(),
    kind: "container",
    props: {
      layout: "stack",
      align: "center",
      gap: "s",
      layerLabel: "Footer",
      ...(opts.footerStyle ? { style: opts.footerStyle } : {}),
    },
    children: [
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: `© ${new Date().getFullYear()} ${opts.displayName}`,
          layerLabel: "Copyright",
          style: { tone: opts.footerTone ?? "muted", align: "center" },
        },
      },
    ],
  } as BuilderNode;

  return [header, footer];
}

export { defaultIdFactory };
