// Saves Valeria's (QA_FRESH) storage state. Never prints credentials.
import { chromium } from "playwright"; import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(new URL("../../../.env.local", import.meta.url), "utf8").split("\n").filter(l => /^QA_FRESH_/.test(l)).map(l => [l.split("=")[0], l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const BASE = process.env.BASE_URL || "http://localhost:3001"; const out = process.argv[2];
const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.locator('input[type="email"]').waitFor({ timeout: 60000 });
await p.fill('input[type="email"]', env.QA_FRESH_EMAIL); await p.fill('input[type="password"]', env.QA_FRESH_PASSWORD);
await Promise.all([p.waitForURL(/\/(talent|admin|workspace|onboarding)/, { timeout: 120000 }), p.click('button[type="submit"]')]);
console.log("landed", p.url()); await ctx.storageState({ path: out }); await b.close();
