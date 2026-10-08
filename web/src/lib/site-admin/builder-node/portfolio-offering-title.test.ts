import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { resolveLinkedOfferingTitle } from "./portfolio-offering-title";

const row = { title: "Extensiones clásicas", title_i18n: { en: "Classic extensions", es: "Extensiones clásicas" } };

test("English visitor gets the service's English title, Spanish visitor the Spanish one", () => {
  assert.equal(resolveLinkedOfferingTitle(row, "en", "es"), "Classic extensions");
  assert.equal(resolveLinkedOfferingTitle(row, "es", "es"), "Extensiones clásicas");
});

test("no English title: the page's primary language, then the plain title; never English for a Spanish visitor", () => {
  const onlyEs = { title: "Lifting de pestañas", title_i18n: { es: "Lifting de pestañas" } };
  assert.equal(resolveLinkedOfferingTitle(onlyEs, "en", "es"), "Lifting de pestañas");
  const onlyEn = { title: "Lifting de pestañas", title_i18n: { en: "Lash lift" } };
  assert.equal(resolveLinkedOfferingTitle(onlyEn, "es", "es"), "Lifting de pestañas");
  assert.equal(resolveLinkedOfferingTitle({ title: "Gel", title_i18n: null }, "en", "es"), "Gel");
  assert.equal(resolveLinkedOfferingTitle({ title: "Gel" }, "en", "es"), "Gel");
});

test("a missing or odd locale returns the plain title", () => {
  assert.equal(resolveLinkedOfferingTitle(row, null, "es"), "Extensiones clásicas");
  assert.equal(resolveLinkedOfferingTitle(row, "  ", null), "Extensiones clásicas");
  assert.equal(resolveLinkedOfferingTitle(row, "EN-us", "es"), "Classic extensions");
});

test("the loader reads title_i18n and resolves it for the visitor (static guard)", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/site-admin/builder-node/portfolio-sources.ts"), "utf8");
  assert.match(src, /\.select\("id, title, title_i18n"\)/);
  assert.match(src, /resolveLinkedOfferingTitle\(row, opts\?\.locale, opts\?\.primaryLocale\)/);
});
