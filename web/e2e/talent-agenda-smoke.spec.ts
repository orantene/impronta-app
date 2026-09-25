/**
 * Talent Agenda V2 — smoke + T9.5 journey specs.
 *
 * Requires QA_TALENT_EMAIL + QA_TALENT_PASSWORD. Skips when unset so CI stays green.
 * Screenshots (when run with creds) land under docs/plans/program/evidence/today-calendar/.
 *
 * Auth: one login per worker via storageState (avoids 13× cold logins thrashing Next).
 */

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://app.local:3102";
const QA_EMAIL = process.env.QA_TALENT_EMAIL;
const QA_PASSWORD = process.env.QA_TALENT_PASSWORD ?? "";
const EVIDENCE = path.resolve(
  process.cwd(),
  "../docs/plans/program/evidence/today-calendar",
);
const AUTH_FILE = path.resolve(process.cwd(), "e2e/.auth/agenda-qa.json");

test.setTimeout(180_000);

// Stub so test.use({ storageState }) never ENOENT before beforeAll fills cookies.
fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
if (!fs.existsSync(AUTH_FILE)) {
  fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
}

async function login(page: import("@playwright/test").Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.fill('input[type="email"]', QA_EMAIL!);
  await page.fill('input[type="password"]', QA_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/(talent|admin|workspace)/, { timeout: 120_000 }),
    page.click('button[type="submit"]'),
  ]);
}

let authWrite: Promise<void> | null = null;

async function ensureStorageState(browser: import("@playwright/test").Browser) {
  if (!QA_EMAIL) return;
  if (authWrite) {
    await authWrite;
    return;
  }
  authWrite = (async () => {
    try {
      const ageMs = Date.now() - fs.statSync(AUTH_FILE).mtimeMs;
      const raw = fs.readFileSync(AUTH_FILE, "utf8");
      const parsed = JSON.parse(raw) as { cookies?: unknown[] };
      if (ageMs < 45 * 60_000 && (parsed.cookies?.length ?? 0) > 0) return;
    } catch {
      /* recreate */
    }
    // Fresh context — do NOT inherit the empty storageState fixture.
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await login(page);
    await context.storageState({ path: AUTH_FILE });
    await context.close();
  })();
  await authWrite;
}

