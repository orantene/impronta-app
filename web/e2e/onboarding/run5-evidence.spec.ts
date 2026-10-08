/**
 * RUN 5 EVIDENCE · per-card proof on the ISOLATED journeys stack only (Supabase `fxlankepwnvelxjrahwk`, "qa-journeys").
 *
 * README (how to run). Same stack, env and guard as choices-journey.spec.ts (see
 * docs/plans/qa-evidence/onboarding-choices-2026-10-07/RUNBOOK.md for the staging variables). WRITTEN, NOT YET RUN.
 *
 *   Local (stack up via web/scripts/onboarding-qa/dev.sh, prod build on :3008, proxies 3105/3106):
 *     cd web && JOURNEY_TARGET=local ONB_EVIDENCE_DIR=<abs dir> PLAYWRIGHT_SKIP_WEBSERVER=1 \
 *       PLAYWRIGHT_BASE_URL=http://localhost:3105 \
 *       npx playwright test e2e/onboarding/run5-evidence.spec.ts --workers=1
 *   Staging: export JOURNEY_MARKETING_ORIGIN / JOURNEY_APP_ORIGIN / JOURNEY_TALENT_HOST_TEMPLATE (no defaults), drop JOURNEY_TARGET.
 *
 *   One test (`run5 evidence`) signs up THREE fresh throwaway accounts through the real front door (A = myself, M2 = myself,
 *   S = studio; qa-r5-* emails, desktop 1440x900), then runs every card step below in order. A failing step is recorded
 *   (status FAIL + screenshot + DB facts) and the run CONTINUES. Anything not deterministic records BLOCKED / NOT_POSSIBLE
 *   with a reason, never a silent skip. The test itself fails only if some step is FAIL (BLOCKED / NOT_POSSIBLE do not fail it).
 *   Output: ONB_EVIDENCE_DIR/results/run5-<CARD>-<nn>.json (one per step: card, step, status, detail, facts, screenshots),
 *   ONB_EVIDENCE_DIR/results/run5-summary.json, screenshots ONB_EVIDENCE_DIR/run5-<CARD>-<nn>-<label>.jpg.
 *   Needs: `npx tsx` (TUL-108/136/67 render the real email catalog in a child process via e2e/onboarding/_run5-render.mts).
 *   Filter one card: add `-g` is NOT possible (single test); instead set RUN5_ONLY="TUL-76,TUL-93" (comma list of card ids;
 *   SETUP steps always run).
 *
 * CARD -> STEP NAME -> WHAT IT ASSERTS
 *   (setup)     SETUP signup A/M2/S ........ front door -> sentence -> setup -> look (2nd palette) -> email code -> build -> arrival
 *   TUL-76      TUL-76 edit hero headline + publish ....... /talent/site editor: edit the hero h1, publish; DB talent_pages (home,
 *                       blocks_published) has the new headline, talent_sites.status=published + site_published_at moved forward,
 *                       public URL serves the new headline. BLOCKED if the editor canvas hero cannot be located.
 *   TUL-85      TUL-85 picked look is applied ............. talent_sites.theme_design_slug = maison-v2 and the picked palette key
 *                       is traceable in the site row or the public HTML.
 *   TUL-85      TUL-85 simulated publish failure .......... NOT_POSSIBLE: site_publish_failed is only returned by
 *                       provision-for-choice.server.ts when ensureOwnSitePublished fails; there is no env/flag/slug hook (needs a product change).
 *   TUL-86      TUL-86 myself -> both (M2) / studio -> both (S) ... Settings "Como trabajas" card: current state text, confirm sheet,
 *                       result; DB: agency_memberships owner, agencies row, roster row active + site_visible, talent profile.
 *   TUL-93      TUL-93 guest booking email + notification evidence ... one guest booking, then notification_dispatch_log rows for the
 *                       inquiry (channel/status/error) + user_notifications rows for the talent. Bodies are NOT stored anywhere
 *                       (see TUL-108/136 for rendered bodies). 'email unproven: hook (TUL-333)' when no email row reaches sent.
 *   Studio      Studio booking re-test (no provider) ....... studio fixture still inquiry-only (no booking widget), recorded.
 *   Studio      Studio booking with a provider ............. provider added through the app (TUL-86 add_provider) + hours and one
 *                       offering seeded on the ISOLATED project only (copied from account A), then a guest books it.
 *   TUL-115     TUL-115 publish + Horario saves ........... talent site published; Settings "Horario y dias libres" saves timezone and
 *                       hours, reload shows them, talent_booking_hours row has them.
 *   TUL-157     TUL-157 hub roster, media, services, hero, languages ... agency_talent_roster active; a PNG uploaded in the dashboard
 *                       lands in media_assets; talent_offerings rows listed on /talent/services; home page hero image set; talent_languages rows.
 *   TUL-125     TUL-125 bilingual bio + stock hero ........ bio_i18n.es and .en non-empty; home hero has an image and (no own photo) it is a
 *                       platform stock image.
 *   TUL-130     TUL-130 no legacy-signup leftovers ........ after a fresh /start signup: exactly one talent_profiles row, no client_profiles
 *                       row, no agency_client_relationships, no pending roster invite, profiles.app_role correct; /register and
 *                       /onboarding/role (anonymous) redirect to /start. Legacy writers checked: src/app/onboarding/actions.ts
 *                       (chooseTalentRole, chooseClientRole, completeTalentLocationOnboarding, completeTalentProfileInPlace).
 *   TUL-168     TUL-168 booking stores the real time ...... the held/booked slot row (talent_bookings, else talent_holds) starts_at in
 *                       the talent's timezone (talent_booking_hours.timezone) equals the chip HH:MM the guest chose.
 *   TUL-132     TUL-132 inquiry event_date + location ..... inquiries.event_date and event_location set for the booking inquiry.
 *   TUL-139     TUL-139 lightbox fires one book event ..... public site lightbox [data-portfolio-lightbox-book] click dispatches
 *                       `tulala:portfolio-book` exactly once and exactly one handler claims it. BLOCKED if the site has no portfolio block.
 *   TUL-108/136 TUL-108/136 reminder uses appointment wording ... real catalog render (es + en): subject and body say appointment/cita,
 *                       show the appointment time in the talent zone (9:45 Cancun), agency event variant still says event.
 *   TUL-67      TUL-67 client email carries the tenant brand ... real render with a tenant brand: wordmark, logo <img>, footer domain; the
 *                       platform brand is NOT used when a tenant brand is given.
 *   TUL-123/138 TUL-123/138 captcha on booking ............ [data-guest-instant-captcha] present when a provider is configured, and a
 *                       submit with the captcha script blocked (no token) creates no inquiry/order. Records configured/not configured.
 *   TUL-123/138 TUL-123/138 captcha on chat ............... chat captcha slot [data-guest-chat-captcha-slot]; it only renders after the server
 *                       asks for it (velocity), so BLOCKED with the reason unless it appears.
 *   TUL-120     TUL-120 no error banner + Messages empty state ... fresh login lands on the Spanish dashboard without an error
 *                       banner; /talent/messages shows an empty state, no error, 0 threads.
 *   TUL-120     TUL-120 sign-out .......................... account menu / POST /auth/sign-out clears the auth cookies; /talent/today -> login.
 *   TUL-120     TUL-120 Spanish support reply ............. BLOCKED unless an AI provider answers on the stack (isolated stack has none).
 *
 * Safety: refuses unless the env is the isolated project (assertIsolatedJourneysTarget) and every origin is localhost or
 * staging-qa-*.tulala.digital (target-guard.mjs); service role is `isolatedService()` only (refuses prod). Seeds/writes happen
 * on the isolated project only. No secret is ever logged or written.
 */
import { execFileSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Browser, BrowserContext, Page } from "@playwright/test";

import { isolatedService } from "../cases/_isolated-db";
// @ts-ignore -- plain ESM script shared with the journeys seed/cleanup tools
import { assertIsolatedJourneysTarget } from "../../scripts/isolated-target-guard.mjs";
// @ts-ignore -- plain ESM, unit-tested in scripts/onboarding-qa/target-guard.test.mjs
import { assertAllowedOrigins, bypassHeadersFor, resolveJourneyTargets, talentHostFor } from "../../scripts/onboarding-qa/target-guard.mjs";
import { createServerClient } from "@supabase/ssr";
import { expect, test as baseTest } from "./_module";

// ---------------------------------------------------------------------------
// Targets + guard (copied from choices-journey.spec.ts)
// ---------------------------------------------------------------------------
const TARGET = resolveJourneyTargets(process.env) as { local: boolean; marketing: string; app: string; talentHostTemplate: string | null };
const MARKETING_BASE = TARGET.marketing;
const APP_BASE = TARGET.app;
const DEV_PORT = 3008;
const VIEWPORT = { width: 1440, height: 900 };
const STAMP = Date.now().toString(36).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]).slice(-6);
const ONLY = (process.env.RUN5_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);

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

type Row = Record<string, unknown>;
type Choice = "myself" | "studio";
const SERVICES = [
  { name: "Limpieza profunda", min: "90", price: "850" },
  { name: "Limpieza ligera", min: "60", price: "500" },
];

// ---------------------------------------------------------------------------
// Evidence recorder: per step pass/fail/blocked + screenshots + DB facts -> results/run5-*.json
// ---------------------------------------------------------------------------
class Blocked extends Error {
  constructor(msg: string, readonly kind: "BLOCKED" | "NOT_POSSIBLE" = "BLOCKED") {
    super(msg);
  }
}
type StepStatus = "PASS" | "FAIL" | "BLOCKED" | "NOT_POSSIBLE";
type StepRecord = { card: string; step: string; n: number; status: StepStatus; detail?: string; facts: Record<string, unknown>; shots: string[] };

function evidenceDir(): string | null {
  return process.env.ONB_EVIDENCE_DIR ? resolve(process.env.ONB_EVIDENCE_DIR) : null;
}

