import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { fidelityDesigns } from "../../scripts/fidelity/designs";
import { FIDELITY_BREAKPOINTS } from "../../scripts/fidelity/html";
import {
  applyMotionState,
  fidelityMotionFrameKey,
  FIDELITY_MOTION_FRAMES,
} from "../../scripts/fidelity/motion";
import {
  fidelityHtmlUrl,
  startFidelityServer,
  type FidelityServer,
} from "../../scripts/fidelity/server";

// FIX: no retries for fidelity tests — a flaky 1-pixel diff must be
// investigated, not silently retried to green. This overrides the global
// `retries:1` in playwright.config.ts for this suite only.
test.describe.configure({ retries: 0 });

// FIX: render with prefers-reduced-motion so entrance-animated elements
// settle to their final visible state instead of being captured at the
// animation `from` frame (opacity:0). The BUILDER_NODE_RENDERER_CSS guard
// (.site-builder-node[style*="animation"]{animation:none!important}) fires
// under this media query, which removes the animation entirely and leaves
// elements at their natural visible style. `animations:"disabled"` alone
// freezes CSS animations at their `from` keyframe (t=0), causing
// scroll-reveal sections to be captured invisible — the golden then
// baselines that invisible state and can never catch a regression.
test.use({ reducedMotion: "reduce" });

// The rebuilt designs reference REAL photos as root-relative `/marketing/…`
// srcs and self-hosted bundled woff2. NEITHER loads under `page.setContent`
// (origin `about:blank`): the renderer's image guard drops `data:`/`file:` (so
// a `data:` SVG renders nothing), and a relative font URL can't resolve. So,
// exactly like `capture.ts`, this suite serves `web/public` + the bundled fonts
// + the generated HTML over a localhost static server and navigates via http.
// Offline, deterministic, and the renderer guard is never loosened.
const SCRIPTS_DIR = resolve(process.cwd(), "scripts/fidelity");
const OUTPUT_ROOT = resolve(process.cwd(), "fidelity");
const PUBLIC_DIR = resolve(process.cwd(), "public");
const FONTS_DIR = join(SCRIPTS_DIR, "fonts");

let server: FidelityServer;

test.beforeAll(async () => {
  server = await startFidelityServer({
    publicDir: PUBLIC_DIR,
    outputDir: OUTPUT_ROOT,
    fontsDir: FONTS_DIR,
  });
});

test.afterAll(async () => {
  await server?.close();
});

/** Render a design's HTML in the renderer's own process (the bundled-font base
 * URL points at the running server so the woff2 load over http). */
function buildHtmlInRendererProcess(designId: string): string {
  return execFileSync(
    "npx",
    ["tsx", "scripts/fidelity/render-html.ts", designId, server.fontsBaseUrl],
    { cwd: process.cwd(), encoding: "utf8" },
  );
}

/** Write the HTML under the served output dir and navigate to it over http so
 * root-relative photos + bundled woff2 resolve; then settle fonts + images. */
async function loadServedDesign(page: Page, designId: string, artifact: string): Promise<void> {
  const html = buildHtmlInRendererProcess(designId);
  const htmlPath = join(OUTPUT_ROOT, designId, `${designId}-${artifact}.html`);
  mkdirSync(dirname(htmlPath), { recursive: true });
  writeFileSync(htmlPath, html, "utf8");
  await page.goto(fidelityHtmlUrl(server.origin, OUTPUT_ROOT, htmlPath), {
    waitUntil: "networkidle",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) => img.decode().catch(() => undefined)),
    );
  });
}

for (const design of fidelityDesigns) {
  test.describe(`fidelity: ${design.id}`, () => {
    for (const breakpoint of FIDELITY_BREAKPOINTS) {
      test(`${breakpoint.name} ${breakpoint.width}px`, async ({ page }) => {
        await page.setViewportSize({
          width: breakpoint.width,
          height: breakpoint.height,
        });
        await loadServedDesign(page, design.id, String(breakpoint.width));

        await expect(page).toHaveScreenshot(
          `${design.id}-${breakpoint.name}.png`,
          {
            fullPage: true,
            animations: "disabled",
          },
        );
      });
    }
  });
}

// Motion-state goldens. These convert previously-unscoreable axes into measured
// ones: `scrolled` proves sticky headers + backdrop-filter glass OVER real
// scrolled content, `reveal` proves a scroll-driven entrance animation settles
// to its end state, and `hover` proves the hover/transition system produces a
// real state change. They run with reduced-motion OFF (so the animation exists
// to be fast-forwarded) and are clipped to the viewport at a scroll/hover state,
// unlike the full-page static frames. Sub-pixel AA drift across machines is
// absorbed by a tight `maxDiffPixels`; a hard regression still fails.
test.describe("fidelity: motion", () => {
  test.use({ reducedMotion: "no-preference" });
  for (const frame of FIDELITY_MOTION_FRAMES) {
    const frameKey = fidelityMotionFrameKey(frame);
    test(`${frame.design} ${frameKey} ${frame.width}px`, async ({ page, browserName }) => {
      // Motion goldens are chromium-pinned. WebKit's backdrop-filter compositing
      // and scroll-timeline support diverge enough that a shared golden would be
      // noise, not signal; the cross-engine (webkit) project covers the static
      // frames instead. Seed a webkit motion golden intentionally before lifting.
      test.skip(browserName !== "chromium", "motion goldens are chromium-pinned");
      await page.setViewportSize({ width: frame.width, height: frame.height });
      await loadServedDesign(page, frame.design, `${frame.width}-${frameKey}`);
      await applyMotionState(page, frame.state, { targetSelector: frame.targetSelector });

      await expect(page).toHaveScreenshot(`${frame.design}-${frame.width}-${frameKey}.png`, {
        clip: { x: 0, y: 0, width: frame.width, height: frame.height },
        animations: "disabled",
        maxDiffPixels: 250,
      });
    });
  }
});
