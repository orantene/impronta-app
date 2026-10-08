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
  appBadgeTip,
  appNames,
  appsForDetail,
  appsOnDemo,
  appsOnDesign,
} from "./gallery-apps";
import { exploreDesignPatch } from "./maison-choices";

const nail = APP_LIBRARY[0]!;
const designWithApp = getGalleryDesign("maison-v2")!;
const designWithout = getGalleryDesign("gridline")!;

test("badge label EN and ES", () => {
  assert.equal(appBadgeLabel([nail], "en"), "★ App");
  assert.equal(appBadgeLabel([nail], "es"), "★ App");
  assert.equal(appBadgeTip([nail], "en"), "Includes the Nail Designer app · Try it in the theme");
  assert.equal(appBadgeTip([nail], "es"), "Incluye la app Diseñador de uñas · Pruébala en el tema");
  assert.equal(appNames([nail, { ...nail, name: { en: "B", es: "B" } }], "en"), "Nail Designer, B");
  assert.equal(appBadgeLabel([], "en"), null);
});

test("badge renders only when the design has apps", () => {
  const withApps = appsOnDesign(designWithApp);
  const without = appsOnDesign(designWithout);
  assert.ok(withApps.length > 0);
  assert.equal(without.length, 0);
  const on = renderToStaticMarkup(<AppBadge apps={withApps} locale="en" onOpen={() => {}} />);
  const off = renderToStaticMarkup(<AppBadge apps={without} locale="en" onOpen={() => {}} />);
  assert.match(on, /★ App/);
  assert.match(on, /role="tooltip"/);
  assert.match(on, /aria-describedby/);
  assert.match(on, /Includes the Nail Designer app/);
  assert.match(renderToStaticMarkup(<AppBadge apps={withApps} locale="es" onOpen={() => {}} />), /Incluye la app Diseñador de uñas/);
  assert.equal(off, "");
});

test("demo apps follow the demo trades", () => {
  assert.equal(appsOnDemo({ professions: ["nails", "lashes"] }).length, 1);
  assert.equal(appsOnDemo({ professions: ["chef"] }).length, 0);
  assert.equal(appsOnDemo(null).length, 0);
  assert.equal(appsForDetail(designWithApp, { professions: ["nails"] }).length, 1);
});

test("Apps tab lists Nail Designer with playground and Web Office pill (premium)", () => {
  assert.equal(nail.premium, true);
  const html = renderToStaticMarkup(<AppsTab apps={[nail]} locale="es" />);
  assert.match(html, /Diseñador de uñas/);
  assert.match(html, /data-testid="gallery-app-playground-app_nail_designer"/);
  assert.match(html, /<iframe[^>]*src="\/apps\/nail-studio\/index\.html\?lang=es(?:&amp;layout=desktop)?"/);
  assert.match(html, /data-gallery-app-device="desktop"/);
  assert.match(html, /gallery-app-pro/);
  assert.match(html, /Oficina Web/);
});

test("Apps tab phone device forces phone layout on the playground", () => {
  const html = renderToStaticMarkup(<AppsTab apps={[nail]} locale="en" previewDevice="phone" />);
  assert.match(html, /data-gallery-app-device="phone"/);
  assert.match(html, /layout=phone/);
});

test("Web Office pill shows only for premium apps", () => {
  const free: AppLibraryEntry = { ...nail, premium: false };
  const premiumHtml = renderToStaticMarkup(<AppsTab apps={[nail]} locale="en" />);
  assert.match(premiumHtml, /gallery-app-pro/);
  assert.match(premiumHtml, /Web Office/);
  assert.doesNotMatch(renderToStaticMarkup(<AppsTab apps={[free]} locale="en" />), /gallery-app-pro/);
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

test("browse card: badge in the title row, chips below (Wave 3 card)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./GalleryDesignCard.tsx", import.meta.url), "utf8");
  const title = src.indexOf('data-testid="design-card-title-row"');
  assert.ok(title > 0 && src.indexOf("<AppBadge", title) > title);
  assert.match(src, /design-card-chip-line/);
  assert.doesNotMatch(src, /design-card-app-fit/);
});