class Rec {
  records: StepRecord[] = [];
  private n = 0;
  private cur: StepRecord | null = null;
  private shotN = 0;
  page: Page | null = null;

  fact(k: string, v: unknown) {
    if (this.cur) this.cur.facts[k] = v;
  }

  getFact(k: string): unknown {
    return this.cur?.facts[k];
  }

  async shot(page: Page, label: string) {
    const dir = evidenceDir();
    if (!dir || !this.cur) return;
    mkdirSync(dir, { recursive: true });
    this.shotN += 1;
    const file = `run5-${this.cur.card.replace(/[^A-Za-z0-9-]+/g, "_")}-${String(this.n).padStart(2, "0")}-${String(this.shotN).padStart(2, "0")}-${label}.jpg`;
    const ok = await page.screenshot({ path: `${dir}/${file}`, type: "jpeg", quality: 55 }).then(() => true, () => false);
    if (ok) this.cur.shots.push(file);
  }

  /** Cards in RUN5_ONLY (if set) run; SETUP always runs. */
  private wanted(card: string) {
    return !ONLY.length || card === "SETUP" || ONLY.some((c) => card.includes(c));
  }

  async step(card: string, step: string, fn: () => Promise<void>) {
    if (!this.wanted(card)) return;
    this.n += 1;
    this.shotN = 0;
    const rec: StepRecord = { card, step, n: this.n, status: "PASS", facts: {}, shots: [] };
    this.cur = rec;
    try {
      await fn();
    } catch (err) {
      if (err instanceof Blocked) {
        rec.status = err.kind;
        rec.detail = err.message;
      } else {
        rec.status = "FAIL";
        rec.detail = String((err as Error).message ?? err).replace(/\u001b\[[0-9;]*m/g, "").split("\n").slice(0, 8).join(" | ");
        if (this.page) await this.shot(this.page, "FAIL");
      }
    }
    this.records.push(rec);
    this.cur = null;
    this.save(rec);
  }

  private save(rec: StepRecord) {
    const dir = evidenceDir();
    if (!dir) return;
    mkdirSync(`${dir}/results`, { recursive: true });
    writeFileSync(`${dir}/results/run5-${rec.card.replace(/[^A-Za-z0-9-]+/g, "_")}-${String(rec.n).padStart(2, "0")}.json`, JSON.stringify(rec, null, 2));
    writeFileSync(`${dir}/results/run5-summary.json`, JSON.stringify(this.records.map((r) => ({ card: r.card, step: r.step, status: r.status, detail: r.detail })), null, 2));
  }

  failures() {
    return this.records.filter((r) => r.status === "FAIL");
  }
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
async function poll<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs: number, everyMs = 2_000): Promise<T | null> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
/** A valid solid-colour PNG (no dependency): used for the media upload. */
function solidPng(size = 800): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 0x9a)]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** HH:MM of an instant on the wall clock of an IANA zone. */
function wallClock(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("hour")}:${g("minute")}`;
}
/** YYYY-MM-DD of an instant on the wall clock of an IANA zone. */
function wallDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** Local: `https://<slug>.tulala.digital/...` -> `http://<slug>.tulala.digital:3008/...`; staging: rebuilt from the talent host template. */
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
const siteUrl = (slug: string) => toLocalUrl(`https://${slug}.tulala.digital/`);

// ---------------------------------------------------------------------------
// Sessions without /api/dev/signin (copied from choices-journey.spec.ts)
// ---------------------------------------------------------------------------
async function mintCode(email: string): Promise<string> {
  const link = await isolatedService().auth.admin.generateLink({ type: "magiclink", email });
  const otp = link.data?.properties?.email_otp ?? "";
  if (otp.length < 6) throw new Error(`could not mint a sign-in code (${link.error?.message ?? "no email_otp"})`);
  return otp;
}

async function mintSessionCookies(email: string): Promise<string[]> {
  const jar = new Map<string, string>();
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach((c) => (c.value ? jar.set(c.name, c.value) : jar.delete(c.name))),
    },
  });
  const { error } = await sb.auth.verifyOtp({ email, token: await mintCode(email), type: "email" });
  if (error) throw new Error(`could not verify the minted code: ${error.message}`);
  if (!jar.size) throw new Error("no session cookies minted");
  return Array.from(jar, ([k, v]) => `${k}=${v}`);
}

async function addSession(ctx: BrowserContext, email: string) {
  const host = new URL(MARKETING_BASE).hostname;
  const cookies = await mintSessionCookies(email);
  await ctx.addCookies(
    cookies.map((h) => {
      const [pair] = h.split(";");
      const eq = pair.indexOf("=");
      return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), domain: host, path: "/" };
    }),
  );
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

// ---------------------------------------------------------------------------
// Account provisioning through the real front door (copied/condensed from choices-journey.spec.ts)
// ---------------------------------------------------------------------------
type Acct = {
  label: string;
  choice: Choice;
  email: string;
  displayName: string;
  userId: string;
  talentId: string | null;
  tenantId: string | null;
  tenantSlug: string | null;
  siteSlug: string | null;
  finishHref: string;
  pickedLook: string | null;
};

async function fillCode(page: Page, otp: string) {
  const inputs = page.locator('[data-testid="onb-code"] input');
  const n = await inputs.count();
  for (let i = 0; i < Math.min(n, otp.length); i += 1) await inputs.nth(i).fill(otp[i]);
}

async function pick(page: Page, testId: string, text: string, fallbackOther?: string) {
  await page.getByTestId(testId).fill(text);
  const option = page.getByTestId(`${testId}-option`).first();
  if (await option.waitFor({ timeout: fallbackOther ? 6_000 : 25_000 }).then(() => true, () => false)) await option.click();
  else if (fallbackOther) await page.getByTestId("onb-basics-other").fill(fallbackOther);
  else throw new Error(`no option for ${testId} "${text}"`);
}

async function seedGuestBrief(sentence: string, choice: Choice, displayName: string) {
  const admin = isolatedService();
  const { data: brief, error } = await admin.from("tulala_briefs").select("id, module_state").filter("module_state->input->>value", "eq", sentence).order("created_at", { ascending: false }).limit(1).maybeSingle();
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
  const facts = choice === "myself" ? [...talent, ["business.works_alone", true] as [string, unknown]] : business;
  const ins = await admin.from("tulala_brief_facts").insert(facts.map(([k, v]) => ({ brief_id: brief.id, fact_key: k, fact_value: v, source: "user_stated", status: "confirmed", confidence: 1 })));
  if (ins.error) throw new Error(`seed facts: ${ins.error.message}`);
  const ms = (brief.module_state ?? {}) as Record<string, unknown>;
  await admin.from("tulala_briefs").update({ module_state: { ...ms, step: "understood", updatedAt: new Date().toISOString() } }).eq("id", brief.id);
}

async function driveToAccount(page: Page, rec: Rec, acct: Acct) {
  const { choice, displayName } = acct;
  const sentence =
    choice === "myself"
      ? `Me llamo ${displayName}. Soy limpiadora de casas en Playa del Carmen. Hago limpieza profunda y ligera, de lunes a sábado.`
      : `Soy ${displayName}. Tengo un estudio de limpieza de casas en Playa del Carmen con un equipo de tres personas. Hacemos limpieza profunda y ligera, de lunes a sábado.`;
  rec.fact("sentence", sentence);
  await page.getByTestId("onb-sentence").fill(sentence);
  await page.getByTestId("onb-send").click();
  await page.getByTestId("onb-confirm-send").click();

  const accept = page.getByTestId("onb-accept");
  const essentials = page.getByTestId("onb-essentials");
  const tooLittle = page.getByTestId("onb-too-little");
  await expect(accept.or(essentials).or(page.getByTestId("onb-setup")).or(tooLittle)).toBeVisible({ timeout: 60_000 });
  if (await tooLittle.isVisible().catch(() => false)) {
    // Isolated stack has no AI provider: seed the facts an AI read would have produced, then resume (as the template does).
    rec.fact("aiRead", "off: too-little dead end; facts seeded with the service role");
    await seedGuestBrief(sentence, choice, displayName);
    await page.reload();
    await page.getByTestId("onb-resume-continue").click({ timeout: 30_000 });
    await expect(accept).toBeVisible({ timeout: 30_000 });
  }
  if (await accept.isVisible().catch(() => false)) await accept.click();

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
    await page.getByTestId("onb-next").click();
  }

  await expect(page.getByTestId("onb-setup")).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < SERVICES.length; i += 1) {
    if ((await page.getByTestId(`onb-service-name-${i}`).count()) === 0) await page.getByTestId("onb-service-add").click();
    await page.getByTestId(`onb-service-name-${i}`).fill(SERVICES[i].name);
    await page.getByTestId(`onb-service-min-${i}`).fill(SERVICES[i].min);
    const quote = page.getByTestId(`onb-service-quote-${i}`);
    if (await quote.isChecked().catch(() => false)) await quote.uncheck();
    await page.getByTestId(`onb-service-price-${i}`).fill(SERVICES[i].price);
  }
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
  await page.getByTestId("onb-setup-continue").click();

  const style = page.getByTestId("onb-style");
  const ready = page.getByTestId("onb-ready");
  await expect(style.or(ready)).toBeVisible({ timeout: 30_000 });
  if (await style.isVisible().catch(() => false)) {
    await page.locator('[data-testid^="onb-style-"]:not([data-testid$="notes"]):not([data-testid$="continue"]):not([data-testid="onb-style"])').first().click();
    await page.getByTestId("onb-style-continue").click();
  }
  await expect(ready).toBeVisible({ timeout: 30_000 });
  if (choice === "studio") await expect(page.getByTestId("onb-link-available")).toBeVisible({ timeout: 30_000 });

  // TUL-85: pick the SECOND look (not the preselected recommended one) so "the picked one is applied" is meaningful.
  const designs = page.locator('[data-testid^="onb-design-"]:not([data-testid="onb-design-keep"])');
  if (choice === "myself" && (await designs.first().waitFor({ timeout: 3_000 }).then(() => true, () => false))) {
    const target = (await designs.count()) > 1 ? designs.nth(1) : designs.first();
    acct.pickedLook = ((await target.getAttribute("data-testid")) ?? "").replace("onb-design-", "") || null;
    await target.click();
    rec.fact("pickedLook", acct.pickedLook);
  }
}

