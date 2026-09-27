/**
 * Path A UI journey on localhost vanity — Bozo (controlled, pay-in-person).
 * Never invents PASS; writes evidence JSON + screenshots.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.env.PATHA_OUT ||
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/finish-loop/path-a";
// Prefer 127.0.0.1 so shouldSkipGuestCaptchaOnHost() can skip captcha
// (hostname localhost/127.0.0.1 + DEV surfaces). Proxy still sends vanity Host.
const URLS = [
  "http://127.0.0.1:3111/#servicios",
  "http://127.0.0.1:3110/#servicios",
  "http://book-jorgelina.lvh.me:3000/#servicios",
];

mkdirSync(OUT, { recursive: true });

const evidence = {
  when: new Date().toISOString(),
  url: null,
  steps: [],
  ctaLabels: [],
  result: "NOT_RUN",
  bookingRedirect: null,
  bookingIdHint: null,
  slotsApi: null,
  whoPayText: null,
  errors: [],
  shots: [],
  guestEmail: "qa-patha-ui-20260927@impronta.test",
};

async function shot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: false });
  evidence.shots.push(path);
  return path;
}

function note(step, detail = {}) {
  evidence.steps.push({ step, at: new Date().toISOString(), ...detail });
  console.log("STEP", step, detail);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => evidence.errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") evidence.errors.push(`console: ${msg.text()}`);
  });
  page.on("response", async (res) => {
    const u = res.url();
    if (!u.includes("/api/public/booking/slots")) return;
    let bodyPreview = "";
    try {
      const j = await res.json();
      bodyPreview = JSON.stringify({
        status: res.status(),
        slotCount: Array.isArray(j.slots) ? j.slots.length : null,
        reason: j.reason ?? null,
        timezone: j.timezone ?? null,
      });
    } catch {
      bodyPreview = `status=${res.status()} non-json`;
    }
    evidence.slotsApi = bodyPreview;
    note("slots_api", { bodyPreview });
  });

  let opened = null;
  for (const u of URLS) {
    try {
      const res = await page.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 });
      const code = res?.status() ?? 0;
      const body = await page.textContent("body");
      if (code === 200 && body && /Jorg|MENÚ|Servicios/i.test(body) && !/Host not registered/i.test(body)) {
        opened = u;
        break;
      }
    } catch (e) {
      evidence.errors.push(`goto ${u}: ${e.message}`);
    }
  }
  if (!opened) {
    evidence.result = "BLOCKED_NO_URL";
    writeFileSync(join(OUT, "ui-journey.json"), JSON.stringify(evidence, null, 2));
    await browser.close();
    process.exit(2);
  }
  evidence.url = opened;
  note("home_servicios", { url: opened });
  await page.waitForTimeout(1500);
  await shot(page, "ui-01-servicios.png");

  // Category: Depilación
  const dep = page.getByRole("button", { name: /Depilación/i }).first();
  if (await dep.count()) {
    await dep.click();
    note("category_depilacion");
    await page.waitForTimeout(800);
  } else {
    // pills may be tabs
    const pill = page.locator("button, [role='tab']").filter({ hasText: /Depilación/i }).first();
    await pill.click({ timeout: 10000 });
    note("category_depilacion_alt");
    await page.waitForTimeout(800);
  }
  await shot(page, "ui-02-depilacion-bozo.png");

  // Find Bozo row + Seleccionar
  const bozoRow = page.locator("article, li, div").filter({ hasText: /^[\s\S]*Bozo[\s\S]*$/ }).filter({ hasText: /Seleccionar|Seleccionado/i }).first();
  const selectBtn = page.getByRole("button", { name: /Seleccionar/i }).filter({
    has: page.locator("xpath=ancestor::*[contains(., 'Bozo')]"),
  });
  // Prefer nearest Seleccionar in a card containing Bozo
  const card = page.locator("*").filter({ hasText: "Bozo" }).filter({ has: page.getByRole("button", { name: /Seleccionar|Seleccionado/i }) }).first();
  if (await card.count()) {
    await card.getByRole("button", { name: /Seleccionar|Seleccionado/i }).first().click();
    note("select_bozo");
  } else {
    // fallback: scan buttons
    const buttons = page.getByRole("button", { name: /Seleccionar/i });
    const n = await buttons.count();
    let clicked = false;
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i);
      const parentText = await b.evaluate((el) => el.closest("article,li,div,section")?.textContent ?? "");
      if (/Bozo/i.test(parentText)) {
        await b.click();
        clicked = true;
        note("select_bozo_scan", { i });
        break;
      }
    }
    if (!clicked) {
      evidence.result = "BLOCKED_NO_BOZO";
      await shot(page, "ui-02b-bozo-missing.png");
      writeFileSync(join(OUT, "ui-journey.json"), JSON.stringify(evidence, null, 2));
      await browser.close();
      process.exit(3);
    }
  }
  await page.waitForTimeout(600);

  // Sticky Continuar (PR #2351)
  const sticky = page.locator("[data-catalog-continue], button").filter({ hasText: /^Continuar$/i }).first();
  const stickyBar = page.locator(".cb-bar button, [data-has-selection] button").filter({ hasText: /Continuar/i }).first();
  if (await stickyBar.count()) {
    await stickyBar.click();
    note("sticky_continuar");
  } else if (await sticky.count()) {
    await sticky.click();
    note("continuar_generic");
  }
  await page.waitForTimeout(1000);

  const sheet = page.locator("[data-catalog-booking]");
  if (!(await sheet.count())) {
    evidence.result = "BLOCKED_NO_SHEET";
    await shot(page, "ui-03-no-sheet.png");
    writeFileSync(join(OUT, "ui-journey.json"), JSON.stringify(evidence, null, 2));
    await browser.close();
    process.exit(4);
  }
  note("sheet_open", { mode: await sheet.getAttribute("data-catalog-booking") });
  await shot(page, "ui-03-sheet-open.png");

  // choose → when if needed
  const chooseCta = sheet.locator('[data-catalog-continue="choose"]');
  if (await chooseCta.count()) {
    await chooseCta.click();
    note("choose_continue");
    await page.waitForTimeout(800);
  }

  // Wait for live slots (avoid racing "Cargando horarios…")
  try {
    await sheet.locator(".jb-time").first().waitFor({ state: "visible", timeout: 25000 });
    note("slots_visible");
  } catch {
    const whenBody = ((await sheet.textContent()) || "").slice(0, 400);
    note("slots_wait_failed", { whenBody });
    evidence.result = "BLOCKED_NO_SLOTS";
    await shot(page, "ui-04-when-slots.png");
    writeFileSync(join(OUT, "ui-journey.json"), JSON.stringify(evidence, null, 2));
    await browser.close();
    process.exit(5);
  }
  await shot(page, "ui-04-when-slots.png");
  const timeBtn = sheet.locator(".jb-time").first();
  if (!(await timeBtn.count())) {
    evidence.result = "BLOCKED_NO_SLOTS";
    writeFileSync(join(OUT, "ui-journey.json"), JSON.stringify(evidence, null, 2));
    await browser.close();
    process.exit(5);
  }
  await timeBtn.click();
  note("picked_time", { label: (await timeBtn.textContent())?.trim() });
  const whenCta = sheet.locator('[data-catalog-continue="when"]');
  await whenCta.click();
  note("when_continue");
  await page.waitForTimeout(500);

  await shot(page, "ui-05-who-contact.png");
  const whoPay = sheet.locator("[data-catalog-who-pay]");
  const payText = ((await whoPay.textContent()) || "").trim();
  evidence.whoPayText = payText;
  const whoCta = sheet.locator('[data-catalog-continue="who"]');
  const ctaText = ((await whoCta.textContent()) || "").trim();
  evidence.ctaLabels.push(ctaText);
  note("who_step", { payText, ctaText });

  await sheet.locator('[data-testid="cb-name"]').fill("QA PathA UI");
  await sheet.locator('[data-testid="cb-phone"]').fill("+525551119999");
  await sheet.locator('[data-testid="cb-email"]').fill(evidence.guestEmail);

  // captcha check
  const captcha = sheet.locator("iframe[src*='hcaptcha'], iframe[src*='turnstile'], [data-catalog-captcha]");
  if (await captcha.count()) {
    evidence.result = "BLOCKED_CAPTCHA";
    await shot(page, "ui-05b-captcha.png");
    writeFileSync(join(OUT, "ui-journey.json"), JSON.stringify(evidence, null, 2));
    await browser.close();
    process.exit(6);
  }

  await whoCta.click();
  note("confirm_clicked");
  try {
    await page.waitForURL(/\/c\/|checkout|instant_booked|\/book\//, { timeout: 25000 });
    evidence.bookingRedirect = page.url();
    const m = page.url().match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
    if (m) evidence.bookingIdHint = m[0];
    note("redirect", { url: page.url(), bookingIdHint: evidence.bookingIdHint });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    const resultTitle = await page.title();
    const resultBody = ((await page.locator("body").innerText().catch(() => "")) || "")
      .replace(/\s+/g, " ")
      .slice(0, 600);
    evidence.resultPage = { title: resultTitle, body: resultBody };
    note("result_page", { title: resultTitle, body: resultBody.slice(0, 200) });
    if (/page not found|no encontr/i.test(`${resultTitle} ${resultBody}`)) {
      evidence.result = "REDIRECT_OK_RESULT_404";
    } else {
      evidence.result = "REDIRECT_OK";
    }
  } catch {
    await page.waitForTimeout(3000);
    const kicker = ((await sheet.locator(".jb-kicker").textContent().catch(() => "")) || "").trim();
    const err = ((await sheet.locator(".jb-error, [data-catalog-error]").textContent().catch(() => "")) || "").trim();
    const done = await sheet.locator(".jb-done, [data-catalog-done]").count();
    const bodySnippet = ((await sheet.textContent()) || "").replace(/\s+/g, " ").slice(0, 500);
    note("after_confirm", { kicker, err, done, bodySnippet });
    if (err) evidence.result = "ERROR_UI";
    else if (done || /confirmada|enviada|listo|reservad/i.test(`${kicker} ${bodySnippet}`)) {
      evidence.result = "DONE_UI";
    } else evidence.result = "UNKNOWN_AFTER_CONFIRM";
  }
  await shot(page, "ui-06-submitting-or-result.png");
  await shot(page, "ui-07-final.png");

  writeFileSync(join(OUT, "ui-journey.json"), JSON.stringify(evidence, null, 2));
  console.log("RESULT", evidence.result);
  console.log("EVIDENCE", join(OUT, "ui-journey.json"));
  await browser.close();
  const ok =
    evidence.result === "REDIRECT_OK" ||
    evidence.result === "DONE_UI" ||
    evidence.result === "REDIRECT_OK_RESULT_404";
  // RESULT_404 still wrote the booking; exit 0 only for clean result page.
  process.exit(evidence.result === "REDIRECT_OK" || evidence.result === "DONE_UI" ? 0 : ok ? 3 : 1);
}

main().catch((e) => {
  evidence.result = "CRASH";
  evidence.errors.push(String(e.stack || e));
  writeFileSync(join(OUT, "ui-journey.json"), JSON.stringify(evidence, null, 2));
  console.error(e);
  process.exit(1);
});
