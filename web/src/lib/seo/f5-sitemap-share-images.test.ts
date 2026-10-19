/**
 * F5 (TUL-1273 #8): sitemap and URL hygiene, share images WhatsApp shows,
 * image srcset, and the public image budget.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { cleanSitemapEntries, canonicalSitemapUrl, SITEMAP_MAX_URLS } from "./sitemap-hygiene";
import {
  SHARE_IMAGE,
  isOptimizableImageUrl,
  optimizedSrcSet,
  shareImageUrl,
  shareImageWithinBudget,
} from "./share-image";
import { findBudgetViolations, MAX_BYTES } from "../../../scripts/ci/check-public-asset-budget.mjs";

const WEB = path.resolve(__dirname, "../../..");
const SUPA = "https://abc.supabase.co";

// ─── sitemap hygiene ──────────────────────────────────────────────────────────

test("canonical URL: no query, no fragment, no trailing slash, root keeps its slash", () => {
  assert.equal(canonicalSitemapUrl("https://x.test/pricing/?utm=1#top")?.url, "https://x.test/pricing");
  assert.equal(canonicalSitemapUrl("https://x.test")?.url, "https://x.test/");
  assert.equal(canonicalSitemapUrl("https://x.test//a//b/")?.url, "https://x.test/a/b");
  assert.equal(canonicalSitemapUrl("mailto:a@b.test"), null);
  assert.equal(canonicalSitemapUrl("/relative"), null);
});

test("hygiene: duplicates collapse, newest date and all languages survive", () => {
  const { entries, report } = cleanSitemapEntries([
    { url: "https://x.test/pricing", lastModified: new Date("2026-01-01"), alternates: { languages: { en: "https://x.test/pricing" } } },
    { url: "https://x.test/pricing/", lastModified: new Date("2026-03-01"), alternates: { languages: { es: "https://x.test/es/pricing/" } } },
    { url: "https://x.test/pricing?ref=a" },
  ]);
  assert.equal(entries.length, 1);
  assert.equal(report.merged, 2);
  assert.equal(new Date(entries[0].lastModified as Date).toISOString().slice(0, 10), "2026-03-01");
  assert.deepEqual(entries[0].alternates?.languages, { en: "https://x.test/pricing", es: "https://x.test/es/pricing" });
});

test("hygiene: private surfaces and bad URLs are never listed", () => {
  const { entries, report } = cleanSitemapEntries([
    { url: "https://x.test/directory" },
    { url: "https://x.test/api/health" },
    { url: "https://x.test/login" },
    { url: "https://x.test/talent/inbox" },
    { url: "https://x.test/review/abc" },
    { url: "https://x.test/talents-we-love" },
    { url: "not a url" },
  ]);
  assert.deepEqual(entries.map((e) => e.url), ["https://x.test/directory", "https://x.test/talents-we-love"]);
  assert.equal(report.droppedPrivate, 4);
  assert.equal(report.droppedInvalid, 1);
});

test("hygiene: capped at the protocol limit and reports the cut", () => {
  const many = Array.from({ length: SITEMAP_MAX_URLS + 5 }, (_, i) => ({ url: `https://x.test/p/${i}` }));
  const { entries, report } = cleanSitemapEntries(many);
  assert.equal(entries.length, SITEMAP_MAX_URLS);
  assert.equal(report.truncated, 5);
});

test("the sitemap route runs every sitemap through the hygiene pass", () => {
  const src = fs.readFileSync(path.join(WEB, "src/app/sitemap.ts"), "utf8");
  assert.match(src, /cleanSitemapEntries\(await buildSitemap\(\)\)/);
});

// ─── share images ─────────────────────────────────────────────────────────────

test("share size is the WhatsApp card: 1200x630 under 300 KB", () => {
  assert.equal(SHARE_IMAGE.width, 1200);
  assert.equal(SHARE_IMAGE.height, 630);
  assert.equal(SHARE_IMAGE.maxBytes, 300 * 1024);
  assert.equal(shareImageWithinBudget(120 * 1024), true);
  assert.equal(shareImageWithinBudget(301 * 1024), false);
  assert.equal(shareImageWithinBudget(0), false);
});

test("a storage photo is shared through the optimizer at 1200 px; foreign hosts and cards are left alone", () => {
  const photo = `${SUPA}/storage/v1/object/public/media/a.jpg`;
  const out = shareImageUrl(photo, "https://shop.test/", SUPA);
  assert.equal(out, `https://shop.test/_next/image?url=${encodeURIComponent(photo)}&w=1200&q=75`);
  assert.equal(shareImageUrl("https://evil.example/a.jpg", "https://shop.test", SUPA), "https://evil.example/a.jpg");
  assert.equal(shareImageUrl(`${SUPA}/storage/v1/object/public/m/a.svg`, "https://shop.test", SUPA), `${SUPA}/storage/v1/object/public/m/a.svg`);
  assert.equal(shareImageUrl(out, "https://shop.test", SUPA), out);
  assert.equal(isOptimizableImageUrl(`${SUPA}/rest/v1/x.jpg`, SUPA), false);
});

test("public metadata uses the share-image helper", () => {
  const src = fs.readFileSync(path.join(WEB, "src/lib/seo/public-metadata.ts"), "utf8");
  assert.match(src, /shareImageUrl\(shareImageAbsolute/);
});

// ─── srcset ───────────────────────────────────────────────────────────────────

test("srcset: every width, optimizable sources only", () => {
  const photo = `${SUPA}/storage/v1/object/public/media/a.jpg`;
  const set = optimizedSrcSet(photo, undefined, SUPA);
  assert.ok(set);
  assert.equal(set.split(", ").length, 5);
  assert.match(set, /w=480&q=75 480w/);
  assert.match(set, /w=1920&q=75 1920w/);
  assert.ok(optimizedSrcSet("/brand/logo.png", [640], SUPA)?.startsWith("/_next/image?url=%2Fbrand%2Flogo.png&w=640"));
  assert.equal(optimizedSrcSet("data:image/png;base64,AAAA", undefined, SUPA), null);
  assert.equal(optimizedSrcSet("https://evil.example/a.jpg", undefined, SUPA), null);
});

// ─── public image budget ──────────────────────────────────────────────────────

test("budget: a new heavy image fails, a frozen one passes, growth fails", () => {
  const KB = 1024;
  const files = [
    { path: "marketing/new.jpg", bytes: 400 * KB },
    { path: "marketing/old.jpg", bytes: 500 * KB },
    { path: "marketing/grew.png", bytes: 600 * KB },
    { path: "marketing/small.jpg", bytes: 90 * KB },
    { path: "marketing/data.json", bytes: 900 * KB },
  ];
  const bad = findBudgetViolations(files, { "marketing/old.jpg": 500 * KB, "marketing/grew.png": 550 * KB });
  assert.deepEqual(bad.map((b: { path: string; reason: string }) => `${b.path}:${b.reason}`), [
    "marketing/grew.png:grew",
    "marketing/new.jpg:new-heavy",
  ]);
  assert.equal(MAX_BYTES, SHARE_IMAGE.maxBytes);
});

test("budget: the committed baseline matches the tree, and CI runs the gate", () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(WEB, "scripts/ci/public-asset-budget.baseline.json"), "utf8"));
  for (const [rel, bytes] of Object.entries(baseline) as Array<[string, number]>) {
    const stat = fs.statSync(path.join(WEB, "public", rel));
    assert.ok(stat.size <= bytes, `${rel} grew past its baseline`);
  }
  const ci = fs.readFileSync(path.join(WEB, "../.github/workflows/ci.yml"), "utf8");
  assert.match(ci, /node scripts\/ci\/check-public-asset-budget\.mjs/);
});
