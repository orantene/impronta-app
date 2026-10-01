/**
 * The demos the one-command rebuild owns. Derived from THEME_DEMOS (the same
 * list the gallery and the apply pipeline read) plus the two reference demos
 * that sit outside it: Alba (maison-v2) and Mateo Ferrer (folio). No manifest:
 * adding a demo to THEME_DEMOS adds it here.
 *
 * Exactly one demo per design is the `reference` (the mockup's own content).
 * Pure data, no I/O.
 */
import { THEME_DEMOS } from "@/lib/talent-site/theme-catalog/theme-demos";
import type { DemoDesign, DemoRegistryEntry } from "./types";

export const ALBA_CODE = "TAL-93020";
export const MATEO_CODE = "TAL-93011";

const FROM_THEME_DEMOS: DemoRegistryEntry[] = THEME_DEMOS.map((d) => ({
  design: d.design,
  profileCode: d.profileCode,
  palette: d.palette,
  reference: false,
}));

const REFERENCES: DemoRegistryEntry[] = [
  { design: "maison-v2", profileCode: ALBA_CODE, palette: "rose", reference: true, contentFixture: "maison-v2" },
  { design: "folio", profileCode: MATEO_CODE, palette: "stone", reference: true, contentFixture: "folio" },
];

export const DEMO_REGISTRY: readonly DemoRegistryEntry[] = [
  ...REFERENCES,
  ...FROM_THEME_DEMOS.filter((d) => !REFERENCES.some((r) => r.profileCode === d.profileCode)),
];

/** Demos of one design (all designs when omitted). */
export function demosFor(design?: DemoDesign): DemoRegistryEntry[] {
  return DEMO_REGISTRY.filter((d) => !design || d.design === design);
}

export function findDemo(profileCode: string): DemoRegistryEntry | undefined {
  return DEMO_REGISTRY.find((d) => d.profileCode === profileCode);
}
