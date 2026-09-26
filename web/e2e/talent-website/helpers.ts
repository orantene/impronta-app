/**
 * Talent-website / Maison journey helpers (PR9 / W77–W78).
 *
 * Specs import from here — never from `../cases/_harness` (agency journeys
 * staff). Sign-in is the same `/api/dev/signin` path as `auth.setup.ts`.
 */
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  AUTH_STATE_DIR,
  FIXTURE_PASSWORD,
  talentFixture,
  type TalentFixture,
} from "./fixtures";

/** Gate for Maison journeys 1–6 (requires seed + TALENT_MAISON_THEME_ENABLED). */
export const MAISON_JOURNEY_READY = process.env.MAISON_JOURNEY_E2E === "1";

/** Gate for legacy Phase Q specs that need seeded custom domains / subdomains. */
export const TALENT_SITE_FIXTURE_READY = process.env.TALENT_SITE_E2E_FIXTURE_READY === "1";

/** Live Jor Beauty profile code (production read-only check). */
export const JOR_PROFILE_CODE = "TAL-JORGBEAUTY";
export const JOR_SITE_SLUG = "book-jorgelina";
export const JOR_PUBLIC_ORIGIN =
  process.env.JOR_LIVE_ORIGIN?.replace(/\/$/, "") ?? "https://tulala.digital";

/**
 * Viewports for W77–W78. Primary pair 1440 / 390; plus phone matrix.
 * 375×667 = classic iPhone SE logical size.
 */
export const MAISON_VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone390: { width: 390, height: 844 },
  phone360: { width: 360, height: 780 },
  phone430: { width: 430, height: 932 },
  phone375: { width: 375, height: 667 },
} as const;

export type MaisonViewportKey = keyof typeof MAISON_VIEWPORTS;

export const MAISON_LOCALES = ["en", "es"] as const;
export type MaisonLocale = (typeof MAISON_LOCALES)[number];

const IDS_PATH = join(process.cwd(), AUTH_STATE_DIR, "ids.json");

export type TalentIdsFile = {
  generatedAt: string;
  profiles: Partial<Record<TalentFixture["key"], string>>;
};

/** Read seed-written talent_profile ids (null when seed has not run). */
export function readTalentIds(): TalentIdsFile | null {
  if (!existsSync(IDS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(IDS_PATH, "utf8")) as TalentIdsFile;
  } catch {
    return null;
  }
}

/**
 * UUID for a fixture. Prefers the seed-written ids file; falls back to a
 * clear throw so a missing seed never becomes a silent locator timeout.
 */
export function talentProfileIdFor(key: TalentFixture["key"]): string {
  const ids = readTalentIds();
  const id = ids?.profiles?.[key];
  if (!id) {
    throw new Error(
      `talentProfileId for ${key} missing — run e2e/talent-website/seed.ts ` +
        `(writes ${AUTH_STATE_DIR}/ids.json).`,
    );
  }
  return id;
}

/** Passwordless fixture sign-in (same contract as auth.setup.ts). */
export async function signInTalentFixture(
  page: Page,
  key: TalentFixture["key"],
  nextPath = "/talent/today",
): Promise<void> {
  const fx = talentFixture(key);
  const res = await page.goto(
    `/api/dev/signin?email=${encodeURIComponent(fx.email)}&next=${encodeURIComponent(nextPath)}`,
    { waitUntil: "domcontentloaded" },
  );
  expect(
    res?.ok(),
    `dev-signin failed for ${fx.email}. Has seed.ts run? (password ${FIXTURE_PASSWORD} is reset each seed.)`,
  ).toBeTruthy();
  await page.goto(nextPath, { waitUntil: "domcontentloaded" });
  const url = page.url().toLowerCase();
  expect(url, "login URL cannot pass a talent journey").not.toMatch(/\/login|\/signin|\/auth\//);
  await expect(page.getByText(/host not registered/i)).toHaveCount(0);
}

/** Set dashboard locale cookie before navigating. */
export async function setDashboardLocale(
  context: BrowserContext,
  locale: MaisonLocale,
  baseURL?: string,
): Promise<void> {
  const origin = (baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  await context.addCookies([{ name: "locale", value: locale, url: origin }]);
}

export async function setViewport(page: Page, key: MaisonViewportKey): Promise<void> {
  await page.setViewportSize(MAISON_VIEWPORTS[key]);
}

/** W20 / W23 — Unlock copy must never appear for a live published site. */
export async function assertNeverUnlockCopy(page: Page): Promise<void> {
  const body = await page.locator("body").innerText();
  expect(body, 'live surface must not show "Unlock your free website"').not.toMatch(
    /Unlock your free website/i,
  );
  expect(body, 'live surface must not show "Desbloquea tu sitio gratis"').not.toMatch(
    /Desbloquea tu sitio gratis/i,
  );
}

/** Wait for Maison setup host (flag + personalSiteEdit). */
export async function expectMaisonSetupHost(page: Page): Promise<void> {
  await expect(page.getByTestId("maison-setup-host")).toBeVisible({ timeout: 30_000 });
}
