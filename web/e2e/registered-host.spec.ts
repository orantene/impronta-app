/**
 * Phase 0 — confirms a hostname that exists in `agency_domains` serves the app
 * (not middleware `Host not registered`). Does **not** log in or fill the human
 * QA matrix in `docs/phase-0-qa-registered-host.md`.
 *
 * Default URL is production marketing hub (`https://tulala.digital`). Override:
 *   PLAYWRIGHT_REGISTERED_HOST_URL=https://app.tulala.digital npm run test:e2e:registered-host
 */

import { test, expect } from "@playwright/test";

const REGISTERED_URL =
  process.env.PLAYWRIGHT_REGISTERED_HOST_URL ?? "https://tulala.digital";

test("registered host responds without middleware host-registration block", async ({
  page,
}) => {
  const response = await page.goto(REGISTERED_URL, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  expect(response, `Expected HTTP response from ${REGISTERED_URL}`).not.toBeNull();
  expect(response!.status(), `Expected 2xx/3xx from ${REGISTERED_URL}`).toBeLessThan(
    400,
  );

  const body = await page.content();
  expect(body).not.toContain("Host not registered");
});
