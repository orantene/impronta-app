/**
 * TUL-290: render-to-content timing of Today, Messages, Profile and Builder as the TEST talent TAL-93900, in a
 * headless Chromium (rAF fires, the page is visible), 3 loads per page, plus console hydration errors (#418).
 *
 * ON DEMAND ONLY. It signs in with a service-role minted session (no password), so it needs:
 *   LIVE_TIMING=1  NEXT_PUBLIC_SUPABASE_URL  NEXT_PUBLIC_SUPABASE_ANON_KEY  SUPABASE_SERVICE_ROLE_KEY
 * (production project pluhdapdnuiulvxmyspd). Without LIVE_TIMING=1 it skips. The storage state lives in a temp
 * dir and is deleted after the run, pass or fail. Read-only: it only navigates and reads.
 *
 *   cd web && LIVE_TIMING=1 npm run live:check -- timing-harness
 *   (env from web/.env.local: node --env-file=.env.local ... or export before running)
 *
 * Run it ONE project at a time and alone (timings are only meaningful on a quiet machine): the spec skips the
 * phone project and runs serially with no retries.
 */
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import {
  APP_HOST,
  CONTENT_PROBE_INIT,
  CONTENT_TIMEOUT_MS,
  LOADS_PER_PAGE,
  PROD_SUPABASE_REF,
  TEST_TALENT_CODE,
  TIMED_PAGES,
  deleteTempState,
  formatTable,
  isHydrationError,
  mintTestTalentState,
  summarize,
  writeTempState,
  type LoadSample,
  type MintPorts,
} from "../scripts/live-timing/timing-harness";

test.describe.configure({ mode: "serial", retries: 0 });

let statePath: string | null = null;

test.beforeAll(async () => {
  test.skip(process.env.LIVE_TIMING !== "1", "set LIVE_TIMING=1 to run the timing harness");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url.includes(PROD_SUPABASE_REF) || !anon || !service) {
    throw new Error(`needs NEXT_PUBLIC_SUPABASE_URL (${PROD_SUPABASE_REF}), NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY`);
  }
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const ports: MintPorts = {
    async emailForProfileCode(code) {
      const { data, error } = await admin.from("talent_profiles").select("user_id").eq("profile_code", code).maybeSingle<{ user_id: string | null }>();
      if (error || !data?.user_id) return null;
      const { data: u } = await admin.auth.admin.getUserById(data.user_id);
      return u?.user?.email ?? null;
    },
    async hashedTokenFor(email) {
      const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      const hash = data?.properties?.hashed_token;
      if (error || !hash) throw new Error(`magic link failed: ${error?.message ?? "no hashed_token"}`);
      return hash;
    },
    async verifyOtp(tokenHash) {
      const { data, error } = await client.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
      if (error || !data.session) throw new Error(`verifyOtp failed: ${error?.message ?? "no session"}`);
      return data.session;
    },
  };
  statePath = writeTempState(await mintTestTalentState(ports, { code: TEST_TALENT_CODE }));
});

test.afterAll(() => {
  deleteTempState(statePath);
  statePath = null;
});

test(`time ${TIMED_PAGES.map((p) => p.key).join(", ")} as ${TEST_TALENT_CODE} (${LOADS_PER_PAGE} loads each) and catch console #418`, async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "timings run on the desktop project only");
  test.setTimeout(TIMED_PAGES.length * LOADS_PER_PAGE * (CONTENT_TIMEOUT_MS + 15_000));
  const samples: LoadSample[] = [];
  for (const p of TIMED_PAGES) {
    for (let load = 1; load <= LOADS_PER_PAGE; load += 1) {
      // A fresh context per load: a cold cache, the same session.
      const context = await browser.newContext({ storageState: statePath ?? undefined });
      await context.addInitScript(CONTENT_PROBE_INIT);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("console", (m) => { if (m.type() === "error" && isHydrationError(m.text())) errors.push(m.text().slice(0, 160)); });
      page.on("pageerror", (e) => { if (isHydrationError(String(e.message))) errors.push(String(e.message).slice(0, 160)); });
      await page.goto(`${APP_HOST}${p.path}`, { waitUntil: "commit", timeout: 60_000 }).catch(() => undefined);
      await page.waitForFunction(() => (window as unknown as { __timing?: { firstContentMs: number | null } }).__timing?.firstContentMs != null, undefined, { timeout: CONTENT_TIMEOUT_MS }).catch(() => undefined);
      const probe = await page.evaluate(() => (window as unknown as { __timing?: { firstContentMs: number | null; visibility: string } }).__timing ?? null).catch(() => null);
      const nav = await page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        return n ? { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd) } : null;
      }).catch(() => null);
      samples.push({
        page: p.key,
        load,
        ttfbMs: nav?.ttfb ?? null,
        domContentLoadedMs: nav?.dcl ?? null,
        firstContentMs: probe?.firstContentMs ?? null,
        visibility: probe?.visibility ?? "unknown",
        hydrationErrors: errors,
      });
      await context.close();
    }
  }
  const table = formatTable(summarize(samples));
  process.stdout.write(`\nTUL-290 timing, as ${TEST_TALENT_CODE}, headless desktop, ${LOADS_PER_PAGE} cold loads per page:\n${table}\n\n`);
  await info.attach("timing-table", { body: table, contentType: "text/plain" });
  await info.attach("timing-samples", { body: JSON.stringify(samples, null, 2), contentType: "application/json" });
  const hydration = samples.flatMap((s) => s.hydrationErrors.map((e) => `${s.page} #${s.load}: ${e}`));
  expect(hydration, "console hydration errors (#418 and friends)").toEqual([]);
});
