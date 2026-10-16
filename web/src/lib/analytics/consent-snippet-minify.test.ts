/**
 * TUL-597 regression: every inline script string the app ships must survive the
 * production minifier.
 *
 * Root cause (found on prod, 2026-10-13): `ANALYTICS_ALLOWED_JS` was built as
 * `` `…${KEY}…` + `…${ATTR}…` `` and then inlined into the `ga-consent-default`
 * template. Next's SWC minifier dropped the text after the first `${…}`, so
 * every page shipped a script with `missing ) after argument list`.
 *
 * Unit-testing the constant proves nothing (the bug only exists after the
 * bundler concatenates modules and SWC folds constants). So this test bundles
 * the REAL modules with esbuild (cross-module inlining is what triggers it),
 * minifies the bundle with Next's own SWC binding, runs it, collects every
 * inline script body and requires each to parse and keep its key statements.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { build } from "esbuild";

import { ANALYTICS_ALLOWED_JS } from "./consent";
import { WEB_ROOT } from "../quality/supabase-unchecked-read";

const consentSrc = readFileSync(join(WEB_ROOT, "src/lib/analytics/consent.ts"), "utf8");
const allowedDecl = /export const ANALYTICS_ALLOWED_JS = (`[^`]*`);/.exec(consentSrc)?.[1];

test("ANALYTICS_ALLOWED_JS is valid JavaScript", () => {
  assert.doesNotThrow(() => new Function(`return ${ANALYTICS_ALLOWED_JS};`));
});

test("ANALYTICS_ALLOWED_JS stays one template literal", () => {
  assert.ok(allowedDecl, "ANALYTICS_ALLOWED_JS must be a single template literal, not `a` + `b`");
});

test("the minified consent snippet keeps the whole consent check (nested-template shape)", async () => {
  const swc = await import("next/dist/build/swc/index.js");
  await swc.loadBindings();
  const source = [
    `const CONSENT_STORAGE_KEY = "impronta_analytics_consent";`,
    `const CONSENT_REGION_ATTR = "data-consent-region";`,
    `const ANALYTICS_ALLOWED_JS = ${allowedDecl};`,
    "export function snippet(){ return `(function(){var consent=${ANALYTICS_ALLOWED_JS}?'granted':'denied';})();`; }",
  ].join("\n");
  const { code } = await swc.minify(source, { compress: true, mangle: true, module: true });
  const snippet = new Function(`${code.replace(/\bexport\s+/g, "")}\nreturn snippet();`)() as string;
  assert.match(snippet, /getItem\('impronta_analytics_consent'\);if\(s==='granted'\|\|s==='denied'\)/);
  assert.doesNotThrow(() => new Function(snippet), snippet);
});

type Snippet = { name: string; src: string };

/** Entry that renders every real inline-script producer with all inputs set. */
const ENTRY = `
import { AnalyticsScripts } from "@/components/analytics/analytics-scripts";
import { CONSENT_DEFAULT_CODE, selectTrackingForRender, TRACKING_PROVIDER_IDS } from "@/lib/site-admin/tracking";
import { ANALYTICS_ALLOWED_JS } from "@/lib/analytics/consent";
import { buildRevealArmingScript, buildScrollLaneRuntimeScript } from "@/lib/site-admin/builder-node/reveal-runtime";

function walk(node, out) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) walk(n, out); return; }
  const props = node.props || {};
  if (props.dangerouslySetInnerHTML) {
    out.push({ name: "analytics-scripts:" + props.id, src: props.dangerouslySetInnerHTML.__html });
  }
  walk(props.children, out);
}

function collect() {
  const out = [];
  walk(
    AnalyticsScripts({
      gaId: "G-TEST123456",
      gtmId: "GTM-TEST123",
      metaPixelId: "1234567890",
      tiktokPixelId: "TESTTIKTOK123",
      linkedInPartnerId: "1234567",
      tenantId: "tenant-one",
    }),
    out,
  );
  const ids = { ga4: "G-TEST123456", gtm: "GTM-TEST123", metaPixel: "1234567890", plausible: "example.com" };
  const sel = selectTrackingForRender(
    { tenantId: "t1", providers: Object.fromEntries(TRACKING_PROVIDER_IDS.map((k) => [k, ids[k]])) },
    { tenantId: "t1" },
  );
  for (const tag of sel.tags) if (tag.code) out.push({ name: "tracking:" + tag.key, src: tag.code });
  out.push({ name: "CONSENT_DEFAULT_CODE", src: CONSENT_DEFAULT_CODE });
  out.push({ name: "ANALYTICS_ALLOWED_JS", src: "return " + ANALYTICS_ALLOWED_JS + ";" });
  out.push({ name: "reveal-arming", src: buildRevealArmingScript({ threshold: 0.2, staggerMs: 80, once: true }) });
  out.push({
    name: "scroll-lane",
    src: buildScrollLaneRuntimeScript({ flag: "__f", attr: "data-x", sheetAttr: "data-y", armedCss: ".a{opacity:0}" }),
  });
  return out;
}
globalThis.__tul597Collect = collect;
`;

