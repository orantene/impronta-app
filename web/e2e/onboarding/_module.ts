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

/**
 * The basics question (what you do + city) is two pickers, not two text
 * fields: type, wait for the list, pick the first row. `what` falls back to
 * "Not in the list" when the taxonomy has no row for it on this stack.
 */
export async function answerBasics(page: Page, what: string, city: string): Promise<void> {
  await expect(page.getByTestId("onb-essentials")).toBeVisible();
  // The AI's guess is preselected; "Change" reopens the picker.
  const change = page.getByTestId("onb-basics-what-change");
  if (await change.isVisible().catch(() => false)) await change.click();
  await page.getByTestId("onb-basics-what").fill(what);
  const option = page.getByTestId("onb-basics-what-option").first();
  if (await option.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await option.click();
  } else {
    await page.getByTestId("onb-basics-other").fill(what);
  }
  await page.getByTestId("onb-basics-city").fill(city);
  await page.getByTestId("onb-basics-city-option").first().click({ timeout: 10_000 });
  await expect(page.getByTestId("onb-basics-city-selected")).toBeVisible();
}

/** Essentials → (style for a business) → ready. Fills what the caller gives; leaves the rest prefilled. */
export async function finishEssentials(page: Page, input: { what?: string; city?: string; name?: string; services?: string[]; hours?: string; whatsapp?: string; style?: boolean }): Promise<void> {
  await expect(page.getByTestId("onb-essentials")).toBeVisible();
  if (input.what && input.city) await answerBasics(page, input.what, input.city);
  else if (input.city) {
    const change = page.getByTestId("onb-basics-city-change");
    if (await change.isVisible().catch(() => false)) await change.click();
    await page.getByTestId("onb-basics-city").fill(input.city);
    await page.getByTestId("onb-basics-city-option").first().click({ timeout: 10_000 });
  }
  if (input.name !== undefined) await page.getByTestId("onb-name-input").fill(input.name);
  for (const svc of input.services ?? []) {
    await page.getByTestId("onb-service-input").fill(svc);
    await page.getByTestId("onb-service-input").press("Enter");
  }
  if (input.hours) await page.getByTestId(`onb-hours-${input.hours}`).click();
  if (input.whatsapp !== undefined) await page.getByTestId("onb-whatsapp-input").fill(input.whatsapp);
  await page.getByTestId("onb-next").click();
  if (input.style) {
    await expect(page.getByTestId("onb-style")).toBeVisible();
    await page.getByTestId("onb-style-continue").click();
  }
}
