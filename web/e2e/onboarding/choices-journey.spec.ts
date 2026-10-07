/**
 * TUL-16 / cards 82-85 · the three-choice sign-up journey, in Spanish, on the
 * ISOLATED stack only (Supabase project `fxlankepwnvelxjrahwk`, "qa-journeys").
 *
 * One fresh account per choice (`myself`, `studio`, `both`) per viewport
 * (desktop 1440x900, phone 390x844), signed up through the real front door
 * `/start?lang=es` on the marketing host, then checked against the isolated DB.
 * Numbered steps (the RESULTS.md columns):
 *   1 front door      200, step "choose", h1, 3 choices, readable contrast, pick
 *   2 screens + code  sentence, essentials, setup (services/price/hours/place),
 *                     look picker (talent), email, minted code
 *   3 DB accounts     profiles / talent_profiles / hub roster / owner membership /
 *                     brief module_state / essentials / locales / bio_i18n / design
 *   4 finish screen   the shown URL is real (served by the local stack, shows the
 *                     person's name), button copy per choice
 *   5 sign out + in   lands on the Spanish dashboard within 15 s
 *   6 guest booking   fresh context, no login, one service booked, row in the DB
 *
 * Run (stack up via web/scripts/onboarding-qa/dev.sh):
 *   cd web && ONB_EVIDENCE_DIR=<abs dir> PLAYWRIGHT_SKIP_WEBSERVER=1 \
 *     PLAYWRIGHT_BASE_URL=http://localhost:3105 \
 *     npx playwright test e2e/onboarding/choices-journey.spec.ts --workers=1
 *
 * Safety: refuses unless the env is the isolated project (guard below), never
 * fetches a non-local host (finish URLs on `*.tulala.digital` are mapped to the
 * local dev server by Chromium host-resolver rules and an http:// URL), and the
 * service role is only ever the isolated one (`isolatedService()` refuses prod).
 * A step that fails is recorded and the run continues with the next step.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { BrowserContext, Page } from "@playwright/test";

import { isolatedService } from "../cases/_isolated-db";
// @ts-ignore -- plain ESM script shared with the journeys seed/cleanup tools
import { assertIsolatedJourneysTarget } from "../../scripts/isolated-target-guard.mjs";
import { APP_BASE, MARKETING_BASE, expect, test } from "./_module";

type Choice = "myself" | "studio" | "both";
type Vp = "desktop" | "phone";
const CHOICES: Choice[] = ["myself", "studio", "both"];
const VIEWPORTS: Record<Vp, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
};
/** Local dev server behind the two host proxies (see scripts/onboarding-qa/dev.sh). */
const DEV_PORT = 3008;
const STAMP = Date.now().toString(36).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]).slice(-6);

const TALENT = (c: Choice) => c !== "studio";
const WORKSPACE = (c: Choice) => c !== "myself";
const EXPECTED = {
  myself: { appRole: "talent", home: "talent", cta: /Abrir mi sitio/i },
  studio: { appRole: "agency_staff", home: "workspace", cta: /Ir a mi panel|Abrir mi (espacio|sitio web)|Ver mi sitio/i },
  both: { appRole: "agency_staff", home: "workspace", cta: /Ir a mi panel|Abrir mi (espacio|sitio web)|Ver mi sitio/i },
} satisfies Record<Choice, { appRole: string; home: string; cta: RegExp }>;

const SERVICES = [
  { name: "Limpieza profunda", min: "90", price: "850" },
  { name: "Limpieza ligera", min: "60", price: "500" },
];

type StepResult = { n: number; name: string; status: "PASS" | "FAIL" | "SKIP"; detail?: string };

function evidenceDir(): string | null {
  return process.env.ONB_EVIDENCE_DIR ? resolve(process.env.ONB_EVIDENCE_DIR) : null;
}

class Run {
  results: StepResult[] = [];
  facts: Record<string, unknown> = {};
  private shots = 0;
  constructor(readonly choice: Choice, readonly vp: Vp) {}

  async shot(page: Page, name: string) {
    const dir = evidenceDir();
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    this.shots += 1;
    const nn = String(this.shots).padStart(2, "0");
    await page
      .screenshot({ path: `${dir}/${this.choice}-${this.vp}-${nn}-${name}.png`, type: "jpeg", quality: 55, fullPage: false })
      .catch(() => undefined);
  }

