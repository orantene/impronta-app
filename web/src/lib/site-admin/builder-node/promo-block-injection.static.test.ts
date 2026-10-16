/**
 * TUL-1178 step 2: the promo renderer is injected, not imported, so the builder canvas does not
 * bundle it. These tests pin the three facts that make that safe:
 *   1. render.tsx (shared with the browser canvas) never imports the promo renderer or the
 *      modules only it uses (picker, copy, CSS, client island);
 *   2. only allow-listed SERVER files import them;
 *   3. every server path that holds promo data injects the real renderer, so the live site
 *      keeps rendering promos. A new data-bearing caller fails here until it injects.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(process.cwd(), "src");
const norm = (p: string) => p.split("\\").join("/");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}
const FILES = walk(SRC);
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
const isTest = (f: string) => /\.test\.(ts|tsx)$/.test(f);

/** Files (relative to src, not tests) with a RUNTIME import whose specifier matches `re`. */
function runtimeImporters(re: RegExp): string[] {
  const hits: string[] = [];
  for (const f of FILES) {
    if (isTest(f)) continue;
    const src = readFileSync(f, "utf8");
    // `import type ...` is erased at build, so it does not count.
    for (const m of src.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gms)) {
      if (re.test(m[1])) {
        hits.push(norm(relative(SRC, f)));
        break;
      }
    }
  }
  return hits.sort();
}

test("TUL-1178: render.tsx does not import the promo renderer or its private modules", () => {
  const src = read("lib/site-admin/builder-node/render.tsx");
  assert.doesNotMatch(src, /from\s+["']\.\/promo-block["']/);
  assert.doesNotMatch(src, /from\s+["']@\/components\/promos\//);
  assert.doesNotMatch(src, /from\s+["']@\/lib\/promos\/widgets\/(model|copy)["']/);
  assert.match(src, /from\s+["']\.\/promo-block-fallback["']/);
});

test("TUL-1178: the fallback module has no runtime import from the promo modules", () => {
  const src = read("lib/site-admin/builder-node/promo-block-fallback.tsx");
  for (const m of src.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gms)) {
    assert.doesNotMatch(m[1], /promos\//, `runtime import ${m[1]} would pull the promo code back into the canvas`);
  }
});

test("TUL-1178: only allow-listed server files import the promo renderer", () => {
  assert.deepEqual(runtimeImporters(/(^|\/)promo-block$/), [
    "components/talent/site/TalentSiteFreeformRenderer.tsx",
    "lib/talent-site/server/render-max-site-document.tsx",
  ]);
});

test("TUL-1178: only the promo block imports the picker, copy, CSS and client island", () => {
  // Alias imports only (siblings import each other by relative path, which cannot reach the canvas).
  assert.deepEqual(runtimeImporters(/promos\/widgets\/(model|copy)$/), [
    "components/promos/widgets/promo-widget-client.ts",
    "components/promos/widgets/promo-widget.tsx",
    "lib/site-admin/builder-node/promo-block.tsx",
  ]);
  assert.deepEqual(runtimeImporters(/promos\/widgets\/promo-widget(-css|-client)?$/), [
    "lib/site-admin/builder-node/promo-block.tsx",
  ]);
});

test("TUL-1178: every server path that produces promo data is accounted for and injects the renderer", () => {
  // The only two producers of `dataSources.promoWidgets` (loadPromoWidgetData callers).
  assert.deepEqual(runtimeImporters(/promos\/widgets\/load\.server$/), [
    "lib/talent-site/server/preview-my-content.server.ts",
    "lib/talent-site/server/render-max-site-document.tsx",
  ]);
  // The live site renders directly: every render call that passes renderSectionEmbed also injects.
  const live = read("lib/talent-site/server/render-max-site-document.tsx");
  const embedCalls = live.match(/^\s+renderSectionEmbed,$/gm)?.length ?? 0;
  const injected = live.match(/^\s+renderPromoBlock,$/gm)?.length ?? 0;
  assert.ok(embedCalls >= 5, "expected the five render calls in the live site document");
  assert.equal(injected, embedCalls, "each live-site render call must inject renderPromoBlock");
  // The My content preview only prepares data; its consumer renders through TalentSiteFreeformRenderer.
  assert.match(read("components/talent/site/TalentSiteFreeformRenderer.tsx"), /^\s+renderPromoBlock,$/m);
  const consumers = FILES.filter((f) => !isTest(f) && /prepareMyContentPreview/.test(readFileSync(f, "utf8")))
    .map((f) => norm(relative(SRC, f)))
    .sort();
  assert.deepEqual(consumers, [
    "app/template-preview/[key]/theme-preview.tsx",
    "lib/talent-site/server/preview-my-content.server.ts",
  ]);
});
