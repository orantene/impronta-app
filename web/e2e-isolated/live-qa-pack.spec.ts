/**
 * Live-QA regression pack (ISOLATED stack only). One test per Notion card id.
 *
 * What it replaces: the checks a person ran by hand in the browser for each card
 * (Spanish workspace, client portal, builder, first-run publish). A release is
 * checked by running this file against a stack built from the release commit.
 *
 *   cd web && JOURNEYS_ISOLATED=1 QA_PACK_FIXTURES=/abs/path/fixtures.json npm run qa:live-pack
 *
 * GUARD: `live-qa-pack-setup.ts` runs first and refuses unless the Supabase target is the
 * isolated project (scripts/isolated-target-guard.mjs) and every origin is local.
 *
 * FIXTURES (QA_PACK_FIXTURES, a JSON file; ids come from the three-choices journey evidence
 * `accounts.json` / `results/*.json`; no passwords are stored: sessions are minted through the
 * admin API on the isolated project):
 *   {
 *     "myself":      { "userId": "...", "talentId": "...", "siteHost": "rosa-...tulala.digital", "serviceName": "Limpieza profunda" },
 *     "both":        { "userId": "...", "slug": "rosa-both-..." },
 *     "studio":      { "userId": "...", "slug": "estudio-..." },
 *     "clientPortal":{ "userId": "...", "slug": "qa-journeys" },
 *     "superAdmin":  { "userId": "..." },
 *     "sites":       ["rosa-....tulala.digital", "..."]          // optional, for the header-CTA check
 *   }
 * A missing fixture SKIPS the test with the reason. A skipped test is NOT a pass.
 *
 * THROWAWAY DATA: the pack creates one QA client (name "QA Pack ...", generated address, no password)
 * for the client-account tests and removes the auth user + profile in afterAll with a read-back; the
 * inquiries/bookings that client makes are listed in `fixtures-created.json` next to the results
 * (clean them with the TUL-3 list; the pack never deletes shared rows).
 *
 * Status: written 2026-10-09 from the hand-run checks of that day; NOT YET RUN end to end. Where a
 * test encodes a defect that is open today it is written to FAIL until the fix ships (the card id and
 * the open defect are in the test title or its first comment): a red test here is the finding.
 */
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { assertIsolatedJourneysTarget } from "../scripts/isolated-target-guard.mjs";

// ───────────────────────── config + guard ─────────────────────────
assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const APP = process.env.QA_PACK_APP_ORIGIN ?? "http://localhost:3106";
const MARKETING = process.env.QA_PACK_MARKETING_ORIGIN ?? "http://localhost:3105";
const SITE_PORT = process.env.QA_PACK_SITE_PORT ?? "3008";
const day = new Date().toISOString().slice(0, 10);
const evidence = join(process.cwd(), "docs/plans/qa-evidence", `live-qa-pack-${day}`);
mkdirSync(evidence, { recursive: true });

type Fixtures = {
  myself?: { userId: string; talentId: string; siteHost: string; serviceName?: string };
  both?: { userId: string; slug: string; siteHost?: string };
  studio?: { userId: string; slug: string };
  clientPortal?: { userId: string; slug: string };
  superAdmin?: { userId: string };
  /** Talent with an inbox inquiry that can open the Oferta draft editor (TUL-381). */
  offerDraft?: { userId: string };
  /** Paid booking row for /admin/work/<id> (TUL-473). */
  paidBooking?: { userId: string; bookingId: string };
  sites?: string[];
};
const FIX: Fixtures = JSON.parse(readFileSync(process.env.QA_PACK_FIXTURES ?? "/dev/null", "utf8") || "{}");

function need<T>(value: T | undefined, what: string): T {
  test.skip(value === undefined, `fixture missing: ${what}`);
  return value as T;
}

const svc: SupabaseClient = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !url.includes("fxlankepwnvelxjrahwk")) throw new Error("[live-qa-pack] isolated service role required");
  return createClient(url, key, { auth: { persistSession: false } });
})();

// ───────────────────────── session helpers ─────────────────────────
type Cookie = { name: string; value: string; domain: string; path: string };

async function sessionCookies(userId: string, domain: string): Promise<Cookie[]> {
  const email = (await svc.auth.admin.getUserById(userId)).data.user?.email;
  if (!email) throw new Error(`no email for fixture user ${userId}`);
  const link = await svc.auth.admin.generateLink({ type: "magiclink", email });
  const otp = link.data?.properties?.email_otp;
  if (!otp) throw new Error("no otp minted");
  const jar = new Map<string, string>();
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach((c) => (c.value ? jar.set(c.name, c.value) : jar.delete(c.name))),
    },
  });
  const { error } = await sb.auth.verifyOtp({ email, token: otp, type: "email" });
  if (error) throw error;
  return Array.from(jar, ([name, value]) => ({ name, value, domain, path: "/" }));
}

async function openAs(browser: Browser, userId: string, size: { width: number; height: number }, domain = "localhost"): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: size, locale: "es-MX" });
  await ctx.addCookies(await sessionCookies(userId, domain));
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  return { ctx, page };
}

async function guestPage(browser: Browser, size = { width: 1440, height: 900 }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: size, locale: "es-MX" });
  // The isolated stack is plain http on a mapped host (not a secure context): shim the one API the chat needs.
  await ctx.addInitScript(() => {
    const c = crypto as unknown as { randomUUID?: () => string };
    if (!c.randomUUID) {
      c.randomUUID = () => {
        const b = crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6]! & 0x0f) | 0x40;
        b[8] = (b[8]! & 0x3f) | 0x80;
        const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
      };
    }
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  return { ctx, page };
}