  async step(n: number, name: string, fn: () => Promise<void>) {
    try {
      await fn();
      this.results.push({ n, name, status: "PASS" });
    } catch (err) {
      this.results.push({ n, name, status: "FAIL", detail: String((err as Error).message ?? err).split("\n").slice(0, 6).join(" | ") });
    }
  }

  skip(n: number, name: string, why: string) {
    this.results.push({ n, name, status: "SKIP", detail: why });
  }

  save() {
    const dir = evidenceDir();
    if (!dir) return;
    mkdirSync(`${dir}/results`, { recursive: true });
    writeFileSync(`${dir}/results/${this.choice}-${this.vp}.json`, JSON.stringify({ choice: this.choice, viewport: this.vp, results: this.results, facts: this.facts }, null, 2));
  }

  failures() {
    return this.results.filter((r) => r.status === "FAIL");
  }
}

/** WCAG contrast of the h1 text against the first painted ancestor background. */
async function contrastOf(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(",").map((x) => parseFloat(x));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return 0;
    const fg = parse(getComputedStyle(el).color);
    let bg: { r: number; g: number; b: number; a: number } | null = null;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.95) {
        bg = c;
        break;
      }
    }
    if (!fg || !bg) return 0;
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  }, selector);
}

async function mintCode(email: string): Promise<string> {
  const link = await isolatedService().auth.admin.generateLink({ type: "magiclink", email });
  const otp = link.data?.properties?.email_otp ?? "";
  if (otp.length < 6) throw new Error(`could not mint a sign-in code (${link.error?.message ?? "no email_otp"})`);
  return otp;
}

async function fillCode(page: Page, otp: string) {
  const inputs = page.locator('[data-testid="onb-code"] input');
  const n = await inputs.count();
  for (let i = 0; i < Math.min(n, otp.length); i += 1) await inputs.nth(i).fill(otp[i]);
}

/** Pick the first row of a Picker (type or city). */
async function pick(page: Page, testId: string, text: string, fallbackOther?: string) {
  await page.getByTestId(testId).fill(text);
  const option = page.getByTestId(`${testId}-option`).first();
  if (await option.isVisible({ timeout: 8_000 }).catch(() => false)) await option.click();
  else if (fallbackOther) await page.getByTestId("onb-basics-other").fill(fallbackOther);
  else throw new Error(`no option for ${testId} "${text}"`);
}

