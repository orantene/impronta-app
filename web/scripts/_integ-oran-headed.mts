import { chromium } from "playwright";
import fs from "node:fs";

const AUTH = "/home/ubuntu/.claude/design-diff/.auth-alba-nail-artist.json";
const MATEO = "/home/ubuntu/.claude/design-diff/.auth-mateo-localhost.json";
const LIVE =
  "http://localhost:3001/template-preview/current?kind=live-site&talent=8a59afc1-6e2e-49cd-b78d-27f689cc80f5&locale=es";
const BUILDER = "http://localhost:3001/talent/page-builder";
const SITE = "http://localhost:3001/talent/site";
const MATEO_LIVE =
  "http://localhost:3001/template-preview/current?kind=live-site&talent=30f45c0f-6c40-44d4-bfb7-f04bfd0a6adc&locale=es";

// Remint check: open Alba context headed
const browser = await chromium.launch({
  headless: false,
  args: ["--window-size=1440,900", "--window-position=40,40"],
});
const alba = await browser.newContext({
  storageState: AUTH,
  viewport: { width: 1440, height: 900 },
});
const live = await alba.newPage();
await live.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 60000 });
await live.waitForTimeout(2500);
const notFound = (await live.getByText(/Page not found/i).count()) > 0;
const hero = await live.locator("[data-builder-node-kind='hero'], #hero").count();
console.log("ALBA_LIVE", { notFound, hero, url: live.url() });

const builder = await alba.newPage();
await builder.goto(BUILDER, { waitUntil: "domcontentloaded", timeout: 60000 });
await builder.waitForTimeout(3500);
console.log("ALBA_BUILDER", { url: builder.url(), login: /\/login/.test(builder.url()) });

const site = await alba.newPage();
await site.goto(SITE, { waitUntil: "domcontentloaded", timeout: 60000 });
await site.waitForTimeout(2000);
console.log("ALBA_SITE", { url: site.url(), login: /\/login/.test(site.url()) });

// Mateo in second window/context
const mateo = await browser.newContext({
  storageState: MATEO,
  viewport: { width: 1280, height: 800 },
});
const ml = await mateo.newPage();
await ml.goto(MATEO_LIVE, { waitUntil: "domcontentloaded", timeout: 60000 });
await ml.waitForTimeout(2000);
console.log("MATEO_LIVE", {
  notFound: (await ml.getByText(/Page not found/i).count()) > 0,
  url: ml.url(),
});

// Bring Alba live to front
await live.bringToFront();
console.log("READY — leave open for Try Live");
await new Promise(() => {});
