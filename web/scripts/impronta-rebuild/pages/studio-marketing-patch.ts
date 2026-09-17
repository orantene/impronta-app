/**
 * Studio page — 2026-09 marketing patch (applied to the LIVE tree).
 *
 * The studio page has been edited in the builder nine times since it was
 * seeded, so — like the homepage — it gets a surgical, id-keyed, idempotent
 * patch rather than a reseed. One addition: a PACKAGES band right after the
 * "Sessions" band, listing the four priced photo packages from the owner's
 * 2026-09-17 list and pointing at `/p/experiences` for booking. Prices live
 * on the experiences page as the single source of truth; this band repeats
 * them as a compact list so a visitor who lands on /studio sees a number.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { mergeLocalePageIntoOverlays } from "@/lib/site-admin/builder-node/locale-page-merge";

import { priceRow } from "../shared-offers";
import { band, centerHead, ctaRow, goldButton, lineButton } from "../shared";
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

export const STUDIO_PACKAGES_BAND_ID = "rb-studio-packages";

export function buildStudioPackagesBand(): BuilderNode {
  return band(
    STUDIO_PACKAGES_BAND_ID,
    [
      centerHead(
        STUDIO_PACKAGES_BAND_ID,
        "Packages & prices",
        "Four ways to book the studio",
        "Every package includes the studio, a professional photographer, direction on set and edited images. Prices in MXN.",
      ),
      {
        id: `${STUDIO_PACKAGES_BAND_ID}-list`,
        kind: "container",
        props: {
          layout: "stack",
          align: "start",
          layerLabel: "Price list",
          style: { width: "100%", maxWidthFree: "820px", marginLeftFree: "auto", marginRightFree: "auto", gap: "0px" },
        },
        children: [
          priceRow(`${STUDIO_PACKAGES_BAND_ID}-p1`, "Studio + photographer", "$1,500 MXN", "Studio, photographer and 10 edited photographs"),
          priceRow(`${STUDIO_PACKAGES_BAND_ID}-p2`, "Studio + photographer + makeup", "$2,500 MXN", "Adds a professional makeup artist on set"),
          priceRow(`${STUDIO_PACKAGES_BAND_ID}-p3`, "Complete session", "From $3,000 MXN", "Studio, photographer, makeup, hair and styling"),
          priceRow(`${STUDIO_PACKAGES_BAND_ID}-p4`, "Vintage-era photos", "$3,000 MXN", "A themed, period-styled session"),
        ],
      },
      ctaRow(`${STUDIO_PACKAGES_BAND_ID}-cta`, [
        goldButton(`${STUDIO_PACKAGES_BAND_ID}-cta-book`, "Book a package", "/p/experiences#rb-exp-sessions"),
        lineButton(`${STUDIO_PACKAGES_BAND_ID}-cta-courses`, "Courses and experiences", "/p/experiences"),
      ]),
    ],
    { borderTop: true, layerLabel: "Packages & prices" },
  );
}

const STUDIO_PATCH_ES_COPY: Record<string, string> = {
  ...EXPERIENCES_ES_COPY,
  "Packages & prices": "Paquetes y precios",
  "Four ways to book the studio": "Cuatro formas de reservar el estudio",
  "Every package includes the studio, a professional photographer, direction on set and edited images. Prices in MXN.":
    "Cada paquete incluye el estudio, un fotógrafo profesional, dirección en set y fotos editadas. Precios en MXN.",
  "Price list": "Lista de precios",
  "Studio, photographer and 10 edited photographs": "Estudio, fotógrafo y 10 fotografías editadas",
  "Adds a professional makeup artist on set": "Suma una maquilladora profesional en set",
  "Studio, photographer, makeup, hair and styling": "Estudio, fotógrafo, maquillaje, peinado y estética",
  "A themed, period-styled session": "Una sesión temática ambientada en otra época",
  "Book a package": "Reservar un paquete",
  "Courses and experiences": "Cursos y experiencias",
  Package: "Paquete",
  "Package name": "Nombre del paquete",
  Includes: "Incluye",
};

export interface StudioPatchReport {
  packagesInserted: boolean;
}

export function applyStudioMarketingPatch(live: BuilderNode[]): { tree: BuilderNode[]; report: StudioPatchReport; problems: string[] } {
  const problems: string[] = [];
  const report: StudioPatchReport = { packagesInserted: false };
  if (live.some((n) => n.id === STUDIO_PACKAGES_BAND_ID)) return { tree: withRootAnchors(live), report, problems };
  const i = live.findIndex((n) => n.id === "rb-studio-sessions");
  if (i === -1) {
    problems.push('anchor "rb-studio-sessions" not found at the root; packages band not inserted');
    return { tree: live, report, problems };
  }
  const node = buildStudioPackagesBand();
  const es = buildLocalizedTree([node], { locale: "es", copy: STUDIO_PATCH_ES_COPY, idPrefix: "es-" });
  const merged = mergeLocalePageIntoOverlays({ primaryTree: [node], secondaryTree: es, locale: "es" });
  const tree = withRootAnchors([...live.slice(0, i + 1), merged.tree[0]!, ...live.slice(i + 1)]);
  report.packagesInserted = true;
  return { tree, report, problems };
}