/** Screens 2 and 3: sentence, essentials, setup, look, up to the account step. Returns the display name used. */
async function driveToAccount(page: Page, run: Run, choice: Choice, displayName: string) {
  const sentence = TALENT(choice) && !WORKSPACE(choice)
    ? "Soy limpiadora de casas en Playa del Carmen. Hago limpieza profunda y ligera, de lunes a sábado."
    : choice === "studio"
    ? "Tengo un estudio de limpieza de casas en Playa del Carmen con un equipo de tres personas. Hacemos limpieza profunda y ligera, de lunes a sábado."
    : "Tengo un estudio de limpieza en Playa del Carmen con un equipo, y también limpio casas yo misma. Hacemos limpieza profunda y ligera, de lunes a sábado.";

  await page.getByTestId("onb-sentence").fill(sentence);
  await page.getByTestId("onb-send").click();
  await page.getByTestId("onb-confirm-send").click();
  await run.shot(page, "words-sent");

  // After the words: the card (AI read, or the short form when the AI is off) then essentials.
  const accept = page.getByTestId("onb-accept");
  const essentials = page.getByTestId("onb-essentials");
  await expect(accept.or(essentials).or(page.getByTestId("onb-setup"))).toBeVisible({ timeout: 60_000 });
  if (await accept.isVisible().catch(() => false)) {
    await run.shot(page, "understood");
    await accept.click();
  }

  // Essentials (what you do, name, city, whatsapp for a business).
  if (await essentials.or(page.getByTestId("onb-name-input")).first().isVisible({ timeout: 15_000 }).catch(() => false)) {
    const change = page.getByTestId("onb-basics-what-change");
    if (await change.isVisible().catch(() => false)) await change.click();
    await pick(page, "onb-basics-what", "limpieza", "Limpieza de casas");
    await page.getByTestId("onb-name-input").fill(displayName);
    const cityChange = page.getByTestId("onb-basics-city-change");
    if (await cityChange.isVisible().catch(() => false)) await cityChange.click();
    await pick(page, "onb-basics-city", "Playa del Carmen");
    const wa = page.getByTestId("onb-whatsapp-input");
    if (await wa.isVisible().catch(() => false)) await wa.fill("984 123 4567");
    await run.shot(page, "essentials");
    await page.getByTestId("onb-next").click();
  }

  // Setup: services with price and minutes, weekly hours, place.
  await expect(page.getByTestId("onb-setup")).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < SERVICES.length; i += 1) {
    if ((await page.getByTestId(`onb-service-name-${i}`).count()) === 0) await page.getByTestId("onb-service-add").click();
    await page.getByTestId(`onb-service-name-${i}`).fill(SERVICES[i].name);
    await page.getByTestId(`onb-service-min-${i}`).fill(SERVICES[i].min);
    const quote = page.getByTestId(`onb-service-quote-${i}`);
    if (await quote.isChecked().catch(() => false)) await quote.uncheck();
    await page.getByTestId(`onb-service-price-${i}`).fill(SERVICES[i].price);
  }
  // Drop any extra prefilled service beyond the two typed (keeps the DB assertion exact).
  while ((await page.locator('[data-testid^="onb-service-name-"]').count()) > SERVICES.length) {
    const last = page.locator('[data-testid^="onb-service-name-"]').last();
    await last.locator("xpath=ancestor::div[contains(@class,'rounded')][1]").getByRole("button").first().click();
  }
  const day = page.getByTestId("onb-day-mon");
  if ((await day.getAttribute("aria-pressed")) !== "true") await day.click();
  await page.getByTestId("onb-hours-startMin").fill("09:00");
  await page.getByTestId("onb-hours-endMin").fill("18:00");
  await page.getByTestId("onb-hours-apply-all").click();
  await page.getByTestId("onb-place-studio").click();
  await page.getByTestId("onb-place-area").fill("Centro");
  const tz = page.getByTestId("onb-timezone");
  if (await tz.isVisible().catch(() => false)) await tz.selectOption({ index: 1 });
  await run.shot(page, "setup");
  await page.getByTestId("onb-setup-continue").click();

  // Business look (studio / both).
  const style = page.getByTestId("onb-style");
  const ready = page.getByTestId("onb-ready");
  await expect(style.or(ready)).toBeVisible({ timeout: 30_000 });
  if (await style.isVisible().catch(() => false)) {
    await page.locator('[data-testid^="onb-style-"]:not([data-testid$="notes"]):not([data-testid$="continue"]):not([data-testid="onb-style"])').first().click();
    await run.shot(page, "style");
    await page.getByTestId("onb-style-continue").click();
  }

  // Ready: link (business), look picker (talent).
  await expect(ready).toBeVisible({ timeout: 30_000 });
  if (!TALENT(choice) || choice === "both") {
    await expect(page.getByTestId("onb-link-available")).toBeVisible({ timeout: 30_000 });
  }
  const design = page.locator('[data-testid^="onb-design-"]:not([data-testid="onb-design-keep"])').first();
  if (TALENT(choice) && (await design.isVisible({ timeout: 3_000 }).catch(() => false))) {
    await design.click();
    await run.shot(page, "look-picker");
  }
  run.facts.readyLink = await page.getByTestId("onb-link-value").innerText().catch(() => null);
  await run.shot(page, "ready");
}

