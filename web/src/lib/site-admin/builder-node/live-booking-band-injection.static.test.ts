/**
 * TUL-1613: `render.tsx` shows a marked "Live booking" band ONLY when a caller injects
 * `renderLiveBookingBand` (so the admin bundle does not pull the public booking chain). A public
 * caller that loads the live booking data (`loadBuilderNodeDataSources`) but forgets to inject it
 * silently shows the authored fallback instead of the real booking flow. This fails when one does.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/** Callers that deliberately do NOT inject it, each with the reason. */
const NOT_INJECTED: Record<string, string> = {
  "src/lib/site-admin/builder-core/in-editor-canvas-render-data.ts": "the in-editor canvas is the admin builder: it must not bundle the public booking flow; the band shows its authored fallback there",
  "src/lib/talent-site/server/preview-my-content.server.ts": "preview / builder canvases (My content, template preview) show the authored fallback band by design",
  "src/components/home/homepage-cms-data-sources.ts": "the loader itself",
};

function files(): string[] {
  const out = execFileSync("git", ["ls-files", "src"], { cwd: process.cwd(), encoding: "utf8" });
  return out.split("\n").filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
}

test("every public caller of loadBuilderNodeDataSources injects renderLiveBookingBand", () => {
  const callers: string[] = [];
  for (const f of files()) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    if (/\bloadBuilderNodeDataSources\(/.test(src.replace(/export async function loadBuilderNodeDataSources\(/g, ""))) callers.push(f);
  }
  assert.ok(callers.length >= 6, `expected the known callers, found ${callers.join(", ")}`);
  const missing = callers.filter((f) => !(f in NOT_INJECTED) && !readFileSync(join(process.cwd(), f), "utf8").includes("renderLiveBookingBand"));
  assert.deepEqual(missing, [], "these callers load live booking data but do not inject renderLiveBookingBand");
});

test("the known public renderers inject it next to their dataSources", () => {
  for (const f of [
    "src/components/talent/site/TalentSiteFreeformRenderer.tsx",
    "src/lib/talent-site/server/render-max-site-document.tsx",
    "src/app/(public)/p/[[...slug]]/page.tsx",
    "src/app/t/[profileCode]/[pageSlug]/page.tsx",
    "src/components/home/homepage-cms-sections.tsx",
  ]) {
    assert.match(readFileSync(join(process.cwd(), f), "utf8"), /renderLiveBookingBand,/, f);
  }
});

test("render.tsx no longer imports the booking band, and the band module is the only owner of the BookPageClient import", () => {
  const render = readFileSync(join(process.cwd(), "src/lib/site-admin/builder-node/render.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(render, /live-booking-band"/);
  assert.doesNotMatch(render, /BookPageClient/);
});
