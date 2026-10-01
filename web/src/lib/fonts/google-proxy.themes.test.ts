/**
 * Font proxy x theme fonts: every family and weight the designs and the theme
 * drawer can request must pass through the same-origin proxy (so no visitor
 * browser contacts Google) and every proxied request must rebuild to a valid
 * upstream URL. A family the proxy rejects falls back to the Google URL, so a
 * silent miss here is a privacy regression, not a broken theme: this test makes
 * it loud.
 *
 * Run: node_modules/.bin/tsx --test src/lib/fonts/google-proxy.themes.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildUpstreamCssUrl,
  rewriteFontCss,
  toFontProxyHref,
} from "./google-proxy";
import {
  buildGoogleFontsHrefFromUsage,
  getGoogleFontMeta,
  loadGoogleFontsCatalog,
  THEME_TOKEN_FONT_WEIGHTS,
} from "@/lib/site-admin/builder-node/fonts-catalog";
import { firstFontFamily, resolveBuilderFont } from "@/lib/site-admin/builder-node/fonts-registry";
import { GALLERY_DESIGNS } from "@/lib/talent-site/theme-catalog/gallery-meta";

const ALL_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

function assertProxied(href: string | null, label: string) {
  assert.ok(href, `${label}: no href built`);
  const proxied = toFontProxyHref(href);
  assert.ok(proxied.startsWith("/api/fonts/css?"), `${label}: not proxied (${href})`);
  const upstream = buildUpstreamCssUrl(proxied.split("?")[1]);
  assert.ok(upstream, `${label}: proxy rejects its own href`);
  // The rebuilt upstream must carry the same family/axis tuples we asked for.
  const want = href.split("?")[1].split("&").filter((p) => p.startsWith("family="));
  for (const p of want) assert.ok(upstream.includes(p), `${label}: lost ${p}`);
}

test("every gallery design heading/body family resolves through the proxy at theme-token weights", () => {
  let checked = 0;
  for (const d of GALLERY_DESIGNS) {
    if (!d.fonts) continue;
    for (const slot of ["heading", "body"] as const) {
      const value = d.fonts[slot];
      const family = firstFontFamily(value);
      assert.ok(family, `${d.slug}.${slot}: no family in "${value}"`);
      const bundled = resolveBuilderFont(family)?.source === "bundled";
      if (bundled) continue;
      assert.ok(getGoogleFontMeta(family), `${d.slug}.${slot}: "${family}" is not in the catalogue`);
      for (const italic of [false, true]) {
        const href = buildGoogleFontsHrefFromUsage([
          { value, weights: THEME_TOKEN_FONT_WEIGHTS, italic },
        ]);
        assertProxied(href, `${d.slug}.${slot} italic=${italic}`);
      }
      checked += 1;
    }
  }
  assert.ok(checked > 0, "no gallery design declares fonts");
});

test("every catalogue family resolves at every weight, with and without italics", () => {
  const families = loadGoogleFontsCatalog();
  assert.ok(families.length > 100);
  for (const meta of families) {
    for (const italic of [false, true]) {
      const href = buildGoogleFontsHrefFromUsage([
        { value: meta.family, weights: ALL_WEIGHTS, italic },
      ]);
      if (resolveBuilderFont(meta.family)?.source === "bundled") continue;
      assertProxied(href, `${meta.family} italic=${italic}`);
    }
  }
});

test("a heading + body pair with a header-nav font stays one proxied request", () => {
  const href = buildGoogleFontsHrefFromUsage([
    { value: '"Bodoni Moda", Didot, serif', weights: THEME_TOKEN_FONT_WEIGHTS, italic: true },
    { value: '"Figtree", system-ui, sans-serif', weights: THEME_TOKEN_FONT_WEIGHTS },
    { value: "Instrument Serif, Didot, Georgia, serif", weights: THEME_TOKEN_FONT_WEIGHTS },
  ]);
  assertProxied(href, "maison+folio mix");
});

test("rewritten css never leaves a gstatic host behind", () => {
  const css = "@font-face{src:url(https://fonts.gstatic.com/s/figtree/v9/a.woff2)} @font-face{src:url(https://fonts.gstatic.com/s/bodonimoda/v1/b.woff2)}";
  assert.ok(!rewriteFontCss(css).includes("gstatic"));
});

test("proxy accepts a percent-encoded query (what the route sees behind the proxy layer)", () => {
  const plain = "family=Instrument+Serif:ital,wght@0,400;1,400&family=Archivo+Narrow:wght@400..700&display=swap";
  const encoded = plain.replace(/:/g, "%3A").replace(/@/g, "%40").replace(/;/g, "%3B").replace(/,/g, "%2C");
  assert.ok(buildUpstreamCssUrl(plain));
  assert.equal(buildUpstreamCssUrl(encoded), buildUpstreamCssUrl(plain));
});

test("GoogleFontsLink output for folio / maison-v2 / gridline is a proxy URL the proxy accepts", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const React = await import("react");
  const { GoogleFontsLink } = await import("@/app/google-fonts-link");
  for (const slug of ["folio", "maison-v2", "gridline"]) {
    const fonts = GALLERY_DESIGNS.find((d) => d.slug === slug)?.fonts;
    assert.ok(fonts, `${slug}: no gallery fonts`);
    const tokens: Record<string, string> = {
      "typography.heading-font-family": fonts.heading,
      "typography.body-font-family": fonts.body,
    };
    const html = renderToStaticMarkup(React.createElement(GoogleFontsLink, { tokens }));
    const m = html.match(/href="([^"]+)"/);
    assert.ok(m, `${slug}: no font link rendered`);
    const href = m[1].replace(/&amp;/g, "&");
    assert.ok(href.startsWith("/api/fonts/css?"), `${slug}: not proxied: ${href}`);
    assert.ok(buildUpstreamCssUrl(href.split("?")[1]), `${slug}: proxy rejects ${href}`);
  }
});
