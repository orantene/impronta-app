/**
 * TUL-590 — cheap real-user vitals + obvious LCP guards for talent sites.
 * Static source checks only (no server, no build).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("web vitals reporter ships a sampled metric to Sentry (not a client console log)", () => {
  const src = read("components/web-vitals-reporter.tsx");
  assert.match(src, /Sentry\.metrics\.distribution/);
  const m = src.match(/SAMPLE_RATE\s*=\s*([0-9.]+)/);
  assert.ok(m, "SAMPLE_RATE constant is required");
  assert.ok(Number(m[1]) > 0 && Number(m[1]) <= 0.1, "sample rate must be <= 10%");
  assert.doesNotMatch(src, /improntaLog/);
});

test("static hero background image is preloaded with high fetch priority", () => {
  const src = read("lib/site-admin/sections/hero/Component.tsx");
  assert.match(src, /rel="preload"[\s\S]{0,80}as="image"|as="image"[\s\S]{0,80}rel="preload"/);
  assert.match(src, /fetchPriority="high"/);
});

test("hero_split above-the-fold image has fetchPriority high", () => {
  const src = read("lib/site-admin/sections/hero_split/Component.tsx");
  assert.match(src, /loading="eager"[\s\S]{0,60}fetchPriority="high"/);
});

test("first body section gets aboveFold; media is eager only then (TUL-590 follow-up)", () => {
  const types = read("lib/site-admin/sections/types.ts");
  assert.match(types, /aboveFold\?: boolean/);
  assert.match(read("components/talent/site/TalentSiteRenderer.tsx"), /aboveFold=\{index === 0\}/);
  assert.match(read("components/home/homepage-cms-sections.tsx"), /aboveFold=\{entryIndex === 0\}/);
  const split = read("lib/site-admin/sections/split_screen/Component.tsx");
  assert.match(split, /loading=\{aboveFold \? "eager" : "lazy"\}/);
  assert.match(split, /fetchPriority=\{aboveFold \? "high" : undefined\}/);
  const prim = read("lib/site-admin/sections/shared/section-primitives/index.tsx");
  assert.match(prim, /loading=\{eager \? "eager" : "lazy"\}/);
  assert.match(prim, /eager = false/);
  assert.match(read("lib/site-admin/sections/editorial_split_hero/Component.tsx"), /eager=\{aboveFold\}/);
});

test("slider hero preloads only slide 1", () => {
  const src = read("lib/site-admin/sections/hero/Component.tsx");
  assert.match(src, /slides\[0\]\?\.backgroundImageUrl/);
  assert.equal((src.match(/rel="preload"/g) ?? []).length, 2, "static + slider slide 1 only");
});
