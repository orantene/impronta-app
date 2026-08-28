/**
 * tenant-fonts.test.ts — the pure model for tenant-uploaded brand fonts:
 * magic-byte sniffing, theme_json (de)serialization, @font-face emission and
 * the preload selection.
 *
 * Run: node_modules/.bin/tsx --test src/lib/site-admin/builder-node/tenant-fonts.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countTenantFontFiles,
  parseTenantFonts,
  sanitizeTenantFontFamilyName,
  serializeTenantFonts,
  sniffTenantFontFormat,
  tenantFontCssFamily,
  tenantFontFacesCss,
  tenantFontPreloadUrls,
  THEME_JSON_CUSTOM_FONTS_KEY,
  type TenantFontFamily,
} from "./tenant-fonts";
import { LEGACY_THEME_PASSTHROUGH_KEYS } from "@/lib/site-admin/tokens/legacy-passthrough";

function bytes(tag: string, flavor: number[]): Uint8Array {
  return new Uint8Array([...tag.split("").map((c) => c.charCodeAt(0)), ...flavor, 0, 0, 0, 0]);
}

// ── magic bytes ────────────────────────────────────────────────────────────

test("sniff accepts genuine woff2/woff signatures with a real sfnt flavor", () => {
  assert.equal(sniffTenantFontFormat(bytes("wOF2", [0, 1, 0, 0])), "woff2");
  assert.equal(sniffTenantFontFormat(bytes("wOFF", [0, 1, 0, 0])), "woff");
  // CFF-flavored (OTTO)
  assert.equal(sniffTenantFontFormat(bytes("wOF2", [0x4f, 0x54, 0x54, 0x4f])), "woff2");
});

test("sniff refuses everything that is not a font, whatever the name said", () => {
  // Empty / truncated
  assert.equal(sniffTenantFontFormat(new Uint8Array()), null);
  assert.equal(sniffTenantFontFormat(new Uint8Array([0x77])), null);
  // A PNG
  assert.equal(
    sniffTenantFontFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    null,
  );
  // HTML masquerading as .woff2 — the classic stored-XSS smuggle
  assert.equal(sniffTenantFontFormat(bytes("<htm", [0x6c, 0x3e, 0, 0])), null);
  // Raw TTF without the woff wrapper (we serve only web-packaged formats)
  assert.equal(sniffTenantFontFormat(new Uint8Array([0, 1, 0, 0, 0, 10, 0, 0])), null);
  // woff wrapper around a nonsense flavor
  assert.equal(sniffTenantFontFormat(bytes("wOF2", [9, 9, 9, 9])), null);
});

// ── family-name rules ──────────────────────────────────────────────────────

test("family names sanitize or refuse", () => {
  assert.equal(sanitizeTenantFontFamilyName("  Suisse   Intl "), "Suisse Intl");
  assert.equal(sanitizeTenantFontFamilyName("Neue-Haas 55"), "Neue-Haas 55");
  assert.equal(sanitizeTenantFontFamilyName('x"; } body { display:none'), null);
  assert.equal(sanitizeTenantFontFamilyName(""), null);
  assert.equal(sanitizeTenantFontFamilyName("a".repeat(65)), null);
});

// ── theme_json round trip ──────────────────────────────────────────────────

const FAMILY: TenantFontFamily = {
  family: "Suisse Intl",
  category: "sans",
  files: [
    {
      path: "tenant/t1/fonts/aa.woff2",
      url: "https://cdn.example/aa.woff2",
      format: "woff2",
      weight: 400,
      style: "normal",
      bytes: 1234,
    },
    {
      path: "tenant/t1/fonts/bb.woff2",
      url: "https://cdn.example/bb.woff2",
      format: "woff2",
      weight: [300, 800],
      style: "normal",
      bytes: 2345,
    },
  ],
};

test("serialize → parse is lossless; malformed entries are dropped not thrown", () => {
  const theme = {
    [THEME_JSON_CUSTOM_FONTS_KEY]: [
      ...(serializeTenantFonts([FAMILY]) as unknown[]),
      { family: "No Files", category: "serif", files: [] },
      { family: 42 },
      "garbage",
      null,
    ],
  };
  const parsed = parseTenantFonts(theme);
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0], FAMILY);
  assert.equal(countTenantFontFiles(parsed), 2);
  assert.deepEqual(parseTenantFonts({}), []);
  assert.deepEqual(parseTenantFonts(null), []);
  assert.deepEqual(parseTenantFonts({ [THEME_JSON_CUSTOM_FONTS_KEY]: "nope" }), []);
});

test("custom_fonts is a design-pipeline passthrough key (publish must not strip it)", () => {
  assert.ok(
    LEGACY_THEME_PASSTHROUGH_KEYS.has(THEME_JSON_CUSTOM_FONTS_KEY),
    "custom_fonts missing from LEGACY_THEME_PASSTHROUGH_KEYS — a design publish would wipe every uploaded font",
  );
});

// ── render side ────────────────────────────────────────────────────────────

test("@font-face css: swap, format hint, variable weight range descriptor", () => {
  const css = tenantFontFacesCss([FAMILY]);
  assert.match(css, /@font-face\{font-family:"Suisse Intl";src:url\("https:\/\/cdn\.example\/aa\.woff2"\) format\("woff2"\);font-weight:400;font-style:normal;font-display:swap;\}/);
  assert.match(css, /font-weight:300 800/);
});

test("the stored css family value carries a real fallback", () => {
  assert.equal(tenantFontCssFamily(FAMILY), '"Suisse Intl", system-ui, sans-serif');
  assert.match(
    tenantFontCssFamily({ ...FAMILY, category: "serif" }),
    /Georgia, serif$/,
  );
});

test("preload picks only theme-token-bound families, upright woff2 first", () => {
  const tokens = {
    "typography.heading-font-family": '"Suisse Intl", system-ui, sans-serif',
  };
  // The regular (400) file wins over the variable file when both exist.
  assert.deepEqual(tenantFontPreloadUrls([FAMILY], tokens), ["https://cdn.example/aa.woff2"]);
  // Unbound family → nothing preloads.
  assert.deepEqual(tenantFontPreloadUrls([FAMILY], { "typography.body-font-family": "Lora" }), []);
  assert.deepEqual(tenantFontPreloadUrls([FAMILY], null), []);
});
