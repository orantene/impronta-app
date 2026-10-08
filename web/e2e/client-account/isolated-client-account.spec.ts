/**
 * TUL-61 / 62 / 64 (and the page side of 67): a SIGNED-IN CLIENT on the ISOLATED stack, read only.
 *
 * ISOLATED ONLY. Runs against the fxlank Supabase project and a `staging-qa-*` host, never production:
 * `assertIsolated()` refuses before any network call. It mints a session for ONE existing client (the guest
 * of the Onboarding Developer's run 5 booking, so visits / receipts are real), by service-role magic link,
 * the same no-password path as e2e-live/dashboard-cards.spec.ts. It only navigates, reads and asserts. It
 * never clicks Cancel, Change time, Confirm, Save, Send, Pay or Log out: opening a detail page and a
 * dialog and leaving them is the most it does.
 *
 *   cd web && JOURNEYS_ISOLATED=1 \
 *     PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital \
 *     CLIENT_QA_EMAIL=<run-5 guest email, @impronta.test> \
 *     [CLIENT_QA_AGENCY_BASE_URL=https://staging-qa-app.tulala.digital] \
 *     set -a; . ./.env.capacity-isolated.local; set +a; \
 *     npx playwright test e2e/client-account/isolated-client-account.spec.ts --project=chromium
 *   (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY for fxlank;
 *   the staging bypass header, if the host needs one, comes from the environment and is never printed.)
 *
 * A check that cannot prove its card because the fixture has no such data (no visit, no receipt) SKIPS with
 * the reason; a skip is not a pass.
 */
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { buildSessionCookies } from "../../scripts/live-timing/timing-harness";

const PROD_REF = "pluhdapdnuiulvxmyspd";
const ISOLATED_REF = "fxlankepwnvelxjrahwk";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "";
const AGENCY_BASE = process.env.CLIENT_QA_AGENCY_BASE_URL ?? "";
const EMAIL = process.env.CLIENT_QA_EMAIL ?? "";

function assertIsolated(): void {
  const supa = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (process.env.JOURNEYS_ISOLATED !== "1") throw new Error("REFUSED: set JOURNEYS_ISOLATED=1");
  if (!supa.includes(ISOLATED_REF) || supa.includes(PROD_REF)) throw new Error("REFUSED: NEXT_PUBLIC_SUPABASE_URL is not the isolated fxlank project");
  for (const b of [BASE, AGENCY_BASE].filter(Boolean)) {
    if (!/^https:\/\/staging-qa-[a-z0-9-]+\.tulala\.digital$/.test(b)) throw new Error(`REFUSED: ${b} is not a staging-qa host`);
  }
  if (!/@impronta\.test$/i.test(EMAIL)) throw new Error("REFUSED: CLIENT_QA_EMAIL must be an @impronta.test throwaway");
}

let cookies: ReturnType<typeof buildSessionCookies> = [];

test.beforeAll(async () => {
  assertIsolated();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  const hash = link.data?.properties?.hashed_token;
  if (link.error || !hash) throw new Error(`magic link failed: ${link.error?.message ?? "no hashed_token"}`);
  const v = await anon.auth.verifyOtp({ type: "magiclink", token_hash: hash });
  if (v.error || !v.data.session) throw new Error(`verifyOtp failed: ${v.error?.message ?? "no session"}`);
  // One session, valid on both hosts (cookie per host, same token).
  cookies = [BASE, AGENCY_BASE].filter(Boolean).flatMap((b) => buildSessionCookies(v.data.session!, new URL(b).hostname, ISOLATED_REF));
});

test.beforeEach(async ({ context, page }) => {
  await context.addCookies(cookies);
  await page.addInitScript(() => {
    try { window.localStorage.setItem("impronta_analytics_consent", "denied"); } catch { /* ignore */ }
  });
});

const body = (page: Page) => page.evaluate(() => document.body.innerText);

async function expectAccountHome(page: Page, path: string): Promise<void> {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /^(sign in|log in)$/i }), "client must not hit a sign-in wall").toHaveCount(0);
  await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  await expect(page.getByText(/this is a team account|esta es una cuenta de equipo/i), "client must not be treated as a team account").toHaveCount(0);
}

// TUL-61: icon + signed-in summary on the talent site.
test("TUL-61: the account icon opens a signed-in summary with 'My account' (opened and closed, nothing clicked inside)", async ({ page }, info) => {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const icon = page.getByRole("button", { name: /open account menu|abrir men[uú] de cuenta/i }).first();
  await expect(icon, "account icon in the site header").toBeVisible({ timeout: 30_000 });
  await icon.click();
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(EMAIL.split("@")[0]!.slice(0, 8));
  await expect(dialog.getByRole("link", { name: /my account|mi cuenta/i }).first()).toBeVisible();
  await info.attach("account popover", { body: await page.screenshot(), contentType: "image/png" });
  await page.keyboard.press("Escape");
});