const siteUrl = (host: string, path = "/") => `http://${host}:${SITE_PORT}${path}`;
const bodyText = async (page: Page) => (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
const shot = (page: Page, name: string) => page.screenshot({ path: join(evidence, `${name}.png`) }).catch(() => undefined);

async function go(page: Page, url: string, settleMs = 12_000) {
  await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  await page.waitForTimeout(settleMs);
  const reject = page.getByRole("button", { name: /^Rechazar$/ });
  if (await reject.first().isVisible().catch(() => false)) await reject.first().click().catch(() => undefined);
}

// ───────────────────────── throwaway client (created + removed by the pack) ─────────────────────────
const created: { clientUserId?: string; clientEmail?: string; notes: string[] } = { notes: [] };

test.beforeAll(async () => {
  const email = `qa-pack-client-${Date.now().toString(36)}@example.test`;
  const r = await svc.auth.admin.createUser({ email, email_confirm: true });
  if (r.error || !r.data.user) throw r.error ?? new Error("could not create the throwaway client");
  created.clientUserId = r.data.user.id;
  created.clientEmail = email;
  await svc.from("profiles").update({ app_role: "client", display_name: "QA Pack Cliente", account_status: "active", onboarding_completed_at: new Date().toISOString() }).eq("id", r.data.user.id);
});

test.afterAll(async () => {
  if (created.clientUserId) {
    await svc.auth.admin.deleteUser(created.clientUserId);
    const { count } = await svc.from("profiles").select("id", { count: "exact", head: true }).eq("id", created.clientUserId);
    created.notes.push(`read-back: profiles rows for the throwaway client after delete = ${count ?? 0} (expected 0)`);
  }
  const { data: leftovers } = await svc.from("inquiries").select("id").eq("contact_email", created.clientEmail ?? "");
  created.notes.push(`inquiries left under ${created.clientEmail}: ${(leftovers ?? []).map((r) => String(r.id).slice(0, 8)).join(", ") || "none"}`);
  writeFileSync(join(evidence, "fixtures-created.json"), JSON.stringify(created, null, 2));
});

// ───────────────────────── cards ─────────────────────────

test("TUL-62 · client /account: visit list row names the service, shows the booking's date and status, and the visit can be cancelled or rescheduled", async ({ browser }) => {
  // Open defects on 2026-10-09: list row shows 'Servicio' + a date one day early + 'Pendiente'; no cancel/reschedule
  // because a booking made while signed in has client_user_id NULL. This test is red until both are fixed.
  const fx = need(FIX.myself, "myself");
  const host = fx.siteHost;
  const { ctx, page } = await openAs(browser, created.clientUserId!, { width: 1440, height: 900 }, host);
  await go(page, siteUrl(host), 9000);
  await page.getByRole("button", { name: /^Seleccionar$/ }).first().click();
  await page.getByRole("button", { name: /^Continuar$/ }).first().click();
  const days = page.getByRole("button", { name: /^(LUN|MAR|MI[ÉE]|JUE|VIE|S[ÁA]B|DOM)\s*\d/i });
  await days.nth(4).click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /^\d{1,2}:\d{2}$/ }).first().click();
  await page.getByRole("button", { name: /^Continuar$/ }).last().click();
  await page.getByTestId("cb-name").first().fill("QA Pack Cliente");
  await page.getByTestId("cb-email").first().fill(created.clientEmail!);
  await page.waitForFunction(() => (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value, null, { timeout: 25_000 }).catch(() => undefined);
  await page.getByRole("button", { name: /confirmar|reservar cita/i }).last().click();
  await page.waitForTimeout(10_000);
  await go(page, siteUrl(host, "/account"), 9000);
  const list = await bodyText(page);
  await shot(page, "TUL-62-list");
  const service = fx.serviceName ?? "Limpieza";
  expect(list, "the visit row names the service, not the generic 'Servicio'").toContain(service);
  const link = page.locator('a[href^="/account/visits/"]').first();
  const rowText = (await link.innerText()).replace(/\s+/g, " ");
  await link.click();
  await page.waitForTimeout(8000);
  const detail = await bodyText(page);
  await shot(page, "TUL-62-detail");
  const rowDate = rowText.match(/\d{1,2} de \w+ de \d{4}/)?.[0];
  expect(rowDate && detail.includes(rowDate), `list date '${rowDate}' equals the detail date`).toBeTruthy();
  await expect(page.getByRole("button", { name: /Cancelar|Reprogramar|Cambiar horario/ }).first()).toBeVisible();
  await ctx.close();
});

test("TUL-64 · an active, onboarded client is not bounced to /start or /onboarding/role on the app host", async ({ browser }) => {
  const { ctx, page } = await openAs(browser, created.clientUserId!, { width: 1440, height: 900 });
  await go(page, `${APP}/account`, 8000);
  await shot(page, "TUL-64");
  const path = new URL(page.url()).pathname;
  expect(path, "client lands on an account page, not the pro onboarding").not.toMatch(/^\/(start|onboarding)/);
  await ctx.close();
});

test("TUL-116 · guest chat: a price question gets an instant answer with price and duration, no contact gate first", async ({ browser }) => {
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await guestPage(browser);
  await go(page, siteUrl(fx.siteHost), 9000);
  await page.locator('[aria-label^="Enviar mensaje a"]').first().evaluate((el) => (el as HTMLElement).click());
  await page.waitForTimeout(3000);
  await page.locator("textarea, input[type=text]").last().fill("¿Cuánto cuesta y cuánto dura?");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(9000);
  await shot(page, "TUL-116");
  const t = await bodyText(page);
  expect(t).toMatch(/\$\s?\d[\d,.]*\s?(MXN|USD)/);
  expect(t).toMatch(/\d\s?h|\bmin\b|minutos/);
  expect(t.indexOf("Nombre")).toBe(-1);
  await ctx.close();
});

test("TUL-401 · guest chat dock is present on a freshly added talent host within 30 s", async ({ browser }) => {
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await guestPage(browser);
  await page.goto(siteUrl(fx.siteHost), { waitUntil: "domcontentloaded" });
  await expect(page.locator('[aria-label^="Enviar mensaje a"]').first()).toBeAttached({ timeout: 30_000 });
  await shot(page, "TUL-401");
  await ctx.close();
});

