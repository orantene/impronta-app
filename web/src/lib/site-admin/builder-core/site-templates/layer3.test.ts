/**
 * Layer 3 unit tests: the image resolver's owner-first rule, the tenant
 * business-type resolver, and the stock byte cap (sharp, in-process).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import sharp from "sharp";

import { fitStockBytes, STOCK_MAX_BYTES } from "@/lib/media/platform-stock-admin.server";

import { assignmentSourceForLevel, buildImageResolver } from "./image-resolver";
import { candidatePalettesFromHexes } from "./theme-from-palette";
import { resolveTenantBusinessType } from "./tenant-business-type";

test("owner media wins over stock, and stock fills what the owner lacks", () => {
  const { resolve, picks } = buildImageResolver([
    { src: "stock-hero", width: 1600, height: 900, alt: { es: "a", en: "a" }, role: "hero", owner: false },
    { src: "stock-portrait", width: 900, height: 1200, alt: { es: "b", en: "b" }, role: "portrait", owner: false },
    { src: "owner-wide", width: 2000, height: 1000, alt: { es: "c", en: "c" }, owner: true },
  ]);
  assert.equal(resolve("hero", "hero")?.src, "owner-wide", "the owner's wide photo takes the hero even though stock declared the role");
  assert.equal(resolve("portrait", "portrait")?.src, "stock-portrait");
  assert.equal(resolve("wide", "wide")?.src, "stock-hero", "owner-wide is spent; the next best is stock");
  assert.equal(picks.filter((p) => p.source === "owner").length, 1);
  assert.equal(buildImageResolver([]).resolve("hero", "hero"), null);
});

test("tenant business type: explicit id, then preset family, then custom", () => {
  assert.deepEqual(resolveTenantBusinessType({ business_type_id: "nail-salon" }), { typeId: "nail-salon", family: "beauty", source: "business_type_id" });
  const fromPreset = resolveTenantBusinessType({ industry_preset: "restaurant" });
  assert.equal(fromPreset.family, "dining");
  assert.equal(fromPreset.source, "industry_preset");
  assert.equal(resolveTenantBusinessType({ business_type_id: "not-a-type", industry_preset: "salon_barber" }).family, "beauty");
  assert.deepEqual(resolveTenantBusinessType(null), { typeId: "custom", family: "custom", source: "default" });
});

test("stock bytes are capped at 300 KB whatever comes in", async () => {
  // A noisy 2400×1600 image compresses badly; the cap must still hold.
  const noise = Buffer.alloc(2400 * 1600 * 3);
  let seed = 12345;
  for (let i = 0; i < noise.length; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    noise[i] = seed >>> 24;
  }
  const big = await sharp(noise, { raw: { width: 2400, height: 1600, channels: 3 } }).png().toBuffer();
  assert.ok(big.length > STOCK_MAX_BYTES, "fixture must start over the cap");
  const fitted = await fitStockBytes(big);
  assert.ok(fitted.bytes.length <= STOCK_MAX_BYTES, `got ${fitted.bytes.length}`);
  assert.ok(fitted.width <= 1600 && fitted.height <= 1600);
});

test("tag-first selection: an asset sharing the brief's facts outranks a plain-type asset; the pick is stored with page and stock id", () => {
  const { resolve, picks } = buildImageResolver(
    [
      { src: "https://x/plain.jpg", width: 1536, height: 1024, alt: { es: "a", en: "a" }, role: "hero", owner: false, level: "type", stockId: "s1", tags: {} },
      { src: "https://x/indian.jpg", width: 1536, height: 1024, alt: { es: "b", en: "b" }, role: "hero", owner: false, level: "type", stockId: "s2", tags: { cuisine: "Indian" }, direction: "service" },
    ],
    { briefTags: { cuisine: "indian" } },
  );
  const hero = resolve("hero", "hero", "home");
  assert.equal(hero?.src, "https://x/indian.jpg");
  assert.deepEqual(picks[0], { page: "home", slot: "hero", source: "stock", level: "type", src: "https://x/indian.jpg", stockId: "s2", direction: "service" });
});

test("the tenant's own generated image outranks the type pool, and assignment sources map from levels", () => {
  const { resolve } = buildImageResolver([
    { src: "https://x/pool.jpg", width: 1536, height: 1024, alt: { es: "a", en: "a" }, role: "hero", owner: false, level: "type" },
    { src: "https://x/mine.jpg", width: 1536, height: 1024, alt: { es: "b", en: "b" }, role: "hero", owner: false, level: "tenant" },
  ]);
  assert.equal(resolve("hero", "hero")?.src, "https://x/mine.jpg");
  assert.equal(assignmentSourceForLevel("tenant"), "tenant_generated");
  assert.equal(assignmentSourceForLevel("type"), "type_pool");
  assert.equal(assignmentSourceForLevel("universal"), "universal");
});

test("candidatePalettesFromHexes: at most three, each ≤ 3 swatches, demotions spelled out, nothing applied", () => {
  const base = { "color.background": "#ffffff", "color.primary": "#222222", "color.accent": "#888888" };
  const out = candidatePalettesFromHexes(base, ["#f7f7f7", "#c0392b", "#2c3e50", "#27ae60", "#ffffff"]);
  assert.ok(out.length >= 1 && out.length <= 3);
  for (const c of out) {
    assert.ok(c.swatches.length <= 3);
    assert.ok(c.primary.length === 7);
  }
  // The near-white swatch cannot be a primary on a white canvas: it is demoted, never applied as primary.
  const withWhite = candidatePalettesFromHexes(base, ["#f7f7f7"]);
  assert.equal(withWhite[0]?.primary, "#222222");
  assert.match(withWhite[0]?.demotions.join(" ") ?? "", /accent|unused/);
  assert.deepEqual(candidatePalettesFromHexes(base, ["nope"]), []);
});

test("one photo per page+slot: a slot asked twice on a page returns the same frame and records one pick (p13)", () => {
  const { resolve, picks } = buildImageResolver([
    { src: "wide-a", width: 1600, height: 900, alt: { es: "a", en: "a" }, role: "wide", owner: false, level: "universal" },
    { src: "wide-b", width: 1600, height: 900, alt: { es: "b", en: "b" }, role: "wide", owner: false, level: "universal" },
  ]);
  const first = resolve("wide", "wide", "home")?.src;
  const second = resolve("wide", "wide", "home")?.src;
  assert.equal(first, second, "the sticky story and the picture share the frame the assignment tracks");
  assert.equal(picks.filter((p) => p.page === "home" && p.slot === "wide").length, 1);
  assert.notEqual(resolve("wide", "wide", "about")?.src, first, "another page still gets an unused photo");
});
