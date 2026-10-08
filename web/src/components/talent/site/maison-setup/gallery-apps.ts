/**
 * Gallery apps (pure helpers): which market apps a theme card, demo card or
 * theme detail advertises, and their EN/ES copy. Data comes from the App
 * Library (`apps-registry.ts`); no UI here.
 */
import {
  appsForProfessions,
  appsForDesign,
  type AppLibraryEntry,
} from "@/lib/site-admin/add-gallery/apps-registry";
import type { GalleryDemo, GalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import type { MaisonSetupLocale } from "./maison-setup-copy";

export const GALLERY_APPS_COPY = {
  en: {
    badge: "★ App",
    bestFit: "Best fit for the app:",
    tipOne: "Includes the {names} app · Try it in the theme",
    tipMany: "Includes the apps {names} · Try them in the theme",
    apps: "Apps",
    // Badge names the same paid tier the server gate uses (Web Office /
    // personalSiteSections / talent_portfolio) — not the folded talent_pro SKU.
    pro: "Web Office",
    empty: "No apps for this theme yet.",
    play: "Try it here",
    suggested: "Suggested for your trade",
    allApps: "All apps",
    looksBest: "Looks best in",
    addToSite: "Add to my site",
    upgradeToUse: "Upgrade to use",
    webOffice: "Available on Web Office",
    webOfficeTip: "Adding apps needs Web Office. You can still try them here and pick a design.",
    seePlans: "See plans",
    browseAll: "Browse all apps",
    openApp: "Open app",
    backToApps: "Apps",
    trades: "Trades",
    libraryTitle: "Apps",
    librarySub: "Interactive tools for your site",
    noSuggested: "No suggestions for your trade yet. Browse all apps below.",
    builderLink: "Open in page builder",
    designsLink: "Browse designs",
  },
  es: {
    badge: "★ App",
    bestFit: "Ideal para la app:",
    tipOne: "Incluye la app {names} · Pruébala en el tema",
    tipMany: "Incluye las apps {names} · Pruébalas en el tema",
    apps: "Apps",
    pro: "Oficina Web",
    empty: "Este tema aún no tiene apps.",
    play: "Pruébala aquí",
    suggested: "Sugeridas para tu oficio",
    allApps: "Todas las apps",
    looksBest: "Se ve mejor en",
    addToSite: "Agregar a mi sitio",
    upgradeToUse: "Mejora tu plan para usarla",
    webOffice: "Disponible en Oficina Web",
    webOfficeTip: "Agregar apps necesita Oficina Web. Puedes probarlas aquí y elegir un diseño.",
    seePlans: "Ver planes",
    browseAll: "Ver todas las apps",
    openApp: "Abrir app",
    backToApps: "Apps",
    trades: "Oficios",
    libraryTitle: "Apps",
    librarySub: "Herramientas interactivas para tu sitio",
    noSuggested: "Aún no hay sugerencias para tu oficio. Mira todas las apps abajo.",
    builderLink: "Abrir en el editor",
    designsLink: "Ver diseños",
  },
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
  return demo ? appsForProfessions(demo.professions) : [];
}

/** Theme detail list: design apps first, then the active demo's, deduped by kind. */
export function appsForDetail(
  design: Pick<GalleryDesign, "slug">,
  demo: Pick<GalleryDemo, "professions"> | null | undefined,
): AppLibraryEntry[] {
  const seen = new Set<string>();
  return [...appsOnDesign(design), ...appsOnDemo(demo)].filter((a) => {
    if (seen.has(a.nativeKind)) return false;
    seen.add(a.nativeKind);
    return true;
  });
}

/** Badge text: a star pill, "★ App". */
export function appBadgeLabel(apps: ReadonlyArray<AppLibraryEntry>, locale: MaisonSetupLocale): string | null {
  return apps.length ? galleryAppsT(locale, "badge") : null;
}

/** App names joined with commas. */
export function appNames(apps: ReadonlyArray<AppLibraryEntry>, locale: MaisonSetupLocale): string {
  return apps.map((a) => appName(a, locale)).join(", ");
}

/** Tooltip: "Includes the Nail Designer app · Try it in the theme". */
export function appBadgeTip(apps: ReadonlyArray<AppLibraryEntry>, locale: MaisonSetupLocale): string {
  const key = apps.length > 1 ? "tipMany" : "tipOne";
  return galleryAppsT(locale, key).replace("{names}", appNames(apps, locale));
}
