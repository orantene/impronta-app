/**
 * Aftercare tips (optional Design block): a short EN/ES "what to do after your
 * visit" section. Design copy is deliberately generic (no treatment, product
 * or timing claims): the talent rewrites the three tips for her own work.
 * Title and tips carry the ES overlay seeded on the node. Token refs only.
 *
 * Kept out of `section-kit.ts` (800-line budget). Provenance mirrors the
 * `aftercare` entry of `TALENT_KIT_SECTIONS`.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { MaxSiteTemplateIdFactory } from "../max-site-templates/types";

const SLOT = { slotKey: "aftercare", originRole: "talent.aftercare" } as const;

const TIPS: ReadonlyArray<{ title: string; titleEs: string; text: string; textEs: string }> = [
  {
    title: "Follow the care steps",
    titleEs: "Sigue los pasos de cuidado",
    text: "After your visit I will share simple steps to keep your results looking their best.",
    textEs: "Después de tu visita te comparto pasos sencillos para que tus resultados se vean siempre bien.",
  },
  {
    title: "Ask me anything",
    titleEs: "Pregúntame lo que quieras",
    text: "If something feels off, message me and I will help you sort it out.",
    textEs: "Si algo no te convence, escríbeme y te ayudo a resolverlo.",
  },
  {
    title: "Plan your next visit",
    titleEs: "Planea tu próxima visita",
    text: "Regular visits keep everything fresh. Book the next one before you leave or message me later.",
    textEs: "Las visitas regulares mantienen todo en su mejor momento. Reserva la próxima antes de irte o escríbeme después.",
  },
];

function tip(makeId: MaxSiteTemplateIdFactory, t: (typeof TIPS)[number]): BuilderNode {
  return {
    id: makeId(),
    kind: "container",
    props: { layout: "stack", gap: "s", align: "stretch", layerLabel: t.title },
    children: [
      {
        id: makeId(),
        kind: "heading",
        props: { text: t.title, i18n: { es: { text: t.titleEs } }, level: 3, style: { size: "md" } },
      } as BuilderNode,
      {
        id: makeId(),
        kind: "paragraph",
        props: { text: t.text, i18n: { es: { text: t.textEs } }, style: { tone: "muted" } },
      } as BuilderNode,
    ],
  } as BuilderNode;
}

export function aftercareBlock(
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
      layerLabel: "Aftercare tips",
      style: { maxWidth: "wide", paddingY: "l", paddingX: "m" },
      ...SLOT,
      anchorId: SLOT.slotKey,
    },
    children: [
      {
        id: makeId(),
        kind: "paragraph",
        props: {
          text: opts.eyebrow ?? "Aftercare",
          i18n: { es: { text: "Cuidados" } },
          style: { textTransform: "uppercase", letterSpacing: "0.18em", size: "sm", textColor: "token:color.ink" },
        },
      },
      {
        id: makeId(),
        kind: "heading",
        props: {
          text: opts.heading ?? "Aftercare tips",
          i18n: { es: { text: opts.headingEs ?? "Cuidados posteriores" } },
          level: 2,
          style: { size: "xl" },
          layerLabel: "Aftercare heading",
        },
      },
      {
        id: makeId(),
        kind: "container",
        props: {
          layout: "grid",
          columns: 3,
          gap: "m",
          align: "stretch",
          layerLabel: "Aftercare tips list",
          responsive: { mobile: { layout: "stack", columns: 1 } },
        },
        children: TIPS.map((t) => tip(makeId, t)),
      },
    ],
  } as BuilderNode;
}
