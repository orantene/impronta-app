/**
 * Talent website SECTION KIT: the allow-listed section builders every talent
 * Design (built-in or authored) is composed from.
 *
 * Refactored from `max-site-templates/sections.ts` (which now re-exports this
 * module) with two contracts every kit section honours:
 *
 *   1. PROVENANCE. Every top-level section carries `props.slotKey` + a
 *      namespaced `props.originRole` (see `TALENT_KIT_SECTIONS`). Both survive
 *      `validateBuilderNodeTree` via the base-field carriers in
 *      `builder-node/section-provenance.ts`, so a Design swap, the Free tree
 *      guard and hide / reorder edits can address a section by slot.
 *   2. TOKEN-ONLY STYLE. No literal colours or font stacks: colours are
 *      `token:color.*` refs (resolved to `var(--token-color-*)` at render) or a
 *      registry step value (`tone`, `background: "contrast"`). A Look therefore
 *      restyles every kit section with no tree rewrite.
 *
 * Content stays `{{token}}`-driven (the same placeholders as
 * `default-talent-tree.ts`), hydrated by `hydrateTalentTree()` at apply time.
 * Pure (injectable id factory), so the kit is unit-testable and importable by
 * the template registry, the built-in designs and the apply core.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { CONTACT_LAYER, TALENT_ASK_HREF, contactChannelButtons } from "../contact-channels";
import type { MaxSiteTemplateIdFactory } from "../max-site-templates/types";

export type KitIdFactory = MaxSiteTemplateIdFactory;

export const defaultIdFactory: KitIdFactory = () => crypto.randomUUID();

/**
 * The allow-listed kit sections: slot → role. The role is the provenance stamp
 * (`props.originRole`); the slot is the stable address (`props.slotKey`).
 * Designs may only compose top-level home sections from this list.
 */
export const TALENT_KIT_SECTIONS = {
  hero: { slotKey: "hero", originRole: "talent.hero" },
  about: { slotKey: "about", originRole: "talent.about" },
  services: { slotKey: "services", originRole: "talent.services" },
  gallery: { slotKey: "gallery", originRole: "talent.gallery" },
  contact: { slotKey: "contact", originRole: "talent.contact" },
} as const;

/** Shell landmarks (header / footer) a Design's shell tree may contain. */
export const TALENT_KIT_SHELL = {
  header: { slotKey: "header", originRole: "talent.shell.header" },
  footer: { slotKey: "footer", originRole: "talent.shell.footer" },
} as const;

export type TalentKitSectionSlot = keyof typeof TALENT_KIT_SECTIONS;
export type TalentKitShellSlot = keyof typeof TALENT_KIT_SHELL;

export const TALENT_KIT_SECTION_ROLES: ReadonlySet<string> = new Set(
  Object.values(TALENT_KIT_SECTIONS).map((s) => s.originRole),
);
export const TALENT_KIT_SHELL_ROLES: ReadonlySet<string> = new Set(
  Object.values(TALENT_KIT_SHELL).map((s) => s.originRole),
);

/** Colour refs the kit uses. Named so no builder ever inlines a colour. */
export const KIT_COLOR = {
  accent: "token:color.accent",
  background: "token:color.background",
  ink: "token:color.ink",
  line: "token:color.line",
} as const;

/** Stamp the kit provenance onto a top-level section's props. */
export function stampKitSection(
  slot: TalentKitSectionSlot,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const { slotKey, originRole } = TALENT_KIT_SECTIONS[slot];
  return { ...props, slotKey, originRole };
}

/** A pill chip whose only content is a `{{token}}` label (pruned when empty). */
function chip(makeId: KitIdFactory, token: string, accent: boolean): BuilderNode {
  return {
    id: makeId(),
    kind: "card",
    props: {
      variant: "outline",
      style: {
        radius: "pill",
        paddingX: "m",
        paddingY: "s",
        ...(accent ? { borderColor: KIT_COLOR.accent } : {}),
      },
    },
    children: [
      {
        id: makeId(),
        kind: "paragraph",
        props: { text: token, style: { size: "sm", tone: "muted" } },
      },
    ],
  } as BuilderNode;
}