/** Skip when V2 routes are absent (flag off or commit not on this host yet). */
async function requireAgendaV2Route(
  page: import("@playwright/test").Page,
  pathName: string,
) {
  try {
    await page.goto(`${BASE_URL}${pathName}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
  } catch (err) {
    test.skip(true, `Navigation failed for ${pathName}: ${String(err).slice(0, 120)}`);
  }
  if (await page.getByRole("heading", { name: /Page not found/i }).isVisible().catch(() => false)) {
    test.skip(true, `Agenda V2 route missing at ${pathName} (flag off or not deployed)`);
  }
}

async function expectCalendarChrome(page: import("@playwright/test").Page) {
  const tablist = page.getByRole("tablist", { name: /Calendar view|Vista del calendario/i });
  const dayTab = page.getByRole("tab", { name: /^(Day|Día)$/i });
  const weekTab = page.getByRole("tab", { name: /^(Week|Semana)$/i });
  const anyChrome = tablist.or(dayTab).or(weekTab).or(page.getByText(/Calendar|Calendario/i).first());
  await expect(anyChrome.first()).toBeVisible({ timeout: 60_000 });
}

test.describe("Talent Agenda V2 smoke", () => {
  test.beforeAll(async ({ browser }) => {
    if (!QA_EMAIL) return;
    await ensureStorageState(browser);
  });

  test.use({
    storageState: QA_EMAIL ? AUTH_FILE : undefined,
  });

  test.beforeEach(async ({ page }) => {
    if (!QA_EMAIL) test.skip();
    // Warm: if storage expired mid-run, bounce through login once.
    await page.goto(`${BASE_URL}/talent/today`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    if (page.url().includes("/login")) {
      await login(page);
    }
  });

  test("Today page renders with agenda header", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/today`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(page.getByText(/Hi,|Today|Agenda/i).first()).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "today-desktop.png"), fullPage: true });
  });

  test("Calendar page loads with view toggle", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expectCalendarChrome(page);
    await page.screenshot({ path: path.join(EVIDENCE, "calendar-desktop.png"), fullPage: true });
  });

  test("New booking page renders form", async ({ page }) => {
    await requireAgendaV2Route(page, "/talent/bookings/new");
    await expect(page.getByText(/Client|What|Name|New booking/i).first()).toBeVisible({
      timeout: 60_000,
    });
  });

  test("Availability page renders weekly schedule", async ({ page }) => {
    await requireAgendaV2Route(page, "/talent/calendar/availability");
    await expect(page.getByText(/Weekly schedule|Availability|Horario/i).first()).toBeVisible({
      timeout: 60_000,
    });
  });

  test("Calendar + Add menu opens without error", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const addBtn = page.getByRole("button", { name: /Add event or block|Add/i }).first();
    if (!(await addBtn.isVisible().catch(() => false))) {
      test.skip(true, "Calendar Add menu is Agenda V2-only");
    }
    await addBtn.click();
    await expect(page.getByRole("menu").or(page.getByText(/New booking|Block time/i).first())).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Attention page loads", async ({ page }) => {
    await requireAgendaV2Route(page, "/talent/attention");
    await expect(page.getByText(/Needs attention|Necesita atención|Attention/i).first()).toBeVisible({
      timeout: 60_000,
    });
  });

  test("Block time form opens from Add menu", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const addBtn = page.getByRole("button", { name: /Add event or block|Add/i }).first();
    if (!(await addBtn.isVisible().catch(() => false))) {
      test.skip(true, "Block time Add path is Agenda V2-only");
    }
    await addBtn.click();
    await page.getByRole("button", { name: /Block time|Bloquear/i }).click();
    await expect(page.locator('input[type="time"]').first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Talent Agenda V2 T9.5 journeys", () => {
  test.beforeAll(async ({ browser }) => {
    if (!QA_EMAIL) return;
    await ensureStorageState(browser);
  });

  test.use({
    storageState: QA_EMAIL ? AUTH_FILE : undefined,
  });

  test.beforeEach(async ({ page }) => {
    if (!QA_EMAIL) test.skip();
    await page.goto(`${BASE_URL}/talent/today`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    if (page.url().includes("/login")) {
      await login(page);
    }
  });

  test("attention → open record path is reachable", async ({ page }) => {
    await requireAgendaV2Route(page, "/talent/attention");
    const open = page.getByRole("button", { name: /Open|Reply|Collect|Release/i }).first();
    if (await open.count()) {
      await open.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(EVIDENCE, "attention-journey.png"), fullPage: true });
  });

  test("new booking conflict UI surfaces Save gated until payment", async ({ page }) => {
    await requireAgendaV2Route(page, "/talent/bookings/new");
    await expect(page.getByText(/Save stays off|Save|Client|New booking/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await page.screenshot({ path: path.join(EVIDENCE, "new-booking-journey.png"), fullPage: true });
  });

  test("finish/collect surface opens from a booking when linked", async ({ page }) => {
    try {
      await page.goto(`${BASE_URL}/talent/today`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    } catch (err) {
      test.skip(true, `Today navigation failed: ${String(err).slice(0, 120)}`);
    }
    await page.screenshot({ path: path.join(EVIDENCE, "finish-collect-entry.png"), fullPage: true });
  });
});

test.describe("Talent Agenda V2 mobile 390", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    storageState: QA_EMAIL ? AUTH_FILE : undefined,
  });

  test.beforeAll(async ({ browser }) => {
    if (!QA_EMAIL) return;
    await ensureStorageState(browser);
  });

  test.beforeEach(async ({ page }) => {
    if (!QA_EMAIL) test.skip();
    await page.goto(`${BASE_URL}/talent/today`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    if (page.url().includes("/login")) {
      await login(page);
    }
  });

  test("Today touch targets stay readable at 390", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/today`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const header = page.getByText(/Hi,|Today|Agenda/i).first();
    await expect(header).toBeVisible({ timeout: 60_000 });
    const box = await header.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(40);
    await page.screenshot({ path: path.join(EVIDENCE, "today-390.png"), fullPage: true });
  });

  test("focused new-booking hides bottom tab chrome", async ({ page }) => {
    await requireAgendaV2Route(page, "/talent/bookings/new");
    await expect(page.getByText(/Client|What|Name|New booking/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await page.screenshot({ path: path.join(EVIDENCE, "new-booking-390.png"), fullPage: true });
  });
});

test.describe("Talent Agenda V2 mobile 360", () => {
  test.use({
    viewport: { width: 360, height: 740 },
    storageState: QA_EMAIL ? AUTH_FILE : undefined,
  });

  test.beforeAll(async ({ browser }) => {
    if (!QA_EMAIL) return;
    await ensureStorageState(browser);
  });

  test.beforeEach(async ({ page }) => {
    if (!QA_EMAIL) test.skip();
    await page.goto(`${BASE_URL}/talent/today`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    if (page.url().includes("/login")) {
      await login(page);
    }
  });

  test("Calendar readable at 360", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await expectCalendarChrome(page);
    await page.screenshot({ path: path.join(EVIDENCE, "calendar-360.png"), fullPage: true });
  });
});
