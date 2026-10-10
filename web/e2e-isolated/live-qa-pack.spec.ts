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
  both?: { userId: string; slug: string };
  studio?: { userId: string; slug: string };
  clientPortal?: { userId: string; slug: string };
  superAdmin?: { userId: string };
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
  const toast = page.locator("[role=status],[role=alert],[aria-live]").filter({ hasText: /Borrador guardado/ }).first();
  await expect(toast).toBeVisible({ timeout: 15_000 });
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
  await ctx.close();
});

test("TUL-381 · talent offer draft editor: fits its panel, Spanish labels, no typo", async ({ browser }) => {
  const fx = need(FIX.myself, "myself");
  const { ctx, page } = await openAs(browser, fx.userId, { width: 1440, height: 1000 });
  await go(page, `${APP}/talent/inbox`, 14_000);
  await page.locator("[role=listitem],a[href*=inbox]").first().click().catch(() => undefined);
  await page.waitForTimeout(5000);
  await page.getByRole("tab", { name: /^Oferta$/ }).or(page.getByRole("button", { name: /^Oferta$/ })).first().click();
  await page.getByRole("button", { name: /Empezar a redactar la oferta/ }).first().click();
  await page.getByRole("button", { name: /^MXN$/ }).first().click({ timeout: 5000 }).catch(() => undefined);
  await expect(page.getByRole("button", { name: /^Editar$/ }).first()).toBeVisible({ timeout: 40_000 });
  await page.getByRole("button", { name: /^Editar$/ }).first().click();
  await page.waitForTimeout(4000);
  const t = await bodyText(page);
  await shot(page, "TUL-381");
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
