/**
 * Track G Wave 4 — Apps flow contracts: library, app page, Folio/Gridline
 * Apps tab, bidirectional back paths.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { APP_LIBRARY } from "@/lib/site-admin/add-gallery/apps-registry";
import { getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { AppsTab } from "./GalleryAppsUi";
import { AppsLibraryScreen } from "./AppsLibraryScreen";
import { AppDetailScreen } from "./AppDetailScreen";
import {
  designsThatSuitApp,
  findLibraryApp,
  openAppDetailPatch,
  openAppsLibraryPatch,
  openDesignWithAppPatch,
  suggestedAppsForTrade,
} from "./gallery-apps-flow";
import { GALLERY_APPS_COPY, galleryAppsT } from "./gallery-apps";
import { parseMaisonChoices } from "./maison-choices";

const ROOT = join(process.cwd(), "src/components/talent/site/maison-setup");

function read(name: string): string {
  return readFileSync(join(ROOT, name), "utf8");
}

test("G4-LIB: suggested + all apps copy and library screen", () => {
  assert.equal(galleryAppsT("es", "suggested"), "Sugeridas para tu oficio");
  assert.equal(galleryAppsT("es", "allApps"), "Todas las apps");
  assert.deepEqual(Object.keys(GALLERY_APPS_COPY.en).sort(), Object.keys(GALLERY_APPS_COPY.es).sort());
  for (const lang of ["en", "es"] as const) {
    for (const v of Object.values(GALLERY_APPS_COPY[lang])) assert.ok(!v.includes("—"));
  }
  const html = renderToStaticMarkup(
    <AppsLibraryScreen locale="es" onOpenApp={() => {}} onBack={() => {}} onClose={() => {}} />,
  );
  assert.match(html, /apps-library-screen/);
  assert.match(html, /apps-library-suggested/);
  assert.match(html, /apps-library-all/);
  assert.match(html, /Sugeridas para tu oficio/);
  assert.match(html, /Todas las apps/);
});

test("G4-APP: try-it, Se ve mejor en, Agregar / Oficina Web path", () => {
  const nail = APP_LIBRARY[0]!;
  assert.ok(designsThatSuitApp(nail).some((d) => d.slug === "maison-v2"));
  const html = renderToStaticMarkup(
    <AppDetailScreen
      locale="es"
      appId={nail.id}
      previewDevice="desktop"
      onOpenDesign={() => {}}
      onBackToLibrary={() => {}}
      onClose={() => {}}
    />,
  );
  assert.match(html, /app-detail-screen/);
  assert.match(html, /Se ve mejor en/);
  assert.match(html, /Agregar a mi sitio/);
  assert.match(html, /Disponible en Oficina Web/);
  assert.match(html, /app-detail-see-plans/);
  assert.match(html, /app-detail-design-maison-v2/);
  assert.match(html, /layout=desktop/);
  // Add to site carries the app into the builder Add gallery.
  assert.match(html, /panel=add/);
  assert.match(html, new RegExp(`app=${encodeURIComponent(nail.id)}`));
  const detail = read("AppDetailScreen.tsx");
  assert.match(detail, /requestBuilderAppIntent/);
});

test("G4-BACK: App↔templates + library patches", () => {
  assert.equal(openAppsLibraryPatch().screen, "apps");
  assert.equal(openAppDetailPatch("app-nail-designer").screen, "app");
  assert.equal(openAppDetailPatch("app-nail-designer").appId, "app-nail-designer");
  const toDesign = openDesignWithAppPatch("maison-v2");
  assert.equal(toDesign.screen, "detail");
  assert.equal(toDesign.designSlug, "maison-v2");
  assert.equal(toDesign.detailTab, "apps");
  assert.equal(findLibraryApp("app_nail_designer")?.id, "app-nail-designer");
});

test("G4-FOLIO-GRIDLINE: Apps tab always rendered in Theme detail", () => {
  const detail = read("ThemeDetailScreen.tsx");
  assert.match(detail, /data-gallery-wave4-detail-tabs/);
  assert.match(detail, /appsTabOn = choices\.detailTab === "apps"/);
  assert.match(detail, /onBrowseAppsLibrary/);
  assert.match(detail, /onOpenAppDetail/);
  // Folio + Gridline have no design-level apps today; tab still mounts.
  assert.equal(getGalleryDesign("folio")!.slug, "folio");
  assert.equal(getGalleryDesign("gridline")!.slug, "gridline");
  const empty = renderToStaticMarkup(
    <AppsTab apps={[]} locale="en" onBrowseAll={() => {}} onOpenApp={() => {}} />,
  );
  assert.match(empty, /gallery-apps-browse-all/);
  assert.match(empty, /gallery-apps-empty/);
});

test("G4-PRESENCE: Apps tile opens apps library screen", () => {
  const manager = readFileSync(
    join(process.cwd(), "src/components/talent/site/TalentMaxSiteManager.tsx"),
    "utf8",
  );
  assert.match(manager, /setMaisonForceScreen\("apps"\)/);
  const host = read("MaisonSetupHost.tsx");
  assert.match(host, /AppsLibraryScreen/);
  assert.match(host, /AppDetailScreen/);
  assert.match(host, /forceScreen === "apps"/);
  const parsed = parseMaisonChoices({ screen: "apps", appId: "app-nail-designer" });
  assert.equal(parsed.screen, "apps");
  assert.equal(parsed.appId, "app-nail-designer");
});

test("G4-SUGGEST: nails trade suggests Nail Designer", () => {
  assert.ok(suggestedAppsForTrade("Nail Artist").some((a) => a.id === "app-nail-designer"));
  assert.ok(suggestedAppsForTrade("Manicurista").some((a) => a.id === "app-nail-designer"));
  assert.equal(suggestedAppsForTrade("Electrician").length, 0);
  assert.equal(suggestedAppsForTrade(null).length, 0);
});

test("G4-BUILDER: Apps tab search + designs back-link", () => {
  const panel = readFileSync(
    join(process.cwd(), "src/components/edit-chrome/add-gallery/add-gallery-panel.tsx"),
    "utf8",
  );
  assert.match(panel, /Search apps/);
  assert.match(panel, /add-gallery-apps-designs-link/);
  assert.match(panel, /Browse designs/);
  assert.match(panel, /href="\/talent\/site"/);
  assert.match(panel, /requestWebsiteSetup\("gallery"\)/);
  assert.match(panel, /takeBuilderAppIntent/);
  const es = readFileSync(
    join(process.cwd(), "src/components/edit-chrome/editor-i18n-es-apps.ts"),
    "utf8",
  );
  assert.match(es, /Search apps/);
  assert.match(es, /Buscar apps/);
});