async function signUpWithCode(page: Page, run: Run, email: string) {
  await page.getByTestId("onb-build").click();
  await expect(page.getByTestId("onb-save")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("onb-email").fill(email);
  await page.getByTestId("onb-age-terms").check();
  await run.shot(page, "email");
  await page.getByTestId("onb-email-cta").click();
  await expect(page.getByTestId("onb-code")).toBeVisible({ timeout: 30_000 });
  await run.shot(page, "code");
  // The isolated auth hook has no secret: mint the code like account.spec.ts does.
  await fillCode(page, await mintCode(email));
  await expect(page.getByTestId("onb-building").or(page.getByTestId("onb-arrival"))).toBeVisible({ timeout: 30_000 });
  await run.shot(page, "building");
}

/** `https://<slug>.tulala.digital/...` -> `http://<slug>.tulala.digital:3008/...`; resolved to 127.0.0.1 by Chromium. */
function toLocalUrl(href: string): string {
  const u = new URL(href, MARKETING_BASE);
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return u.toString();
  if (!u.hostname.endsWith(".tulala.digital")) throw new Error(`refusing to open a non-Tulala host: ${u.hostname}`);
  return `http://${u.hostname}:${DEV_PORT}${u.pathname}${u.search}`;
}

async function getUserId(email: string): Promise<string> {
  const admin = isolatedService();
  for (let page = 1; page <= 20; page += 1) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const hit = data?.users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (!data?.users.length || data.users.length < 200) break;
  }
  throw new Error("account not found in auth.users");
}

async function assertAccounts(run: Run, choice: Choice, userId: string, displayName: string) {
  const admin = isolatedService();
  const expected = EXPECTED[choice];
  const { data: prof } = await admin.from("profiles").select("app_role, home_surface_preference, account_status").eq("id", userId).maybeSingle();
  run.facts.profile = prof;
  expect(prof?.app_role, "profiles.app_role").toBe(expected.appRole);
  expect(prof?.home_surface_preference, "profiles.home_surface_preference").toBe(expected.home);

  const { data: brief } = await admin.from("tulala_briefs").select("id, module_state").eq("profile_id", userId).neq("status", "abandoned").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const ms = (brief?.module_state ?? {}) as { choice?: string; locale?: string };
  run.facts.brief = { id: brief?.id, choice: ms.choice, locale: ms.locale };
  expect(ms.choice, "module_state.choice").toBe(choice);
  expect(ms.locale, "module_state.locale").toBe("es");

  let talentId: string | null = null;
  if (TALENT(choice)) {
    const { data: tp } = await admin.from("talent_profiles").select("id, profile_code, display_name, preferred_locale, bio_i18n").eq("user_id", userId).is("deleted_at", null).maybeSingle();
    expect(tp, "talent_profiles row").toBeTruthy();
    talentId = tp!.id as string;
    const bio = (tp!.bio_i18n ?? {}) as Record<string, unknown>;
    run.facts.talent = { id: talentId, code: tp!.profile_code, preferred_locale: tp!.preferred_locale, bioLocales: Object.keys(bio) };
    expect(tp!.preferred_locale, "talent_profiles.preferred_locale").toBe("es");
    expect(String(bio.es ?? "").length, "bio_i18n.es").toBeGreaterThan(0);
    expect(String(bio.en ?? "").length, "bio_i18n.en").toBeGreaterThan(0);
    const { data: hub } = await admin.from("agency_talent_roster").select("tenant_id, status").eq("talent_profile_id", talentId).eq("status", "active");
    run.facts.hubRoster = (hub ?? []).length;
    expect((hub ?? []).length, "active hub roster row").toBeGreaterThan(0);
    const { data: site } = await admin.from("talent_sites").select("site_slug, theme_design_slug, site_published_at").eq("talent_profile_id", talentId).maybeSingle();
    run.facts.talentSite = site;
    expect(site?.theme_design_slug, "talent_sites.theme_design_slug").toBe("maison-v2");
    const { data: offers } = await admin.from("talent_offerings").select("title, amount_cents, duration_minutes").eq("talent_profile_id", talentId);
    run.facts.talentOfferings = offers;
    for (const s of SERVICES) {
      const row = (offers ?? []).find((o) => o.title === s.name);
      expect(row, `talent_offerings "${s.name}"`).toBeTruthy();
      expect(Number(row!.amount_cents), `price of ${s.name}`).toBe(Number(s.price) * 100);
    }
    const { data: hours } = await admin.from("talent_booking_hours").select("*").eq("talent_profile_id", talentId).limit(10);
    run.facts.bookingHoursRows = (hours ?? []).length;
    expect((hours ?? []).length, "talent_booking_hours rows").toBeGreaterThan(0);
    const { data: tpBook } = await admin.from("talent_profiles").select("booking_terms").eq("id", talentId).maybeSingle();
    run.facts.place = (tpBook?.booking_terms as { place?: unknown } | null)?.place ?? null;
    expect(run.facts.place, "booking_terms.place").toBeTruthy();
  } else {
    const { count } = await admin.from("talent_profiles").select("id", { count: "exact", head: true }).eq("user_id", userId).is("deleted_at", null);
    expect(count, "studio creates no talent profile").toBe(0);
  }

  if (WORKSPACE(choice)) {
    const { data: members } = await admin.from("agency_memberships").select("tenant_id, role").eq("user_id", userId);
    run.facts.memberships = members;
    const owner = (members ?? []).find((m) => String(m.role).toLowerCase().includes("owner"));
    expect(owner, "agency owner membership").toBeTruthy();
    const tenantId = owner!.tenant_id as string;
    const { data: agency } = await admin.from("agencies").select("id, slug, display_name, settings").eq("id", tenantId).maybeSingle();
    run.facts.workspace = { id: tenantId, slug: agency?.slug };
    const { data: ident } = await admin.from("agency_business_identity").select("default_locale, public_name").eq("tenant_id", tenantId).maybeSingle();
    run.facts.businessIdentity = { default_locale: ident?.default_locale };
    expect(ident?.default_locale, "agency_business_identity.default_locale").toBe("es");
    const { data: offers } = await admin.from("talent_offerings").select("title, amount_cents").eq("tenant_id", tenantId).eq("owner_kind", "workspace");
    run.facts.workspaceOfferings = offers;
    for (const s of SERVICES) {
      const row = (offers ?? []).find((o) => o.title === s.name);
      expect(row, `workspace offering "${s.name}"`).toBeTruthy();
      expect(Number(row!.amount_cents)).toBe(Number(s.price) * 100);
    }
    const settings = (agency?.settings ?? {}) as { opening_hours?: unknown; business_place?: unknown };
    expect(settings.opening_hours, "agencies.settings.opening_hours").toBeTruthy();
    expect(settings.business_place, "agencies.settings.business_place").toBeTruthy();
    if (choice === "both" && talentId) {
      const { data: self } = await admin.from("agency_talent_roster").select("status").eq("tenant_id", tenantId).eq("talent_profile_id", talentId).maybeSingle();
      run.facts.selfRoster = self?.status ?? null;
      expect(self?.status, "owner is on her own workspace roster").toBe("active");
    }
  } else {
    const { count } = await admin.from("agency_memberships").select("id", { count: "exact", head: true }).eq("user_id", userId);
    expect(count ?? 0, "myself creates no workspace membership").toBe(0);
  }
  void displayName;
}