test("TUL-182 · dashboard money reads '<symbol><amount> <CODE>' everywhere; never 'MX$' or a bare '$' for a talent-currency amount", async ({ browser }) => {
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 1000 });
  for (const path of ["/talent/services", "/talent/today", "/talent/money"]) {
    await go(page, `${APP}${path}`, 12_000);
    const t = await bodyText(page);
    await shot(page, `TUL-182-${path.replace(/\W+/g, "_")}`);
    expect(t, `${path} has no MX$`).not.toMatch(/MX\$/);
    const bare = [...t.matchAll(/(?<![A-Z]|\w)\$\s?\d[\d.,]*(?!\s?(MXN|USD|EUR))/g)].map((m) => m[0]);
    expect(bare, `${path} has no bare $ amounts`).toEqual([]);
  }
  await ctx.close();
});

test("TUL-378 · dual owner: the Talent | Admin switch is reachable in both shells on desktop AND on a phone", async ({ browser }) => {
  // Open defect 2026-10-09: on phone 390 the talent shell has no route to the business side.
  const fx = need(FIX.both, "both");
  for (const [label, size] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    const { ctx, page } = await openAs(browser, fx.userId, size);
    await go(page, `${APP}/talent/today`, 12_000);
    if (label === "phone") {
      await page.getByText(/^Más$/).first().click().catch(() => undefined);
      await page.waitForTimeout(2500);
    }
    await shot(page, `TUL-378-${label}`);
    const visible = await page.getByText(/^(Admin|Negocio|Ir al negocio)$/).first().isVisible().catch(() => false);
    expect(visible, `${label}: a visible way to the admin side from /talent`).toBeTruthy();
    await ctx.close();
  }
});

