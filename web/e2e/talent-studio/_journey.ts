import { expect, type Page } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export async function walkTalentJourney(page: Page, path: string, heading: string) {
  const response = await page.goto(`${BASE}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  expect(response, `Expected a response from ${path}`).not.toBeNull();
  expect(response!.status()).toBeLessThan(400);
  const body = await page.content();
  expect(body).not.toContain("Host not registered");
  const named = page.getByRole("heading", { name: heading }).first();
  const anyHeading = page.locator("h1").first();
  const login = page.getByRole("heading", { name: /sign in|log in/i }).first();
  await expect(named.or(anyHeading).or(login)).toBeVisible({ timeout: 20_000 });
}
