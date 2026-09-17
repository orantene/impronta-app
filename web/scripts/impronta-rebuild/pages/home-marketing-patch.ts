/**
 * Homepage — 2026-09 marketing patch (applied to the LIVE tree, not the module).
 *
 * The live homepage has been edited in the builder since `home.ts` was seeded
 * (the LUMINA banner, a marquee embed, a hand-dropped `menu_board`), so this
 * is a SURGICAL patch on the live `cms_pages.blocks` rather than a reseed
 * that would discard those edits. Everything here is keyed by node id and
 * idempotent: run it twice and the second run changes nothing.
 *
 * What it does, in page order:
 *   1. After the divisions rail: a SERVICES strip — the nine client segments
 *      from the owner's commercial map, each deep-linking into
 *      `/p/for-clients#rb-clients-seg-<key>`.
 *   2. The show band (`rb-home-statement`): "Coming soon" → "Now booking",
 *      copy that says the production is finished and for sale to hotels,
 *      CTA "See the show".
 *   3. After the studio band (`rb-home-2`): an EXPERIENCES band with the three
 *      dated / priced products and a link to `/p/experiences`.
 *   4. Removes the hand-dropped `menu_board` ("Studio & workshops", USD prices
 *      that no longer match the offer) — the experiences band replaces it.
 *
 * Spanish: every new or changed string carries its `i18n.es` overlay, built
 * with the same copy-map mechanism as the pages (one design, text overlay).
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { mergeLocalePageIntoOverlays } from "@/lib/site-admin/builder-node/locale-page-merge";

import { experienceInquiryHref, offerCard } from "../shared-offers";
import {
  IMAGE_SLOT,
  band,
  centerHead,
  ctaRow,
  goldButton,
  grid,
  lineButton,
  linkRow,
} from "../shared";
import { EXPERIENCE_PRODUCTS } from "./experiences";
import { EXPERIENCES_ES_COPY } from "./experiences-es-copy";
import { buildLocalizedTree } from "./localize-page";


/** Every root band carries its id as a DOM anchor, so `#<id>` links land. */
export function withRootAnchors(nodes: BuilderNode[]): BuilderNode[] {
  return nodes.map((n) => {
    if (n.kind !== "container") return n;
    const props = n.props as Record<string, unknown>;
    if (props.anchorId === n.id) return n;
    return { ...n, props: { ...props, anchorId: n.id } } as BuilderNode;
  });
}

export const HOME_SERVICES_BAND_ID = "rb-home-services";
export const HOME_EXPERIENCES_BAND_ID = "rb-home-experiences";
export const HOME_SHOW_BAND_ID = "rb-home-statement";

// ── 1. services strip ────────────────────────────────────────────────────────

const SERVICE_LINKS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "brands", label: "Fashion brands & designers" },
  { key: "activations", label: "Activations & promotions" },
  { key: "private", label: "Private events & weddings" },
  { key: "hotels", label: "Hotels, resorts & beach clubs" },
  { key: "nightlife", label: "Casinos, bars, clubs & restaurants" },
  { key: "runway", label: "Fashion shows & runway" },
  { key: "audiovisual", label: "Audiovisual production" },
  { key: "corporate", label: "Corporate events & agencies" },
  { key: "studio", label: "Studio experiences & courses" },
];

export function buildServicesBand(): BuilderNode {
  return band(
    HOME_SERVICES_BAND_ID,
    [
      centerHead(
        HOME_SERVICES_BAND_ID,
        "What we do",
        "From a single face to a full show",
        "Talent, production, photography, entertainment and experiences, for brands, venues, agencies and private clients. Find your brief.",
      ),
      {
        id: `${HOME_SERVICES_BAND_ID}-grid`,
        kind: "container",
        props: {
          layout: "grid",
          columns: 3,
          gap: "m",
          layerLabel: "Service rows",
          responsive: { tablet: { columns: 2 }, mobile: { layout: "stack", columns: 1 } },
          style: { width: "100%", maxWidthFree: "100%", gap: "0px 48px" },
        },
        children: SERVICE_LINKS.map((s) =>
          linkRow(`${HOME_SERVICES_BAND_ID}-${s.key}`, s.label, `/p/for-clients#rb-clients-seg-${s.key}`),
        ),
      },
      ctaRow(`${HOME_SERVICES_BAND_ID}-cta`, [
        goldButton(`${HOME_SERVICES_BAND_ID}-cta-brief`, "Start an inquiry", "/p/contact"),
        lineButton(`${HOME_SERVICES_BAND_ID}-cta-show`, "The show for hotels", "/p/show"),
      ]),
    ],
    { borderTop: true, layerLabel: "What we do" },
  );
}

