import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { fidelityDesigns } from "../../scripts/fidelity/designs";
import { FIDELITY_BREAKPOINTS } from "../../scripts/fidelity/html";
import { applyMotionState, FIDELITY_MOTION_FRAMES } from "../../scripts/fidelity/motion";

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

function buildHtmlInRendererProcess(designId: string): string {
  return execFileSync("npx", ["tsx", "scripts/fidelity/render-html.ts", designId], {
    cwd: process.cwd(),
    encoding: "utf8",
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
        await page.setContent(buildHtmlInRendererProcess(design.id), { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);

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

// Motion-state goldens. These convert two previously-unscoreable axes into
// measured ones: `scrolled` proves sticky headers + backdrop-filter glass OVER
// real scrolled content, and `reveal` proves a scroll-driven entrance animation
// settles to its end state. They run with reduced-motion OFF (so the animation
// exists to be fast-forwarded) and are clipped to the viewport at a scroll/hover
// state, unlike the full-page static frames. Sub-pixel AA drift across machines
// is absorbed by a tight `maxDiffPixels`; a hard regression still fails.
test.describe("fidelity: motion", () => {
  test.use({ reducedMotion: "no-preference" });
  for (const frame of FIDELITY_MOTION_FRAMES) {
    test(`${frame.design} ${frame.state} ${frame.width}px`, async ({ page, browserName }) => {
      // Motion goldens are chromium-pinned. WebKit's backdrop-filter compositing
      // and scroll-timeline support diverge enough that a shared golden would be
      // noise, not signal; the cross-engine (webkit) project covers the static
      // frames instead. Seed a webkit motion golden intentionally before lifting.
      test.skip(browserName !== "chromium", "motion goldens are chromium-pinned");
      await page.setViewportSize({ width: frame.width, height: frame.height });
      await page.setContent(buildHtmlInRendererProcess(frame.design), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await applyMotionState(page, frame.state);

      await expect(page).toHaveScreenshot(`${frame.design}-${frame.width}-${frame.state}.png`, {
        clip: { x: 0, y: 0, width: frame.width, height: frame.height },
        animations: "disabled",
        maxDiffPixels: 250,
      });
    });
  }
});
