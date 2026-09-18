/** Screenshot helper: full-page capture of a composed site (dev host, path-addressed). Opt-in via SHOT_SLUG. */
import { test } from "@playwright/test";
test.skip(!process.env.SHOT_SLUG, "SHOT_SLUG=<slug> SHOT_OUT=<png>");
test.use({ viewport: { width: 1440, height: 900 } });
test("shot", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto(`http://localhost:3008/w/${process.env.SHOT_SLUG}`, { timeout: 240_000, waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 90_000 }).catch(() => {});
  // Scroll-reveals fire on intersection: walk the page before the capture.
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: process.env.SHOT_OUT!, fullPage: true });
});