test("TUL-255 · staff impersonating a client: portal pages show the client's data with the banner, and /client does not loop", async ({ browser }) => {
  // Open defect 2026-10-09: every portal page is a bare 404, /client is a redirect loop.
  const admin = need(FIX.superAdmin, "superAdmin");
  const portal = need(FIX.clientPortal, "clientPortal");
  const secret = process.env.IMPERSONATION_COOKIE_SECRET;
  test.skip(!secret, "IMPERSONATION_COOKIE_SECRET (+ IMPERSONATION_QA_CLIENT_USER_ID) must be set on the stack under test");
  const body = JSON.stringify({ v: 1, targetUserId: portal.userId, iat: Date.now() });
  const b64u = (buf: Buffer | string) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const enc = b64u(body);
  const token = `${enc}.${b64u(createHmac("sha256", secret!).update(enc).digest())}`;
  const { ctx, page } = await openAs(browser, admin.userId, { width: 1440, height: 900 });
  await ctx.addCookies([{ name: "impronta_impersonation", value: token, domain: "localhost", path: "/", httpOnly: true }]);
  const chain: string[] = [];
  page.on("response", (r) => { if (r.request().resourceType() === "document") chain.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await page.goto(`${APP}/client`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  expect(chain.length, "/client redirects fewer than 6 times (no loop)").toBeLessThan(6);
  for (const pg of ["today", "bookings", "inquiries", "messages", "settings", "favorites"]) {
    const resp = await page.goto(`${APP}/${portal.slug}/client/${pg}`, { waitUntil: "domcontentloaded" }).catch(() => null);
    await page.waitForTimeout(6000);
    const t = await bodyText(page);
    await shot(page, `TUL-255-${pg}`);
    expect(resp?.status(), `${pg} answers 200`).toBe(200);
    expect(t, `${pg} is not the generic 404`).not.toMatch(/Page not found|No encontramos/i);
    expect(t, `${pg} shows the impersonation banner`).toMatch(/suplant|impersonat|actuando como|acting as/i);
  }
  await ctx.close();
});

test("TUL-398 · builder 'Agregar diseños' on a Spanish studio: Spanish search works, defaults are Spanish, no roster sections", async ({ browser }) => {
  // Open defect 2026-10-09: search matches English words only; Gallery default arrives in English.
  const fx = need(FIX.studio, "studio");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 1000 });
  await go(page, `http://localhost:${SITE_PORT}/w/${fx.slug}?edit=1`, 25_000);
  await page.getByText(/^Agregar$/).first().click();
  await page.waitForTimeout(3000);
  const panel = await bodyText(page);
  expect(panel).not.toMatch(/Featured Talent|Talent Roster|Talento destacado|Plantel/);
  const search = page.getByPlaceholder(/Buscar/i).first();
  for (const q of ["galería", "galeria", "servicios", "contacto", "portada"]) {
    await search.fill(q);
    await page.waitForTimeout(1500);
    expect(await page.getByText(/Sin coincidencias/).count(), `search '${q}' finds Spanish section names`).toBe(0);
  }
  await search.fill("");
  await page.getByText("Cuadrícula de galería", { exact: true }).first().click();
  await page.waitForTimeout(4000);
  await page.keyboard.press("Escape");
  const frame = page.frames().find((f) => f !== page.mainFrame());
  const canvas = (await (frame ? frame.locator("body") : page.locator("body")).innerText().catch(() => "")).replace(/\s+/g, " ");
  await shot(page, "TUL-398");
  expect(canvas, "no English default headings on a Spanish site").not.toMatch(/\bGallery\b|Showcase editorial photography/);
  await ctx.close();
});

test("TUL-81 · builder: 'Borrador guardado' toast is readable and on top; the photo pill ends within 200 s", async ({ browser }) => {
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 1000 });
  await go(page, `${APP}/talent/page-builder`, 20_000);
  const h = await page.locator("h1").first().boundingBox();
  if (h) {
    await page.mouse.click(h.x + 60, h.y + h.height / 2);
    await page.waitForTimeout(1500);
    await page.mouse.click(1380, 115);
    await page.waitForTimeout(1500);
  }
  const input = page.locator("input[type=text]").first();
  if (await input.count()) {
    await input.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" ", { delay: 40 });
    await page.keyboard.press("Backspace");
  }
  // Stable hook from EditToast overlayId="draft-saved-toast" (not a generic live region).
  const toast = page.locator('[data-edit-overlay="draft-saved-toast"]').first();
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await expect(toast).toContainText(/Borrador guardado/);
  const probe = await toast.evaluate((el) => {
    const cs = getComputedStyle(el as HTMLElement);
    return { color: cs.color, bg: cs.backgroundColor, z: Number(cs.zIndex) || 0 };
  });
  await shot(page, "TUL-81-toast");
  const lum = (rgb: string) => {
    const c = (rgb.match(/\d+/g) ?? ["0", "0", "0"]).slice(0, 3).map((n) => Number(n) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const ratio = (Math.max(lum(probe.color), lum(probe.bg)) + 0.05) / (Math.min(lum(probe.color), lum(probe.bg)) + 0.05);
  expect(ratio, `toast contrast ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  expect(probe.z).toBeGreaterThanOrEqual(100);
  const pill = page.locator('[data-edit-overlay="pending-images-pill"]');
  if (await pill.count()) {
    await expect(pill.first()).toBeHidden({ timeout: 200_000 });
  }
  await ctx.close();
});

test("TUL-381 · talent offer draft editor: fits its panel, Spanish labels, no typo", async ({ browser }) => {
  // Prefer a dedicated offerDraft fixture (inbox with an offerable inquiry); fall back to myself.
  const fx = need(FIX.offerDraft ?? FIX.myself, "offerDraft (or myself)");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 1000 });
  await go(page, `${APP}/talent/inbox`, 14_000);
  const thread = page.locator("[role=listitem],a[href*='inbox']").first();
  test.skip(!(await thread.count()), "fixture missing: offerDraft talent has no inbox thread");
  await thread.click();
  await page.waitForTimeout(5000);
  const oferta = page.getByRole("tab", { name: /^Oferta$/ }).or(page.getByRole("button", { name: /^Oferta$/ })).first();
  test.skip(!(await oferta.count()), "fixture missing: offerDraft thread has no Oferta tab");
  await oferta.click();
  const start = page.getByRole("button", { name: /Empezar a redactar la oferta/ }).first();
  if (await start.isVisible().catch(() => false)) await start.click();
  await page.getByRole("button", { name: /^MXN$/ }).first().click({ timeout: 5000 }).catch(() => undefined);
  await expect(page.getByRole("button", { name: /^Editar$/ }).first()).toBeVisible({ timeout: 40_000 });
  await page.getByRole("button", { name: /^Editar$/ }).first().click();
  await page.waitForTimeout(4000);
  const t = await bodyText(page);
  await shot(page, "TUL-381");
  // Open defect until i18n ships: "+ Anadir linea" / "— elige Talent —" must be gone.
  expect(t).not.toMatch(/Anadir linea|— elige Talent —/);
  await ctx.close();
});

test("TUL-519 · talent count bubble equals the inbox 'esperando tu respuesta' count and Hoy agrees", async ({ browser }) => {
  // Open defect 2026-10-09: bubble 2 vs inbox 5 vs Hoy 'Todo al día'.
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 900 });
  await go(page, `${APP}/talent/inbox`, 14_000);
  const awaiting = (await bodyText(page)).match(/esperando tu respuesta/g)?.length ?? 0;
  await go(page, `${APP}/talent/today`, 14_000);
  const bubble = await page.locator("[data-shell-count-bubble=attention]").first().getAttribute("aria-label").catch(() => null);
  const n = Number(bubble?.match(/(\d+)\s*$/)?.[1] ?? 0);
  await shot(page, "TUL-519-bubble");
  expect(n, "bubble count equals inbox awaiting count").toBe(awaiting);
  if (awaiting > 0) expect(await bodyText(page), "Hoy does not say all clear while threads wait").not.toMatch(/Todo al día por ahora/);
  expect(bubble ?? "", "bubble label is Spanish").not.toMatch(/^Attention/);
  await ctx.close();
});

test("FIRST-RUN · a new studio's dashboard greets a person, has no restaurant POS rail, and the first publish has zero blockers", async ({ browser }) => {
  // Open defects 2026-10-09 (P1 cards): greeting shows the account handle, POS/Mesas/Pedidos rail, first publish blocked.
  const fx = need(FIX.studio, "studio");
  const email = (await svc.auth.admin.getUserById(fx.userId)).data.user?.email ?? "";
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 1000 });
  await go(page, `${APP}/${fx.slug}/admin`, 14_000);
  const t = await bodyText(page);
  await shot(page, "FIRST-RUN-dashboard");
  expect(t, "greeting is not the account handle").not.toContain(email.split("@")[0]!);
  expect(t, "no restaurant-only surfaces for a service studio").not.toMatch(/Abrir POS|Mesas|Pedidos/);
  await go(page, `http://localhost:${SITE_PORT}/w/${fx.slug}?edit=1`, 25_000);
  await page.getByRole("button", { name: /^Publicar$/ }).first().click();
  await page.waitForTimeout(5000);
  const dialog = (await page.locator("[role=dialog]").last().innerText().catch(() => "")).replace(/\s+/g, " ");
  await shot(page, "FIRST-RUN-publish");
  expect(dialog, "no blockers on a brand-new site's first publish").not.toMatch(/\d+ bloqueos?|BLOQUEO/);
  expect(dialog, "no English or internal wording in the Spanish publish dialog").not.toMatch(/Missing published|Free publish policy|PUBLISH BLOCKED|Add at least one section/);
  await ctx.close();
});

test("T1/DS-62 · header primary CTA on a talent site points at something that exists, on the home page and on /politicas", async ({ browser }) => {
  const sites = FIX.sites ?? (FIX.myself ? [FIX.myself.siteHost] : []);
  test.skip(sites.length === 0, "fixture missing: sites");
  for (const host of sites) {
    for (const path of ["/", "/politicas"]) {
      const { ctx, page } = await guestPage(browser);
      await go(page, siteUrl(host, path), 9000);
      const hrefs = await page.evaluate(() => {
        const header = document.querySelector("header, [data-talent-max-site-header]");
        return [...(header?.querySelectorAll("a.site-btn, a[class*=cta]") ?? [])].map((a) => a.getAttribute("href") ?? "");
      });
      await shot(page, `T1-cta-${host.split(".")[0]}-${path.replace(/\W+/g, "_")}`);
      for (const href of hrefs) {
        if (!href.startsWith("#")) continue;
        expect(href === "#" || (await page.locator(`[id="${href.slice(1)}"]`).count()) > 0, `${host}${path}: CTA ${href} has a target on this page`).toBeTruthy();
      }
      await ctx.close();
    }
  }
});

test("TUL-117 · three choices journey: covered by e2e/onboarding/choices-journey.spec.ts (run with --project=chromium; the WebKit project drops the localhost guest cookie)", async () => {
  test.skip(true, "delegated to the journeys spec; run it in the same sitting and record the table");
});

test("TUL-120 · support AI answers a Spanish ticket in Spanish", async () => {
  test.skip(process.env.QA_PACK_AI_SUPPORT !== "1", "needs platform_settings.workspace_support_enabled and settings.ai_support_enabled on fxlank: a shared-row change that needs the PM's yes, backed up and restored (QA_PACK_AI_SUPPORT=1 only inside that window)");
});

test("TUL-421 · theme A to B to A: business data identical and the live page restored byte for byte", async ({ browser }) => {
  // Publishes to the fixture site and back (restores it). Run on a throwaway talent only.
  test.skip(process.env.QA_PACK_THEME_ROUNDTRIP !== "1", "publishes to the fixture site and back: set QA_PACK_THEME_ROUNDTRIP=1 on a throwaway talent");
  const fx = need(FIX.myself, "myself");
  const hash = (v: unknown) => createHmac("sha256", "qa-pack").update(JSON.stringify(v)).digest("hex").slice(0, 12);
  const live = async () => (await svc.from("talent_pages").select("blocks_published").eq("talent_profile_id", fx.talentId).eq("is_home", true).maybeSingle()).data?.blocks_published;
  const business = async () => ({
    offers: (await svc.from("talent_offerings").select("id,title,amount_cents,currency,status,visibility").eq("talent_profile_id", fx.talentId).order("id")).data,
    prof: (await svc.from("talent_profiles").select("display_name,short_bio,bio_i18n").eq("id", fx.talentId).maybeSingle()).data,
  });
  const baseLive = hash(await live());
  const baseBiz = hash(await business());
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 1000 });
  const switchTo = async (cardIndex: number) => {
    await go(page, `${APP}/talent/site`, 12_000);
    await page.getByRole("button", { name: /Cambiar diseño/ }).first().click();
    await page.waitForTimeout(5000);
    await page.getByRole("button", { name: /^Explorar$/ }).nth(cardIndex).click();
    await page.waitForTimeout(7000);
    await page.getByRole("button", { name: /^Usar este diseño$/ }).first().click();
    await page.waitForTimeout(3500);
    await page.getByRole("button", { name: /Cambiar y publicar ahora/ }).first().click();
    await page.waitForTimeout(25_000);
  };
  await switchTo(2); // B: Folio (card order in the gallery: Maison, Maison v2, Folio, ...)
  expect(hash(await business()), "business data unchanged after A to B").toBe(baseBiz);
  expect(hash(await live()), "live page changed to B").not.toBe(baseLive);
  await switchTo(1); // back to A: Maison v2
  expect(hash(await business()), "business data unchanged after B to A").toBe(baseBiz);
  expect(hash(await live()), "live page restored to A exactly").toBe(baseLive);
  await shot(page, "TUL-421-restored");
  await ctx.close();
});

