/**
 * P5 — live design switch helpers (pure; unit-tested).
 * "Publish <Design>?" dialog copy (What changes / What stays) and the
 * palette display name for any design (named gallery palettes included).
 */
import type { MaisonCustomPaletteStored } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { liveDesignName } from "./maison-live-summary";
import type { MaisonSetupLocale } from "./maison-setup-copy";

type L = { en: string; es: string };

/** How each design shows the service menu (mirrors the design payloads). */
const MENU_STYLE: Record<string, L> = {
  maison: { en: "tabs", es: "pestañas" },
  "maison-v2": { en: "image-led rows", es: "filas con fotos" },
  solace: { en: "an editorial list", es: "una lista editorial" },
  mono: { en: "a compact price list", es: "una lista de precios compacta" },
  frame: { en: "cards", es: "tarjetas" },
  folio: { en: "a rate card", es: "una tarifa" },
};

export function serviceMenuStyleLabel(locale: MaisonSetupLocale, designSlug: string): string {
  const hit = MENU_STYLE[designSlug.trim().toLowerCase()];
  if (hit) return locale === "es" ? hit.es : hit.en;
  return locale === "es" ? "el estilo del diseño" : "the design's style";
}

function sameHex(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Palette name to show for a site. Order: a gallery palette of the design
 * whose colors match the stored custom palette (localized name), then a named
 * look palette of the design, then the stored custom name, then "My colors".
 */
export function paletteDisplayName(input: {
  locale: MaisonSetupLocale;
  designSlug: string | null;
  lookSlug: string | null;
  customPalette: MaisonCustomPaletteStored | null;
}): string {
  const { locale, designSlug, lookSlug, customPalette } = input;
  const es = locale === "es";
  const design = getGalleryDesign(designSlug ?? "maison") ?? getGalleryDesign("maison");
  if (customPalette) {
    const f = customPalette.fields;
    const match = design?.palettes.find(
      (p) =>
        sameHex(p.page, f.page) &&
        sameHex(p.text, f.text) &&
        sameHex(p.accent, f.accent) &&
        sameHex(p.section, f.section),
    );
    if (match) return es ? match.name.es : match.name.en;
    const saved = (es ? customPalette.name.es : customPalette.name.en)?.trim();
    if (saved) return saved;
    return es ? "Mis colores" : "My colors";
  }
  if (lookSlug?.startsWith("maison-")) {
    const key = lookSlug.slice("maison-".length);
    const all = getGalleryDesign("maison")?.palettes ?? [];
    const hit = all.find((p) => p.key === key);
    if (hit) return es ? hit.name.es : hit.name.en;
  }
  // Collection looks (e.g. maison-v2 "rose") use the bare palette key.
  if (lookSlug && design) {
    const hit = design.palettes.find((p) => p.key === lookSlug);
    if (hit) return es ? hit.name.es : hit.name.en;
  }
  return es ? "Mis colores" : "My colors";
}

export type LiveDesignChangeSummary = {
  title: string;
  changes: string;
  stays: string;
  toast: string;
};

/** What changes / What stays for switching a live site to another design. */
export function buildLiveDesignChangeSummary(input: {
  locale: MaisonSetupLocale;
  fromSlug: string | null;
  toSlug: string;
  paletteName: string;
  counts?: { services: number | null; photos: number | null } | null;
}): LiveDesignChangeSummary {
  const { locale, toSlug, paletteName, counts } = input;
  const es = locale === "es";
  const oldName = liveDesignName(locale, input.fromSlug);
  const newName = liveDesignName(locale, toSlug);
  const menu = serviceMenuStyleLabel(locale, toSlug);

  const changes = es
    ? `Diseño: ${oldName} → ${newName} · orden de secciones · menú de servicios como ${menu} · colores: ${paletteName}`
    : `Layout: ${oldName} → ${newName} · section order · service menu shown as ${menu} · colors: ${paletteName}`;

  const services =
    typeof counts?.services === "number"
      ? es
        ? `tus ${counts.services} servicios`
        : `${counts.services} services`
      : es
        ? "tus servicios"
        : "services";
  const photos =
    typeof counts?.photos === "number"
      ? es
        ? `${counts.photos} fotos`
        : `${counts.photos} photos`
      : es
        ? "fotos"
        : "photos";
  const stays = es
    ? `${services.charAt(0).toUpperCase()}${services.slice(1)}, ${photos}, tu presentación, la configuración de reservas y la dirección. Puedes restaurar ${oldName} después desde Opciones de diseño.`
    : `Your ${services}, ${photos}, intro, booking settings and address. You can restore ${oldName} afterwards from Design options.`;

  return {
    title: es ? `¿Publicar ${newName}?` : `Publish ${newName}?`,
    changes,
    stays,
    toast: es ? `✓ ${newName} está en vivo` : `✓ ${newName} is live`,
  };
}