// ── 3. experiences band ──────────────────────────────────────────────────────

export function buildExperiencesBand(): BuilderNode {
  return band(
    HOME_EXPERIENCES_BAND_ID,
    [
      centerHead(
        HOME_EXPERIENCES_BAND_ID,
        "Experiences & photo sessions",
        "Step in front of the camera",
        "Open to everyone at Impronta's own studio: a one-day experience, a posing course and professional photo sessions from $1,500 MXN.",
      ),
      grid(
        `${HOME_EXPERIENCES_BAND_ID}-grid`,
        3,
        [
          offerCard(`${HOME_EXPERIENCES_BAND_ID}-model-day`, {
            imageSlot: "exp-model-for-a-day",
            imageAlt: "A posing coach directing a small group during a studio experience.",
            chip: "27 September 2026 · one day",
            title: "Model for a Day",
            price: "$2,500 MXN",
            priceNote: "per person",
            text: "One day inside the agency: posing direction, a styled session with a professional photographer, and edited images to keep.",
            cta: { label: "Reserve my seat", href: experienceInquiryHref(EXPERIENCE_PRODUCTS.modelForADay) },
          }),
          offerCard(`${HOME_EXPERIENCES_BAND_ID}-posing`, {
            imageSlot: "exp-posing-course",
            imageAlt: "An instructor demonstrating a pose in front of a studio mirror.",
            chip: "October 2026 · course",
            title: "Posing Course",
            price: "$7,000 MXN",
            priceNote: "per person",
            text: "Angles, movement, expression and casting presence, taught by the people who direct it every week.",
            cta: { label: "Join the October course", href: experienceInquiryHref(EXPERIENCE_PRODUCTS.posing) },
          }),
          offerCard(`${HOME_EXPERIENCES_BAND_ID}-sessions`, {
            imageSlot: "exp-session-studio",
            imageAlt: "A photographer at work on a seamless studio backdrop.",
            chip: "Photo sessions",
            title: "Studio photo sessions",
            price: "From $1,500 MXN",
            priceNote: "per session",
            text: "Studio and photographer, with makeup, hair and styling on the fuller packages. Ten edited photographs from the first package up.",
            cta: { label: "See all sessions", href: "/p/experiences#rb-exp-sessions" },
          }),
        ],
        { layerLabel: "Experiences", mobileColumns: 1 },
      ),
      ctaRow(`${HOME_EXPERIENCES_BAND_ID}-cta`, [
        lineButton(`${HOME_EXPERIENCES_BAND_ID}-cta-all`, "All experiences and prices", "/p/experiences"),
      ]),
    ],
    { borderTop: true, layerLabel: "Experiences & photo sessions" },
  );
}

// ── ES copy for the two new bands ────────────────────────────────────────────

