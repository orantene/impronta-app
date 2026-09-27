/**
 * Named style presets for `services_catalog` inspector Behavior.
 * Applying a preset patches concrete presentation props and stamps `stylePreset`.
 */
export type ServicesCatalogStylePresetId = "clean" | "editorial" | "compact" | "image_led";

export type ServicesCatalogStylePreset = {
  id: ServicesCatalogStylePresetId;
  label: string;
  patch: Record<string, unknown>;
};

export const SERVICES_CATALOG_STYLE_PRESETS: readonly ServicesCatalogStylePreset[] = [
  {
    id: "clean",
    label: "Clean",
    patch: {
      layout: "rows",
      categoryNav: "pills",
      density: "comfortable",
      photoRadius: "soft",
      rowCtaVariant: "outline",
      useWebsiteTheme: true,
    },
  },
  {
    id: "editorial",
    label: "Editorial",
    patch: {
      layout: "editorial",
      categoryNav: "sections",
      density: "comfortable",
      photoRadius: "soft",
      rowCtaVariant: "outline",
      columns: 2,
    },
  },
  {
    id: "compact",
    label: "Compact",
    patch: {
      layout: "compact_list",
      categoryNav: "tabs",
      density: "compact",
      showPhoto: false,
      rowCtaVariant: "outline",
    },
  },
  {
    id: "image_led",
    label: "Image-led",
    patch: {
      layout: "cards",
      categoryNav: "pills",
      density: "comfortable",
      photoRadius: "soft",
      showPhoto: true,
      columns: 2,
    },
  },
] as const;

/** Props written when an inspector preset button is clicked. */
export function servicesCatalogStylePresetCommit(
  id: ServicesCatalogStylePresetId,
): Record<string, unknown> {
  const preset = SERVICES_CATALOG_STYLE_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown services_catalog stylePreset: ${id}`);
  return { ...preset.patch, stylePreset: preset.id };
}