/** Stand-in for next/script (never called: the walker reads the element props). */
const SCRIPT_STUB = `export default function Script() { return null; }`;

/** Minimal automatic-JSX runtime so components can be called as plain functions. */
const JSX_RUNTIME_STUB = `
export const Fragment = "fragment";
export function jsx(type, props) { return { type, props }; }
export const jsxs = jsx;
export const jsxDEV = jsx;
`;

async function collectMinifiedSnippets(): Promise<Snippet[]> {
  const result = await build({
    stdin: { contents: ENTRY, resolveDir: WEB_ROOT, loader: "ts", sourcefile: "tul597-entry.ts" },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node20",
    jsx: "automatic",
    external: ["server-only"],
    alias: { "@": join(WEB_ROOT, "src") },
    plugins: [
      {
        name: "next-script-stub",
        setup(b) {
          b.onResolve({ filter: /^next\/script$/ }, () => ({ path: "next-script-stub", namespace: "stub" }));
          b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: SCRIPT_STUB, loader: "js" }));
          b.onResolve({ filter: /^react\/jsx(-dev)?-runtime$/ }, () => ({ path: "jsx-stub", namespace: "jsxstub" }));
          b.onLoad({ filter: /.*/, namespace: "jsxstub" }, () => ({ contents: JSX_RUNTIME_STUB, loader: "js" }));
        },
      },
    ],
    logLevel: "silent",
  });
  const bundled = result.outputFiles[0]?.text ?? "";
  const swc = await import("next/dist/build/swc/index.js");
  await swc.loadBindings();
  const { code } = await swc.minify(bundled, { compress: { toplevel: true, passes: 2, unused: true, inline: 3, reduce_vars: true, collapse_vars: true }, mangle: { toplevel: true }, module: true });
  new Function(code.replace(/\bexport\s*\{[^}]*\};?\s*$/m, ""))();
  return (globalThis as unknown as { __tul597Collect: () => Snippet[] }).__tul597Collect();
}

test("every inline script survives SWC minification of the bundled modules (TUL-597)", async () => {
  const snippets = await collectMinifiedSnippets();
  const names = snippets.map((s) => s.name);
  for (const expected of [
    "analytics-scripts:ga-consent-default",
    "analytics-scripts:ga-init",
    "analytics-scripts:gtm-init",
    "analytics-scripts:meta-pixel-init",
    "analytics-scripts:tiktok-pixel-init",
    "analytics-scripts:linkedin-insight-init",
    "tracking:consent-default",
    "tracking:ga4-config",
    "tracking:gtm-loader",
    "tracking:meta-pixel",
    "CONSENT_DEFAULT_CODE",
    "reveal-arming",
    "scroll-lane",
  ]) {
    assert.ok(names.includes(expected), `snippet ${expected} was not produced (got ${names.join(", ")})`);
  }
  for (const s of snippets) {
    // Entities: renderToStaticMarkup escapes `&` and `'` inside dangerouslySetInnerHTML? It does not.
    assert.doesNotThrow(() => new Function(s.src), `${s.name} must parse after minification:\n${s.src}`);
  }
  // The consent check must be whole in every snippet that embeds it.
  const wholeCheck = /getItem\('impronta_analytics_consent'\);if\(s==='granted'\|\|s==='denied'\)return s==='granted';/;
  for (const name of [
    "analytics-scripts:ga-consent-default",
    "analytics-scripts:meta-pixel-init",
    "analytics-scripts:tiktok-pixel-init",
    "analytics-scripts:linkedin-insight-init",
    "tracking:consent-default",
    "CONSENT_DEFAULT_CODE",
  ]) {
    const s = snippets.find((x) => x.name === name);
    assert.match(s?.src ?? "", wholeCheck, `${name} lost part of the consent check`);
    assert.match(s?.src ?? "", /globalPrivacyControl!==true/, `${name} lost the GPC check`);
  }
  assert.match(snippets.find((x) => x.name === "analytics-scripts:ga-init")?.src ?? "", /G-TEST123456/);
  assert.match(snippets.find((x) => x.name === "analytics-scripts:gtm-init")?.src ?? "", /GTM-TEST123/);
  assert.match(snippets.find((x) => x.name === "analytics-scripts:meta-pixel-init")?.src ?? "", /fbq\('init','1234567890'\)/);
});