const HOME_PATCH_ES_COPY: Record<string, string> = {
  ...EXPERIENCES_ES_COPY,
  "What we do": "Qué hacemos",
  "From a single face to a full show": "De un solo rostro a un show completo",
  "Talent, production, photography, entertainment and experiences, for brands, venues, agencies and private clients. Find your brief.":
    "Talento, producción, fotografía, entretenimiento y experiencias, para marcas, venues, agencias y clientes particulares. Encuentra tu brief.",
  "Service rows": "Filas de servicios",
  "Fashion brands & designers  →": "Marcas de ropa y diseñadores  →",
  "Fashion brands & designers": "Marcas de ropa y diseñadores",
  "Activations & promotions  →": "Activaciones y promociones  →",
  "Activations & promotions": "Activaciones y promociones",
  "Private events & weddings  →": "Eventos privados y bodas  →",
  "Private events & weddings": "Eventos privados y bodas",
  "Hotels, resorts & beach clubs  →": "Hoteles, resorts y beach clubs  →",
  "Hotels, resorts & beach clubs": "Hoteles, resorts y beach clubs",
  "Casinos, bars, clubs & restaurants  →": "Casinos, bares, clubes y restaurantes  →",
  "Casinos, bars, clubs & restaurants": "Casinos, bares, clubes y restaurantes",
  "Fashion shows & runway  →": "Desfiles y pasarela  →",
  "Fashion shows & runway": "Desfiles y pasarela",
  "Audiovisual production  →": "Producciones audiovisuales  →",
  "Audiovisual production": "Producciones audiovisuales",
  "Corporate events & agencies  →": "Eventos corporativos y agencias  →",
  "Corporate events & agencies": "Eventos corporativos y agencias",
  "Studio experiences & courses  →": "Experiencias y cursos en el estudio  →",
  "Studio experiences & courses": "Experiencias y cursos en el estudio",
  "Start an inquiry": "Enviar una solicitud",
  "The show for hotels": "El show para hoteles",
  "Experiences & photo sessions": "Experiencias y sesiones de fotos",
  "Step in front of the camera": "Ponte frente a la cámara",
  "Open to everyone at Impronta's own studio: a one-day experience, a posing course and professional photo sessions from $1,500 MXN.":
    "Abierto a todos en el estudio propio de Impronta: una experiencia de un día, un curso de posing y sesiones de fotos profesionales desde $1,500 MXN.",
  "One day inside the agency: posing direction, a styled session with a professional photographer, and edited images to keep.":
    "Un día dentro de la agencia: dirección de posing, una sesión con styling y fotógrafo profesional, y fotos editadas para ti.",
  "Angles, movement, expression and casting presence, taught by the people who direct it every week.":
    "Ángulos, movimiento, expresión y presencia en casting, impartido por quienes lo dirigen cada semana.",
  "Studio photo sessions": "Sesiones de fotos en estudio",
  "Studio and photographer, with makeup, hair and styling on the fuller packages. Ten edited photographs from the first package up.":
    "Estudio y fotógrafo, con maquillaje, peinado y styling en los paquetes más completos. Diez fotografías editadas desde el primer paquete.",
  "See all sessions": "Ver todas las sesiones",
  "All experiences and prices": "Todas las experiencias y precios",
};

/** A band with its `i18n.es` overlays attached (one design, text overlay). */
function withSpanishOverlay(node: BuilderNode): BuilderNode {
  const es = buildLocalizedTree([node], { locale: "es", copy: HOME_PATCH_ES_COPY, idPrefix: "es-" });
  const merged = mergeLocalePageIntoOverlays({ primaryTree: [node], secondaryTree: es, locale: "es" });
  return merged.tree[0]!;
}

// ── 2. show band text patch ──────────────────────────────────────────────────

export const SHOW_BAND_PATCH: ReadonlyArray<{ id: string; prop: "text" | "label"; en: string; es: string; href?: string }> = [
  { id: "rb-home-statement-eyebrow", prop: "text", en: "Now booking", es: "Ya se puede reservar" },
  { id: "rb-home-statement-line1", prop: "text", en: "A show built for", es: "Un show hecho para" },
  { id: "rb-home-statement-line2", prop: "text", en: "the Riviera Maya.", es: "la Riviera Maya." },
  {
    id: "rb-home-statement-body",
    prop: "text",
    en: "Show Impronta is finished and ready to travel: original scenography, wardrobe, dancers, acrobats and choreography, rehearsed as one company. Hotels, resorts, beach clubs, casinos and restaurants can book it for the coming season now.",
    es: "El Show Impronta está terminado y listo para viajar: escenografía original, vestuario, bailarines, acróbatas y coreografías, ensayado como una sola compañía. Hoteles, resorts, beach clubs, casinos y restaurantes ya pueden reservarlo para la próxima temporada.",
  },
  { id: "rb-home-statement-more", prop: "label", en: "See the show", es: "Ver el show", href: "/p/show" },
];

