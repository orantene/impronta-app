/**
 * Before / After (optional Design block): a two-image comparison under an
 * EN/ES title. F77: the two image slots are seeded EMPTY (never a random
 * gallery pair): the builder shows "Choose your before and after photos" and
 * the public site hides the block until both photos are set. Title and
 * captions are design copy with the ES overlay seeded on the node. Token refs
 * only, no colours.
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
      i18n: { en: { text }, es: { text: es } },
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
          i18n: { en: { text: opts.eyebrow ?? "The difference" }, es: { text: "La diferencia" } },
          style: { textTransform: "uppercase", letterSpacing: "0.18em", size: "sm", textColor: "token:color.ink" },
        },
      },
      {
        id: makeId(),
        kind: "heading",
        props: {
          text: opts.heading ?? "Before and after",
          // Both languages on the kit itself (TUL-207): seedI18n can fill a
          // missing en from the base, but a kit used outside that walker must
          // already ship es + en so a Spanish site never reads the English base.
          i18n: {
            en: { text: opts.heading ?? "Before and after" },
            es: { text: opts.headingEs ?? "Antes y después" },
          },
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
          pane(makeId, "", "Before", "Antes"),
          pane(makeId, "", "After", "Después"),
        ],
      },
    ],
  } as BuilderNode;
}