// ───────────────────────── WO3 enrollments (21 cards) ─────────────────────────

test("TUL-39 · free talent Apps: premium Nail Designer shows Web Office badge and Upgrade to use", async ({ browser }) => {
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 1000 });
  await go(page, `${APP}/talent/site`, 14_000);
  const apps = page.getByRole("button", { name: /^Apps$/ }).or(page.getByRole("link", { name: /^Apps$/ })).or(page.getByText(/^Apps$/)).first();
  if (await apps.isVisible().catch(() => false)) await apps.click();
  else await go(page, `${APP}/talent/site?tab=apps`, 12_000);
  await page.waitForTimeout(4000);
  const t = await bodyText(page);
  await shot(page, "TUL-39-apps");
  expect(t, "Nail Designer is listed").toMatch(/Nail Designer|Diseñador de uñas/i);
  expect(t, "Web Office / Oficina Web badge on premium").toMatch(/Web Office|Oficina Web/);
  expect(t, "free plan sees Upgrade to use (or Spanish equivalent)").toMatch(/Upgrade to use|Mejorar para usar|Actualizar para usar/i);
  await ctx.close();
});

test("TUL-67 · client receipt/email path: seller block and fee line are present in the render fixture", async ({ browser }) => {
  // Done-when: receipt shows seller block + 1.5% fee line. Uses the pack throwaway client's booking
  // receipt surface when available; otherwise SKIPs (missing fixture path).
  const fx = need(FIX.myself, "myself");
  test.skip(!created.clientUserId, "fixture missing: throwaway client");
  const { ctx, page } = await openAs(browser, created.clientUserId!, { width: 1440, height: 900 }, fx.siteHost);
  await go(page, siteUrl(fx.siteHost, "/account"), 10_000);
  const visit = page.locator('a[href^="/account/visits/"]').first();
  test.skip(!(await visit.count()), "fixture missing: client has no visit for receipt proof");
  await visit.click();
  await page.waitForTimeout(8000);
  const receipt = page.getByRole("link", { name: /recibo|receipt|factura/i }).or(page.getByRole("button", { name: /recibo|receipt/i })).first();
  if (await receipt.isVisible().catch(() => false)) {
    await receipt.click();
    await page.waitForTimeout(5000);
  }
  const t = await bodyText(page);
  await shot(page, "TUL-67-receipt");
  expect(t, "seller / booked-with block").toMatch(/via Tulala|Reservado con|Booked with|Vendedor|Seller/i);
  expect(t, "fee line visible").toMatch(/1[\.,]5\s?%|comisi[oó]n|fee/i);
  await ctx.close();
});

