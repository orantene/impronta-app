import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { INDUSTRY_PRESETS } from "@/lib/words/presets";
import { resolveHomeFooterTagline, resolvePublicBrandName } from "./public-brand";

const AGENCY_LINE = "Agency-managed discovery and representation";
const agency = INDUSTRY_PRESETS.find((p) => p.id === "agency")!;
const restaurant = INDUSTRY_PRESETS.find((p) => p.id === "restaurant")!;
const base = {
  footerTagline: null,
  tagline: null,
  identityPublicName: null,
  preset: agency,
  businessDescription: null,
  agencyLine: AGENCY_LINE,
};

test("header brand uses the workspace name when there is no identity row", () => {
  assert.equal(resolvePublicBrandName(null, "QA Grok Workspace"), "QA Grok Workspace");
  assert.equal(resolvePublicBrandName("  ", " QA Grok Workspace "), "QA Grok Workspace");
  assert.equal(resolvePublicBrandName("Impronta", "x"), "Impronta");
  assert.equal(resolvePublicBrandName(null, null), null);
});

test("an unconfigured workspace never claims to be agency-managed", () => {
  assert.equal(resolveHomeFooterTagline(base), "");
  assert.equal(resolveHomeFooterTagline({ ...base, preset: null }), "");
});

test("a business preset never shows the agency sentence", () => {
  const out = resolveHomeFooterTagline({
    ...base,
    preset: restaurant,
    identityPublicName: "El Paisa",
  });
  assert.doesNotMatch(out, /Agency-managed/);
});

test("a named agency keeps the agency sentence; operator lines still win", () => {
  assert.equal(resolveHomeFooterTagline({ ...base, identityPublicName: "Impronta" }), AGENCY_LINE);
  assert.equal(
    resolveHomeFooterTagline({ ...base, identityPublicName: "Impronta", footerTagline: "Ours" }),
    "Ours",
  );
});

const root = path.resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

test("header and storefront resolve the brand through the workspace name", () => {
  for (const f of ["src/components/public-header.tsx", "src/components/home/agency-home-storefront.tsx"]) {
    const src = read(f);
    assert.match(src, /resolvePublicBrandName/, f);
    assert.doesNotMatch(src, /identity\?\.public_name\?\.trim\(\) \|\| PLATFORM_BRAND\.name/, f);
  }
  assert.match(read("src/components/home/agency-home-storefront.tsx"), /resolveHomeFooterTagline/);
});

/** OKLab lightness of an sRGB hex, to check the CSS contrast formula's threshold. */
function oklabL(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  const [r, g, b] = c;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

test("hero primary CTA text flips on the brand colour instead of a fixed dark ink", () => {
  const src = read("src/lib/site-admin/builder-node/render.tsx");
  const rule = src.match(/\.site-bn-hero__btn--primary\{[^}]*\}/)?.[0] ?? "";
  assert.match(rule, /oklch\(from var\(--token-color-primary/, "ink must derive from the primary token");
  const threshold = Number(rule.match(/clamp\(0,\(([\d.]+)\s*-\s*l\)/)?.[1]);
  const textOn = (hex: string) => (oklabL(hex) < threshold ? "white" : "dark");
  assert.equal(textOn("#171717"), "white");
  assert.equal(textOn("#c6a14e"), "dark");
});
