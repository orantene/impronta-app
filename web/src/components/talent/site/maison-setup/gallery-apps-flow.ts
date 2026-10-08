/**
 * Wave 4 Apps flow helpers (pure): suggested vs all apps, designs that suit
 * an app, and navigation patches. No React.
 */
import {
  APP_LIBRARY,
  appsForProfessions,
  type AppLibraryEntry,
} from "@/lib/site-admin/add-gallery/apps-registry";
import {
  FINISHED_GALLERY_SLUGS,
  GALLERY_PROFESSIONS,
  getGalleryDesign,
  professionsForTerm,
  type GalleryDesign,
  type GalleryProfession,
} from "@/lib/talent-site/theme-catalog/gallery-meta";
import type { MaisonSetupChoices } from "./maison-choices";

/** Apps suggested from the talent's primary trade label (empty when unknown). */
export function suggestedAppsForTrade(
  primaryTypeLabel: string | null | undefined,
): AppLibraryEntry[] {
  const label = (primaryTypeLabel ?? "").trim();
  if (!label) return [];
  const professions = professionsForTerm(label);
  return appsForProfessions(professions);
}

/** Every app in the library (stable order). */
export function allLibraryApps(): ReadonlyArray<AppLibraryEntry> {
  return APP_LIBRARY;
}

/** Resolve an app by registry id (`app-nail-designer`) or native kind. */
export function findLibraryApp(idOrKind: string | null | undefined): AppLibraryEntry | null {
  if (!idOrKind) return null;
  return (
    APP_LIBRARY.find((a) => a.id === idOrKind || a.nativeKind === idOrKind) ?? null
  );
}

/** Finished designs that suit this app (recommendedDesigns ∩ finished gallery). */
export function designsThatSuitApp(app: AppLibraryEntry): GalleryDesign[] {
  const out: GalleryDesign[] = [];
  for (const slug of app.recommendedDesigns) {
    if (!FINISHED_GALLERY_SLUGS.includes(slug)) continue;
    const d = getGalleryDesign(slug);
    if (d) out.push(d);
  }
  return out;
}

/** Trade labels (EN or ES) for chips on an app card. */
export function appTradeLabels(
  app: AppLibraryEntry,
  locale: "en" | "es",
): string[] {
  return app.trades.map((t) => {
    const meta = GALLERY_PROFESSIONS[t as GalleryProfession];
    if (!meta) return t;
    return locale === "es" ? meta.label.es : meta.label.en;
  });
}

/** Open the Apps library from presence / builder / detail. */
export function openAppsLibraryPatch(): Partial<MaisonSetupChoices> {
  return {
    screen: "apps",
    appId: null,
    phoneSheet: null,
    detailTab: "preview",
  };
}

/** Open one app's page (try-it + Se ve mejor en + add). */
export function openAppDetailPatch(appId: string): Partial<MaisonSetupChoices> {
  const app = findLibraryApp(appId);
  return {
    screen: "app",
    appId: app?.id ?? appId,
    phoneSheet: null,
  };
}

/** From an app page → a design's gallery with the Apps tab open. */
export function openDesignWithAppPatch(
  designSlug: string,
): Partial<MaisonSetupChoices> {
  const slug = designSlug.trim().toLowerCase();
  return {
    screen: "detail",
    designSlug: slug,
    demoKey: null,
    fromQuery: null,
    designPaletteKey: null,
    phoneSheet: null,
    detailTab: "apps",
    status: "Preview",
    appId: null,
  };
}