async function guestBook(browserCtx: BrowserContext, run: Run, finishHref: string, displayName: string, guestEmail: string) {
  const page = await browserCtx.newPage();
  const url = toLocalUrl(finishHref);
  run.facts.guestUrl = url.replace(/^http:\/\//, "").replace(`:${DEV_PORT}`, "");
  const res = await page.goto(url, { waitUntil: "domcontentloaded" });
  expect(res?.status(), "finish URL status").toBe(200);
  await expect(page.locator("body")).toContainText(displayName, { timeout: 30_000 });
  await run.shot(page, "guest-site");
  // Service -> slot -> details -> confirm (booking widget, same selectors as e2e/cases/*).
  const bookEntry = page.getByRole("button", { name: new RegExp(`Reservar|Agendar|${SERVICES[0].name}`, "i") }).first();
  if (await bookEntry.isVisible({ timeout: 10_000 }).catch(() => false)) await bookEntry.click();
  const serviceChoice = page.getByText(SERVICES[0].name).first();
  if (await serviceChoice.isVisible({ timeout: 5_000 }).catch(() => false)) await serviceChoice.click().catch(() => undefined);
  const slot = page.locator("[data-testid=slot-picker] button").first();
  await expect(slot, "an available slot").toBeVisible({ timeout: 45_000 });
  await slot.click();
  await run.shot(page, "guest-slot");
  const name = page.getByTestId("cb-name").or(page.getByRole("textbox", { name: /nombre|your name/i })).first();
  await name.fill("Invitada QA");
  await page.getByTestId("cb-email").or(page.getByRole("textbox", { name: /correo|email/i })).first().fill(guestEmail);
  const phone = page.getByTestId("cb-phone").or(page.getByRole("textbox", { name: /whatsapp|tel/i })).first();
  if (await phone.isVisible().catch(() => false)) await phone.fill("984 765 4321");
  await run.shot(page, "guest-details");
  await page.getByRole("button", { name: /confirmar|reservar|confirm this time|enviar solicitud/i }).last().click();
  await expect(page.getByText(/confirmad|reserva|listo|solicitud enviada|gracias|booked/i).first()).toBeVisible({ timeout: 45_000 });
  await run.shot(page, "guest-confirmation");
  const admin = isolatedService();
  const { data: cust } = await admin.from("customers").select("id").eq("email", guestEmail).limit(1).maybeSingle();
  const { data: inq } = await admin.from("inquiries").select("id, status").eq("contact_email", guestEmail).limit(1).maybeSingle();
  let orderId: string | null = null;
  if (cust?.id) {
    const { data: order } = await admin.from("orders").select("id, status, source_channel").eq("customer_id", cust.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    orderId = (order?.id as string | undefined) ?? null;
    run.facts.guestOrder = order ? { id: order.id, status: order.status, channel: order.source_channel } : null;
  }
  run.facts.guestInquiry = inq ? { id: inq.id, status: inq.status } : null;
  expect(orderId ?? inq?.id, "a booking row (order or inquiry) for the guest exists in the isolated DB").toBeTruthy();
  await page.close();
}

// Chromium maps every *.tulala.digital name to this machine; finish URLs are opened as http://<host>:3008.
test.use({ launchOptions: { args: ["--host-resolver-rules=MAP *.tulala.digital 127.0.0.1"] } });

test.beforeAll(() => {
  // Refuse unless the loaded env is the isolated project (exits the process otherwise).
  assertIsolatedJourneysTarget(process.env);
  const base = process.env.PLAYWRIGHT_BASE_URL ?? MARKETING_BASE;
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base.replace(/\/$/, ""))) {
    throw new Error(`refusing a non-local base URL: ${base}`);
  }
});

