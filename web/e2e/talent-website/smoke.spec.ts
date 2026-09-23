/**
 * Talent website — local smoke journey (Phase Q).
 *
 * The minimum proof that the whole hermetic loop works: a database built from
 * `supabase/ci/*` with no production credentials, seeded by
 * `e2e/talent-website/seed.ts`, serving real pages through the real proxy.
 *
 * What it asserts:
 *   1. `t_max`'s published site answers 200 on its own custom domain and shows
 *      the talent's display name — the `kind: "talent_site"` host resolution
 *      (`talent_site_domain_lookup`) + `/_talent-site` rewrite + Max gate.
 *   2. `/t/<profile_code>` answers 200 on the app host — the canonical talent
 *      discovery profile.
 *
 * Hosts: the talent custom domain must reach the dev server by NAME (the proxy
 * gates on `Host`, and a browser will not let a test forge that header), so
 * `max-site.test` has to resolve to 127.0.0.1. `supabase/ci/RUNBOOK.md` has the
 * one-line /etc/hosts entry. The app host is `localhost`, which migration
 * 20260922100000_agency_domains_localhost_app_dev.sql already registers in
 * `agency_domains` as `kind='app'` — nothing to seed for it.
 *
 * Run (see RUNBOOK.md for the full sequence):
 *   cd web
 *   PLAYWRIGHT_BASE_URL=http://localhost:3400 PLAYWRIGHT_SKIP_WEBSERVER=1 \
 *     npx playwright test e2e/talent-website/smoke.spec.ts --project=chromium
 */

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { TALENT_FIXTURES } from "./fixtures";

const EVIDENCE_DIR = resolve(process.cwd(), "..", "qa-evidence/talent-website/local");

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3400";
const PORT = new URL(BASE_URL).port || "80";

const MAX_FIXTURE = TALENT_FIXTURES.find((f) => f.key === "t_max")!;
const MAX_SITE_ORIGIN = `http://${MAX_FIXTURE.customDomain}:${PORT}`;

// An agent container ships ONE pinned Chromium under $PLAYWRIGHT_BROWSERS_PATH
// and forbids `playwright install`. When the installed @playwright/test wants a
// different build than the image has, point it at the build that is there:
//   QA_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
// Unset (CI, a dev machine) this is a no-op and Playwright resolves its own.
if (process.env.QA_CHROMIUM_EXECUTABLE) {
  test.use({ launchOptions: { executablePath: process.env.QA_CHROMIUM_EXECUTABLE } });
}

test.beforeAll(() => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
});

test("t_max's published site renders on its custom domain", async ({ page }) => {
  const response = await page.goto(`${MAX_SITE_ORIGIN}/`, { waitUntil: "domcontentloaded" });

  expect(response, `no response from ${MAX_SITE_ORIGIN}/`).not.toBeNull();
  expect(response!.status(), await response!.text().catch(() => "")).toBe(200);

  // The display name is rendered by the starter home tree's hero block.
  await expect(page.locator("body")).toContainText(MAX_FIXTURE.displayName);

  await page.screenshot({
    path: `${EVIDENCE_DIR}/t_max-custom-domain-home.png`,
    fullPage: true,
  });
});

test("the canonical /t/<code> profile answers on the app host", async ({ page }) => {
  const url = `${BASE_URL}/t/${MAX_FIXTURE.profileCode}`;
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });

  expect(response, `no response from ${url}`).not.toBeNull();
  expect(response!.status(), await response!.text().catch(() => "")).toBe(200);

  await page.screenshot({
    path: `${EVIDENCE_DIR}/t_max-canonical-profile.png`,
    fullPage: true,
  });
});
