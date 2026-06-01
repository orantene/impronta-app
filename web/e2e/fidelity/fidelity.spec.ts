import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { fidelityDesigns } from "../../scripts/fidelity/designs";
import { FIDELITY_BREAKPOINTS } from "../../scripts/fidelity/html";

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