/** The sentence typed on screen 2 (the brief is found by it when the email hook is down). */
let CURRENT_SENTENCE = "";

async function signUpWithCode(page: Page, rec: Rec, acct: Acct) {
  await page.getByTestId("onb-build").click();
  await expect(page.getByTestId("onb-save")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("onb-email").fill(acct.email);
  await page.getByTestId("onb-age-terms").check();
  await page.getByTestId("onb-email-cta").click();
  const code = page.getByTestId("onb-code");
  const sendError = page.getByTestId("onb-error");
  await expect(code.or(sendError)).toBeVisible({ timeout: 30_000 });
  if (await code.isVisible().catch(() => false)) {
    await fillCode(page, await mintCode(acct.email));
    await expect(page.getByTestId("onb-building").or(page.getByTestId("onb-arrival"))).toBeVisible({ timeout: 30_000 });
    rec.fact("emailCode", "typed (minted with generateLink)");
    return;
  }
  // The isolated send-email hook rejects (TUL-333): same end state as verifyOnboardingCode without the email code UI.
  rec.fact("emailCode", `send failed on the isolated stack; UI error: ${(await sendError.innerText()).slice(0, 80)}`);
  const admin = isolatedService();
  const created = await admin.auth.admin.createUser({ email: acct.email, email_confirm: true });
  const uid = created.data.user?.id;
  if (!uid) throw new Error(`could not create the test user: ${created.error?.message}`);
  const sentence = CURRENT_SENTENCE;
  const { data: brief } = await admin.from("tulala_briefs").select("id, module_state").filter("module_state->input->>value", "eq", sentence).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!brief) throw new Error("guest brief not found to claim");
  const claim = await admin.from("tulala_briefs").update({ profile_id: uid, guest_session_id: null, module_state: { ...((brief.module_state ?? {}) as Record<string, unknown>), step: "readyToBuild" } }).eq("id", brief.id);
  if (claim.error) throw new Error(`claim brief: ${claim.error.message}`);
  await addSession(page.context(), acct.email);
  await page.goto(`${MARKETING_BASE}/start?lang=es`);
  await expect(page.getByTestId("onb-building").or(page.getByTestId("onb-arrival")).or(page.getByTestId("onb-ready")).or(page.getByTestId("onb-save"))).toBeVisible({ timeout: 30_000 });
  if (await page.getByTestId("onb-ready").isVisible().catch(() => false)) await page.getByTestId("onb-build").click();
}

async function provision(browser: Browser, rec: Rec, choice: Choice, label: string): Promise<Acct> {
  const acct: Acct = {
    label,
    choice,
    email: `qa-r5-${label.toLowerCase()}-${STAMP}@impronta.test`,
    displayName: `${choice === "studio" ? "Estudio" : "Rosa"} r5${label.toLowerCase()} ${STAMP}`,
    userId: "",
    talentId: null,
    tenantId: null,
    tenantSlug: null,
    siteSlug: null,
    finishHref: "",
    pickedLook: null,
  };
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "es-MX" });
  await armBypass(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  rec.page = page;
  try {
    const res = await page.goto(`${MARKETING_BASE}/start?lang=es`);
    expect(res?.status(), "front door status").toBe(200);
    await expect(page.getByTestId("onb-choose")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId(`onb-choice-${choice}`).click();
    await page.getByTestId("onb-choose-continue").click();
    await expect(page.getByTestId("onb-entry")).toBeVisible({ timeout: 20_000 });
    CURRENT_SENTENCE = choice === "myself"
      ? `Me llamo ${acct.displayName}. Soy limpiadora de casas en Playa del Carmen. Hago limpieza profunda y ligera, de lunes a sábado.`
      : `Soy ${acct.displayName}. Tengo un estudio de limpieza de casas en Playa del Carmen con un equipo de tres personas. Hacemos limpieza profunda y ligera, de lunes a sábado.`;
    await driveToAccount(page, rec, acct);
    await signUpWithCode(page, rec, acct);
    acct.userId = await getUserId(acct.email);
    rec.fact("userId", acct.userId);

    const arrival = page.getByTestId("onb-arrival");
    const failed = page.getByTestId("onb-arrival-failed");
    await expect(arrival.or(failed)).toBeVisible({ timeout: 180_000 });
    if (!(await arrival.isVisible())) {
      rec.fact("firstBuildEndedOnFailedScreen", true);
      await page.getByTestId("onb-arrival-retry").click();
      await expect(arrival.or(failed).first()).toBeVisible({ timeout: 180_000 });
      await page.waitForTimeout(500);
    }
    await rec.shot(page, "arrival");
    const link = page.getByTestId("onb-arrival-visit").or(page.getByTestId("onb-arrival-cta")).first();
    acct.finishHref = (await link.getAttribute("href").catch(() => null)) ?? "";
    rec.fact("finishHref", acct.finishHref);
  } finally {
    // Keep the context open for nothing: later steps mint fresh sessions.
    await ctx.close();
  }
  const admin = isolatedService();
  const { data: tp } = await admin.from("talent_profiles").select("id").eq("user_id", acct.userId).is("deleted_at", null).maybeSingle();
  acct.talentId = (tp?.id as string | undefined) ?? null;
  const { data: mem } = await admin.from("agency_memberships").select("tenant_id").eq("profile_id", acct.userId).limit(1).maybeSingle();
  acct.tenantId = (mem?.tenant_id as string | undefined) ?? null;
  if (acct.tenantId) {
    const { data: ag } = await admin.from("agencies").select("slug").eq("id", acct.tenantId).maybeSingle();
    acct.tenantSlug = (ag?.slug as string | undefined) ?? null;
  }
  if (acct.talentId) {
    const { data: site } = await admin.from("talent_sites").select("site_slug").eq("talent_profile_id", acct.talentId).maybeSingle();
    acct.siteSlug = (site?.site_slug as string | undefined) ?? null;
  }
  rec.fact("talentId", acct.talentId);
  rec.fact("tenantSlug", acct.tenantSlug);
  rec.fact("siteSlug", acct.siteSlug);
  return acct;
}

/** A fresh signed-in dashboard page for the account (never reuses the signup context). */
async function openAs(browser: Browser, acct: Acct): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "es-MX" });
  await armBypass(ctx);
  await addSession(ctx, acct.email);
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  return { ctx, page };
}

function requireAcct(a: Acct | null, what: string): Acct {
  if (!a?.userId) throw new Blocked(`blocked: ${what} account was not created (see the SETUP step)`);
  return a;
}

// ---------------------------------------------------------------------------
// Guest booking (copied from choices-journey.spec.ts guestBook, now returns the facts the cards need)
// ---------------------------------------------------------------------------
type GuestBooking = {
  email: string;
  chip: string;
  inquiry: Row | null;
  order: Row | null;
  customerId: string | null;
  confirmationSeen: boolean;
};

