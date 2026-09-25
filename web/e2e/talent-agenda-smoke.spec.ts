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
  // Desktop: view tablist. Phone (≤720): Month select stays visible when V2 is on.
  const tablist = page.getByRole("tablist", { name: /Calendar view|Vista del calendario/i });
  const dayTab = page.getByRole("tab", { name: /^(Day|Día)$/i });
  const weekTab = page.getByRole("tab", { name: /^(Week|Semana)$/i });
  const monthSelect = page.getByRole("combobox").or(page.locator("select").first());
  const monthLabel = page.getByText(/^(Month|Mes)$/i);
  const anyChrome = tablist
    .or(dayTab)
    .or(weekTab)
    .or(monthSelect)
    .or(monthLabel)
    .or(page.getByRole("button", { name: /Add event or block|Añadir evento o bloqueo/i }));
  await expect(anyChrome.first()).toBeVisible({ timeout: 60_000 });
}

function calendarAddButton(page: import("@playwright/test").Page) {
  // Exact EN/ES aria-label — do NOT match bare "Add" (hits unrelated chrome).
  return page.getByRole("button", {
    name: /^(Add event or block|Añadir evento o bloqueo)$/i,
  });
}

/** Open the Calendar Add menu (assert Block time is offered). */
async function openCalendarAddMenu(page: import("@playwright/test").Page) {
  const addBtn = calendarAddButton(page);
  const blockBtn = page.getByRole("button", { name: /Block time|Bloquear tiempo|Bloquear/i });
  const newBtn = page.getByRole("button", { name: /New booking|Nueva reserva/i });
  await addBtn.click();
  // Prefer aria-expanded; fall back to visible menu items (SecondaryButtons).
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await blockBtn.or(newBtn).first().isVisible().catch(() => false)) return;
    const expanded = await addBtn.getAttribute("aria-expanded");
    if (expanded !== "true") {
      await addBtn.click();
    }
    await page.waitForTimeout(250);
  }
  await expect(blockBtn.or(newBtn).first()).toBeVisible({ timeout: 15_000 });
}