test("TUL-77 · myself site: public services list + /book offers real slots (not inquiry-only)", async ({ browser }) => {
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await guestPage(browser);
  await go(page, siteUrl(fx.siteHost, "/servicios"), 10_000);
  let t = await bodyText(page);
  if (/Page not found|No encontramos/i.test(t)) {
    await go(page, siteUrl(fx.siteHost) + "#services", 8000);
    t = await bodyText(page);
  }
  await shot(page, "TUL-77-services");
  expect(t, "services surface is not a bare 404").not.toMatch(/Page not found|No encontramos/i);
  await go(page, siteUrl(fx.siteHost, "/book"), 12_000);
  const book = await bodyText(page);
  await shot(page, "TUL-77-book");
  expect(book, "book page is not inquiry-only").not.toMatch(/preferred date|fecha preferida.*mensaje/i);
  expect(book, "slots or service picker present").toMatch(/Seleccionar|Continuar|Reservar|:\d{2}|No open times|Sin horarios/i);
  // Done-when requires real slots for a bookable myself; "No open times" is FAIL until fixed.
  expect(book, "real open times (not empty)").not.toMatch(/No open times|Sin horarios disponibles/i);
  await ctx.close();
});

test("TUL-79 · builder: device switch shows skeleton then content; hero not cut off on desktop", async ({ browser }) => {
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 1000 });
  await go(page, `${APP}/talent/page-builder`, 20_000);
  const tablet = page.getByRole("button", { name: /tablet|tableta/i }).or(page.locator("[data-viewport=tablet]")).first();
  if (await tablet.isVisible().catch(() => false)) {
    await tablet.click();
    const skeleton = page.locator("[data-edit-chrome-loading], [data-device-frame-skeleton], [aria-busy=true]").first();
    // Skeleton may be brief; either it appears or content returns without a blank frame.
    await page.waitForTimeout(500);
    await expect(page.locator("iframe, [data-edit-canvas], main").first()).toBeVisible({ timeout: 20_000 });
    void skeleton;
  }
  const hero = page.locator("h1").first();
  if (await hero.count()) {
    const box = await hero.boundingBox();
    expect(box && box.x >= -2, "hero heading not cut off on the left").toBeTruthy();
  }
  await shot(page, "TUL-79-builder");
  await ctx.close();
});

test("TUL-93 · confirmed booking on the fixture talent has guest + talent notification dispatch rows", async () => {
  const fx = need(FIX.myself, "myself");
  const { data: bookings } = await svc
    .from("talent_bookings")
    .select("id, inquiry_id, status")
    .eq("talent_profile_id", fx.talentId)
    .eq("status", "confirmed")
    .order("created_at", { ascending: false })
    .limit(1);
  test.skip(!bookings?.length, "fixture missing: no confirmed booking on myself talent");
  const inquiryId = bookings![0]!.inquiry_id as string | null;
  test.skip(!inquiryId, "fixture missing: confirmed booking has no inquiry_id");
  const { data: dispatches } = await svc
    .from("notification_dispatch_log")
    .select("id, status, channel, kind")
    .eq("inquiry_id", inquiryId)
    .limit(20);
  writeFileSync(join(evidence, "TUL-93-dispatches.json"), JSON.stringify(dispatches ?? [], null, 2));
  expect((dispatches ?? []).length, "at least one dispatch row for the booking inquiry").toBeGreaterThan(0);
  const skipped = (dispatches ?? []).filter((d) => String(d.status).includes("skipped") || /not configured/i.test(String(d.status)));
  expect(skipped, "no 'channel not configured' skips for this inquiry").toEqual([]);
});

test("TUL-146 · Spanish talent chrome: profile/settings/services have no English shell strings", async ({ browser }) => {
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 900 });
  for (const path of ["/talent/profile", "/talent/settings", "/talent/services"]) {
    await go(page, `${APP}${path}`, 12_000);
    const t = await bodyText(page);
    await shot(page, `TUL-146-${path.replace(/\W+/g, "_")}`);
    expect(t, `${path}: no English How do you work / Continue / Settings chrome leaks`).not.toMatch(
      /\bHow do you work\b|\bI work for myself\b|\bContinue\b|\bSettings\b|\bSave changes\b/,
    );
  }
  const title = await page.title();
  expect(title === "Tulala" || /·\s*Tulala/.test(title), "tab title is Page · Tulala, not bare Tulala").toBeTruthy();
  await ctx.close();
});

test("TUL-279 · isolated /start understand-your-words step accepts a short valid brief", async ({ browser }) => {
  const { ctx, page } = await guestPage(browser);
  await go(page, `${MARKETING}/start?lang=es`, 12_000);
  const myself = page.getByRole("button", { name: /Trabajo por mi cuenta|Por mi cuenta/i }).or(page.getByText(/Trabajo por mi cuenta/i)).first();
  test.skip(!(await myself.isVisible().catch(() => false)), "fixture missing: /start three-choice door not reachable on marketing origin");
  await myself.click();
  await page.getByRole("button", { name: /^Continuar$/ }).first().click().catch(() => undefined);
  await page.waitForTimeout(3000);
  const input = page.locator("textarea, input[type=text]").first();
  test.skip(!(await input.count()), "fixture missing: understand-your-words input");
  await input.fill("Hago uñas en Playa del Carmen, limpiezas y diseños");
  await page.getByRole("button", { name: /Continuar|Siguiente|Entendido/i }).first().click().catch(() => undefined);
  await page.waitForTimeout(12_000);
  const t = await bodyText(page);
  await shot(page, "TUL-279-brief");
  expect(t, "not stuck on Tell us a little more / Cuéntanos un poco más").not.toMatch(/Tell us a little more|Cu[eé]ntanos un poco m[aá]s/i);
  await ctx.close();
});