/** A single outline "service / focus" card carrying one `{{serviceN}}` label. */
function serviceCard(makeId: KitIdFactory, token: string): BuilderNode {
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
  makeId: KitIdFactory,
  opts: { accent: boolean; center?: boolean },
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: {
      layout: "row",
      gap: "s",
      align: opts.center ? "center" : "start",
      style: {
        flexWrap: "wrap",
        marginTop: "s",
        ...(opts.center ? { justifyContent: "center" } : {}),
      },
    },
    children: [
      chip(makeId, "{{primaryTypeLabel}}", opts.accent),
      chip(makeId, "{{secondaryType1}}", opts.accent),
      chip(makeId, "{{secondaryType2}}", opts.accent),
      chip(makeId, "{{secondaryType3}}", opts.accent),
    ],
  } as BuilderNode;
}

/** Ask opens Messages on this page. It does not send the visitor to the hub profile. */
function inquiryCta(
  makeId: KitIdFactory,
  marginTop: "s" | "m" = "s",
  label = CONTACT_LAYER.ask,
): BuilderNode {
  return {
    id: makeId(),
    kind: "button",
    props: {
      label,
      href: TALENT_ASK_HREF,
      tone: "primary",
      layerLabel: CONTACT_LAYER.ask,
      style: { marginTop },
    },
  } as BuilderNode;
}

/** Small uppercase eyebrow line. `accent` binds it to the Look's accent. */
function eyebrow(
  makeId: KitIdFactory,
  text: string,
  opts: { letterSpacing: string; accent?: boolean; align?: "center" },
): BuilderNode {
  return {
    id: makeId(),
    kind: "paragraph",
    props: {
      text,
      style: {
        textTransform: "uppercase",
        letterSpacing: opts.letterSpacing,
        size: "sm",
        tone: "muted",
        ...(opts.align ? { align: opts.align } : {}),
        ...(opts.accent ? { textColor: KIT_COLOR.accent } : {}),
      },
    },
  } as BuilderNode;
}

// ── HERO variants ────────────────────────────────────────────────────────────

export interface HeroSplitOptions {
  ratio?: "50-50" | "40-60" | "60-40";
  eyebrow?: boolean;
  chips?: boolean;
  /** Bind the eyebrow + chip borders to the Look's accent colour. */
  accent?: boolean;
  minHeight?: string;
}