async function guestBook(browser: Browser, rec: Rec, o: { finishHref: string; name: string; email: string; timezoneId: string; blockCaptcha?: boolean; expectNoRows?: boolean }): Promise<GuestBooking> {
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "es-MX", timezoneId: o.timezoneId });
  await armBypass(ctx);
  if (o.blockCaptcha) await ctx.route(/challenges\.cloudflare\.com|hcaptcha\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  rec.page = page;
  try {
    const res = await page.goto(toLocalUrl(o.finishHref), { waitUntil: "domcontentloaded" });
    expect(res?.status(), "public site status").toBe(200);
    await expect(page.locator("body")).toContainText(o.name, { timeout: 30_000 });
    let chipText = "";
    const slotPicker = page.locator("[data-testid=slot-picker] button").first();
    const selectBtn = page.getByRole("button", { name: /^Seleccionar$/ }).first();
    if (await selectBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await selectBtn.click({ timeout: 15_000 });
      await page.getByRole("button", { name: /^Continuar$/ }).first().click({ timeout: 15_000 });
      const chip = page.getByRole("button", { name: /^\d{1,2}:\d{2}$/ }).first();
      await expect(chip, "an available slot").toBeVisible({ timeout: 45_000 });
      chipText = (await chip.innerText()).trim();
      await chip.click({ timeout: 15_000 });
      await rec.shot(page, "guest-slot");
      await page.getByRole("button", { name: /^Continuar$/ }).last().click({ timeout: 15_000 });
    } else {
      const bookEntry = page.getByRole("button", { name: /Reservar|Agendar/i }).first();
      if (await bookEntry.isVisible({ timeout: 5_000 }).catch(() => false)) await bookEntry.click({ timeout: 15_000 });
      await expect(slotPicker, "an available slot").toBeVisible({ timeout: 45_000 });
      chipText = ((await slotPicker.innerText()).match(/\d{1,2}:\d{2}/)?.[0] ?? "").trim();
      await slotPicker.click({ timeout: 15_000 });
      await rec.shot(page, "guest-slot");
    }
    rec.fact("chip", chipText);
    await page.getByTestId("cb-name").or(page.getByRole("textbox", { name: /nombre|your name/i })).first().fill("Invitada QA", { timeout: 15_000 });
    await page.getByTestId("cb-email").or(page.getByRole("textbox", { name: /correo|email/i })).first().fill(o.email);
    const phone = page.getByTestId("cb-phone").or(page.getByRole("textbox", { name: /whatsapp|tel/i })).first();
    if (await phone.isVisible().catch(() => false)) await phone.fill("984 765 4321");
    rec.fact("captchaElementPresent", (await page.locator("[data-guest-instant-captcha]").count()) > 0);
    await rec.shot(page, "guest-details");
    await page.getByRole("button", { name: /confirmar|reservar|confirm this time|enviar solicitud/i }).last().click({ timeout: 15_000 });
    const confirmation = await page.getByText(/confirmad|reserva|listo|solicitud enviada|gracias|booked|cita/i).first().isVisible({ timeout: 20_000 }).catch(() => false);
    const refusalText = await page.getByText(/desaf[ií]o|challenge|captcha|verifica/i).first().innerText().catch(() => "");
    rec.fact("refusalTextShown", refusalText.slice(0, 120));
    await rec.shot(page, "guest-after-confirm");

    const admin = isolatedService();
    let cust: Row | null = null;
    let inq: Row | null = null;
    const found = await poll(async () => {
      ({ data: cust } = (await admin.from("customers").select("id").eq("email", o.email).limit(1).maybeSingle()) as { data: Row | null });
      ({ data: inq } = (await admin.from("inquiries").select("*").eq("contact_email", o.email).order("created_at", { ascending: false }).limit(1).maybeSingle()) as { data: Row | null });
      return cust && inq ? true : null;
    }, o.expectNoRows ? 10_000 : 30_000);
    void found;
    let order: Row | null = null;
    if (cust) {
      ({ data: order } = (await admin.from("orders").select("*").eq("customer_id", (cust as Row).id as string).order("created_at", { ascending: false }).limit(1).maybeSingle()) as { data: Row | null });
    }
    return { email: o.email, chip: chipText, inquiry: inq, order, customerId: (cust as Row | null)?.id as string | null ?? null, confirmationSeen: confirmation };
  } finally {
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------
if (TARGET.local) test.use({ launchOptions: { args: ["--host-resolver-rules=MAP *.tulala.digital 127.0.0.1"] } });

test.beforeAll(() => {
  assertIsolatedJourneysTarget(process.env);
  assertAllowedOrigins({ marketing: MARKETING_BASE, app: APP_BASE }, process.env);
});

test.describe("run 5 evidence · isolated journeys stack", () => {
  test.use({ viewport: VIEWPORT });

  test("run5 evidence", async ({ browser }) => {
    test.setTimeout(3_600_000);
    const rec = new Rec();
    const admin = isolatedService();
    let A: Acct | null = null;
    let M2: Acct | null = null;
    let S: Acct | null = null;
    let guest: GuestBooking | null = null;
    let talentTz = "America/Cancun";
    const HEADLINE = `Titular Run5 ${STAMP}`;

    // ---- SETUP: three throwaway accounts through the real front door --------------------------------------------
    await rec.step("SETUP", "signup A (myself)", async () => { A = await provision(browser, rec, "myself", "A"); });
    await rec.step("SETUP", "signup M2 (myself, for TUL-86)", async () => { M2 = await provision(browser, rec, "myself", "M2"); });
    await rec.step("SETUP", "signup S (studio)", async () => { S = await provision(browser, rec, "studio", "S"); });

    // ---- TUL-130 -------------------------------------------------------------------------------------------------
    await rec.step("TUL-130", "no legacy-signup leftovers after a fresh signup", async () => {
      const a = requireAcct(A, "A");
      const checked: string[] = [];
      const { data: tps } = await admin.from("talent_profiles").select("id, deleted_at, workflow_status, invitation_email").eq("user_id", a.userId);
      rec.fact("talent_profiles_rows_incl_deleted", (tps ?? []).length);
      checked.push("talent_profiles (legacy chooseTalentRole stub)");
      expect((tps ?? []).length, "exactly one talent_profiles row (no orphan from the legacy role picker)").toBe(1);
      const { count: clients } = await admin.from("client_profiles").select("id", { count: "exact", head: true }).eq("user_id", a.userId);
      checked.push("client_profiles (legacy chooseClientRole)");
      expect(clients ?? 0, "no client_profiles row for a talent signup").toBe(0);
      const { data: rel } = await admin.from("agency_client_relationships").select("id, client_profile_id").eq("added_by", a.userId);
      checked.push("agency_client_relationships (legacy portal next)");
      expect((rel ?? []).length, "no client relationship rows").toBe(0);
      const { data: roster } = await admin.from("agency_talent_roster").select("tenant_id, status").eq("talent_profile_id", a.talentId!);
      rec.fact("rosterRows", roster);
      checked.push("agency_talent_roster (legacy ensureTalentRosterForNext)");
      expect((roster ?? []).filter((r) => r.status !== "active").length, "no pending/invited roster leftover").toBe(0);
      const { data: prof } = await admin.from("profiles").select("app_role, account_status").eq("id", a.userId).maybeSingle();
      checked.push("profiles.app_role");
      rec.fact("profile", prof);
      expect(prof?.app_role).toBe("talent");
      rec.fact("tablesChecked", checked);
      // The old doors must hand off to /start (anonymous visitor).
      const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "es-MX" });
      await armBypass(ctx);
      const p = await ctx.newPage();
      rec.page = p;
      try {
        for (const path of ["/register", "/onboarding/role"]) {
          await p.goto(`${MARKETING_BASE}${path}`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
          await p.waitForTimeout(1_500);
          const finalPath = new URL(p.url()).pathname;
          rec.fact(`legacy ${path} ->`, finalPath);
          expect(finalPath, `${path} lands on /start`).toMatch(/\/start/);
        }
        await rec.shot(p, "legacy-door-redirect");
      } finally {
        await ctx.close();
      }
    });

    // ---- TUL-125 -------------------------------------------------------------------------------------------------
    await rec.step("TUL-125", "bilingual bio + stock hero image", async () => {
      const a = requireAcct(A, "A");
      const { data: tp } = await admin.from("talent_profiles").select("bio_i18n, short_bio").eq("id", a.talentId!).maybeSingle();
      const bio = (tp?.bio_i18n ?? {}) as Record<string, unknown>;
      rec.fact("bioLocales", Object.keys(bio));
      expect(String(bio.es ?? "").length, "bio_i18n.es").toBeGreaterThan(0);
      expect(String(bio.en ?? "").length, "bio_i18n.en").toBeGreaterThan(0);
      const { data: own } = await admin.from("media_assets").select("id").eq("owner_talent_profile_id", a.talentId!).is("deleted_at", null).limit(1);
      rec.fact("ownPhotos", (own ?? []).length);
      const { data: page } = await admin.from("talent_pages").select("blocks, blocks_published").eq("talent_profile_id", a.talentId!).eq("is_home", true).maybeSingle();
      const blob = JSON.stringify([page?.blocks, page?.blocks_published]);
      const imgs = Array.from(blob.matchAll(/https?:\\?\/\\?\/[^"\\]+?\.(?:jpe?g|png|webp)|\/storage\/v1\/object\/[^"\\]+/gi)).map((m) => m[0]);
      rec.fact("homeImageUrlsFound", imgs.slice(0, 5));
      expect(imgs.length, "home page carries a hero image").toBeGreaterThan(0);
      const { data: stock } = await admin.from("platform_stock_images").select("*").limit(300);
      const hit = (stock ?? []).find((r) => Object.values(r as Row).some((v) => typeof v === "string" && v.length > 12 && blob.includes(v)));
      rec.fact("matchesPlatformStockRow", hit ? (hit as Row).id : null);
      if ((own ?? []).length === 0) expect(hit, "no own photo, so the hero must be a platform_stock_images row").toBeTruthy();
    });

    // ---- TUL-157 -------------------------------------------------------------------------------------------------
    await rec.step("TUL-157", "hub roster row, media upload, services, hero, languages", async () => {
      const a = requireAcct(A, "A");
      const { data: hub } = await admin.from("agency_talent_roster").select("tenant_id, status").eq("talent_profile_id", a.talentId!).eq("status", "active");
      rec.fact("hubRosterActive", (hub ?? []).length);
      expect((hub ?? []).length, "active hub roster row").toBeGreaterThan(0);
      const { data: langs } = await admin.from("talent_languages").select("*").eq("talent_profile_id", a.talentId!);
      rec.fact("talent_languages", langs);
      expect((langs ?? []).length, "talent_languages rows").toBeGreaterThan(0);
      const { data: offers } = await admin.from("talent_offerings").select("title").eq("talent_profile_id", a.talentId!);
      rec.fact("offerings", (offers ?? []).map((o) => o.title));
      expect((offers ?? []).length, "services in the DB").toBe(SERVICES.length);

      const { ctx, page } = await openAs(browser, a);
      rec.page = page;
      try {
        // Services listed in the UI.
        await page.goto(`${APP_BASE}/talent/services`, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await expect(page.getByRole("heading", { name: /^Servicios$/ }).first()).toBeVisible({ timeout: 60_000 });
        for (const o of offers ?? []) await expect(page.locator("body"), `service "${o.title}" listed`).toContainText(String(o.title), { timeout: 60_000 });
        await rec.shot(page, "services");
        // Media upload through the dashboard file input.
        const before = (await admin.from("media_assets").select("id").eq("owner_talent_profile_id", a.talentId!).is("deleted_at", null)).data?.length ?? 0;
        let uploaded = false;
        for (const path of ["/talent/profile", "/talent/public-page", "/talent/site"]) {
          await page.goto(`${APP_BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
          await page.waitForTimeout(8_000);
          const input = page.locator('input[type="file"]').first();
          if ((await input.count()) === 0) continue;
          await input.setInputFiles({ name: `run5-${STAMP}.png`, mimeType: "image/png", buffer: solidPng() });
          rec.fact("uploadFrom", path);
          uploaded = true;
          break;
        }
        if (!uploaded) throw new Blocked("blocked: no file input reachable in /talent/profile, /talent/public-page or /talent/site (media upload entry point unknown)");
        await rec.shot(page, "after-upload");
        const row = await poll(async () => {
          const { data } = await admin.from("media_assets").select("*").eq("owner_talent_profile_id", a.talentId!).is("deleted_at", null);
          return (data ?? []).length > before ? data : null;
        }, 60_000);
        rec.fact("media_assets_rows", { before, after: (row ?? []).length });
        expect(row, "media_assets row created by the upload").toBeTruthy();
      } finally {
        await ctx.close();
      }
      const { data: home } = await admin.from("talent_pages").select("blocks").eq("talent_profile_id", a.talentId!).eq("is_home", true).maybeSingle();
      expect(/https?:\\?\/\\?\/[^"\\]+|\/storage\/v1\/object\//i.test(JSON.stringify(home?.blocks ?? "")), "home hero has an image reference").toBe(true);
    });

    // ---- TUL-76 --------------------------------------------------------------------------------------------------
    await rec.step("TUL-76", "edit hero headline + publish a fresh site", async () => {
      const a = requireAcct(A, "A");
      const before = (await admin.from("talent_sites").select("site_published_at").eq("talent_profile_id", a.talentId!).maybeSingle()).data?.site_published_at as string | null;
      const { ctx, page } = await openAs(browser, a);
      rec.page = page;
      try {
        await page.goto(`${APP_BASE}/talent/site`, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await page.waitForTimeout(10_000);
        await rec.shot(page, "site-dashboard");
        const open = page.getByRole("link", { name: /Editar (mi )?sitio|Personalizar|Abrir (el )?editor|Edit (my )?site/i }).or(page.getByRole("button", { name: /Editar (mi )?sitio|Personalizar|Abrir (el )?editor|Edit (my )?site/i })).first();
        if (await open.isVisible().catch(() => false)) {
          await open.click({ timeout: 10_000 }).catch(() => undefined);
          await page.waitForTimeout(8_000);
        }
        // The hero headline lives on the canvas (main document or an iframe): the first h1 that is editable.
        let edited = false;
        for (const frame of page.frames()) {
          const h1 = frame.locator("h1").first();
          if (!(await h1.isVisible({ timeout: 2_000 }).catch(() => false))) continue;
          await h1.dblclick({ timeout: 5_000 }).catch(() => undefined);
          await page.keyboard.press("ControlOrMeta+a");
          await page.keyboard.type(HEADLINE);
          await frame.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => undefined);
          edited = true;
          break;
        }
        await rec.shot(page, "after-edit");
        if (!edited) throw new Blocked("blocked: no editable hero h1 found on /talent/site (builder canvas selectors unknown); DB/public assertions not reached");
        const publish = page.getByRole("button", { name: /^Publicar|Publish/i }).first();
        await publish.click({ timeout: 15_000 });
        await page.waitForTimeout(6_000);
        const confirm = page.getByRole("button", { name: /^(Publicar|Publish)( ahora| now)?$/i }).last();
        if (await confirm.isVisible().catch(() => false)) await confirm.click().catch(() => undefined);
        await rec.shot(page, "after-publish");
      } finally {
        await ctx.close();
      }
      const live = await poll(async () => {
        const { data } = await admin.from("talent_pages").select("blocks_published").eq("talent_profile_id", a.talentId!).eq("is_home", true).maybeSingle();
        return JSON.stringify(data?.blocks_published ?? "").includes(HEADLINE) ? true : null;
      }, 45_000);
      const { data: site } = await admin.from("talent_sites").select("status, site_published_at, site_slug").eq("talent_profile_id", a.talentId!).maybeSingle();
      rec.fact("talent_sites", site);
      rec.fact("blocks_published_has_headline", Boolean(live));
      expect(live, "talent_pages.blocks_published carries the new headline").toBeTruthy();
      expect(site?.status, "talent_sites.status").toBe("published");
      expect(new Date(String(site?.site_published_at)).getTime(), "site_published_at moved forward").toBeGreaterThan(new Date(String(before ?? 0)).getTime());
      const pub = await browser.newContext({ viewport: VIEWPORT, locale: "es-MX" });
      await armBypass(pub);
      const pp = await pub.newPage();
      rec.page = pp;
      try {
        let ok = false;
        for (let i = 0; i < 6 && !ok; i += 1) {
          const res = await pp.goto(siteUrl(a.siteSlug!), { waitUntil: "domcontentloaded" });
          expect(res?.status(), "public site status").toBe(200);
          ok = (await pp.locator("body").innerText()).includes(HEADLINE);
          if (!ok) await pp.waitForTimeout(5_000);
        }
        await rec.shot(pp, "public-site");
        expect(ok, "public URL serves the new headline").toBe(true);
      } finally {
        await pub.close();
      }
    });

    // ---- TUL-85 --------------------------------------------------------------------------------------------------
    await rec.step("TUL-85", "picked look is applied on the built site", async () => {
      const a = requireAcct(A, "A");
      const { data: site } = await admin.from("talent_sites").select("*").eq("talent_profile_id", a.talentId!).maybeSingle();
      rec.fact("pickedLook", a.pickedLook);
      rec.fact("theme_design_slug", site?.theme_design_slug);
      expect(site?.theme_design_slug, "talent_sites.theme_design_slug").toBe("maison-v2");
      if (!a.pickedLook) throw new Blocked("blocked: the look picker was not shown during signup (no picked key to compare)");
      const row = JSON.stringify(site ?? {});
      const pub = await browser.newContext({ viewport: VIEWPORT, locale: "es-MX" });
      await armBypass(pub);
      const pp = await pub.newPage();
      rec.page = pp;
      try {
        await pp.goto(siteUrl(a.siteSlug!), { waitUntil: "domcontentloaded" });
        const html = await pp.content();
        const inRow = row.includes(a.pickedLook);
        const inHtml = html.includes(a.pickedLook) || html.includes("maison-v2");
        rec.fact("pickedKeyInSiteRow", inRow);
        rec.fact("pickedKeyOrDesignInPublicHtml", inHtml);
        await rec.shot(pp, "public-site-look");
        expect(inRow || html.includes(a.pickedLook), `picked look "${a.pickedLook}" is traceable in the site row or the public page`).toBe(true);
      } finally {
        await pub.close();
      }
    });
    await rec.step("TUL-85", "simulated publish failure shows the honest fallback screen", async () => {
      throw new Blocked(
        "simulation not possible: site_publish_failed is only returned by provision-for-choice.server.ts (ensureTalentSite -> ensureOwnSitePublished) " +
          "and no env flag, forced-failing slug or test hook exists; faking it needs a product change. The arrival-failed screen (data-testid onb-arrival-failed, " +
          "retry onb-arrival-retry) is covered by unit tests (provision-for-choice.test.ts) and is observed here only if a build fails by itself (fact firstBuildEndedOnFailedScreen in SETUP).",
        "NOT_POSSIBLE",
      );
    });

    // ---- TUL-115 -------------------------------------------------------------------------------------------------
    await rec.step("TUL-115", "new talent can publish AND Horario (hours) saves", async () => {
      const a = requireAcct(A, "A");
      const { data: site } = await admin.from("talent_sites").select("status, site_published_at").eq("talent_profile_id", a.talentId!).maybeSingle();
      rec.fact("publishState", site);
      expect(site?.site_published_at, "new talent has a published site").toBeTruthy();
      const { ctx, page } = await openAs(browser, a);
      rec.page = page;
      try {
        await page.goto(`${APP_BASE}/talent/settings`, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await page.waitForTimeout(10_000);
        await page.getByText(/Horario y días libres/).first().click();
        await page.waitForTimeout(8_000);
        const tzSel = () => page.locator("body").getByLabel(/^(Zona horaria|Timezone)$/).first();
        if (!(await tzSel().isVisible().catch(() => false))) {
          await page.getByRole("button", { name: /^Disponibilidad$/ }).first().click({ timeout: 10_000 }).catch(() => undefined);
          await page.waitForTimeout(3_000);
        }
        await rec.shot(page, "horario-open");
        await expect(tzSel(), "a time zone control labelled Zona horaria is reachable").toBeVisible({ timeout: 60_000 });
        await tzSel().selectOption("America/Cancun");
        const boxes = page.locator('input[type="checkbox"]');
        for (let i = 0; i < Math.min(await boxes.count(), 7); i += 1) {
          const want = i < 5;
          if ((await boxes.nth(i).isChecked()) !== want) await boxes.nth(i).setChecked(want);
        }
        const times = page.locator('input[type="time"]');
        for (let i = 0; i < (await times.count()); i += 2) {
          await times.nth(i).fill("10:00");
          await times.nth(i + 1).fill("18:00");
        }
        await page.getByRole("button", { name: /Guardar|Save/ }).last().click();
        await page.waitForTimeout(3_000);
        expect(await page.locator("body").innerText(), "a success state is shown").toMatch(/guardad|saved/i);
        await rec.shot(page, "horario-saved");
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(10_000);
        await page.getByText(/Horario y días libres/).first().click();
        if (!(await tzSel().isVisible().catch(() => false))) await page.getByRole("button", { name: /^Disponibilidad$/ }).first().click({ timeout: 10_000 }).catch(() => undefined);
        await expect(tzSel()).toBeVisible({ timeout: 60_000 });
        await expect(tzSel(), "reload keeps the time zone").toHaveValue("America/Cancun");
        await expect(page.locator('input[type="time"]').first(), "reload keeps the opening time").toHaveValue("10:00");
        await expect(page.locator('input[type="time"]').nth(1), "reload keeps the closing time").toHaveValue("18:00");
        await rec.shot(page, "horario-after-reload");
      } finally {
        await ctx.close();
      }
      const { data: hours } = await admin.from("talent_booking_hours").select("*").eq("talent_profile_id", a.talentId!).maybeSingle();
      rec.fact("talent_booking_hours", hours);
      expect(hours?.timezone, "talent_booking_hours.timezone").toBe("America/Cancun");
      expect(JSON.stringify(hours?.weekly ?? {}), "weekly hours carry 10:00 and 18:00").toMatch(/10:00[\s\S]*18:00/);
      talentTz = "America/Cancun";
    });

    // ---- A's guest booking (shared by TUL-93 / 168 / 132 / 123-138 booking) ---------------------------------------
    await rec.step("SETUP", "guest booking on A's site (shared by TUL-93/168/132)", async () => {
      const a = requireAcct(A, "A");
      const { data: hrs } = await admin.from("talent_booking_hours").select("timezone").eq("talent_profile_id", a.talentId!).maybeSingle();
      talentTz = String(hrs?.timezone ?? talentTz);
      rec.fact("talentTimezone", talentTz);
      guest = await guestBook(browser, rec, { finishHref: a.finishHref, name: a.displayName, email: `qa-r5-guest-${STAMP}@impronta.test`, timezoneId: talentTz });
      rec.fact("guest", { chip: guest.chip, inquiry: guest.inquiry?.id, order: guest.order ? { id: guest.order.id, status: guest.order.status, channel: guest.order.source_channel } : null, confirmationSeen: guest.confirmationSeen });
      expect(guest.inquiry ?? guest.order, "a booking row (inquiry or order) exists").toBeTruthy();
    });

    // ---- TUL-168 -------------------------------------------------------------------------------------------------
    await rec.step("TUL-168", "booking stores the real appointment time + talent timezone", async () => {
      const a = requireAcct(A, "A");
      if (!guest?.inquiry) throw new Blocked("blocked: no guest inquiry from the shared booking step");
      const iid = guest.inquiry.id as string;
      let table = "talent_bookings";
      let { data: slot } = await admin.from("talent_bookings").select("*").eq("inquiry_id", iid).maybeSingle();
      if (!slot) {
        table = "talent_holds";
        ({ data: slot } = await admin.from("talent_holds").select("*").eq("inquiry_id", iid).maybeSingle());
      }
      rec.fact("slotTable", table);
      rec.fact("slotRow", slot);
      expect(slot, "a talent_bookings (confirmed) or talent_holds (pending payment) row for the inquiry").toBeTruthy();
      const { data: hrs } = await admin.from("talent_booking_hours").select("timezone").eq("talent_profile_id", a.talentId!).maybeSingle();
      const tz = String(hrs?.timezone ?? "");
      rec.fact("talent_booking_hours.timezone", tz);
      expect(tz, "talent timezone is a real IANA zone (not the UTC default)").toMatch(/\//);
      const got = wallClock(String((slot as Row).starts_at), tz);
      rec.fact("chosenChip", guest.chip);
      rec.fact("startsAtUtc", (slot as Row).starts_at);
      rec.fact("startsAtWallClockInTalentTz", got);
      const norm = (s: string) => s.replace(/^(\d):/, "0$1:");
      expect(got, "starts_at on the talent's wall clock equals the chosen slot").toBe(norm(guest.chip));
    });

    // ---- TUL-132 -------------------------------------------------------------------------------------------------
    await rec.step("TUL-132", "booking inquiry has event_date and location", async () => {
      if (!guest?.inquiry) throw new Blocked("blocked: no guest inquiry from the shared booking step");
      const { data: inq } = await admin.from("inquiries").select("id, status, event_date, event_location").eq("id", guest.inquiry.id as string).maybeSingle();
      rec.fact("inquiry", inq);
      const { data: tb } = await admin.from("talent_bookings").select("id").eq("inquiry_id", guest.inquiry.id as string).maybeSingle();
      rec.fact("talent_bookings_mirror_exists", Boolean(tb));
      if (!tb) rec.fact("note", "the stamp (stampInquiryEventFromBooking) runs on hold->booking conversion in reservation-convert.ts, i.e. after payment; a pending_payment guest booking may legitimately not be stamped yet");
      expect(inq?.event_date, "inquiries.event_date").toBeTruthy();
      expect(String(inq?.event_location ?? "").trim().length, "inquiries.event_location").toBeGreaterThan(0);
      if (guest.chip) {
        const { data: slot } = await admin.from("talent_holds").select("starts_at").eq("inquiry_id", guest.inquiry.id as string).maybeSingle();
        const iso = (slot as Row | null)?.starts_at as string | undefined;
        if (iso) expect(String(inq?.event_date), "event_date is the slot's date in the talent zone").toBe(wallDate(iso, talentTz));
      }
    });

    // ---- TUL-93 --------------------------------------------------------------------------------------------------
    await rec.step("TUL-93", "guest booking email + talent notification evidence", async () => {
      const a = requireAcct(A, "A");
      if (!guest?.inquiry) throw new Blocked("blocked: no guest inquiry from the shared booking step");
      const iid = guest.inquiry.id as string;
      const logs = await poll(async () => {
        const { data } = await admin.from("notification_dispatch_log").select("id, event_kind, channel, status, error_message, payload, sent_at, provider_reference, recipient_user_id").eq("inquiry_id", iid);
        return (data ?? []).length ? data : null;
      }, 45_000);
      rec.fact("notification_dispatch_log", (logs ?? []).map((r) => ({ event_kind: r.event_kind, channel: r.channel, status: r.status, error: r.error_message, sent_at: r.sent_at, payloadKeys: Object.keys((r.payload ?? {}) as Row) })));
      const { data: notes } = await admin.from("user_notifications").select("kind, surface, title, body, created_at").eq("user_id", a.userId).order("created_at", { ascending: false }).limit(10);
      rec.fact("user_notifications_for_talent", notes);
      rec.fact("bodiesNote", "no table stores sent email bodies (dispatch log keeps status + payload only); rendered bodies are asserted in TUL-108/136 and TUL-67");
      const emails = (logs ?? []).filter((r) => r.channel === "email");
      const sent = emails.filter((r) => r.status === "sent");
      expect((notes ?? []).length, "an in-app notification row exists for the talent").toBeGreaterThan(0);
      if (!sent.length) {
        rec.fact("emailProof", "email unproven: hook (TUL-333)");
        throw new Blocked(`email unproven: hook (TUL-333); email dispatch rows=${emails.length} statuses=${emails.map((r) => r.status).join(",") || "none"}; the in-app notification row for the talent IS present (${(notes ?? []).length})`);
      }
      rec.fact("emailProof", `${sent.length} email dispatch row(s) with status sent`);
    });

    // ---- TUL-123 / TUL-138 (booking) -----------------------------------------------------------------------------
    await rec.step("TUL-123/138", "captcha on guest booking: widget present, submit without a token refused", async () => {
      const a = requireAcct(A, "A");
      const env = { turnstileSiteKeyInTestEnv: Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY), turnstileSecretInTestEnv: Boolean(process.env.TURNSTILE_SECRET), hcaptchaSiteKeyInTestEnv: Boolean(process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY) };
      rec.fact("captchaEnvOfTestProcess(booleans only)", env);
      const email = `qa-r5-captcha-${STAMP}@impronta.test`;
      const r = await guestBook(browser, rec, { finishHref: a.finishHref, name: a.displayName, email, timezoneId: talentTz, blockCaptcha: true, expectNoRows: true });
      if (rec.getFact("captchaElementPresent") !== true) {
        throw new Blocked(`blocked: no captcha widget rendered on guest booking, so none is configured on this stack (test-process env: ${JSON.stringify(env)}); resolution order is tenant integration, platform default, then env NEXT_PUBLIC_TURNSTILE_SITE_KEY/TURNSTILE_SECRET (src/lib/captcha/env-fallback.ts). Configure Cloudflare test keys (1x00000000000000000000AA / 2x0000000000000000000000000000000AA) to prove this`);
      }
      expect(r.inquiry, "no inquiry created without a captcha token").toBeNull();
      expect(r.order, "no order created without a captcha token").toBeNull();
    });

    // ---- TUL-123 / TUL-138 (chat) --------------------------------------------------------------------------------
    await rec.step("TUL-123/138", "captcha on guest chat", async () => {
      const a = requireAcct(A, "A");
      const { data: tp } = await admin.from("talent_profiles").select("profile_code").eq("id", a.talentId!).maybeSingle();
      const code = tp?.profile_code as string | undefined;
      if (!code) throw new Blocked("blocked: no profile_code for the hub profile /t/<code>");
      const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "es-MX" });
      await armBypass(ctx);
      const p = await ctx.newPage();
      rec.page = p;
      try {
        await p.goto(`${MARKETING_BASE}/t/${code}`, { waitUntil: "domcontentloaded" });
        await p.waitForTimeout(5_000);
        const box = p.getByRole("textbox", { name: /mensaje|message|escribe|pregunta/i }).first();
        const hasChat = await box.isVisible({ timeout: 10_000 }).catch(() => false);
        rec.fact("chatComposerVisible", hasChat);
        if (hasChat) {
          await box.fill("Hola, ¿tienen lugar esta semana?");
          await box.press("Enter").catch(() => undefined);
          await p.waitForTimeout(6_000);
        }
        const slot = await p.locator("[data-guest-chat-captcha-slot]").count();
        rec.fact("chatCaptchaSlotCount", slot);
        await rec.shot(p, "chat");
        if (!slot) {
          throw new Blocked(
            `blocked: the chat captcha slot only renders after the server returns captcha_required (velocity guard in guest-chat-actions.ts / evaluate policy), not on a first message; composer ${hasChat ? "was" : "was NOT"} found. ` +
              "Forcing it needs repeated sends from one device or a captcha-configured stack.",
          );
        }
        expect(slot, "chat captcha slot rendered").toBeGreaterThan(0);
      } finally {
        await ctx.close();
      }
    });

    // ---- TUL-139 -------------------------------------------------------------------------------------------------
    await rec.step("TUL-139", "public-site lightbox fires exactly one book event", async () => {
      const a = requireAcct(A, "A");
      const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "es-MX" });
      await armBypass(ctx);
      await ctx.addInitScript(() => {
        const w = window as unknown as { __r5Book: number; __r5Claimed: number };
        w.__r5Book = 0;
        w.__r5Claimed = 0;
        window.addEventListener("tulala:portfolio-book", (e) => {
          w.__r5Book += 1;
          // Registered after the block listeners, so a claimed detail means exactly one handler booked.
          setTimeout(() => {
            if ((e as CustomEvent<{ claimed?: boolean }>).detail?.claimed) w.__r5Claimed += 1;
          }, 0);
        });
      });
      const p = await ctx.newPage();
      rec.page = p;
      try {
        await p.goto(siteUrl(a.siteSlug!), { waitUntil: "domcontentloaded" });
        await p.waitForTimeout(4_000);
        const shot = p.locator("[data-portfolio-shot-link]").first();
        if (!(await shot.count())) throw new Blocked("blocked: the published home page has no portfolio block ([data-portfolio-shot-link] absent), so there is no lightbox to click on this design");
        await shot.click({ timeout: 10_000 });
        const lb = p.locator("[data-portfolio-lightbox]");
        await expect(lb).toBeVisible({ timeout: 10_000 });
        await rec.shot(p, "lightbox-open");
        await p.locator("[data-portfolio-lightbox-book]").first().click({ timeout: 10_000 });
        await p.waitForTimeout(2_000);
        const counts = await p.evaluate(() => {
          const w = window as unknown as { __r5Book: number; __r5Claimed: number };
          return { dispatched: w.__r5Book, claimed: w.__r5Claimed };
        });
        rec.fact("counts", counts);
        await rec.shot(p, "after-book-click");
        expect(counts.dispatched, "one click dispatches one tulala:portfolio-book").toBe(1);
        expect(counts.claimed, "exactly one handler claimed it").toBe(1);
      } finally {
        await ctx.close();
      }
    });

    // ---- TUL-108 / TUL-136 and TUL-67: real email render in a child process --------------------------------------
    let renders: { variants: Array<{ name: string; entryId?: string; subject?: string; html?: string; error?: string }>; fatal?: string } | null = null;
    const render = () => {
      if (renders) return renders;
      const root = process.cwd();
      const out = execFileSync(resolve(root, "node_modules/.bin/tsx"), [resolve(root, "e2e/onboarding/_run5-render.mts")], {
        cwd: root,
        env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_OPTIONS: `--require ${resolve(root, "scripts/register-server-only-test.cjs")}`, NEXT_PUBLIC_SITE_URL: "https://tulala.digital" },
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        timeout: 180_000,
      });
      renders = JSON.parse(out);
      return renders!;
    };
    const variantOf = (name: string) => {
      const r = render();
      if (r.fatal) throw new Blocked(`blocked: render helper failed to load the catalog outside Next: ${r.fatal}`);
      const v = r.variants.find((x) => x.name === name);
      if (!v || v.error || !v.html) throw new Blocked(`blocked: variant ${name} not rendered (${v?.error ?? "missing"})`);
      return v as { name: string; subject: string; html: string };
    };
    const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

    await rec.step("TUL-108/136", "reminder emails say appointment/cita and show the appointment time", async () => {
      const es = variantOf("client-talent-site-es");
      const en = variantOf("client-talent-site-en");
      const ev = variantOf("client-agency-event-en");
      const talentEs = variantOf("talent-talent-site-es");
      rec.fact("subjects", { clientEs: es.subject, clientEn: en.subject, talentEs: talentEs.subject, agencyEventEn: ev.subject });
      rec.fact("bodyExcerptEs", text(es.html).slice(0, 400));
      for (const v of [es, talentEs]) {
        expect(`${v.subject} ${text(v.html)}`, `${v.name}: Spanish copy says cita`).toMatch(/\bcita\b/i);
        expect(`${v.subject} ${text(v.html)}`, `${v.name}: no 'evento' wording on a talent-site booking`).not.toMatch(/\bevento\b/i);
        expect(text(v.html), `${v.name}: appointment time in the talent zone (9:45)`).toMatch(/9:45/);
      }
      expect(`${en.subject} ${text(en.html)}`, "English copy says appointment").toMatch(/appointment/i);
      expect(`${en.subject} ${text(en.html)}`, "English talent-site copy never says event").not.toMatch(/\bevent\b/i);
      expect(`${ev.subject}`, "agency booking keeps the event wording").toMatch(/event/i);
    });

    await rec.step("TUL-67", "client email carries the tenant brand (name + logo)", async () => {
      const t = variantOf("client-talent-site-es");
      const p = variantOf("client-platform-brand-es");
      expect(t.html, "tenant wordmark in the header").toContain("RUN5 STUDIO");
      expect(t.html, "tenant logo <img>").toMatch(/<img[^>]+src="https:\/\/cdn\.example\/run5\/logo\.png"/);
      expect(t.html, "tenant footer domain / home link").toContain("run5-studio.example");
      expect(t.html, "tenant brand does not fall back to the platform wordmark").not.toMatch(/>\s*TULALA\s*</);
      rec.fact("platformBrandControl", { hasTenantWordmark: p.html.includes("RUN5 STUDIO"), hasPlatformWordmark: /TULALA/.test(p.html) });
      expect(p.html.includes("RUN5 STUDIO"), "control: platform-brand render does not contain the tenant name").toBe(false);
    });

    // ---- TUL-86 --------------------------------------------------------------------------------------------------
    const openHywCard = async (page: Page, acct: Acct) => {
      const card = page.getByTestId("how-you-work-card");
      if (acct.choice === "myself" && !acct.tenantSlug) {
        await page.goto(`${APP_BASE}/talent/settings`, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await page.waitForTimeout(10_000);
        await page.getByText(/^Cómo trabajas$/).first().click({ timeout: 15_000 });
      } else {
        for (const path of [`/${acct.tenantSlug}/admin/settings`, `/${acct.tenantSlug}/admin/account`, `/${acct.tenantSlug}/admin`]) {
          await page.goto(`${APP_BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch(() => undefined);
          await page.waitForTimeout(8_000);
          if (await card.isVisible().catch(() => false)) break;
          const nav = page.getByRole("link", { name: /^(Ajustes|Configuración|Settings)$/ }).first();
          if (await nav.isVisible().catch(() => false)) {
            await nav.click().catch(() => undefined);
            await page.waitForTimeout(6_000);
            if (await card.isVisible().catch(() => false)) break;
          }
        }
      }
      await expect(card, "How you work card is reachable").toBeVisible({ timeout: 30_000 });
      return card;
    };

    await rec.step("TUL-86", "myself -> both (Cómo trabajas, M2)", async () => {
      const m = requireAcct(M2, "M2");
      const { ctx, page } = await openAs(browser, m);
      rec.page = page;
      try {
        const card = await openHywCard(page, m);
        await expect(page.getByTestId("how-you-work-current")).toContainText("Solo yo", { timeout: 30_000 });
        await rec.shot(page, "before");
        await card.getByRole("button", { name: "Abrir un espacio de estudio" }).click();
        const dialog = page.getByRole("dialog", { name: /Abrir un espacio de estudio/ });
        await expect(dialog).toBeVisible();
        const slug = `r5m2${STAMP}`;
        await dialog.getByLabel(/Dirección/).fill(slug);
        await rec.shot(page, "confirm-sheet");
        await dialog.getByRole("button", { name: "Abrir espacio" }).click();
        await page.waitForURL(new RegExp(`/${slug}/admin`), { timeout: 90_000 }).catch(() => undefined);
        await rec.shot(page, "after");
        rec.fact("landedOn", new URL(page.url()).pathname);
      } finally {
        await ctx.close();
      }
      const { data: mem } = await admin.from("agency_memberships").select("tenant_id, role, status").eq("profile_id", m.userId);
      rec.fact("memberships", mem);
      const owner = (mem ?? []).find((x) => String(x.role).toLowerCase().includes("owner") && x.status === "active");
      expect(owner, "owner membership of the new workspace").toBeTruthy();
      const { data: roster } = await admin.from("agency_talent_roster").select("status, agency_visibility").eq("tenant_id", owner!.tenant_id as string).eq("talent_profile_id", m.talentId!).maybeSingle();
      rec.fact("selfRoster", roster);
      expect(roster?.status, "self roster active").toBe("active");
      expect(["site_visible", "featured"], "self roster bookable").toContain(roster?.agency_visibility);
      const { data: prof } = await admin.from("profiles").select("home_surface_preference").eq("id", m.userId).maybeSingle();
      rec.fact("home_surface_preference", prof?.home_surface_preference);
      const { data: tp } = await admin.from("talent_profiles").select("id, deleted_at").eq("id", m.talentId!).maybeSingle();
      expect(tp?.deleted_at ?? null, "talent profile kept (nothing deleted)").toBeNull();
      // UI state afterwards
      const again = await openAs(browser, m);
      rec.page = again.page;
      try {
        m.tenantSlug = `r5m2${STAMP}`;
        await again.page.goto(`${APP_BASE}/${m.tenantSlug}/admin/settings`, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch(() => undefined);
        await again.page.waitForTimeout(8_000);
        const cur = again.page.getByTestId("how-you-work-current");
        if (await cur.isVisible().catch(() => false)) {
          rec.fact("uiStateAfter", await cur.innerText());
          await expect(cur).toContainText("también recibo reservas");
        } else rec.fact("uiStateAfter", "card not reached at /<slug>/admin/settings (settings route guessed)");
        await rec.shot(again.page, "state-after");
      } finally {
        await again.ctx.close();
      }
    });

    // Studio: re-test booking with NO provider first, then add one (which is also the TUL-86 studio -> both move).
    await rec.step("Studio booking", "re-test booking on the studio fixture (no provider)", async () => {
      const s = requireAcct(S, "S");
      const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "es-MX" });
      await armBypass(ctx);
      const p = await ctx.newPage();
      rec.page = p;
      try {
        const res = await p.goto(toLocalUrl(s.finishHref), { waitUntil: "domcontentloaded" });
        rec.fact("status", res?.status());
        await expect(p.locator("body")).toContainText(s.displayName, { timeout: 30_000 });
        await rec.shot(p, "studio-site");
        const widget = (await p.getByRole("button", { name: /^Seleccionar$/ }).count()) + (await p.locator("[data-testid=slot-picker]").count());
        rec.fact("bookingWidgetControls", widget);
        const inquiryCta = await p.getByRole("button", { name: /Solicitar|Consultar|Enviar solicitud|Contactar|Escribir/i }).count() + (await p.getByRole("link", { name: /Solicitar|Consultar|WhatsApp|Contactar/i }).count());
        rec.fact("inquiryOnlyControls", inquiryCta);
        expect(widget === 0 && inquiryCta > 0, "studio without a provider is inquiry-only (no booking widget, an inquiry/contact path exists)").toBe(true);
      } finally {
        await ctx.close();
      }
    });

    await rec.step("TUL-86", "studio -> both (Agregarme como proveedor, S)", async () => {
      const s = requireAcct(S, "S");
      if (!s.tenantSlug) throw new Blocked("blocked: studio workspace slug unknown");
      const { ctx, page } = await openAs(browser, s);
      rec.page = page;
      try {
        const card = await openHywCard(page, s);
        await expect(page.getByTestId("how-you-work-current")).toContainText("Un estudio, yo no recibo reservas", { timeout: 30_000 });
        await rec.shot(page, "before");
        await card.getByRole("button", { name: "Agregarme como proveedor" }).click();
        const dialog = page.getByRole("dialog", { name: /Agregarte como proveedor/ });
        await expect(dialog).toBeVisible();
        await rec.shot(page, "confirm-sheet");
        await dialog.getByRole("button", { name: "Agregarme" }).click();
        await expect(page.getByRole("status").filter({ hasText: "Listo." }).or(page.getByTestId("how-you-work-current").filter({ hasText: "también recibo reservas" }))).toBeVisible({ timeout: 60_000 });
        await rec.shot(page, "after");
        rec.fact("uiStateAfter", await page.getByTestId("how-you-work-current").innerText().catch(() => null));
      } finally {
        await ctx.close();
      }
      const { data: tp } = await admin.from("talent_profiles").select("id").eq("user_id", s.userId).is("deleted_at", null).maybeSingle();
      s.talentId = (tp?.id as string | undefined) ?? null;
      rec.fact("talentProfileId", s.talentId);
      expect(s.talentId, "provider talent profile created").toBeTruthy();
      const { data: roster } = await admin.from("agency_talent_roster").select("status, agency_visibility").eq("tenant_id", s.tenantId!).eq("talent_profile_id", s.talentId!).maybeSingle();
      rec.fact("selfRoster", roster);
      expect(roster?.status, "self roster active").toBe("active");
      expect(["site_visible", "featured"], "self roster bookable").toContain(roster?.agency_visibility);
      const { data: mem } = await admin.from("agency_memberships").select("role, status").eq("profile_id", s.userId).eq("tenant_id", s.tenantId!);
      rec.fact("memberships", mem);
      expect((mem ?? []).some((x) => String(x.role).toLowerCase().includes("owner")), "still the owner").toBe(true);
    });

    await rec.step("Studio booking", "provider added (hours + one service seeded on the isolated project) and a guest books", async () => {
      const s = requireAcct(S, "S");
      const a = requireAcct(A, "A");
      if (!s.talentId || !s.tenantId) throw new Blocked("blocked: no provider on the studio (TUL-86 studio -> both did not complete)");
      // Provider decision: the studio owner herself (added through the app above). Seed ONLY what the app did not create,
      // copying from account A on the isolated project: weekly hours and one offering.
      const { data: hoursA } = await admin.from("talent_booking_hours").select("*").eq("talent_profile_id", a.talentId!).maybeSingle();
      const { data: hoursS } = await admin.from("talent_booking_hours").select("talent_profile_id").eq("talent_profile_id", s.talentId).maybeSingle();
      rec.fact("hoursSeeded", !hoursS);
      if (!hoursS && hoursA) {
        const { error } = await admin.from("talent_booking_hours").insert({ ...(hoursA as Row), talent_profile_id: s.talentId, tenant_id: s.tenantId });
        if (error) throw new Blocked(`blocked: could not seed talent_booking_hours for the studio provider: ${error.message}`);
      }
      const { data: offS } = await admin.from("talent_offerings").select("id").eq("talent_profile_id", s.talentId).limit(1);
      rec.fact("offeringSeeded", !(offS ?? []).length);
      if (!(offS ?? []).length) {
        const { data: offA } = await admin.from("talent_offerings").select("*").eq("talent_profile_id", a.talentId!).limit(1).maybeSingle();
        if (!offA) throw new Blocked("blocked: no offering on account A to copy for the studio provider");
        const clone = { ...(offA as Row), talent_profile_id: s.talentId, tenant_id: s.tenantId } as Row;
        delete clone.id;
        delete clone.created_at;
        delete clone.updated_at;
        const { error } = await admin.from("talent_offerings").insert(clone);
        if (error) throw new Blocked(`blocked: could not seed a provider offering for the studio: ${error.message}`);
      }
      const tz = String(((hoursA as Row | null)?.timezone as string | undefined) ?? talentTz);
      const g = await guestBook(browser, rec, { finishHref: s.finishHref, name: s.displayName, email: `qa-r5-studio-guest-${STAMP}@impronta.test`, timezoneId: tz });
      rec.fact("guest", { chip: g.chip, inquiry: g.inquiry?.id, order: g.order ? { id: g.order.id, status: g.order.status } : null, confirmationSeen: g.confirmationSeen });
      expect(g.inquiry ?? g.order, "a booking row (inquiry or order) exists for the studio booking").toBeTruthy();
    });

    // ---- TUL-120 -------------------------------------------------------------------------------------------------
    await rec.step("TUL-120", "no error banner after login + Messages empty state", async () => {
      const m = requireAcct(M2, "M2");
      // M2 never received a booking, so its inbox is empty (A now owns a guest booking).
      const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "es-MX" });
      await armBypass(ctx);
      await addSession(ctx, m.email);
      const p = await ctx.newPage();
      rec.page = p;
      try {
        const errors: string[] = [];
        p.on("response", (r) => {
          if (r.status() >= 500) errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
        });
        await p.goto(`${APP_BASE}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
        const dash = p.getByText(/^(Hoy|Resumen)$/).or(p.getByRole("heading", { name: /^(Buenos días|Buenas tardes|Buenas noches|Hoy)/ })).filter({ visible: true }).first();
        await expect(dash, "Spanish dashboard after login").toBeVisible({ timeout: 90_000 });
        await p.waitForTimeout(3_000);
        await rec.shot(p, "after-login");
        const banner = await p.getByRole("alert").filter({ hasText: /error|no pudimos|algo sali[óo] mal|something went wrong/i }).count();
        const bannerText = await p.getByText(/Algo salió mal|No pudimos cargar|Something went wrong/i).count();
        rec.fact("errorBannerCount", banner + bannerText);
        rec.fact("http5xx", errors);
        expect(banner + bannerText, "no error banner right after login").toBe(0);
        await p.goto(`${APP_BASE}/talent/messages`, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await p.waitForTimeout(8_000);
        await rec.shot(p, "messages");
        const body = await p.locator("main").first().innerText().catch(async () => p.locator("body").innerText());
        rec.fact("messagesText", body.replace(/\s+/g, " ").slice(0, 400));
        expect(body, "Messages shows an empty state, not an error").not.toMatch(/Algo salió mal|No pudimos cargar|error/i);
        expect(body, "Messages empty state wording (Spanish)").toMatch(/sin mensajes|no hay mensajes|aún no|todavía no|empieza|ningún mensaje|no tienes/i);
      } finally {
        await ctx.close();
      }
    });

    await rec.step("TUL-120", "sign-out works", async () => {
      const m = requireAcct(M2, "M2");
      const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "es-MX" });
      await armBypass(ctx);
      await addSession(ctx, m.email);
      const p = await ctx.newPage();
      rec.page = p;
      try {
        await p.goto(`${APP_BASE}/talent/today`, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await p.waitForTimeout(8_000);
        const authCookies = async () => (await ctx.cookies()).filter((c) => /^sb-.*auth-token/.test(c.name) && c.value);
        rec.fact("authCookiesBefore", (await authCookies()).length);
        const menu = p.getByRole("button", { name: /cuenta|perfil|account|menú de usuario|Rosa/i }).first();
        let how = "POST /auth/sign-out";
        if (await menu.isVisible().catch(() => false)) {
          await menu.click().catch(() => undefined);
          const out = p.getByText("Cerrar sesión", { exact: true }).first();
          if (await out.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await rec.shot(p, "menu");
            await out.click();
            how = "account menu 'Cerrar sesión'";
          }
        }
        if (how === "POST /auth/sign-out") {
          await p.request.post(`${APP_BASE}/auth/sign-out`, { maxRedirects: 0, headers: bypassHeadersFor(`${APP_BASE}/auth/sign-out`, process.env) as Record<string, string> }).catch(() => undefined);
        }
        rec.fact("signOutVia", how);
        const gone = await poll(async () => ((await authCookies()).length === 0 ? true : null), 30_000, 1_000);
        rec.fact("authCookiesAfter", (await authCookies()).length);
        expect(gone, "auth cookies cleared").toBeTruthy();
        await p.goto(`${APP_BASE}/talent/today`, { waitUntil: "commit", timeout: 120_000 });
        await p.waitForTimeout(12_000);
        await rec.shot(p, "after-signout");
        const u = new URL(p.url());
        expect(/login|sign-?in|auth|iniciar/i.test(u.pathname + u.search), `/talent/today redirects to login (went to ${u.pathname})`).toBe(true);
      } finally {
        await ctx.close();
      }
    });

    await rec.step("TUL-120", "Spanish support reply", async () => {
      throw new Blocked(
        "blocked: the support assistant needs an AI provider (src/lib/support/support-ai-language.ts sets the reply language, TUL-120 F-04) and the isolated stack has no AI provider (the understand step already hits the too-little dead end). " +
          "The reply language directive is covered by unit tests; a live Spanish reply cannot be made deterministic here.",
      );
    });

    // ---- done ----------------------------------------------------------------------------------------------------
    const failed = rec.failures();
    expect(failed, failed.map((f) => `${f.card} / ${f.step}: ${f.detail}`).join("\n")).toHaveLength(0);
  });
});
