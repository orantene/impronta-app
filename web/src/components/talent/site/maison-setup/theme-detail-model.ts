/**
 * Theme detail model (P4, 2026-09-28): the pure rules the Theme detail
 * screen reads from gallery-meta. Kept out of the component so the
 * colors-kept rule and demo resolution are unit-testable.
 *
 * Colors-kept rule: switching demo never touches the talent's colors. If
 * she picked a palette or saved custom colors, they stay; the panel says
 * "kept when you switch demos" and a toast confirms it. Only "Use demo
 * colors" returns to the demo's own palette.
 */
import {
  getGalleryDesign,
  galleryPaletteLookTokens,
  type GalleryDemo,
  type GalleryDesign,
  type GalleryPalette,
} from "@/lib/talent-site/theme-catalog/gallery-meta";
import {
  MAISON_DEFAULT_PALETTE_KEY,
  MAISON_PALETTE_ORDER,
  maisonPaletteLookTokens,
  type MaisonPaletteKey,
} from "@/lib/talent-site/theme-catalog/maison/seed";
import { maisonCustomLookTokens } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import type { MaisonSetupChoices } from "./maison-choices";

export const MAISON_SLUG = "maison";

export function isMaisonDesign(slug: string): boolean {
  return slug === MAISON_SLUG;
}

/** Built demos first, in catalog order; planned after. */
export function orderedDemos(design: GalleryDesign): GalleryDemo[] {
  return [
    ...design.demos.filter((d) => d.status === "built"),
    ...design.demos.filter((d) => d.status !== "built"),
  ];
}

/** The demo the preview shows: the chosen one when built, else the featured built demo. */
export function resolveActiveDemo(
  design: GalleryDesign,
  demoKey: string | null,
): { demo: GalleryDemo | null; requested: GalleryDemo | null; plannedFallback: boolean } {
  const requested = demoKey ? design.demos.find((d) => d.key === demoKey) ?? null : null;
  const featured = design.demos.find((d) => d.status === "built") ?? null;
  if (requested && requested.status === "built") {
    return { demo: requested, requested, plannedFallback: false };
  }
  return { demo: featured, requested, plannedFallback: requested !== null };
}

/** `?demo=` value for the preview route; only demo-talent sources need one. */
export function demoPreviewParam(designSlug: string, demo: GalleryDemo | null): string | null {
  if (!demo || demo.status !== "built" || demo.source.kind !== "demo-talent") return null;
  return `${designSlug}:${demo.key}`;
}

/** The demo's own palette key, valid for the design. */
export function demoDefaultPaletteKey(design: GalleryDesign, demo: GalleryDemo | null): string {
  const key = demo?.defaultPalette;
  if (key && design.palettes.some((p) => p.key === key)) return key;
  if (isMaisonDesign(design.slug)) return MAISON_DEFAULT_PALETTE_KEY;
  return design.palettes[0]?.key ?? "";
}

/**
 * Explicit palette the talent picked for this design, or null when she is on
 * the demo's colors. Maison keeps its own `paletteKey`; other designs use
 * `designPaletteKey`.
 */
export function chosenPaletteKey(
  design: GalleryDesign,
  choices: Pick<MaisonSetupChoices, "paletteKey" | "designPaletteKey">,
): string | null {
  const key = isMaisonDesign(design.slug) ? choices.designPaletteKey ?? choices.paletteKey : choices.designPaletteKey;
  return key && design.palettes.some((p) => p.key === key) ? key : null;
}

export type EffectiveColors =
  | { kind: "custom" }
  | { kind: "palette"; palette: GalleryPalette; isDemoDefault: boolean };

export function effectiveColors(
  design: GalleryDesign,
  demo: GalleryDemo | null,
  choices: Pick<MaisonSetupChoices, "paletteKey" | "designPaletteKey" | "useCustomPalette" | "customPalette">,
): EffectiveColors {
  if (choices.useCustomPalette && choices.customPalette) return { kind: "custom" };
  const demoKey = demoDefaultPaletteKey(design, demo);
  const key = chosenPaletteKey(design, choices) ?? demoKey;
  const palette = design.palettes.find((p) => p.key === key) ?? design.palettes[0]!;
  return { kind: "palette", palette, isDemoDefault: palette.key === demoKey };
}

/**
 * Colors-kept rule. Patch for switching to `nextDemoKey`: only the demo
 * changes. `kept` is true when the talent's own colors (custom or a picked
 * palette that differs from the new demo's default) stay on screen, which
 * is when the UI shows the "kept" note and toast.
 */
export function demoSwitchPatch(
  design: GalleryDesign,
  choices: Pick<MaisonSetupChoices, "paletteKey" | "designPaletteKey" | "useCustomPalette" | "customPalette">,
  nextDemoKey: string,
): { patch: Partial<MaisonSetupChoices> | null; kept: boolean } {
  const next = design.demos.find((d) => d.key === nextDemoKey);
  if (!next || next.status !== "built") return { patch: null, kept: false };
  const colors = effectiveColors(design, next, choices);
  const kept =
    colors.kind === "custom" ||
    (chosenPaletteKey(design, choices) !== null && !colors.isDemoDefault);
  return { patch: { demoKey: next.key, status: "Choices saved", phoneSheet: null }, kept };
}

/** Patch for "Use demo colors": back to the demo's own palette. */
export function useDemoColorsPatch(
  design: GalleryDesign,
  demo: GalleryDemo | null,
): Partial<MaisonSetupChoices> {
  const key = demoDefaultPaletteKey(design, demo);
  const base: Partial<MaisonSetupChoices> = {
    designPaletteKey: null,
    useCustomPalette: false,
    status: "Choices saved",
    phoneSheet: null,
  };
  if (isMaisonDesign(design.slug) && (MAISON_PALETTE_ORDER as readonly string[]).includes(key)) {
    base.paletteKey = key as MaisonPaletteKey;
  }
  return base;
}

/** Patch for picking a named palette. */
export function pickPalettePatch(design: GalleryDesign, key: string): Partial<MaisonSetupChoices> {
  const base: Partial<MaisonSetupChoices> = {
    designPaletteKey: key,
    useCustomPalette: false,
    status: "Choices saved",
    phoneSheet: null,
  };
  if (isMaisonDesign(design.slug) && (MAISON_PALETTE_ORDER as readonly string[]).includes(key)) {
    base.paletteKey = key as MaisonPaletteKey;
  }
  return base;
}

/** Look tokens posted into the preview for the current colors. */
export function previewTokensFor(
  design: GalleryDesign,
  colors: EffectiveColors,
  choices: Pick<MaisonSetupChoices, "customPalette">,
): Record<string, string> | null {
  if (colors.kind === "custom") {
    return choices.customPalette ? maisonCustomLookTokens(choices.customPalette) : null;
  }
  if (isMaisonDesign(design.slug)) {
    return maisonPaletteLookTokens(colors.palette.key as MaisonPaletteKey);
  }
  return galleryPaletteLookTokens(design.slug, colors.palette.key);
}

export function detailDesign(slug: string): GalleryDesign {
  return getGalleryDesign(slug) ?? getGalleryDesign(MAISON_SLUG)!;
}

/** Only the Maison starter pack can be imported today. */
export function demoSupportsImport(demo: GalleryDemo | null): boolean {
  return demo?.source.kind === "maison-seed";
}
