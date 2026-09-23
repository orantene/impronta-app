/**
 * Theme gallery copy (en + es). Kept local to `theme-gallery/` rather than
 * folded into the large `talent-site-i18n.ts` (file-size ratchet). No em
 * dashes, matching the copy rule for every string added in this pass.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

export type ThemeGalleryLocale = "en" | "es";

const COPY = {
  en: {
    stepDesign: "Design",
    stepLook: "Look",
    categoryAll: "All",
    newBadge: "New",
    lockedPill: "Web Office",
    currentPill: "Current",
    loading: "Loading themes.",
    loadError: "We could not load the theme gallery.",
    retry: "Retry",
    emptyFilter: "No designs in this category yet.",
    previewLoading: "Loading preview.",
    previewError: "The preview could not load.",
    previewRetry: "Retry preview",
    nextToLook: "Next: choose a look",
    backToDesign: "Back to designs",
    applyButton: "Use this theme",
    applyLookOnlyButton: "Use this look",
    applying: "Applying.",
    applySuccess: "Theme saved to your draft. Publish your site to make it live.",
    stepsAria: "Theme gallery steps",
    categoryFilterAria: "Filter designs by category",
    previewTitle: "Theme preview",
    errorTierRequired: "This theme needs Web Office.",
    errorNotFound: "This theme is no longer available.",
    errorConflict: "Your site changed in another tab. Reload and try again.",
    errorDisabled: "Themes are not available yet.",
    applyErrorGeneric: "Something went wrong. Try again.",
    fontSample: "Aa",
    designStepHeading: "Pick a design",
    designStepSubtitle: "Choose the layout for your shell and home page.",
    lookStepHeading: "Pick a look",
    lookStepSubtitle: "Choose colors and fonts. This restyles the preview right away.",
    confirmReplaceDesign: "This replaces your current page content. Continue?",
  },
  es: {
    stepDesign: "Diseño",
    stepLook: "Estilo",
    categoryAll: "Todos",
    newBadge: "Nuevo",
    lockedPill: "Web Office",
    currentPill: "Actual",
    loading: "Cargando temas.",
    loadError: "No pudimos cargar la galería de temas.",
    retry: "Reintentar",
    emptyFilter: "Aún no hay diseños en esta categoría.",
    previewLoading: "Cargando vista previa.",
    previewError: "No se pudo cargar la vista previa.",
    previewRetry: "Reintentar vista previa",
    nextToLook: "Siguiente: elegir estilo",
    backToDesign: "Volver a diseños",
    applyButton: "Usar este tema",
    applyLookOnlyButton: "Usar este estilo",
    applying: "Aplicando.",
    applySuccess: "Tema guardado en tu borrador. Publica tu sitio para que esté en línea.",
    stepsAria: "Pasos de la galería de temas",
    categoryFilterAria: "Filtrar diseños por categoría",
    previewTitle: "Vista previa del tema",
    errorTierRequired: "Este tema requiere Web Office.",
    errorNotFound: "Este tema ya no está disponible.",
    errorConflict: "Tu sitio cambió en otra pestaña. Recarga e intenta de nuevo.",
    errorDisabled: "Los temas aún no están disponibles.",
    applyErrorGeneric: "Algo salió mal. Intenta de nuevo.",
    fontSample: "Aa",
    designStepHeading: "Elige un diseño",
    designStepSubtitle: "Elige el diseño de tu estructura y página de inicio.",
    lookStepHeading: "Elige un estilo",
    lookStepSubtitle: "Elige colores y tipografías. La vista previa cambia al instante.",
    confirmReplaceDesign: "Esto reemplaza el contenido actual de tu página. ¿Continuar?",
  },
} as const;

export type ThemeGalleryCopyKey = keyof (typeof COPY)["en"];

export function themeGalleryCopy(
  locale: ThemeGalleryLocale | string | undefined,
  key: ThemeGalleryCopyKey,
): string {
  const loc = pickLocale(locale, { en: "en", es: "es" } as const);
  return COPY[loc][key];
}

export function themeGallerySelectDesignAria(
  locale: ThemeGalleryLocale | string | undefined,
  label: string,
): string {
  const loc = pickLocale(locale, { en: "en", es: "es" } as const);
  return loc === "es" ? `Elegir el diseño ${label}` : `Select the ${label} design`;
}

export function themeGallerySelectLookAria(
  locale: ThemeGalleryLocale | string | undefined,
  label: string,
): string {
  const loc = pickLocale(locale, { en: "en", es: "es" } as const);
  return loc === "es" ? `Elegir el estilo ${label}` : `Select the ${label} look`;
}

export function themeGalleryLockedAria(
  locale: ThemeGalleryLocale | string | undefined,
  label: string,
): string {
  const loc = pickLocale(locale, { en: "en", es: "es" } as const);
  return loc === "es"
    ? `${label} requiere Web Office`
    : `${label} requires Web Office`;
}

const CATEGORY_LABELS: Record<ThemeGalleryLocale, Record<string, string>> = {
  en: { minimal: "Minimal", editorial: "Editorial", bold: "Bold", classic: "Classic", creator: "Creator" },
  es: { minimal: "Minimalista", editorial: "Editorial", bold: "Audaz", classic: "Clásico", creator: "Creador" },
};

/** Localized design category chip label; an unknown (authored) category shows
 * as-is with a capital first letter. */
export function themeGalleryCategoryLabel(
  locale: ThemeGalleryLocale | string | undefined,
  category: string,
): string {
  const loc = pickLocale(locale, { en: "en", es: "es" } as const);
  const known = CATEGORY_LABELS[loc][category];
  if (known) return known;
  return category.charAt(0).toUpperCase() + category.slice(1);
}
