/**
 * Before / After (optional Design block): a two-image comparison under an
 * EN/ES title. Images are the talent's own gallery pair (`{{gallery2}}` /
 * `{{gallery3}}`, hydrated per site); title and captions are design copy with
 * the ES overlay seeded on the node. Token refs only, no colours.
 *
 * Kept out of `section-kit.ts` (800-line budget). Provenance mirrors the
 * `before_after` entry of `TALENT_KIT_SECTIONS`.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { MaxSiteTemplateIdFactory } from "../max-site-templates/types";

const SLOT = { slotKey: "before_after", originRole: "talent.before_after" } as const;

function caption(makeId: MaxSiteTemplateIdFactory, text: string, es: string): BuilderNode {
  return {
    id: makeId(),
    kind: "paragraph",
    props: {
      text,
      i18n: { es: { text: es } },
      style: { textTransform: "uppercase", letterSpacing: "0.18em", size: "sm", tone: "muted" },
    },
  } as BuilderNode;
}

function pane(
  makeId: MaxSiteTemplateIdFactory,
  src: string,
  label: string,
  es: string,
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: { layout: "stack", gap: "s", align: "stretch", layerLabel: label },
    children: [
      {
        id: makeId(),
        kind: "image",
        props: {
          src,
          alt: label,
          style: { radius: "lg", objectFit: "cover", width: "100%", aspectRatio: "3:4" },
        },
      },
      caption(makeId, label, es),
    ],
  } as BuilderNode;
}

export function beforeAfterBlock(
  makeId: MaxSiteTemplateIdFactory,
  opts: { heading?: string; headingEs?: string; eyebrow?: string } = {},
): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      align: "start",
      layerLabel: "Before and after",
      style: { maxWidth: "wide", paddingY: "l", paddingX: "m" },
      ...SLOT,
      anchorId: SLOT.slotKey,
    },
    children: [
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: opts.eyebrow ?? "The difference",
          i18n: { es: { text: "La diferencia" } },
          style: { textTransform: "uppercase", letterSpacing: "0.18em", size: "sm", textColor: "token:color.accent" },
        },
      },
      {
        id: makeId(),
        kind: "heading",
        props: {
          text: opts.heading ?? "Before and after",
          i18n: { es: { text: opts.headingEs ?? "Antes y después" } },
          level: 2,
          style: { size: "xl" },
          layerLabel: "Before and after heading",
        },
      },
      {
        id: makeId(),
        kind: "split",
        props: {
          ratio: "50-50",
          gap: "m",
          collapseOnMobile: true,
          layerLabel: "Before and after pair",
        },
        children: [
          pane(makeId, "{{gallery2}}", "Before", "Antes"),
          pane(makeId, "{{gallery3}}", "After", "Después"),
        ],
      },
    ],
  } as BuilderNode;
}
