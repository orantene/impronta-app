/**
 * Gallery apps (pure helpers): which market apps a theme card, demo card or
 * theme detail advertises, and their EN/ES copy. Data comes from the App
 * Library (`apps-registry.ts`); no UI here.
 */
import {
  appsForDemo,
  appsForDesign,
  type AppLibraryEntry,
} from "@/lib/site-admin/add-gallery/apps-registry";
import type { GalleryDemo, GalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import type { MaisonSetupLocale } from "./maison-setup-copy";

export const GALLERY_APPS_COPY = {
  en: { badge: "App included", apps: "Apps", pro: "Pro", empty: "No apps for this theme yet.", play: "Try it here" },
  es: { badge: "App incluida", apps: "Apps", pro: "Pro", empty: "Este tema aún no tiene apps.", play: "Pruébala aquí" },
} as const;

export function galleryAppsT(locale: MaisonSetupLocale, key: keyof (typeof GALLERY_APPS_COPY)["en"]): string {
  return GALLERY_APPS_COPY[locale === "es" ? "es" : "en"][key];
}

export function appName(app: AppLibraryEntry, locale: MaisonSetupLocale): string {
  return locale === "es" ? app.name.es : app.name.en;
}

export function appPitch(app: AppLibraryEntry, locale: MaisonSetupLocale): string {
  return locale === "es" ? app.pitch.es : app.pitch.en;
}

/** Apps a theme card advertises (design level). */
export function appsOnDesign(design: Pick<GalleryDesign, "slug">): AppLibraryEntry[] {
  return appsForDesign(design.slug);
}

/** Apps a demo advertises (its trades). */
export function appsOnDemo(demo: Pick<GalleryDemo, "professions"> | null | undefined): AppLibraryEntry[] {
  return demo ? appsForDemo(demo.professions) : [];
}

/** Theme detail list: design apps first, then the active demo's, deduped by kind. */
export function appsForDetail(
  design: Pick<GalleryDesign, "slug">,
  demo: Pick<GalleryDemo, "professions"> | null | undefined,
): AppLibraryEntry[] {
  const seen = new Set<string>();
  return [...appsOnDesign(design), ...appsOnDemo(demo)].filter((a) => {
    if (seen.has(a.kind)) return false;
    seen.add(a.kind);
    return true;
  });
}

/** "App included · Nail Designer" (first app named, "+N" when more). */
export function appBadgeLabel(apps: ReadonlyArray<AppLibraryEntry>, locale: MaisonSetupLocale): string | null {
  const first = apps[0];
  if (!first) return null;
  const more = apps.length > 1 ? ` +${apps.length - 1}` : "";
  return `${galleryAppsT(locale, "badge")} · ${appName(first, locale)}${more}`;
}
