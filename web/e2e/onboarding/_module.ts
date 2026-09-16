/**
 * Shared helpers for the onboarding module specs.
 *
 * Runs against the isolated QA stack (`web/scripts/onboarding-qa/dev.sh`):
 * marketing host on :3105 (proxy → Host: marketing.local), app host on :3106.
 * The module lives on the MARKETING host; `localhost:3008` is kind `app` and
 * would 404 the home page. Base URL comes from `PLAYWRIGHT_BASE_URL`
 * (default here: the marketing proxy).
 */
import { test as base, expect, type Page } from "@playwright/test";

export const MARKETING_BASE = process.env.ONBOARDING_MARKETING_BASE ?? "http://localhost:3105";
export const APP_BASE = process.env.ONBOARDING_APP_BASE ?? "http://localhost:3106";

export const ROSA_EN = "I clean houses in Playa del Carmen, Monday to Saturday, and I can do deep cleaning too.";
export const ROSA_ES = "Limpio casas en Playa del Carmen, de lunes a sábado, y también hago limpieza profunda.";

export const test = base;
export { expect };

export async function openHome(page: Page, locale: "en" | "es" = "en") {
  await page.goto(`${MARKETING_BASE}/${locale === "es" ? "es" : ""}`);
  await expect(page.locator('[data-platform-surface="marketing"]')).toBeVisible();
  // Hydrated and listening (the host sets this in its effect). A click before
  // it would hit a server-rendered button with no handler.
  await expect(page.locator("html[data-onboarding-ready]")).toHaveCount(1, { timeout: 30_000 });
}

export const dialog = (page: Page) => page.getByRole("dialog", { name: /Get started with Tulala|Empieza con Tulala/ });
export const overlay = (page: Page) => page.getByTestId("onb-overlay");
export const sentence = (page: Page) => page.getByTestId("onb-sentence");

/** Evidence screenshots land in `ONB_EVIDENCE_DIR` when set; no-op otherwise. */
export async function evidence(page: Page, name: string): Promise<void> {
  const dir = process.env.ONB_EVIDENCE_DIR;
  if (!dir) return;
  const project = page.viewportSize()?.width && page.viewportSize()!.width < 500 ? "390" : "1440";
  await page.screenshot({ path: `${dir}/${name}-${project}.png`, fullPage: false });
}
