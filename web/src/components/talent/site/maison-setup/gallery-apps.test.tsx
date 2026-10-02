/**
 * Market apps in the talent gallery: badge only when apps exist, Apps tab
 * lists them with a live playground, Pro pill follows `premium`, EN/ES parity.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { APP_LIBRARY, type AppLibraryEntry } from "@/lib/site-admin/add-gallery/apps-registry";
import { getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { AppBadge, AppsTab } from "./GalleryAppsUi";
import {
  GALLERY_APPS_COPY,
  appBadgeLabel,
  appsForDetail,
  appsOnDemo,
  appsOnDesign,
} from "./gallery-apps";
import { exploreDesignPatch } from "./maison-choices";

const nail = APP_LIBRARY[0]!;
const designWithApp = getGalleryDesign("maison-v2")!;
const designWithout = getGalleryDesign("gridline")!;

test("badge label EN and ES", () => {
  assert.equal(appBadgeLabel([nail], "en"), "App included · Nail Designer");
  assert.equal(appBadgeLabel([nail], "es"), "App incluida · Diseñador de uñas");
  assert.equal(appBadgeLabel([], "en"), null);
});

test("badge renders only when the design has apps", () => {
  const withApps = appsOnDesign(designWithApp);
  const without = appsOnDesign(designWithout);
  assert.ok(withApps.length > 0);
  assert.equal(without.length, 0);
  const on = renderToStaticMarkup(<AppBadge apps={withApps} locale="en" onOpen={() => {}} />);
  const off = renderToStaticMarkup(<AppBadge apps={without} locale="en" onOpen={() => {}} />);
  assert.match(on, /App included/);
  assert.equal(off, "");
});

test("demo apps follow the demo trades", () => {
  assert.equal(appsOnDemo({ professions: ["nails", "lashes"] }).length, 1);
  assert.equal(appsOnDemo({ professions: ["chef"] }).length, 0);
  assert.equal(appsOnDemo(null).length, 0);
  assert.equal(appsForDetail(designWithApp, { professions: ["nails"] }).length, 1);
});

test("Apps tab lists the app with a live playground and no Pro pill when free", () => {
  const html = renderToStaticMarkup(<AppsTab apps={[nail]} locale="es" />);
  assert.match(html, /Diseñador de uñas/);
  assert.match(html, /data-testid="gallery-app-playground-app_nail_designer"/);
  assert.match(html, /<iframe[^>]*src="\/apps\/nail-studio\/index\.html\?lang=es"/);
  assert.doesNotMatch(html, /gallery-app-pro/);
});

test("Pro pill shows only for premium apps", () => {
  const premium: AppLibraryEntry = { ...nail, premium: true };
  assert.match(renderToStaticMarkup(<AppsTab apps={[premium]} locale="en" />), /gallery-app-pro/);
  assert.match(renderToStaticMarkup(<AppsTab apps={[]} locale="en" />), /gallery-apps-empty/);
});

test("i18n parity and no em dashes", () => {
  assert.deepEqual(Object.keys(GALLERY_APPS_COPY.en).sort(), Object.keys(GALLERY_APPS_COPY.es).sort());
  for (const lang of ["en", "es"] as const) {
    for (const v of Object.values(GALLERY_APPS_COPY[lang])) assert.ok(!v.includes("—"));
  }
  for (const a of APP_LIBRARY) {
    assert.ok(a.name.en && a.name.es && a.pitch.en && a.pitch.es);
  }
});

test("badge opens detail on the apps tab; default stays preview", () => {
  assert.equal(exploreDesignPatch("maison-v2", { tab: "apps" }).detailTab, "apps");
  assert.equal(exploreDesignPatch("maison-v2").detailTab, "preview");
});
