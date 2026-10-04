/**
 * Attach to the desktop Chrome (CDP :9222), inject Alba session, open live + builder.
 * Leaves Chrome open for Try Live.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const AUTH = "/home/ubuntu/.claude/design-diff/.auth-alba-nail-artist.json";
const MATEO_AUTH = "/home/ubuntu/.claude/design-diff/.auth-mateo-localhost.json";
const LIVE =
  "http://localhost:3001/template-preview/current?kind=live-site&talent=8a59afc1-6e2e-49cd-b78d-27f689cc80f5&locale=es";
const BUILDER = "http://localhost:3001/talent/page-builder";
const SITE = "http://localhost:3001/talent/site";
const MATEO_LIVE =
  "http://localhost:3001/template-preview/current?kind=live-site&talent=30f45c0f-6c40-44d4-bfb7-f04bfd0a6adc&locale=es";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0] ?? (await browser.newContext());

// Clear conflicting auth cookies then inject Alba
type CookieLike = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

const state = JSON.parse(fs.readFileSync(AUTH, "utf8")) as { cookies?: CookieLike[] };
const cookies = (state.cookies ?? []).map((c) => ({
  ...c,
  // Ensure host matches localhost
  domain: c.domain?.replace("127.0.0.1", "localhost") ?? "localhost",
}));
await context.clearCookies();
await context.addCookies(cookies);

// Reuse first page or open new
let page = context.pages()[0];
if (!page) page = await context.newPage();
await page.bringToFront().catch(() => {});
await page.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2000);
const liveOk =
  (await page.locator("[data-builder-node-kind='hero'], #hero, text=Manos que").count()) > 0 ||
  !(await page.getByText(/Page not found/i).count());
console.log("LIVE", page.url(), "ok=", liveOk, "status-ish title=", await page.title());

const builder = await context.newPage();
await builder.goto(BUILDER, { waitUntil: "domcontentloaded", timeout: 60000 });
await builder.waitForTimeout(3000);
console.log("BUILDER", builder.url(), "login?", /\/login/.test(builder.url()));

const site = await context.newPage();
await site.goto(SITE, { waitUntil: "domcontentloaded", timeout: 60000 });
await site.waitForTimeout(2000);
console.log("SITE", site.url(), "login?", /\/login/.test(site.url()));

// Focus live tab for Oran
await page.bringToFront().catch(() => {});
console.log(JSON.stringify({ liveOk, liveUrl: page.url(), builderUrl: builder.url(), siteUrl: site.url() }));
// Do NOT browser.close() — leave CDP connection; disconnect only
await browser.close(); // disconnects CDP, does not kill Chrome