/** The band's portrait becomes the stage frame: a show band should show a stage. */
const SHOW_BAND_IMAGE = {
  id: "rb-home-statement-image",
  src: IMAGE_SLOT("show-hero"),
  alt: "Dancers and an acrobat in silhouette under gold stage light at a resort show.",
  altEs: "Bailarines y un acróbata en silueta bajo luz dorada de escenario en un show de resort.",
};

// ── the patch ────────────────────────────────────────────────────────────────

export interface HomePatchReport {
  servicesInserted: boolean;
  experiencesInserted: boolean;
  showStringsPatched: number;
  menuBoardsRemoved: number;
}

function patchShowBand(nodes: BuilderNode[], report: HomePatchReport): BuilderNode[] {
  const byId = new Map(SHOW_BAND_PATCH.map((p) => [p.id, p]));
  const walk = (list: BuilderNode[]): BuilderNode[] =>
    list.map((node) => {
      const patch = byId.get(node.id);
      let next: BuilderNode = node;
      if (node.id === SHOW_BAND_IMAGE.id && node.kind === "image") {
        const props = { ...(node.props as Record<string, unknown>) };
        // Idempotence: the slot token resolves to a URL on write, so compare on alt.
        if (props.alt !== SHOW_BAND_IMAGE.alt) {
          props.src = SHOW_BAND_IMAGE.src;
          props.alt = SHOW_BAND_IMAGE.alt;
          const i18n = { ...((props.i18n as Record<string, Record<string, string>> | undefined) ?? {}) };
          i18n.es = { ...(i18n.es ?? {}), alt: SHOW_BAND_IMAGE.altEs };
          props.i18n = i18n;
          next = { ...node, props, i18n } as BuilderNode;
          report.showStringsPatched += 1;
        }
      }
      if (patch) {
        const props = { ...(node.props as Record<string, unknown>) };
        const i18n = { ...((props.i18n as Record<string, Record<string, string>> | undefined) ?? {}) };
        const es = { ...(i18n.es ?? {}) };
        const changed = props[patch.prop] !== patch.en || es[patch.prop] !== patch.es || (patch.href && props.href !== patch.href);
        if (changed) {
          props[patch.prop] = patch.en;
          if (patch.href) props.href = patch.href;
          es[patch.prop] = patch.es;
          i18n.es = es;
          props.i18n = i18n;
          next = { ...node, props, i18n } as BuilderNode;
          report.showStringsPatched += 1;
        }
      }
      const children = (next as { children?: BuilderNode[] }).children;
      if (Array.isArray(children)) {
        const nextChildren = walk(children);
        if (nextChildren.some((c, i) => c !== children[i])) next = { ...next, children: nextChildren } as BuilderNode;
      }
      return next;
    });
  return walk(nodes);
}

/**
 * Pure: takes the live root list, returns the patched root list. Node ids in
 * the live tree are the contract; missing anchors are reported, not invented.
 */
export function applyHomeMarketingPatch(live: BuilderNode[]): { tree: BuilderNode[]; report: HomePatchReport; problems: string[] } {
  const report: HomePatchReport = { servicesInserted: false, experiencesInserted: false, showStringsPatched: 0, menuBoardsRemoved: 0 };
  const problems: string[] = [];
  let tree = patchShowBand(live, report);

  // 4. drop the hand-dropped menu_board(s) at the root
  const before = tree.length;
  tree = tree.filter((n) => n.kind !== "menu_board");
  report.menuBoardsRemoved = before - tree.length;

  const insertAfter = (anchorId: string, node: BuilderNode, flag: keyof HomePatchReport) => {
    if (tree.some((n) => n.id === node.id)) return; // idempotent
    const i = tree.findIndex((n) => n.id === anchorId);
    if (i === -1) {
      problems.push(`anchor "${anchorId}" not found at the root; ${node.id} not inserted`);
      return;
    }
    tree = [...tree.slice(0, i + 1), node, ...tree.slice(i + 1)];
    (report as unknown as Record<string, unknown>)[flag] = true;
  };
  insertAfter("rb-home-divisions", withSpanishOverlay(buildServicesBand()), "servicesInserted");
  insertAfter("rb-home-2", withSpanishOverlay(buildExperiencesBand()), "experiencesInserted");

  tree = withRootAnchors(tree);
  return { tree, report, problems };
}
