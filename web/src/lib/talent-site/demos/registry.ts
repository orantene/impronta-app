/**
 * The demos the one-command rebuild owns. Derived from THEME_DEMOS (the same
 * list the gallery and the apply pipeline read) plus the two reference demos
 * that sit outside it: Alba (maison-v2), Mateo Ferrer (folio) and Alex Treviño (gridline). No manifest:
 * adding a demo to THEME_DEMOS adds it here.
 *
 * Exactly one demo per design is the `reference` (the mockup's own content).
 * Pure data, no I/O.
 */
import { THEME_DEMOS } from "@/lib/talent-site/theme-catalog/theme-demos";
import type { DemoDesign, DemoRegistryEntry } from "./types";

export const ALBA_CODE = "TAL-93020";
export const MATEO_CODE = "TAL-93011";
export const ALEX_CODE = "TAL-93030";

const FROM_THEME_DEMOS: DemoRegistryEntry[] = THEME_DEMOS.map((d) => ({
  design: d.design,
  profileCode: d.profileCode,
  palette: d.palette,
  reference: false,
  // Gridline and Folio guide demos each own a content fixture keyed by profile code.
  ...(d.design === "gridline" || d.design === "folio" ? { contentFixture: d.profileCode } : {}),
}));

const REFERENCES: DemoRegistryEntry[] = [
  { design: "maison-v2", profileCode: ALBA_CODE, palette: "rose", reference: true, contentFixture: "maison-v2" },
  { design: "folio", profileCode: MATEO_CODE, palette: "stone", reference: true, contentFixture: "folio" },
  { design: "gridline", profileCode: ALEX_CODE, palette: "default", reference: true, contentFixture: "gridline" },
];

/** Live demos outside THEME_DEMOS: rebuilt to the newest design but always in their CURRENT look. */
const EXTRAS: DemoRegistryEntry[] = [
  { design: "maison-v2", profileCode: "TAL-93006", palette: "current", reference: false, keepLook: true },
  { design: "folio", profileCode: "TAL-93007", palette: "current", reference: false, keepLook: true },
];

export const DEMO_REGISTRY: readonly DemoRegistryEntry[] = [
  ...REFERENCES,
  ...EXTRAS.filter((d) => !REFERENCES.some((r) => r.profileCode === d.profileCode)),
  ...FROM_THEME_DEMOS.filter((d) => ![...REFERENCES, ...EXTRAS].some((r) => r.profileCode === d.profileCode)),
];

/** Demos of one design (all designs when omitted). */
export function demosFor(design?: DemoDesign): DemoRegistryEntry[] {
  return DEMO_REGISTRY.filter((d) => !design || d.design === design);
}

export function findDemo(profileCode: string): DemoRegistryEntry | undefined {
  return DEMO_REGISTRY.find((d) => d.profileCode === profileCode);
}
