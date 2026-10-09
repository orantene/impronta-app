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
 * Run local (stack up via web/scripts/onboarding-qa/dev.sh):
 *   cd web && JOURNEY_TARGET=local ONB_EVIDENCE_DIR=<abs dir> PLAYWRIGHT_SKIP_WEBSERVER=1 \
 *     PLAYWRIGHT_BASE_URL=http://localhost:3105 \
 *     npx playwright test e2e/onboarding/choices-journey.spec.ts --workers=1
 * Run against isolated staging: see docs/plans/qa-evidence/onboarding-choices-2026-10-07/RUNBOOK.md
 * (JOURNEY_MARKETING_ORIGIN / JOURNEY_APP_ORIGIN / JOURNEY_TALENT_HOST_TEMPLATE, no defaults).
 *
 * Safety: refuses unless the env is the isolated project (guard below) and every
 * origin is localhost or staging-qa-*.tulala.digital (scripts/onboarding-qa/target-guard.mjs;
 * locally, finish URLs on `*.tulala.digital` are mapped to the dev server by Chromium
 * host-resolver rules and an http:// URL), and the
 * service role is only ever the isolated one (`isolatedService()` refuses prod).
 * A step that fails is recorded and the run continues with the next step.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { BrowserContext, Page } from "@playwright/test";

import { isolatedService } from "../cases/_isolated-db";
// @ts-ignore -- plain ESM script shared with the journeys seed/cleanup tools
import { assertIsolatedJourneysTarget } from "../../scripts/isolated-target-guard.mjs";
// @ts-ignore -- plain ESM, unit-tested in scripts/onboarding-qa/target-guard.test.mjs
import { assertAllowedOrigins, bypassHeadersFor, resolveJourneyTargets, talentHostFor } from "../../scripts/onboarding-qa/target-guard.mjs";
import { createServerClient } from "@supabase/ssr";
import { expect, test as baseTest } from "./_module";
import { confirmAge18AndBuild } from "./_age18";

// Origins come ONLY from env (JOURNEY_MARKETING_ORIGIN, JOURNEY_APP_ORIGIN, JOURNEY_TALENT_HOST_TEMPLATE); JOURNEY_TARGET=local
// is the only way to get the localhost defaults. Throws at load unless every origin is localhost or staging-qa-*.tulala.digital
// (or JOURNEY_ALLOWED_HOSTS), and never production / Impronta. See the RUNBOOK next to the evidence.
const TARGET = resolveJourneyTargets(process.env) as { local: boolean; marketing: string; app: string; talentHostTemplate: string | null };
const MARKETING_BASE = TARGET.marketing;
const APP_BASE = TARGET.app;

/** Vercel deployment-protection bypass, added per request ONLY for allow-listed hosts (never other origins); the value is never logged. */
async function armBypass(ctx: BrowserContext) {
  if (!process.env.VERCEL_AUTOMATION_BYPASS_SECRET) return;
  await ctx.route("**/*", (route) => {
    const extra = bypassHeadersFor(route.request().url(), process.env) as Record<string, string>;
    return Object.keys(extra).length ? route.continue({ headers: { ...route.request().headers(), ...extra } }) : route.continue();
  });
}
const test = baseTest.extend({
  context: async ({ context }, use) => {
    await armBypass(context);
    await use(context);
  },
});
/** GET for the dev sign-in endpoint; APIRequestContext is not routed, so the bypass header is passed explicitly. */
function apiGet(page: Page, url: string) {
  return page.request.get(url, { maxRedirects: 0, headers: bypassHeadersFor(url, process.env) as Record<string, string> });
}

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
  // Studio has no provider yet: its Finish is the inquiry-only variant (no view/cta button), asserted in step 4.
  studio: { appRole: "agency_staff", home: "workspace", cta: /^$/ },
  both: { appRole: "talent", home: "workspace", cta: /Ir a mi panel|Abrir mi (espacio|sitio web)|Ver mi sitio/i },
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
  page: Page | null = null;
  constructor(readonly choice: Choice, readonly vp: Vp) {}

  async shot(page: Page, name: string) {
    const dir = evidenceDir();
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    this.shots += 1;
    const nn = String(this.shots).padStart(2, "0");
    await page
      .screenshot({ path: `${dir}/${this.choice}-${this.vp}-${nn}-${name}.jpg`, type: "jpeg", quality: 55, fullPage: false })
      .catch(() => undefined);
  }

  async step(n: number, name: string, fn: () => Promise<void>) {
    try {
      await fn();
      this.results.push({ n, name, status: "PASS" });
    } catch (err) {
      if (this.page) {
        await this.shot(this.page, `FAIL-step${n}`);
        const ids = await this.page.evaluate(() => Array.from(document.querySelectorAll("[data-testid^='onb-']")).map((e) => e.getAttribute("data-testid")).slice(0, 12).join(",")).catch(() => "");
        this.facts[`visibleAtFail${n}`] = ids;
      }
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


/**
 * Session without /api/dev/signin (not available on a prod build): mint an email OTP with the admin API and verify it
 * through a cookie-capturing @supabase/ssr client, i.e. the same cookies the app's own email-code sign-in sets.
 * Returns "name=value" strings (the consumers only read the part before the first ";").
 */
async function mintSessionCookies(email: string): Promise<string[]> {
  const jar = new Map<string, string>();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sb = createServerClient(url, anon, {
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach((c) => (c.value ? jar.set(c.name, c.value) : jar.delete(c.name))),
    },
  });
  const otp = await mintCode(email);
  const { error } = await sb.auth.verifyOtp({ email, token: otp, type: "email" });
  if (error) throw new Error(`could not verify the minted code: ${error.message}`);
  if (!jar.size) throw new Error("no session cookies minted");
  return Array.from(jar, ([k, v]) => `${k}=${v}`);
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
  if (await option.waitFor({ timeout: fallbackOther ? 6_000 : 25_000 }).then(() => true, () => false)) await option.click();
  else if (fallbackOther) await page.getByTestId("onb-basics-other").fill(fallbackOther);
  else throw new Error(`no option for ${testId} "${text}"`);
}

/** Write the facts an AI read would have produced into the guest brief that holds `sentence`. */
async function seedGuestBrief(sentence: string, choice: Choice, displayName: string) {
  const admin = isolatedService();
  const { data: brief, error } = await admin
    .from("tulala_briefs")
    .select("id, module_state")
    .filter("module_state->input->>value", "eq", sentence)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !brief) throw new Error(`guest brief for the sentence not found (${error?.message ?? "none"})`);
  const talent: Array<[string, unknown]> = [
    ["person.professional_name", displayName],
    ["work.discipline", "Housekeeper"],
    ["person.city", "Playa del Carmen"],
    ["work.services", SERVICES.map((x) => x.name)],
  ];
  const business: Array<[string, unknown]> = [
    ["business.name", displayName],
    ["business.exists", true],
    ["work.industry", "Cleaning service"],
    ["person.city", "Playa del Carmen"],
    ["work.services", SERVICES.map((x) => x.name)],
    ["presence.whatsapp", "+529849876543"],
  ];
  const facts = choice === "myself" ? [...talent, ["business.works_alone", true] as [string, unknown]] : choice === "studio" ? business : [...business, ["person.professional_name", displayName] as [string, unknown]];
  const rows = facts.map(([k, v]) => ({ brief_id: brief.id, fact_key: k, fact_value: v, source: "user_stated", status: "confirmed", confidence: 1 }));
  const ins = await admin.from("tulala_brief_facts").insert(rows);
  if (ins.error) throw new Error(`seed facts: ${ins.error.message}`);
  const ms = (brief.module_state ?? {}) as Record<string, unknown>;
  await admin.from("tulala_briefs").update({ module_state: { ...ms, step: "understood", updatedAt: new Date().toISOString() } }).eq("id", brief.id);
}

/** Screens 2 and 3: sentence, essentials, setup, look, up to the account step. Returns the display name used. */
async function driveToAccount(page: Page, run: Run, choice: Choice, displayName: string) {
  const sentence = TALENT(choice) && !WORKSPACE(choice)
    ? `Me llamo ${displayName}. Soy limpiadora de casas en Playa del Carmen. Hago limpieza profunda y ligera, de lunes a sábado.`
    : choice === "studio"
    ? `Soy ${displayName}. Tengo un estudio de limpieza de casas en Playa del Carmen con un equipo de tres personas. Hacemos limpieza profunda y ligera, de lunes a sábado.`
    : `Soy ${displayName}. Tengo un estudio de limpieza en Playa del Carmen con un equipo, y también limpio casas yo misma. Hacemos limpieza profunda y ligera, de lunes a sábado.`;

  run.facts.sentence = sentence;
  await page.getByTestId("onb-sentence").fill(sentence);
  await page.getByTestId("onb-send").click();
  await page.getByTestId("onb-confirm-send").click();
  await run.shot(page, "words-sent");

  // After the words: the card (AI read) or, with the AI off, the "too little" dead end.
  const accept = page.getByTestId("onb-accept");
  const essentials = page.getByTestId("onb-essentials");
  const tooLittle = page.getByTestId("onb-too-little");
  await expect(accept.or(essentials).or(page.getByTestId("onb-setup")).or(tooLittle)).toBeVisible({ timeout: 60_000 });
  if (await tooLittle.isVisible().catch(() => false)) {
    // PRODUCT FINDING (recorded in RESULTS.md): the isolated stack has no AI provider, the understand step reads
    // nothing and the only exit is "say it again" (a loop). Work around it as the older specs do: write the facts
    // the AI would have read into this guest brief with the service role, then resume it.
    run.facts.aiRead = "off: too-little dead end; facts seeded with the service role";
    await run.shot(page, "too-little-dead-end");
    await seedGuestBrief(sentence, choice, displayName);
    await page.reload();
    await page.getByTestId("onb-resume-continue").click({ timeout: 30_000 });
    await expect(accept).toBeVisible({ timeout: 30_000 });
  }
  if (await accept.isVisible().catch(() => false)) {
    await run.shot(page, "understood");
    await accept.click();
  }

  // Essentials (what you do, name, city, whatsapp for a business).
  if (await essentials.waitFor({ timeout: 15_000 }).then(() => true, () => false)) {
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
  const day = page.getByTestId("onb-day-1");
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
  if (TALENT(choice) && (await design.waitFor({ timeout: 3_000 }).then(() => true, () => false))) {
    await design.click();
    await run.shot(page, "look-picker");
  }
  run.facts.readyLink = await page.getByTestId("onb-link-value").innerText().catch(() => null);
  await run.shot(page, "ready");
}

async function signUpWithCode(page: Page, run: Run, email: string) {
  await confirmAge18AndBuild(page); // ticks 18+ when shown, waits for "Guardar y construir" to be enabled, clicks it
  await expect(page.getByTestId("onb-save")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("onb-email").fill(email);
  await page.getByTestId("onb-age-terms").check();
  await run.shot(page, "email");
  await page.getByTestId("onb-email-cta").click();
  const code = page.getByTestId("onb-code");
  const sendError = page.getByTestId("onb-error");
  await expect(code.or(sendError)).toBeVisible({ timeout: 30_000 });
  if (await code.isVisible().catch(() => false)) {
    await run.shot(page, "code");
    // The isolated auth hook has no secret: mint the code like account.spec.ts does.
    await fillCode(page, await mintCode(email));
    await expect(page.getByTestId("onb-building").or(page.getByTestId("onb-arrival"))).toBeVisible({ timeout: 30_000 });
    await run.shot(page, "building");
    run.facts.emailCode = "typed (minted with generateLink)";
    return;
  }
  // The send hook of the isolated project rejects (no secret): the module says so and keeps the address.
  run.facts.emailCode = `send failed on the isolated stack ("Hook requires authorization token"); UI error shown: ${(await sendError.innerText()).slice(0, 80)}`;
  await run.shot(page, "code-send-error");
  // Fallback: same end state as verifyOnboardingCode (user + brief claimed + session), without the email code UI.
  const admin = isolatedService();
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  const uid = created.data.user?.id;
  if (!uid) throw new Error(`could not create the test user: ${created.error?.message}`);
  const sentence = String(run.facts.sentence ?? "");
  const { data: brief } = await admin.from("tulala_briefs").select("id, module_state").filter("module_state->input->>value", "eq", sentence).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!brief) throw new Error("guest brief not found to claim");
  const claim = await admin.from("tulala_briefs").update({ profile_id: uid, guest_session_id: null, module_state: { ...((brief.module_state ?? {}) as Record<string, unknown>), step: "readyToBuild" } }).eq("id", brief.id);
  if (claim.error) throw new Error(`claim brief: ${claim.error.message}`);
  const setCookies = await mintSessionCookies(email);
  const host = new URL(MARKETING_BASE).hostname;
  await page.context().addCookies(
    setCookies.map((h) => {
      const [pair] = h.split(";");
      const eq = pair.indexOf("=");
      return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), domain: host, path: "/" };
    }),
  );
  await page.goto(`${MARKETING_BASE}/start?lang=es`);
  await expect(page.getByTestId("onb-building").or(page.getByTestId("onb-arrival")).or(page.getByTestId("onb-ready")).or(page.getByTestId("onb-save"))).toBeVisible({ timeout: 30_000 });
  if (await page.getByTestId("onb-ready").isVisible().catch(() => false)) await page.getByTestId("onb-build").click();
  await run.shot(page, "building");
}

