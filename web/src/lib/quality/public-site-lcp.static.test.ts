/**
 * TUL-590: cheap real-user vitals + the obvious LCP guard for the default hero.
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
  assert.doesNotMatch(src, /location|href|pathname/, "no URL in the metric attributes");
});

test("static hero background image is preloaded with high fetch priority", () => {
  const src = read("lib/site-admin/sections/hero/Component.tsx");
  assert.match(src, /<link rel="preload" as="image" href=\{bgUrl\} fetchPriority="high" \/>/);
});