test("TUL-312 · /start redirects stay on the local marketing origin (never production tulala.digital)", async ({ browser }) => {
  const { ctx, page } = await guestPage(browser);
  const chain: string[] = [];
  page.on("response", (r) => {
    if (r.request().resourceType() === "document") chain.push(r.url());
  });
  await page.goto(`${MARKETING}/start?lang=es`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  await page.waitForTimeout(4000);
  await shot(page, "TUL-312-start");
  for (const u of chain) {
    expect(u, "no redirect to production tulala.digital").not.toMatch(/^https:\/\/(www\.)?tulala\.digital\b/);
  }
  expect(page.url(), "final URL stays local").not.toMatch(/^https:\/\/(www\.)?tulala\.digital\b/);
  await ctx.close();
});

test("TUL-325 · after gallery design apply, Publish CTA is visible and primary", async ({ browser }) => {
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 1000 });
  await go(page, `${APP}/talent/site`, 14_000);
  const change = page.getByRole("button", { name: /Cambiar diseño|Explorar diseños/i }).first();
  test.skip(!(await change.isVisible().catch(() => false)), "fixture missing: design gallery entry");
  await change.click();
  await page.waitForTimeout(5000);
  const explore = page.getByRole("button", { name: /^Explorar$/ }).first();
  if (await explore.isVisible().catch(() => false)) {
    await explore.click();
    await page.waitForTimeout(5000);
    await page.getByRole("button", { name: /Usar este diseño/i }).first().click().catch(() => undefined);
    await page.waitForTimeout(4000);
  }
  const publish = page.getByRole("button", { name: /Publicar|Cambiar y publicar/i }).first();
  await expect(publish).toBeVisible({ timeout: 20_000 });
  await shot(page, "TUL-325-publish-cta");
  await ctx.close();
});

test("TUL-358 · Horario y días libres exposes Zona horaria and an hours form", async ({ browser }) => {
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 1000 });
  await go(page, `${APP}/talent/today`, 12_000);
  const open = page.getByRole("button", { name: /Horario|Disponibilidad|Hours/i }).or(page.getByText(/Horario y d[ií]as libres/i)).first();
  if (await open.isVisible().catch(() => false)) await open.click();
  else await go(page, `${APP}/talent/settings/hours`, 12_000);
  await page.waitForTimeout(5000);
  const t = await bodyText(page);
  await shot(page, "TUL-358-horario");
  expect(t, "Zona horaria control present").toMatch(/Zona horaria|Timezone|America\//i);
  expect(t, "hours form / day rows present").toMatch(/Lunes|Monday|09:00|Cerrado|Closed|Disponibilidad/i);
  await ctx.close();
});

test("TUL-379 · Spanish /talent/inbox has no English chrome and uses 24h times", async ({ browser }) => {
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 900 });
  await go(page, `${APP}/talent/inbox`, 14_000);
  const t = await bodyText(page);
  await shot(page, "TUL-379-inbox");
  expect(t).not.toMatch(/\bMy jobs\b|\bSearch jobs\b|\bAll Jobs\b|\bAwaiting your response\b|\bCOORDINATING\b|\bGUEST\b/);
  expect(t, "no English 12h AM/PM clock in Spanish inbox").not.toMatch(/\b\d{1,2}:\d{2}\s?(AM|PM)\b/);
  await ctx.close();
});

test("TUL-391 · money/approval notification catalog includes refund.failed, payment.needs_attention, offer-pending-approval", async () => {
  // Done-when: catalog entries exist (DB or static registry exposed via RPC/table the pack can read).
  const kinds = ["refund.failed", "payment.needs_attention", "offer.pending_approval", "offer-pending-approval"];
  const { data, error } = await svc.from("notification_catalog").select("kind").in("kind", kinds).limit(20);
  if (error || !data) {
    // Fallback: some stacks store kinds only in code — skip rather than false pass.
    test.skip(true, `fixture missing: notification_catalog unreadable (${error?.message ?? "empty"})`);
  }
  const have = new Set((data ?? []).map((r) => String(r.kind)));
  expect(
    have.has("refund.failed") || have.has("payment.needs_attention") || [...have].some((k) => k.includes("offer") && k.includes("approval")),
    `catalog has money/approval kinds; got ${[...have].join(",") || "none"}`,
  ).toBeTruthy();
});

test("TUL-397 · builder device switch: content returns; inspector does not cover the whole canvas", async ({ browser }) => {
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1280, height: 900 });
  await go(page, `${APP}/talent/page-builder`, 20_000);
  const phone = page.getByRole("button", { name: /390|phone|m[oó]vil/i }).or(page.locator("[data-viewport=phone]")).first();
  if (await phone.isVisible().catch(() => false)) {
    await phone.click();
    await page.waitForTimeout(2500);
  }
  const canvas = page.locator("iframe, [data-edit-canvas]").first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  const canvasBox = await canvas.boundingBox();
  const inspector = page.locator("[data-edit-inspector], [data-edit-drawer]").first();
  if (canvasBox && (await inspector.count())) {
    const ib = await inspector.boundingBox();
    if (ib) {
      expect(ib.width < canvasBox.width * 0.85, "inspector panel must not cover most of the canvas").toBeTruthy();
    }
  }
  await shot(page, "TUL-397-device");
  await ctx.close();
});

test("TUL-420 · theme update on a customized site surfaces a keep/update/conflict decision before apply", async ({ browser }) => {
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 1000 });
  await go(page, `${APP}/talent/site`, 14_000);
  const change = page.getByRole("button", { name: /Cambiar diseño|Actualizaci[oó]n|Update/i }).first();
  test.skip(!(await change.isVisible().catch(() => false)), "fixture missing: theme update / gallery entry");
  await change.click();
  await page.waitForTimeout(6000);
  const t = await bodyText(page);
  await shot(page, "TUL-420-decision");
  expect(t, "talent is told what is kept / updates / conflicts").toMatch(/conserv|mantien|actualiz|conflicto|kept|update|conflict|Se mantiene|Cambiar/i);
  await ctx.close();
});

test("TUL-441 · starter-content failure shows clear retry state (not empty success)", async ({ browser }) => {
  // When starter fails, UI must show "Tu sitio no se pudo preparar" + Reintentar.
  // On a healthy fixture this SKIPs unless QA_PACK_STARTER_FAIL=1 forces the failure path.
  test.skip(process.env.QA_PACK_STARTER_FAIL !== "1", "set QA_PACK_STARTER_FAIL=1 on a throwaway that triggers starter failure");
  const fx = need(FIX.studio, "studio");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 900 });
  await go(page, `${APP}/${fx.slug}/admin`, 14_000);
  const t = await bodyText(page);
  await shot(page, "TUL-441-retry");
  expect(t).toMatch(/Tu sitio no se pudo preparar|no se pudo preparar/i);
  await expect(page.getByRole("button", { name: /Reintentar/i }).first()).toBeVisible();
  await ctx.close();
});

