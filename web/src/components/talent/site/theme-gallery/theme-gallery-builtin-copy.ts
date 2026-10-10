/**
 * Spanish card copy for the in-code built-in Designs. The catalog stores one
 * `title` / `summary` (English) per row, so the gallery localizes the built-ins
 * here by slug; an authored row, or a slug not listed, shows its stored copy.
 * Collection Designs reuse `COLLECTION_DESIGN_SUMMARY_ES` (product titles stay).
 * No em dashes (copy rule).
 */
import { pickLocale } from "@/lib/i18n/pick-locale";
import { COLLECTION_DESIGN_SUMMARY_ES } from "@/lib/talent-site/theme-catalog/collection/design-summaries-es";
import type { GalleryCatalogEntry } from "./types";

const ES_DESIGN_COPY: Record<string, { title?: string; summary: string }> = {
  default: {
    title: "Tulala Predeterminado",
    summary:
      "Nuestro diseño más completo: portada dividida con tu foto, disciplinas, sobre mí, servicios y una galería.",
  },
  minimal: {
    summary:
      "Limpio y centrado en la tipografía: portada con tu nombre al centro (sin foto), servicios compactos y una galería sencilla.",
  },
  editorial: {
    summary:
      "Estilo revista: portada dividida con imagen, una introducción centrada y una galería escalonada. Cálido y refinado.",
  },
  bold: {
    summary:
      "Impactante: portada a pantalla completa con tu foto detrás del título, cabecera oscura, sobre mí, servicios y galería.",
  },
  portfolio: {
    summary:
      "Tu trabajo primero: portada con más texto, una galería destacada de 3 columnas arriba y servicios y contacto debajo.",
  },
};

function esCopy(entry: GalleryCatalogEntry) {
  if (entry.kind !== "design") return undefined;
  const legacy = ES_DESIGN_COPY[entry.slug];
  if (legacy) return legacy;
  const collectionSummary = COLLECTION_DESIGN_SUMMARY_ES[entry.slug];
  if (collectionSummary) return { summary: collectionSummary };
  return undefined;
}

export function themeGalleryEntryTitle(
  locale: string | undefined,
  entry: GalleryCatalogEntry,
): string {
  if (pickLocale(locale, { en: "en", es: "es" } as const) !== "es") return entry.title;
  return esCopy(entry)?.title ?? entry.title;
}

export function themeGalleryEntrySummary(
  locale: string | undefined,
  entry: GalleryCatalogEntry,
): string {
  if (pickLocale(locale, { en: "en", es: "es" } as const) !== "es") return entry.summary;
  return esCopy(entry)?.summary ?? entry.summary;
}