// TUL-62: /account on the talent site, four tabs.
test("TUL-62: /account shows the four tabs and each tab renders its real content or its honest empty line", async ({ page }, info) => {
  await expectAccountHome(page, "/account");
  const nav = page.getByRole("navigation", { name: /your account|tu cuenta/i });
  for (const tab of [/visits|visitas/i, /messages|mensajes/i, /payments|pagos/i, /settings|ajustes|configuraci/i]) {
    await expect(nav.getByRole("link", { name: tab })).toBeVisible();
  }
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);

  await page.goto(`${BASE}/account?tab=messages`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/no messages yet|a[uú]n no hay mensajes/i).or(page.locator('a[href^="/account/messages/"]').first())).toBeVisible();

  await page.goto(`${BASE}/account?tab=payments`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /balance due|saldo/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /receipts|recibos/i })).toBeVisible();

  await page.goto(`${BASE}/account?tab=settings`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(EMAIL, { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(save|guardar)$/i })).toBeVisible(); // seen, never clicked
  await expect(page.getByRole("button", { name: /log out|cerrar sesi/i })).toBeVisible(); // seen, never clicked
  await info.attach("settings tab", { body: await page.screenshot(), contentType: "image/png" });
});

test("TUL-62: a visit opens its detail with Cancel and Change time offered and the cancellation policy stated (never clicked)", async ({ page }, info) => {
  await expectAccountHome(page, "/account");
  const first = page.locator('a[href^="/account/visits/"]').first();
  test.skip((await first.count()) === 0, "this client has no visit on the stack: run 5 must create a booking for CLIENT_QA_EMAIL first");
  await first.click();
  await expect(page).toHaveURL(/\/account\/visits\//);
  const text = await body(page);
  expect(text, "cancellation policy line").toMatch(/cancellation policy|pol[ií]tica de cancelaci/i);
  expect(text, "time zone note").toMatch(/times are in|las horas est[aá]n en/i);
  const cancellable = await page.getByRole("button", { name: /cancel visit|cancelar (la )?visita/i }).count();
  const movable = await page.getByRole("button", { name: /change time|cambiar (la )?hora/i }).count();
  info.annotations.push({ type: "actions", description: `cancel=${cancellable} change-time=${movable}` });
  // A confirmed, future visit must offer both; a past/cancelled one offers neither, and says why.
  if (/confirmed|confirmad/i.test(text) && !/free cancellation window has passed|ventana de cancelaci/i.test(text)) {
    expect(cancellable, "Cancel offered").toBeGreaterThan(0);
    expect(movable, "Change time offered").toBeGreaterThan(0);
  }
  await info.attach("visit detail", { body: await page.screenshot(), contentType: "image/png" });
});

test("TUL-62: a receipt (if any) shows the seller block and the 1.5% fee line (TUL-67 page side)", async ({ page }) => {
  await expectAccountHome(page, "/account?tab=payments");
  const rec = page.locator('a[href^="/account/receipts/"]').first();
  test.skip((await rec.count()) === 0, "no receipt for this client: needs a PAID booking from paid QA S4 (card 8)");
  await rec.click();
  const text = await body(page);
  expect(text).toMatch(/sold by|vendido por/i);
  expect(text).toMatch(/1\.5\s?%|1,5\s?%/);
});

// TUL-64: /me /cuenta /client redirect into /account; agency host has the extra tabs.
test("TUL-64: /me, /cuenta and /client land on /account", async ({ page }) => {
  for (const legacy of ["/me", "/cuenta", "/client"]) {
    await page.goto(`${BASE}${legacy}`, { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname, `${legacy} redirect target`).toMatch(/^\/account(\/|$)/);
  }
});

test("TUL-64: on an agency host /account carries the agency tabs (Quotes, Shortlists, Approvals) after the four", async ({ page }) => {
  test.skip(!AGENCY_BASE, "set CLIENT_QA_AGENCY_BASE_URL to a staging-qa agency host where this client has a relationship");
  await page.goto(`${AGENCY_BASE}/account`, { waitUntil: "domcontentloaded" });
  const nav = page.getByRole("navigation", { name: /your account|tu cuenta/i });
  for (const tab of [/quotes|cotizaciones/i, /shortlists|listas/i, /approvals|aprobaciones/i]) {
    await expect(nav.getByRole("link", { name: tab })).toBeVisible();
  }
});

// TUL-67 (email side): the branded client email body cannot be read from the UI.
test.fixme("TUL-67: the branded confirmation/receipt email body (themed layout, 'via Tulala' sender, reply-to Messages, Manage booking link, seller block + 1.5% fee line)", async () => {
  // Blocked on card 93: the isolated send-email hook still rejects, so no body is captured. Once it is fixed,
  // read the captured message for CLIENT_QA_EMAIL from the hook's sink and assert the five parts named here.
});