for (const vp of Object.keys(VIEWPORTS) as Vp[]) {
  test.describe(`onboarding choices · ${vp}`, () => {
    test.use({ viewport: VIEWPORTS[vp] });

    for (const choice of CHOICES) {
      test(`${choice} · ${vp}`, async ({ page, context, browser }) => {
        test.setTimeout(420_000);
        const run = new Run(choice, vp);
        const email = `qa-onb-choice-${choice}-${vp}-${STAMP}@impronta.test`;
        const displayName = `${choice === "studio" ? "Estudio" : "Rosa"} ${choice} ${vp} ${STAMP}`;
        let userId = "";
        let finishHref = "";

        // 1 · the front door.
        await run.step(1, "front door", async () => {
          const res = await page.goto(`${MARKETING_BASE}/start?lang=es`);
          expect(res?.status()).toBe(200);
          await expect(page.getByTestId("onb-page")).toBeVisible({ timeout: 30_000 });
          await expect(page.getByTestId("onb-choose")).toBeVisible();
          await expect(page.getByRole("heading", { level: 1 })).toHaveText("¿Cómo trabajas?");
          for (const c of CHOICES) await expect(page.getByTestId(`onb-choice-${c}`)).toBeVisible();
          const ratio = await contrastOf(page, "h1");
          run.facts.h1Contrast = Math.round(ratio * 100) / 100;
          expect(ratio, "h1 contrast on its painted background").toBeGreaterThanOrEqual(4.5);
          const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
          expect(bg, "page background is painted").not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
          await run.shot(page, "choose");
          await page.getByTestId(`onb-choice-${choice}`).click();
          await expect(page.getByTestId("onb-creates")).toBeVisible();
          await run.shot(page, "choice-picked");
          await page.getByTestId("onb-choose-continue").click();
          await expect(page.getByTestId("onb-entry")).toBeVisible({ timeout: 20_000 });
        });

        // 2 · screens, email, code.
        await run.step(2, "screens + email code", async () => {
          await driveToAccount(page, run, choice, displayName);
          await signUpWithCode(page, run, email);
          userId = await getUserId(email);
          run.facts.userId = userId;
        });

        // The build and arrival (needed by 3 and 4).
        let arrived = false;
        await run.step(3, "build + DB accounts and essentials", async () => {
          await expect(page.getByTestId("onb-arrival")).toBeVisible({ timeout: 180_000 });
          arrived = true;
          await run.shot(page, "arrival");
          await assertAccounts(run, choice, userId, displayName);
        });

        // 4 · finish screen.
        await run.step(4, "finish screen + URL is real", async () => {
          if (!arrived) throw new Error("no arrival screen");
          const cta = page.getByTestId("onb-arrival-view").or(page.getByTestId("onb-arrival-cta")).first();
          run.facts.finishButtonText = (await cta.innerText()).trim();
          await expect(cta).toHaveText(EXPECTED[choice].cta);
          const link = page.getByTestId("onb-arrival-visit").or(page.getByTestId("onb-arrival-cta")).first();
          finishHref = (await link.getAttribute("href")) ?? "";
          expect(finishHref, "finish link present").toBeTruthy();
          run.facts.finishHost = (() => {
            try { return new URL(finishHref, MARKETING_BASE).host; } catch { return finishHref; }
          })();
          const probe = await context.newPage();
          const res = await probe.goto(toLocalUrl(finishHref), { waitUntil: "domcontentloaded" });
          expect(res?.status(), "finish URL status").toBe(200);
          await expect(probe.locator("body")).toContainText(TALENT(choice) && !WORKSPACE(choice) ? displayName : displayName, { timeout: 30_000 });
          await run.shot(probe, "finish-url");
          await probe.close();
          await run.shot(page, "finish");
        });

        // 5 · sign out, sign in again, Spanish dashboard.
        await run.step(5, "sign out and back in lands on the Spanish dashboard", async () => {
          await context.clearCookies();
          const params = new URLSearchParams({ email, next: "/" });
          let setCookies: string[] = [];
          for (let attempt = 1; attempt <= 6 && !setCookies.length; attempt += 1) {
            const r = await page.request.get(`${APP_BASE}/api/dev/signin?${params.toString()}`, { maxRedirects: 0 });
            if (r.status() === 307) setCookies = r.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
            else await page.waitForTimeout(500 * attempt);
          }
          if (!setCookies.length) throw new Error("dev sign-in never answered 307");
          const host = new URL(MARKETING_BASE).hostname;
          await context.addCookies(
            setCookies.map((h) => {
              const [pair] = h.split(";");
              const eq = pair.indexOf("=");
              return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), domain: host, path: "/" };
            }),
          );
          const t0 = Date.now();
          await page.goto(`${APP_BASE}/`, { waitUntil: "domcontentloaded" });
          const dashboard = page.getByText(/^Hoy$/).or(page.getByRole("heading", { name: /Hoy|Panel|Resumen/ })).first();
          await expect(dashboard).toBeVisible({ timeout: 15_000 });
          run.facts.landingMs = Date.now() - t0;
          run.facts.landingPath = new URL(page.url()).pathname;
          await expect(page.getByText(/Profile created/i)).toHaveCount(0);
          expect(page.url()).not.toMatch(/\/onboarding\/role/);
          expect(await page.evaluate(() => document.documentElement.lang)).toMatch(/^es/);
          await run.shot(page, "dashboard-es");
        });

        // 6 · guest books one service on the public site.
        await run.step(6, "guest books a service", async () => {
          if (!finishHref) throw new Error("no finish URL to open");
          const guestCtx = await browser.newContext({ viewport: VIEWPORTS[vp], locale: "es-MX" });
          try {
            await guestBook(guestCtx, run, finishHref, displayName, `qa-onb-guest-${choice}-${vp}-${STAMP}@impronta.test`);
          } finally {
            await guestCtx.close();
          }
        });

        run.save();
        const failed = run.failures();
        expect(failed, failed.map((f) => `step ${f.n} ${f.name}: ${f.detail}`).join("\n")).toHaveLength(0);
      });
    }
  });
}
