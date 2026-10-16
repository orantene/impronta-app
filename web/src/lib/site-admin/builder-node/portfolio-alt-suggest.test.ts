import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSuggestedAlt, looksLikeSlugAlt } from "./portfolio-alt-suggest";
import { resolvePortfolioAlt } from "./portfolio-i18n";

const ctx = { name: "Mateo Ferrer", trade: "Fashion model", city: "CDMX", service: "Editorial shoot" };

test("English: trade by name in city plus service", () => {
  assert.equal(buildSuggestedAlt(ctx, "en"), "Fashion model by Mateo Ferrer in CDMX. Service: Editorial shoot");
});

test("Spanish wording", () => {
  assert.equal(buildSuggestedAlt(ctx, "es"), "Fashion model por Mateo Ferrer en CDMX. Servicio: Editorial shoot");
});

test("partial data and no data", () => {
  assert.equal(buildSuggestedAlt({ name: "Ana" }, "en"), "Ana");
  assert.equal(buildSuggestedAlt({ city: "CDMX" }, "en"), "");
});

test("never uses slug-style pieces or em dashes", () => {
  const out = buildSuggestedAlt({ name: "Ana — Ruiz", trade: "makeup", service: "f-d-knit" }, "en");
  assert.equal(out, "makeup by Ana - Ruiz");
  assert.ok(!/[–—]/.test(out));
});

test("slug guard", () => {
  for (const s of ["f-hero", "f-d-knit", "IMG_1234", "photo.jpg"]) assert.equal(looksLikeSlugAlt(s), true, s);
  for (const s of ["Fashion model by Ana", "Portfolio", "", null]) assert.equal(looksLikeSlugAlt(s), false);
});

test("capped length", () => {
  assert.ok(buildSuggestedAlt({ name: "x".repeat(300) + " y", trade: "t" }, "en").length <= 125);
});

test("resolver uses suggestion before the generic label, never over a real alt", () => {
  const base = { metadata: null, caption: null, locale: "en" };
  assert.equal(resolvePortfolioAlt({ ...base, alt: "Real alt", suggested: "S" }), "Real alt");
  assert.equal(resolvePortfolioAlt({ ...base, alt: "f-hero", suggested: "Model by Ana" }), "Model by Ana");
  assert.equal(resolvePortfolioAlt({ ...base, alt: null, suggested: "" }), "Portfolio photo");
});
