import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { fidelityDesigns } from "../../scripts/fidelity/designs";
import { FIDELITY_BREAKPOINTS } from "../../scripts/fidelity/html";

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
