/**
 * Gridline hero spec block (any design can place it).
 *
 * Copy column: a kicker (status dot + mono line), a wide headline whose
 * `{i}...{/i}` words take the accent style, a spec grid of TYPED cells, and the
 * CTA pair. "Who" column: a photo, the name, the bio and mono badges. The photo
 * card is a row on a phone (small photo beside the text) and a stacked photo
 * card on desktop.
 *
 * Nothing here is computed or invented: every spec cell and badge is a typed
 * option, and a cell or badge left empty renders nothing (the `stats` spec
 * variant drops incomplete cells). The default kit therefore makes no claim a
 * talent did not type. Token colours and token-or-var fonts only; no hex.
 *
 * Kept out of `section-kit.ts` (800-line budget). The slot mirrors the `hero`
 * entry of `TALENT_KIT_SECTIONS` (this is a hero variant, so it stamps `hero`).
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { styleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";
import type { MaxSiteTemplateIdFactory } from "../max-site-templates/types";
import { heroCtaRow, type HeroCtaRow } from "./section-kit-hero-parts";

export type HeroSpecCell = { label: string; value: string };

export interface HeroSpecBlockOptions {
  /** Mono kicker line next to the status dot. Default: the talent's type label. */
  kicker?: string;
  /** Headline. `{i}words{/i}` takes the accent style. Default: the tagline. */
  headline?: string;
  /** Typed cells (Respuesta, Garantia, Precio, Revision). Empty = grid hidden. */
  specs?: HeroSpecCell[];
  /** Primary + secondary CTA pair. */
  ctaRow?: HeroCtaRow;
  /** Typed mono badges under the bio (years, kind of jobs). Empty = none. */
  badges?: string[];
  /** Bio line. Default: the talent's bio. */
  bio?: string;
}

const HERO = { slotKey: "hero", originRole: "talent.hero" } as const;

/**
 * Mono voice without a raw font stack: the kit never inlines a font-family
 * (static guard). The kicker and badges carry a letter-spacing signature
 * (`.02em`) that the utility type system reads as its mono label role; under
 * any other type system they use the body face.
 */

function kicker(makeId: MaxSiteTemplateIdFactory, text: string): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: { layout: "row", gap: "s", align: "center", layerLabel: "Kicker", style: { flexWrap: "wrap" } },
    children: [
      {
        id: makeId(),
        kind: "container",
        props: {
          layout: "stack",
          layerLabel: "Status dot",
          style: {
            width: "8px",
            height: "8px",
            minWidth: "8px",
            radius: "pill",
            backgroundColor: styleTokenRef("color.accent"),
                      },
        },
        children: [],
      },
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text,
          style: { size: "sm", tone: "muted", letterSpacing: ".02em" },
        },
      },
    ],
  } as BuilderNode;
}

function badge(makeId: MaxSiteTemplateIdFactory, text: string): BuilderNode {
  return {
    id: makeId(),
    kind: "card",
    props: {
      variant: "outline",
      style: { radius: "sm", paddingX: "s", paddingY: "s", backgroundColor: styleTokenRef("color.surface-raised") },
    },
    children: [
      {
        id: makeId(),
        kind: "paragraph",
        props: { text, style: { fontSize: "11px", letterSpacing: ".02em", tone: "muted" } },
      },
    ],
  } as BuilderNode;
}

/** The who card: a row on phone, a stacked photo card on desktop. */
function whoCard(makeId: MaxSiteTemplateIdFactory, opts: HeroSpecBlockOptions): BuilderNode {
  const badges = (opts.badges ?? []).map((b) => b.trim()).filter(Boolean);
  return {
    id: makeId(),
    kind: "container",
    props: {
      layout: "stack",
      gap: "s",
      align: "stretch",
      layerLabel: "Who",
      responsive: { mobile: { layout: "row", align: "center", gap: "m" } },
      style: {
        radius: "md",
        overflow: "hidden",
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: styleTokenRef("color.line"),
        backgroundColor: styleTokenRef("color.surface-raised"),
        responsive: { mobile: { paddingX: "s", paddingY: "s" } },
      },
    },
    children: [
      {
        id: makeId(),
        kind: "image",
        props: {
          src: "{{headshotUrl}}",
          alt: "{{displayName}}",
          priority: true,
          style: {
            width: "100%",
            height: "340px",
            objectFit: "cover",
            objectPosition: "50% 20%",
            radius: "none",
            responsive: { mobile: { width: "92px", height: "92px", minWidth: "92px", radius: "sm" } },
          },
        },
      },
      {
        id: makeId(),
        kind: "container",
        props: {
          layout: "stack",
          gap: "s",
          align: "start",
          layerLabel: "Who text",
          style: { paddingX: "m", paddingY: "s", responsive: { mobile: { paddingX: "none", paddingY: "none" } } },
        },
        children: [
          {
            id: makeId(),
            kind: "heading",
            props: { text: "{{displayName}}", level: 3, style: { size: "md" } },
          },
          {
            id: makeId(),
            kind: "paragraph",
            props: { text: opts.bio ?? "{{richBio}}", style: { size: "sm", tone: "muted", lineClamp: 4 } },
          },
          ...(badges.length
            ? [
                {
                  id: makeId(),
                  kind: "container",
                  props: {
                    layout: "row",
                    gap: "s",
                    align: "start",
                    layerLabel: "Badges",
                    style: { flexWrap: "wrap" },
                  },
                  children: badges.map((b) => badge(makeId, b)),
                } as BuilderNode,
              ]
            : []),
        ],
      },
    ],
  } as BuilderNode;
}

export function heroSpecBlock(makeId: MaxSiteTemplateIdFactory, opts: HeroSpecBlockOptions = {}): BuilderNode {
  const specs = (opts.specs ?? []).filter((s) => s.label.trim() && s.value.trim());
  const copy: BuilderNode = {
    id: makeId(),
    kind: "container",
    props: { layout: "stack", gap: "m", align: "stretch", layerLabel: "Hero copy", style: { paddingY: "m" } },
    children: [
      kicker(makeId, opts.kicker ?? "{{primaryTypeLabel}}"),
      {
        id: makeId(),
        kind: "heading",
        // Her headline field, with the same fallback chain as the live site (trade seed, then name).
        props: {
          text: opts.headline ?? "{{headline}}",
          ...(opts.headline ? {} : { liveText: "hero_headline" }),
          level: 1,
          style: { size: "xl", textWrap: "balance" },
        },
      },
      {
        id: makeId(),
        kind: "stats",
        props: {
          variant: "spec",
          animate: false,
          layerLabel: "Spec grid",
          items: specs.map((s) => ({ label: s.label.trim(), value: s.value.trim() })),
        },
      },
      ...(opts.ctaRow ? [heroCtaRow(makeId, opts.ctaRow)] : []),
    ],
  } as BuilderNode;
  return {
    id: makeId(),
    kind: "split",
    props: {
      ratio: "60-40",
      gap: "l",
      collapseOnMobile: true,
      layerLabel: "Hero",
      ...HERO,
      anchorId: "hero",
      style: { maxWidth: "wide", paddingY: "l", paddingX: "m", alignItems: "flex-start" },
    },
    children: [copy, whoCard(makeId, opts)],
  } as BuilderNode;
}