/** SPLIT hero: copy on the left, headshot on the right. */
export function heroSplit(
  makeId: KitIdFactory,
  opts: HeroSplitOptions = {},
): BuilderNode {
  const accent = opts.accent === true;
  const copy: BuilderNode = {
    id: makeId(),
    kind: "container",
    props: { layout: "stack", gap: "m", align: "start", style: { paddingY: "m" } },
    children: [
      ...(opts.eyebrow !== false
        ? [eyebrow(makeId, "{{primaryTypeLabel}}", { letterSpacing: "0.18em", accent })]
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
      ...(opts.chips !== false ? [disciplineChips(makeId, { accent })] : []),
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
    props: stampKitSection("hero", {
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
    }),
    children: [copy, image],
  } as BuilderNode;
}

/** CENTERED hero: one stacked, centered column with NO headshot. */
export function heroCentered(
  makeId: KitIdFactory,
  opts: { chips?: boolean; accent?: boolean } = {},
): BuilderNode {
  const accent = opts.accent === true;
  return {
    id: makeId(),
    kind: "container",
    props: stampKitSection("hero", {
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
    }),
    children: [
      eyebrow(makeId, "{{primaryTypeLabel}}", {
        letterSpacing: "0.2em",
        accent,
        align: "center",
      }),
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
      ...(opts.chips !== false ? [disciplineChips(makeId, { accent, center: true })] : []),
      inquiryCta(makeId),
    ],
  } as BuilderNode;
}

/**
 * The cover hero's scrim. Built from the Look's INK so it inverts with the
 * Look exactly like `background: "contrast"` does: a light Look gets a dark
 * scrim under light (background-coloured) text, a dark Look the reverse. A
 * `var(--token-*)` inside a gradient is a theme reference, not a literal.
 */
export const COVER_SCRIM =
  "linear-gradient(180deg, color-mix(in srgb, var(--token-color-ink, CanvasText) 15%, transparent) 0%, color-mix(in srgb, var(--token-color-ink, CanvasText) 72%, transparent) 100%)";

/**
 * COVER hero: a full-bleed band painting the headshot as a cover background
 * with the name + tagline + CTA overlaid on an ink scrim. Text binds to the
 * Look's background colour so it always reads on the scrim.
 */
export function heroCover(
  makeId: KitIdFactory,
  opts: { accent?: boolean } = {},
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: stampKitSection("hero", {
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
        backgroundImage: `${COVER_SCRIM}, url({{headshotUrl}})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        textColor: KIT_COLOR.background,
      },
    }),
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
            textColor: opts.accent === false ? KIT_COLOR.background : KIT_COLOR.accent,
          },
        },
      },
      {
        id: makeId(),
        kind: "heading",
        props: {
          text: "{{displayName}}",
          level: 1,
          style: { size: "xl", textColor: KIT_COLOR.background, textWrap: "balance" },
        },
      },
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: "{{tagline}}",
          style: {
            size: "lg",
            textColor: KIT_COLOR.background,
            opacity: 0.85,
            maxWidth: "reading",
          },
        },
      },
      inquiryCta(makeId, "m"),
    ],
  } as BuilderNode;
}

// ── ABOUT ────────────────────────────────────────────────────────────────────

/** The About block: eyebrow + full bio + location + languages lines. */
export function aboutBlock(
  makeId: KitIdFactory,
  opts: { align?: "start" | "center"; accent?: boolean } = {},
): BuilderNode {
  const center = opts.align === "center";
  const alignStyle = center ? { align: "center" as const } : {};
  return {
    id: makeId(),
    kind: "container",
    props: stampKitSection("about", {
      layout: "stack",
      gap: "m",
      align: opts.align ?? "start",
      layerLabel: "About",
      style: { maxWidth: "reading", paddingY: "l", paddingX: "m", marginTop: "m" },
    }),
    children: [
      eyebrow(makeId, "About", {
        letterSpacing: "0.18em",
        accent: opts.accent === true,
        ...(center ? { align: "center" as const } : {}),
      }),
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: "{{richBio}}",
          style: { size: "lg", maxWidth: "reading", ...alignStyle },
        },
      },
      {
        id: makeId(),
        kind: "paragraph",
        props: { text: "{{locationLine}}", style: { tone: "muted", size: "md", ...alignStyle } },
      },
      {
        id: makeId(),
        kind: "paragraph",
        props: { text: "{{languagesLine}}", style: { tone: "muted", size: "md", ...alignStyle } },
      },
    ],
  } as BuilderNode;
}

// ── SERVICES / FOCUS ─────────────────────────────────────────────────────────

/** Services & focus grid: three `{{serviceN}}` cards (empty cards prune). */
export function servicesBlock(
  makeId: KitIdFactory,
  opts: { columns?: 1 | 2 | 3; heading?: string } = {},
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: stampKitSection("services", {
      layout: "stack",
      gap: "m",
      align: "start",
      layerLabel: "Services",
      style: { maxWidth: "wide", paddingY: "l", paddingX: "m" },
    }),
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

function galleryTile(makeId: KitIdFactory, index: number): BuilderNode {
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

/** Gallery: `masonry` or a fixed `grid` of six `{{gallery0..5}}` tiles. */
export function galleryBlock(
  makeId: KitIdFactory,
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
    props: stampKitSection("gallery", {
      layout: "stack",
      gap: "m",
      align: "start",
      layerLabel: "Gallery",
      style: { maxWidth: "wide", paddingY: "l", paddingX: "m" },
    }),
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

/** The closing contact band: heading + copy + inquiry CTA, centered. */
export function contactBlock(
  makeId: KitIdFactory,
  opts: { heading?: string; copy?: string } = {},
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: stampKitSection("contact", {
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
    }),
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
          text: opts.copy ?? "{{contactCopy}}",
          style: { tone: "muted", align: "center" },
        },
      },
      ...contactChannelButtons(makeId),
    ],
  } as BuilderNode;
}

export { buildKitShell, buildKitStandardShell } from "./section-kit-shell";
export type { KitShellOptions } from "./section-kit-shell";