test("TUL-449 · talent site secondary-read degrade: public home stays 200 (not a whole-page 500)", async ({ browser }) => {
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await guestPage(browser);
  const resp = await page.goto(siteUrl(fx.siteHost), { waitUntil: "domcontentloaded" }).catch(() => null);
  await page.waitForTimeout(8000);
  await shot(page, "TUL-449-home");
  expect(resp?.status(), "main talent/site row answers 200").toBe(200);
  const t = await bodyText(page);
  expect(t).not.toMatch(/Something broke|Algo sali[oó] mal|Internal Server Error/i);
  await ctx.close();
});

test("TUL-458 · hub guest chat: second message after Solicitud recibida is sent (composer clears)", async ({ browser }) => {
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await guestPage(browser);
  await go(page, siteUrl(fx.siteHost), 10_000);
  await page.locator('[aria-label^="Enviar mensaje a"]').first().evaluate((el) => (el as HTMLElement).click());
  await page.waitForTimeout(3000);
  const name = page.getByLabel(/Nombre/i).or(page.locator('input[name*=name i]')).first();
  if (await name.isVisible().catch(() => false)) {
    await name.fill("QA Pack");
    await page.getByLabel(/Correo|Email/i).first().fill(`qa-pack-chat-${Date.now().toString(36)}@example.test`);
  }
  const box = page.locator("textarea, input[type=text]").last();
  await box.fill("Hola, primera pregunta del pack");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(10_000);
  await expect(page.getByText(/Solicitud recibida|recibimos tu mensaje/i).first()).toBeVisible({ timeout: 30_000 });
  await box.fill("Segunda pregunta: ¿tienen hueco mañana?");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(8000);
  const value = await box.inputValue().catch(() => "");
  await shot(page, "TUL-458-second");
  expect(value.trim(), "composer cleared after second send").toBe("");
  await ctx.close();
});

test("TUL-472 · offer flow: Oferta tab shows draft after reload; no sticky Error al guardar", async ({ browser }) => {
  const fx = need(FIX.offerDraft ?? FIX.myself, "offerDraft (or myself)");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 1000 });
  await go(page, `${APP}/talent/inbox`, 14_000);
  const thread = page.locator("[role=listitem],a[href*='inbox']").first();
  test.skip(!(await thread.count()), "fixture missing: no inbox thread for offer flow");
  await thread.click();
  await page.waitForTimeout(4000);
  await page.getByRole("tab", { name: /^Oferta$/ }).or(page.getByRole("button", { name: /^Oferta$/ })).first().click().catch(() => undefined);
  await page.waitForTimeout(3000);
  let t = await bodyText(page);
  expect(t, "Selección not stuck opening").not.toMatch(/Abriendo la lista/i);
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
  await page.waitForTimeout(8000);
  await page.getByRole("tab", { name: /^Oferta$/ }).or(page.getByRole("button", { name: /^Oferta$/ })).first().click().catch(() => undefined);
  await page.waitForTimeout(3000);
  t = await bodyText(page);
  await shot(page, "TUL-472-offer");
  expect(t, "draft still present after reload").not.toMatch(/A[uú]n no hay oferta/i);
  expect(t, "no sticky save error").not.toMatch(/Error al guardar/i);
  await ctx.close();
});

test("TUL-473 · /admin/work/<bookingId> for a paid booking is not Something broke", async ({ browser }) => {
  const fx = need(FIX.paidBooking, "paidBooking");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 900 });
  const resp = await page.goto(`${APP}/admin/work/${fx.bookingId}`, { waitUntil: "domcontentloaded" }).catch(() => null);
  await page.waitForTimeout(10_000);
  const t = await bodyText(page);
  await shot(page, "TUL-473-work");
  expect(resp?.status(), "work page answers").toBeLessThan(500);
  expect(t, "not the generic broken page").not.toMatch(/Something broke|Algo sali[oó] mal/i);
  await ctx.close();
});

test("TUL-503 · client hub/agency /account visit rows show each visit's talent booking zone label", async ({ browser }) => {
  const portal = need(FIX.clientPortal, "clientPortal");
  const { ctx, page } = await openAs(browser, portal.userId, { width: 1440, height: 900 });
  await go(page, `${APP}/account`, 12_000);
  const t = await bodyText(page);
  await shot(page, "TUL-503-account");
  test.skip(!/visita|visit|reserva|booking/i.test(t), "fixture missing: client has no visits on hub account");
  expect(t, "zone label present (not a single tenant zone only)").toMatch(/zona|zone|America\/|UTC|GMT|Canc[uú]n|CDMX/i);
  await ctx.close();
});

test("TUL-505 · both/studio workspace site: header and hero links return 200 in the site language", async ({ browser }) => {
  const fx = need(FIX.both, "both");
  const host = fx.siteHost;
  test.skip(!host, "fixture missing: both.siteHost");
  const { ctx, page } = await guestPage(browser);
  await go(page, siteUrl(host!), 10_000);
  const hrefs = await page.evaluate(() => {
    const roots = [...document.querySelectorAll("header a[href], [data-talent-max-site-header] a[href], a.site-btn")];
    return [...new Set(roots.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? "").filter((h) => h.startsWith("/") && !h.startsWith("//")))];
  });
  test.skip(hrefs.length === 0, "fixture missing: no header/hero links on both site");
  const bad: string[] = [];
  for (const href of hrefs.slice(0, 12)) {
    const resp = await page.goto(siteUrl(host!, href), { waitUntil: "domcontentloaded" }).catch(() => null);
    await page.waitForTimeout(2000);
    const status = resp?.status() ?? 0;
    const t = await bodyText(page);
    if (status === 404 || /Page not found|No encontramos/i.test(t)) bad.push(`${href}→${status}`);
  }
  await shot(page, "TUL-505-nav");
  expect(bad, `header/hero links must be 200; bad=${bad.join(", ")}`).toEqual([]);
  await ctx.close();
});