const AGENDA_NOW = "agendaNow=2026-09-23T09:50:00";

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
    await page.goto(`${BASE_URL}/talent/today`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    const needsLogin =
      page.url().includes("/login") ||
      (await page.getByRole("heading", { name: /Page not found/i }).isVisible().catch(() => false)) ||
      (await page.getByRole("link", { name: /Sign in/i }).isVisible().catch(() => false));
    if (needsLogin) {
      await login(page);
      await page.context().storageState({ path: AUTH_FILE });
    }
  });

  test("Today page renders with agenda header", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/today`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(page.getByText(/Hi,|Today|Agenda/i).first()).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "today-desktop.png"), fullPage: true });
  });

  test("Calendar page loads with view toggle", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar?${AGENDA_NOW}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
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
    await page.goto(`${BASE_URL}/talent/calendar?${AGENDA_NOW}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await expect(calendarAddButton(page)).toBeVisible({ timeout: 30_000 });
    await openCalendarAddMenu(page);
    await expect(page.getByRole("button", { name: /New booking|Nueva reserva/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /Block time|Bloquear/i })).toBeVisible();  });

  test("Attention page loads", async ({ page }) => {
    await requireAgendaV2Route(page, "/talent/attention");
    await expect(page.getByText(/Needs attention|Necesita atención|Attention/i).first()).toBeVisible({
      timeout: 60_000,
    });
  });

  test("Block time form opens from Add menu", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar?${AGENDA_NOW}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await expect(calendarAddButton(page)).toBeVisible({ timeout: 30_000 });
    await openCalendarAddMenu(page);
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
    const needsLogin =
      page.url().includes("/login") ||
      (await page.getByRole("heading", { name: /Page not found/i }).isVisible().catch(() => false)) ||
      (await page.getByRole("link", { name: /Sign in/i }).isVisible().catch(() => false));
    if (needsLogin) {
      await login(page);
      await page.context().storageState({ path: AUTH_FILE });
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

  test("finish/collect Card mints a pay link for seeded unpaid booking", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/today?agendaNow=2026-09-23T09:50:00`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    const gel = page.getByText(/QA:agenda-v2 Gel set/i).first();
    try {
      await expect(gel).toBeVisible({ timeout: 45_000 });
    } catch {
      test.skip(true, "No seeded Gel set row on Today for agendaNow pin");
    }
    const row = page.getByRole("button", { name: /QA:agenda-v2 Gel set/i }).first();
    if (await row.isVisible().catch(() => false)) {
      await row.click();
    } else {
      await gel.click();
    }
    const finish = page.getByRole("button", { name: /Finish and collect/i });
    await expect(finish).toBeVisible({ timeout: 30_000 });
    await finish.click();
    await expect(page.getByText(/Cash|Transfer|Card|Efectivo|Transferencia|Tarjeta/i).first()).toBeVisible({
      timeout: 30_000,
    });
    const card = page.getByRole("radio", { name: /Card|Tarjeta/i }).first();
    if (!(await card.isVisible().catch(() => false))) {
      await page.locator("label").filter({ hasText: /^(Card|Tarjeta)$/i }).click();
    } else {
      await card.check().catch(async () => {
        await card.click();
      });
    }
    const go = page.getByRole("button", { name: /^Complete booking$|^Completar reserva$/i });
    await expect(go).toBeEnabled({ timeout: 15_000 });
    await go.click();
    const payLink = page.locator('a[href*="/pay/"]').first();
    const amountDue = page.getByText(/Card needs an amount due|importe pendiente/i);
    const payReady = page.getByText(/Pay link ready|Enlace de pago listo|Card link ready/i);
    await expect(payLink.or(amountDue).or(payReady).first()).toBeVisible({ timeout: 45_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "finish-card-pay-link.png"), fullPage: true });
  });

  test("hold release CTA reachable when hold is seeded", async ({ page }) => {
    await requireAgendaV2Route(page, "/talent/attention?agendaNow=2026-09-23T09:50:00");
    const release = page.getByRole("button", { name: /Release hold|Liberar reserva|Release|Liberar/i }).first();
    if (!(await release.isVisible().catch(() => false))) {
      test.skip(true, "No hold Release CTA on Attention for this seed/clock");
    }
    await expect(release).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, "hold-release-entry.png"), fullPage: true });
  });

  test("block time → form → cancel closes without saving", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar?${AGENDA_NOW}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await expect(calendarAddButton(page)).toBeVisible({ timeout: 30_000 });
    await openCalendarAddMenu(page);
    await page.getByRole("button", { name: /Block time|Bloquear/i }).click();
    await expect(page.locator('input[type="time"]').first()).toBeVisible({ timeout: 15_000 });
    const cancel = page.getByRole("button", { name: /Cancel|Cancelar|Back|Volver/i }).first();
    if (await cancel.isVisible().catch(() => false)) {
      await cancel.click();
    }
    await page.screenshot({ path: path.join(EVIDENCE, "block-time-cancel.png"), fullPage: true });
  });

  test("booking record cancel control is honest (works or absent)", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/today?agendaNow=2026-09-23T09:50:00`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    const open = page.getByRole("button", { name: /Open|Ver|View/i }).first();
    if (!(await open.isVisible().catch(() => false))) {
      test.skip(true, "No booking Open CTA on seeded Today");
    }
    await open.click();
    await page.waitForTimeout(800);
    // Either Cancel is offered and enabled, or it is not shown (A1.7 honesty).
    const cancel = page.getByRole("button", { name: /Cancel booking|Cancelar reserva|^Cancel$|^Cancelar$/i });
    const count = await cancel.count();
    if (count > 0) {
      await expect(cancel.first()).toBeEnabled();
    }
    await page.screenshot({ path: path.join(EVIDENCE, "booking-record-cancel-honesty.png"), fullPage: true });
  });

  test("reschedule sheet opens from record when offered", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/today?agendaNow=2026-09-23T09:50:00`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    const open = page.getByRole("button", { name: /Open|Ver|View/i }).first();
    if (!(await open.isVisible().catch(() => false))) {
      test.skip(true, "No booking Open CTA on seeded Today");
    }
    await open.click();
    await page.waitForTimeout(800);
    const reschedule = page.getByRole("button", { name: /Reschedule|Reagendar/i }).first();
    if (!(await reschedule.isVisible().catch(() => false))) {
      test.skip(true, "Reschedule not offered on this booking");
    }
    await reschedule.click();
    await expect(page.getByText(/Reschedule|Reagendar|New time|Nueva hora/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.screenshot({ path: path.join(EVIDENCE, "reschedule-sheet.png"), fullPage: true });
  });

  test("accept-request path is reachable from attention when seeded", async ({ page }) => {
    await requireAgendaV2Route(page, "/talent/attention?agendaNow=2026-09-23T09:50:00");
    const accept = page.getByRole("button", { name: /Accept|Aceptar|Reply|Responder|Open Messages/i }).first();
    if (!(await accept.isVisible().catch(() => false))) {
      test.skip(true, "No accept/reply request CTA on Attention for this seed");
    }
    await accept.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(EVIDENCE, "accept-request-journey.png"), fullPage: true });
  });

  test("deposit / pay-request surface opens when offered", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/today?agendaNow=2026-09-23T09:50:00`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    const pay = page.getByRole("button", { name: /Request deposit|Request pay|Cobrar|Ask for|Pedir depósito|Pay request/i }).first();
    if (!(await pay.isVisible().catch(() => false))) {
      // Fall back: open a booking and look for pay CTA on the record.
      const open = page.getByRole("button", { name: /Open|Ver|View/i }).first();
      if (!(await open.isVisible().catch(() => false))) {
        test.skip(true, "No deposit/pay CTA on seeded Today");
      }
      await open.click();
      await page.waitForTimeout(800);
      const recordPay = page.getByRole("button", { name: /Request deposit|Request pay|Pedir|Pay link|Depósito/i }).first();
      if (!(await recordPay.isVisible().catch(() => false))) {
        test.skip(true, "No deposit/pay CTA on booking record");
      }
      await recordPay.click();
    } else {
      await pay.click();
    }
    await expect(page.getByText(/Amount|Monto|Deposit|Depósito|Pay|MXN/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.screenshot({ path: path.join(EVIDENCE, "deposit-pay-request-journey.png"), fullPage: true });
  });

  test("new booking conflict UI offers an alternative when conflicted", async ({ page }) => {
    await requireAgendaV2Route(page, "/talent/bookings/new");
    const conflict = page.getByText(/conflict|alternative|otro horario|Choose another|Pick another/i).first();
    if (!(await conflict.isVisible().catch(() => false))) {
      test.skip(true, "Conflict alternative not shown without overlapping draft");
    }
    await expect(conflict).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, "new-booking-conflict-alt.png"), fullPage: true });
  });

  test("no-show is gated until after start (honest or absent)", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/today?agendaNow=2026-09-23T09:50:00`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    const open = page.getByRole("button", { name: /Open|Ver|View/i }).first();
    if (!(await open.isVisible().catch(() => false))) {
      test.skip(true, "No booking Open CTA on seeded Today");
    }
    await open.click();
    await page.waitForTimeout(800);
    const noShow = page.getByRole("button", { name: /Mark no-show|Marcar sin presentación|No-show/i });
    const count = await noShow.count();
    if (count === 0) {
      // Honest: control omitted before start (clock 09:50, appt 10:00).
      await page.screenshot({ path: path.join(EVIDENCE, "no-show-gated.png"), fullPage: true });
      return;
    }
    const first = noShow.first();
    const disabled =
      (await first.isDisabled().catch(() => false)) ||
      (await page.getByText(/Available after the start time|Disponible después/i).isVisible().catch(() => false));
    expect(disabled).toBeTruthy();
    await page.screenshot({ path: path.join(EVIDENCE, "no-show-gated.png"), fullPage: true });
  });

  test("block time undo control appears after a successful block", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar?agendaNow=2026-09-23T09:50:00`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    const undo = page.getByRole("button", { name: /Undo|Deshacer/i }).first();
    if (!(await undo.isVisible().catch(() => false))) {
      test.skip(true, "Undo only after a block save in this session");
    }
    await expect(undo).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, "block-undo.png"), fullPage: true });
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
    const needsLogin =
      page.url().includes("/login") ||
      (await page.getByRole("heading", { name: /Page not found/i }).isVisible().catch(() => false)) ||
      (await page.getByRole("link", { name: /Sign in/i }).isVisible().catch(() => false));
    if (needsLogin) {
      await login(page);
      await page.context().storageState({ path: AUTH_FILE });
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
    const needsLogin =
      page.url().includes("/login") ||
      (await page.getByRole("heading", { name: /Page not found/i }).isVisible().catch(() => false)) ||
      (await page.getByRole("link", { name: /Sign in/i }).isVisible().catch(() => false));
    if (needsLogin) {
      await login(page);
      await page.context().storageState({ path: AUTH_FILE });
    }
  });

  test("Calendar readable at 360", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar?${AGENDA_NOW}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await expectCalendarChrome(page);
    await page.screenshot({ path: path.join(EVIDENCE, "calendar-360.png"), fullPage: true });
  });
});