/**
 * Local: `https://<slug>.tulala.digital/...` -> `http://<slug>.tulala.digital:3008/...` (Chromium resolves it to 127.0.0.1).
 * Staging: the slug host is rebuilt from JOURNEY_TALENT_HOST_TEMPLATE (never a real `<slug>.tulala.digital` host); hosts
 * already allow-listed are used as given.
 */
function toLocalUrl(href: string): string {
  const u = new URL(href, MARKETING_BASE);
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return u.toString();
  if (TARGET.local) {
    if (!u.hostname.endsWith(".tulala.digital")) throw new Error(`refusing to open a non-Tulala host: ${u.hostname}`);
    return `http://${u.hostname}:${DEV_PORT}${u.pathname}${u.search}`;
  }
  try {
    assertAllowedOrigins({ finishUrl: u.origin }, process.env);
    return u.toString();
  } catch {
    if (!u.hostname.endsWith(".tulala.digital") || !TARGET.talentHostTemplate) throw new Error(`refusing to open a non-allow-listed host: ${u.hostname}`);
    const host = talentHostFor(u.hostname.split(".")[0], TARGET.talentHostTemplate, process.env);
    return `https://${host}${u.pathname}${u.search}`;
  }
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
    const { data: members } = await admin.from("agency_memberships").select("tenant_id, role, status").eq("profile_id", userId);
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
    const { count } = await admin.from("agency_memberships").select("id", { count: "exact", head: true }).eq("profile_id", userId);
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
  // Theme widget (maison-v2): "Seleccionar" on a service card -> "Continuar" -> time chip -> "Continuar" -> details.
  // Older widget: slot-picker testid. Click timeouts are bounded (an unbounded click hung the whole test on a moving marquee).
  const slotPicker = page.locator("[data-testid=slot-picker] button").first();
  const selectBtn = page.getByRole("button", { name: /^Seleccionar$/ }).first();
  if (await selectBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await selectBtn.click({ timeout: 15_000 });
    await page.getByRole("button", { name: /^Continuar$/ }).first().click({ timeout: 15_000 });
    const chip = page.getByRole("button", { name: /^\d{1,2}:\d{2}$/ }).first();
    await expect(chip, "an available slot").toBeVisible({ timeout: 45_000 });
    await chip.click({ timeout: 15_000 });
    await run.shot(page, "guest-slot");
    await page.getByRole("button", { name: /^Continuar$/ }).last().click({ timeout: 15_000 });
  } else {
    const bookEntry = page.getByRole("button", { name: /Reservar|Agendar/i }).first();
    if (await bookEntry.isVisible({ timeout: 5_000 }).catch(() => false)) await bookEntry.click({ timeout: 15_000 });
    await expect(slotPicker, "an available slot").toBeVisible({ timeout: 45_000 });
    await slotPicker.click({ timeout: 15_000 });
    await run.shot(page, "guest-slot");
  }
  const name = page.getByTestId("cb-name").or(page.getByRole("textbox", { name: /nombre|your name/i })).first();
  await name.fill("Invitada QA", { timeout: 15_000 });
  await page.getByTestId("cb-email").or(page.getByRole("textbox", { name: /correo|email/i })).first().fill(guestEmail);
  const phone = page.getByTestId("cb-phone").or(page.getByRole("textbox", { name: /whatsapp|tel/i })).first();
  if (await phone.isVisible().catch(() => false)) await phone.fill("984 765 4321");
  await run.shot(page, "guest-details");
  await page.getByRole("button", { name: /confirmar|reservar|confirm this time|enviar solicitud/i }).last().click({ timeout: 15_000 });
  const sawConfirmation = await page.getByText(/confirmad|reserva|listo|solicitud enviada|gracias|booked|cita/i).first().isVisible({ timeout: 20_000 }).catch(() => false);
  run.facts.guestConfirmationTextSeen = sawConfirmation;
  await run.shot(page, "guest-confirmation");
  const admin = isolatedService();
  // The rows land a moment after the confirmation paints: poll up to 30 s instead of reading once.
  let cust: { id: string } | null = null;
  let inq: { id: string; status: string } | null = null;
  for (let i = 0; i < 15 && !(cust && inq); i += 1) {
    ({ data: cust } = await admin.from("customers").select("id").eq("email", guestEmail).limit(1).maybeSingle());
    ({ data: inq } = await admin.from("inquiries").select("id, status").eq("contact_email", guestEmail).limit(1).maybeSingle());
    if (!(cust && inq)) await page.waitForTimeout(2_000);
  }
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

// Local only: Chromium maps every *.tulala.digital name to this machine; finish URLs are opened as http://<host>:3008.
if (TARGET.local) test.use({ launchOptions: { args: ["--host-resolver-rules=MAP *.tulala.digital 127.0.0.1"] } });

test.beforeAll(() => {
  // Refuse unless the loaded env is the isolated project (exits the process otherwise).
  assertIsolatedJourneysTarget(process.env);
  // Hosts were validated at load by resolveJourneyTargets (which also checks PLAYWRIGHT_BASE_URL).
  assertAllowedOrigins({ marketing: MARKETING_BASE, app: APP_BASE }, process.env);
});

for (const vp of Object.keys(VIEWPORTS) as Vp[]) {
  test.describe(`onboarding choices · ${vp}`, () => {
    test.use({ viewport: VIEWPORTS[vp] });

    for (const choice of CHOICES) {
      test(`${choice} · ${vp}`, async ({ page, context, browser }) => {
        test.setTimeout(900_000);
        page.setDefaultTimeout(30_000);
        const run = new Run(choice, vp);
        run.page = page;
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
          // Painted: some ancestor of the h1 has an opaque background (contrastOf returns 0 when none does).
          expect(ratio, "a painted light background sits behind the h1").toBeGreaterThan(0);
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
          const arrival = page.getByTestId("onb-arrival");
          const failedArrival = page.getByTestId("onb-arrival-failed");
          await expect(arrival.or(failedArrival)).toBeVisible({ timeout: 180_000 });
          arrived = await arrival.isVisible();
          if (!arrived) {
            // The first build on a cold dev server can fail verify-live (route still compiling); "Intentar de nuevo" is idempotent.
            run.facts.firstBuildEndedOnFailedScreen = true;
            await run.shot(page, "arrival-failed-first");
            await page.getByTestId("onb-arrival-retry").click();
            await expect(arrival.or(failedArrival).first()).toBeVisible({ timeout: 180_000 });
            await page.waitForTimeout(500);
            arrived = await arrival.isVisible();
          }
          run.facts.arrival = arrived ? "arrival screen" : "arrival-failed screen (build did not finish)";
          await run.shot(page, arrived ? "arrival" : "arrival-failed");
          // Accounts are asserted either way: a failed site publish must not hide what was (not) created.
          await assertAccounts(run, choice, userId, displayName);
          if (!arrived) throw new Error("build ended on the arrival-failed screen (accounts asserted above)");
        });

        // 4 · finish screen + batch-6 behaviors per choice.
        await run.step(4, "finish screen + URL is real", async () => {
          if (!arrived) throw new Error("no arrival screen");
          const admin = isolatedService();
          const openOk = async (href: string, label: string, name: string) => {
            const probe = await context.newPage();
            try {
              const res = await probe.goto(toLocalUrl(href), { waitUntil: "domcontentloaded" });
              expect(res?.status(), `${label} status`).toBe(200);
              await expect(probe.locator("body"), `${label} shows the name`).toContainText(name, { timeout: 30_000 });
              await run.shot(probe, label.replace(/\s+/g, "-"));
            } finally {
              await probe.close();
            }
          };
          const talentId = (run.facts.talent as { id?: string; code?: string } | undefined)?.id;
          const talentCode = (run.facts.talent as { code?: string } | undefined)?.code;
          const arrivalEl = page.getByTestId("onb-arrival");
          if (choice === "studio") {
            // Studio: "ready for requests", NOT bookable; one primary action = add the first team member.
            await expect(arrivalEl).toHaveAttribute("data-finish", "inquiry_only");
            const text = await arrivalEl.innerText();
            run.facts.finishText = text.replace(/\s+/g, " ").slice(0, 300);
            expect(text, "Studio Finish says ready for requests").toMatch(/lista para recibir solicitudes|ready for requests/i);
            expect(text, "Studio Finish never says bookable").not.toMatch(/reservable|bookable|lista para reservar|ready to book/i);
            const add = page.getByTestId("onb-arrival-add-member");
            await expect(add, "add-first-team-member action").toBeVisible();
            expect(await add.getAttribute("href"), "add-member goes to the roster").toMatch(/\/roster\/new/);
            await expect(page.getByTestId("onb-arrival-also-book")).toBeVisible();
            run.facts.finishButtonText = (await add.innerText()).trim();
            finishHref = (await page.getByTestId("onb-arrival-visit").getAttribute("href")) ?? "";
          } else {
            await expect(arrivalEl).not.toHaveAttribute("data-finish", "inquiry_only");
            const cta = page.getByTestId("onb-arrival-view").or(page.getByTestId("onb-arrival-cta")).first();
            run.facts.finishButtonText = (await cta.innerText()).trim();
            await expect(cta).toHaveText(EXPECTED[choice].cta);
            const link = page.getByTestId("onb-arrival-visit").or(page.getByTestId("onb-arrival-cta")).first();
            finishHref = (await link.getAttribute("href")) ?? "";
          }
          expect(finishHref, "finish link present").toBeTruthy();
          run.facts.finishHost = (() => {
            try { return new URL(finishHref, MARKETING_BASE).host; } catch { return finishHref; }
          })();
          await openOk(finishHref, "finish url", displayName);

          if (TALENT(choice)) {
            expect(talentId, "talent id recorded by step 3").toBeTruthy();
            const { data: tp } = await admin.from("talent_profiles").select("workflow_status, visibility").eq("id", talentId!).maybeSingle();
            const { data: site } = await admin.from("talent_sites").select("site_slug, site_published_at").eq("talent_profile_id", talentId!).maybeSingle();
            run.facts.publication = { workflow_status: tp?.workflow_status, visibility: tp?.visibility, site_slug: site?.site_slug, site_published_at: site?.site_published_at };
            if (choice === "myself") {
              // Para mi: the profile is published/public at Finish (not left as a hidden draft).
              expect(["approved", "published"], "myself profile workflow_status at Finish").toContain(tp?.workflow_status);
              expect(tp?.visibility, "myself profile visibility at Finish").toBe("public");
              expect(site?.site_published_at, "myself site is published at Finish").toBeTruthy();
              if (talentCode) await openOk(`${MARKETING_BASE}/t/${talentCode}`, "public hub profile", displayName);
            } else {
              // Ambos: the talent has her OWN site, distinct from the workspace page; Finish only says ready when both open.
              expect(site?.site_slug, "both: own talent site slug").toBeTruthy();
              expect(site?.site_published_at, "both: own talent site is published").toBeTruthy();
              await expect(page.getByTestId("onb-arrival-failed"), "both: Finish is not the failed/draft screen").toHaveCount(0);
              await openOk(`https://${site!.site_slug}.tulala.digital/`, "talent site", displayName);
              const talentHost = new URL(toLocalUrl(`https://${site!.site_slug}.tulala.digital/`)).host;
              const finishHost = new URL(toLocalUrl(finishHref)).host;
              run.facts.bothHosts = { talentHost, finishHost };
              expect(finishHost, "workspace page and talent site are different pages").not.toBe(talentHost);
            }
          }
          await run.shot(page, "finish");
        });

        // 5 · sign out, sign in again, Spanish dashboard.
        await run.step(5, "sign out and back in lands on the Spanish dashboard", async () => {
          await context.clearCookies();
          const setCookies = await mintSessionCookies(email);
          const host = new URL(MARKETING_BASE).hostname;
          await context.addCookies(
            setCookies.map((h) => {
              const [pair] = h.split(";");
              const eq = pair.indexOf("=");
              return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), domain: host, path: "/" };
            }),
          );
          const t0 = Date.now();
          await page.goto(`${APP_BASE}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
          // Poll for the Spanish dashboard (a talent "Hoy" or the workspace "Resumen") and note any English interstitial on the way.
          // Visible match only: on a phone the desktop sidebar "Hoy" exists but is hidden, so a bare .first() waited on it forever (run 4 phone false fail; the bottom-nav "Hoy" was on screen).
          const spanishDashboard = page.getByText(/^(Hoy|Resumen)$/).or(page.getByRole("heading", { name: /^(Buenos días|Buenas tardes|Buenas noches|Hoy)/ })).filter({ visible: true }).first();
          let sawEnglishInterstitial = false;
          let landed = false;
          while (Date.now() - t0 < 90_000 && !landed) {
            if (await page.getByText(/Setting up your page|Profile created/i).first().isVisible().catch(() => false)) sawEnglishInterstitial = true;
            landed = await spanishDashboard.isVisible().catch(() => false);
            if (!landed) await page.waitForTimeout(500);
          }
          run.facts.landingMs = Date.now() - t0;
          run.facts.landingPath = new URL(page.url()).pathname;
          run.facts.sawEnglishInterstitial = sawEnglishInterstitial;
          if (!landed) await run.shot(page, "landing-timeout");
          expect(landed, "Spanish dashboard reached within 90 s").toBe(true);
          await run.shot(page, "dashboard-es");
          expect(page.url()).not.toMatch(/\/onboarding\/role/);
          expect(await page.evaluate(() => document.documentElement.lang)).toMatch(/^es/);
          expect(run.facts.landingMs as number, "Spanish dashboard within ~15 s").toBeLessThanOrEqual(15_000);
          expect(sawEnglishInterstitial, "no English interstitial on the way").toBe(false);
        });

        // 6 · guest books one service on the public site.
        await run.step(6, "guest books a service", async () => {
          if (!finishHref) throw new Error("no finish URL to open");
          const guestCtx = await browser.newContext({ viewport: VIEWPORTS[vp], locale: "es-MX" });
          await armBypass(guestCtx);
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


// ---------------------------------------------------------------------------
// TUL-16 extra rows (C1-03, C1-10, C1-11): the signed-in `myself` talent from the journey above (desktop).
// ---------------------------------------------------------------------------
const EXTRA_ROWS: Array<{ row: string; ok: boolean; detail: string }> = [];

async function latestMyselfEmail(prefix = "qa-onb-choice-myself-desktop-"): Promise<string> {
  const admin = isolatedService();
  let best: { email: string; at: string } | null = null;
  for (let pg = 1; pg <= 20; pg += 1) {
    const { data } = await admin.auth.admin.listUsers({ page: pg, perPage: 200 });
    for (const u of data?.users ?? []) {
      if (u.email?.startsWith(prefix) && (!best || (u.created_at ?? "") > best.at)) best = { email: u.email, at: u.created_at ?? "" };
    }
    if (!data?.users.length || data.users.length < 200) break;
  }
  if (!best) throw new Error("no myself·desktop account from the journey to reuse");
  return best.email;
}

async function devSession(page: Page, email: string) {
  const setCookies = await mintSessionCookies(email);
  const host = new URL(MARKETING_BASE).hostname;
  await page.context().addCookies(
    setCookies.map((h) => {
      const [pair] = h.split(";");
      const eq = pair.indexOf("=");
      return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), domain: host, path: "/" };
    }),
  );
}

async function rowShot(page: Page, row: string, n: number, name: string) {
  const dir = evidenceDir();
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${row}-${String(n).padStart(2, "0")}-${name}.jpg`, type: "jpeg", quality: 55 }).catch(() => undefined);
}

function saveExtras() {
  const dir = evidenceDir();
  if (!dir) return;
  mkdirSync(`${dir}/results`, { recursive: true });
  writeFileSync(`${dir}/results/extra-rows-${EXTRA_ROWS[EXTRA_ROWS.length - 1]?.row ?? "x"}.json`, JSON.stringify(EXTRA_ROWS, null, 2));
}

async function pageText(page: Page, row: string, label: string) {
  const dir = evidenceDir();
  if (!dir) return;
  mkdirSync(`${dir}/results`, { recursive: true });
  const t = await page.evaluate(() => (document.querySelector("main") ?? document.body).innerText.replace(/\s+/g, " ").slice(0, 700)).catch(() => "");
  writeFileSync(`${dir}/results/${row}-${label}.txt`, `${page.url()}\n${t}\n`);
}

async function asRow(row: string, fn: () => Promise<string>) {
  try {
    EXTRA_ROWS.push({ row, ok: true, detail: await fn() });
  } catch (err) {
    EXTRA_ROWS.push({ row, ok: false, detail: String((err as Error).message ?? err).replace(/\u001b\[[0-9;]*m/g, "").split("\n").slice(0, 8).join(" | ") });
  }
  saveExtras();
}

test.describe("TUL-16 extra rows · myself talent · desktop", () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test("C1-03 the website account menu 'Cerrar sesión' signs out (3 of 3)", async ({ page, context }) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(30_000);
    const email = await latestMyselfEmail();
    await asRow("C1-03", async () => {
      const outcomes: string[] = [];
      for (let i = 1; i <= 3; i += 1) {
        await context.clearCookies();
        await devSession(page, email);
        await page.goto(`${MARKETING_BASE}/es`, { waitUntil: "domcontentloaded" });
        const menu = page.getByRole("button", { name: /qa-onb-choice/ }).first();
        await expect(menu, `try ${i}: account button in the site header`).toBeVisible({ timeout: 30_000 });
        await menu.click();
        await rowShot(page, "C1-03", i * 3 - 2, `try${i}-menu`);
        await page.getByText("Cerrar sesión", { exact: true }).first().click();
        await page.waitForLoadState("domcontentloaded");
        // Poll up to 30 s for the sign-out to land (a slow server action must not read as "did not sign out").
        const tSignOut = Date.now();
        let authCookies = (await context.cookies()).filter((c) => /^sb-.*auth-token/.test(c.name) && c.value);
        while (authCookies.length && Date.now() - tSignOut < 30_000) {
          await page.waitForTimeout(1000);
          authCookies = (await context.cookies()).filter((c) => /^sb-.*auth-token/.test(c.name) && c.value);
        }
        outcomes.push(`try ${i}: cookie cleared after ${Date.now() - tSignOut} ms`);
        await page.goto(`${APP_BASE}/talent/today`, { waitUntil: "commit", timeout: 120_000 });
        await page.waitForTimeout(12_000);
        const url = new URL(page.url());
        const toLogin = /login|sign-?in|auth|iniciar/i.test(url.pathname + url.search);
        await rowShot(page, "C1-03", i * 3 - 1, `try${i}-after-signout-today`);
        outcomes.push(`try ${i}: auth cookies left=${authCookies.length}, /talent/today -> ${url.pathname}`);
        expect(authCookies.length, `try ${i}: session cookie cleared`).toBe(0);
        expect(toLogin, `try ${i}: /talent/today redirects to login (went to ${url.pathname})`).toBe(true);
      }
      return outcomes.join("; ");
    });
    expect(EXTRA_ROWS.find((r) => r.row === "C1-03")?.ok, EXTRA_ROWS.find((r) => r.row === "C1-03")?.detail).toBe(true);
  });

  test("C1-10 Settings, working hours: Cancun, Mon-Fri 10-18, save, reload", async ({ page, context }) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(30_000);
    const email = await latestMyselfEmail();
    await asRow("C1-10", async () => {
      await context.clearCookies();
      await devSession(page, email);
      await page.goto(`${APP_BASE}/talent/settings`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForTimeout(10_000); // let the dashboard hydrate: an earlier click is lost
      await rowShot(page, "C1-10", 0, "settings");
      await page.getByText(/Horario y días libres/).first().click();
      // Opens the shared panel, or the full availability page when agenda data is not loaded: either way the form lives in the page.
      const panel = page.locator("body");
      await page.waitForTimeout(8000);
      await rowShot(page, "C1-10", 1, "after-row-click");
      await pageText(page, "C1-10", "after-row-click");
      // TimezonePicker: a native <select data-testid="working-hours-timezone" aria-label="Zona horaria"> (plus a search input
      // labelled "Search time zones"). It renders once the hours load, so wait up to 60 s, found by its label.
      const tzSel = () => panel.getByLabel(/^(Zona horaria|Timezone)$/).first();
      // The row now lands on the calendar week view; the hours form sits behind its "Disponibilidad" button.
      if (!(await tzSel().isVisible().catch(() => false))) {
        await page.getByRole("button", { name: /^Disponibilidad$/ }).first().click({ timeout: 10_000 }).catch(() => undefined);
        await page.waitForTimeout(3000);
        await rowShot(page, "C1-10", 11, "after-disponibilidad-button");
      }
      await expect(tzSel()).toBeVisible({ timeout: 60_000 });
      await tzSel().selectOption("America/Cancun");
      // Mon-Fri open 10:00-18:00, weekend closed.
      const boxes = panel.locator('input[type="checkbox"]');
      const nBoxes = await boxes.count();
      for (let i = 0; i < Math.min(nBoxes, 7); i += 1) {
        const want = i < 5;
        if ((await boxes.nth(i).isChecked()) !== want) await boxes.nth(i).setChecked(want);
      }
      const times = panel.locator('input[type="time"]');
      const nTimes = await times.count();
      for (let i = 0; i < nTimes; i += 2) {
        await times.nth(i).fill("10:00");
        await times.nth(i + 1).fill("18:00");
      }
      await rowShot(page, "C1-10", 2, "filled");
      await panel.getByRole("button", { name: /Guardar|Save/ }).last().click();
      await page.waitForTimeout(3000);
      const text = await panel.innerText();
      await rowShot(page, "C1-10", 3, "after-save");
      expect(text, "no workspace-resolution error").not.toMatch(/Could not resolve the workspace|No se pudo resolver/i);
      expect(text, "a success state is shown").toMatch(/guardad|saved/i);
      // Reload and read it back.
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(10_000);
      await page.getByText(/Horario y días libres/).first().click();
      const panel2 = page.locator("body");
      const tz2 = panel2.getByLabel(/^(Zona horaria|Timezone)$/).first();
      await expect(tz2).toBeVisible({ timeout: 60_000 });
      await expect(tz2).toHaveValue("America/Cancun");
      const t2 = panel2.locator('input[type="time"]');
      await expect(t2.first()).toHaveValue("10:00");
      await expect(t2.nth(1)).toHaveValue("18:00");
      await rowShot(page, "C1-10", 4, "after-reload");
      const admin = isolatedService();
      const userId = await getUserId(email);
      const { data: tp } = await admin.from("talent_profiles").select("id").eq("user_id", userId).is("deleted_at", null).maybeSingle();
      const { data: rows } = await admin.from("talent_booking_hours").select("*").eq("talent_profile_id", tp!.id).limit(5);
      expect((rows ?? []).length, "talent_booking_hours row").toBeGreaterThan(0);
      const r0 = rows![0] as Record<string, unknown>;
      return `saved; reload kept Cancun + 10:00-18:00; talent_booking_hours rows=${rows!.length} timezone=${String(r0.timezone ?? "?")}`;
    });
    expect(EXTRA_ROWS.find((r) => r.row === "C1-10")?.ok, EXTRA_ROWS.find((r) => r.row === "C1-10")?.detail).toBe(true);
  });

  test("C1-11 Profile, Servicios: pick a category, publish, live site opens", async ({ page, context }) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(30_000);
    const email = await latestMyselfEmail();
    await asRow("C1-11", async () => {
      await context.clearCookies();
      await devSession(page, email);
      const errors: string[] = [];
      page.on("response", async (r) => {
        if (r.request().method() === "POST" && r.status() >= 400) errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
      });
      await page.goto(`${APP_BASE}/talent/profile`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForTimeout(10_000);
      await rowShot(page, "C1-11", 1, "profile");
      // /talent/services lists the talent's offerings (ServicesHome). Assert the list and its count against the DB;
      // "Seguimos intentando" is recorded only as a diagnostic.
      await page.goto(`${APP_BASE}/talent/services`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await expect(page.getByRole("heading", { name: /^Servicios$/ }).first()).toBeVisible({ timeout: 60_000 });
      const rowMenus = page.getByRole("button", { name: /Menú de fila|Row menu/ });
      const waitStart = Date.now();
      await rowMenus.first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => undefined);
      await page.waitForTimeout(2000);
      await rowShot(page, "C1-11", 2, "servicios");
      await pageText(page, "C1-11", "servicios");
      const stuck = await page.getByText(/Seguimos intentando|Está tardando más de lo normal/).first().isVisible().catch(() => false);
      const shown = await rowMenus.count();
      const admin = isolatedService();
      const userId = await getUserId(email);
      const { data: tp0 } = await admin.from("talent_profiles").select("id").eq("user_id", userId).is("deleted_at", null).maybeSingle();
      const { data: offers } = await admin.from("talent_offerings").select("title").eq("talent_profile_id", tp0!.id);
      const diag = `services rows shown=${shown}, DB offerings=${(offers ?? []).length}, 'Seguimos intentando' visible=${stuck}, list ready after ${Date.now() - waitStart} ms`;
      expect(shown, `a services list with at least one offering (${diag})`).toBeGreaterThan(0);
      expect(shown, `services shown equals DB offerings (${diag})`).toBe((offers ?? []).length);
      for (const o of offers ?? []) await expect(page.locator("body"), `offering "${o.title}" listed`).toContainText(String(o.title));
      const { data: tp } = await admin.from("talent_profiles").select("id, display_name").eq("user_id", userId).is("deleted_at", null).maybeSingle();
      const { data: site } = await admin.from("talent_sites").select("site_slug, site_published_at").eq("talent_profile_id", tp!.id).maybeSingle();
      expect(site?.site_slug, "talent site slug").toBeTruthy();
      const live = await context.newPage();
      const res = await live.goto(toLocalUrl(`https://${site!.site_slug}.tulala.digital/`), { waitUntil: "domcontentloaded" });
      expect(res?.status(), "live site status").toBe(200);
      await expect(live.locator("body")).toContainText(String(tp!.display_name), { timeout: 30_000 });
      await rowShot(live, "C1-11", 5, "live-site");
      return `${diag}; live site 200 for slug ${site!.site_slug}`;
    });
    expect(EXTRA_ROWS.find((r) => r.row === "C1-11")?.ok, EXTRA_ROWS.find((r) => r.row === "C1-11")?.detail).toBe(true);
  });

  test("DS-49 empty state: a fresh talent with 0 clients sees /talent/clients empty", async ({ page, context }) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(30_000);
    const email = await latestMyselfEmail("qa-onb-choice-both-desktop-");
    await asRow("DS-49", async () => {
      await context.clearCookies();
      await devSession(page, email);
      const admin = isolatedService();
      const userId = await getUserId(email);
      const { data: tp } = await admin.from("talent_profiles").select("id").eq("user_id", userId).is("deleted_at", null).maybeSingle();
      const { count } = await admin.from("talent_clients").select("id", { count: "exact", head: true }).eq("talent_profile_id", tp!.id);
      await page.goto(`${APP_BASE}/talent/clients`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await expect(page.locator("[data-clients-directory]")).toBeVisible({ timeout: 90_000 });
      await expect(page.locator("[data-clients-empty]")).toBeVisible({ timeout: 60_000 });
      await rowShot(page, "DS-49", 1, "clients-empty");
      await pageText(page, "DS-49", "clients-empty");
      const body = await page.locator("[data-clients-directory]").innerText();
      expect(body, "no 'Nuevo' badge").not.toMatch(/\bNuevo\b/);
      expect(body, "no 'N de N clientes' line").not.toMatch(/\d+\s+de\s+\d+\s+clientes/i);
      const add = page.locator("[data-clients-empty]").getByRole("button", { name: /Agregar clienta|Agregar cliente/ });
      await expect(add, "empty-state add-client button").toBeVisible();
      await expect(page.locator("[data-client-add]"), "header add-client button").toBeVisible();
      return `0 clients (talent_clients rows=${count ?? "?"}); empty state with button "${(await add.innerText()).trim()}"; no Nuevo badge; no 'N de N clientes' line`;
    });
    expect(EXTRA_ROWS.find((r) => r.row === "DS-49")?.ok, EXTRA_ROWS.find((r) => r.row === "DS-49")?.detail).toBe(true);
  });
});
