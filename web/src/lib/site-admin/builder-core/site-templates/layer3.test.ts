/**
 * Layer 3 unit tests: the image resolver's owner-first rule, the tenant
 * business-type resolver, and the stock byte cap (sharp, in-process).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import sharp from "sharp";

import { fitStockBytes, STOCK_MAX_BYTES } from "@/lib/media/platform-stock-admin.server";

import { buildImageResolver } from "./image-resolver";
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
