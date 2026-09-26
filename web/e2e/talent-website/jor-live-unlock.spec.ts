/**
 * W20 / W23 — Jor Beauty live site never shows "Unlock your free website".
 *
 * Read-only against production (or JOR_LIVE_ORIGIN). Does not sign in, does
 * not mutate. Owner ruling: Jor stays on her hand-built page for this build.
 *
 * Gate: JOR_LIVE_CHECK=1 (default on when PLAYWRIGHT_BASE_URL is production
 * tulala; otherwise set explicitly).
 */
import { expect, test } from "@playwright/test";

import {
  assertNeverUnlockCopy,
  JOR_PROFILE_CODE,
  JOR_PUBLIC_ORIGIN,
  JOR_SITE_SLUG,
} from "./helpers";

const RUN =
  process.env.JOR_LIVE_CHECK === "1" ||
  /tulala\.digital$/i.test(process.env.PLAYWRIGHT_BASE_URL ?? "");

test.describe("Jor Beauty live — never Unlock (W20)", () => {
  test.skip(!RUN, "set JOR_LIVE_CHECK=1 to hit the live Jor surfaces read-only");

  test.use({
    // Public GETs — no auth storage; do not reuse talent-website setup cookies.
    storageState: { cookies: [], origins: [] },
  });

  test("public profile page has no Unlock chrome", async ({ page }) => {
    const url = `${JOR_PUBLIC_ORIGIN}/t/${JOR_PROFILE_CODE}`;
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    expect(res?.ok() || res?.status() === 304, `GET ${url}`).toBeTruthy();
    await assertNeverUnlockCopy(page);
  });

  test("published site path has no Unlock chrome", async ({ page }) => {
    const url = `${JOR_PUBLIC_ORIGIN}/t/site/${JOR_SITE_SLUG}`;
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    // 200 or redirect to subdomain are both acceptable live shapes.
    expect(res?.status(), `GET ${url}`).toBeLessThan(500);
    await assertNeverUnlockCopy(page);
  });

  test("book-jorgelina subdomain has no Unlock chrome", async ({ page }) => {
    const url = `https://${JOR_SITE_SLUG}.tulala.digital/`;
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    expect(res?.status(), `GET ${url}`).toBeLessThan(500);
    await assertNeverUnlockCopy(page);
  });
});
