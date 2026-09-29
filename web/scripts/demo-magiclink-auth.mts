/**
 * Mint Playwright storageState for a demo talent via admin magiclink.
 * Usage: DEMO_EMAIL=demo-mateo-ferrer@impronta.test DEMO_OUT=~/.claude/design-diff/.auth-mateo-ferrer.json npx tsx --env-file=.env.local scripts/demo-magiclink-auth.mts
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const EMAIL = process.env.DEMO_EMAIL?.trim();
const OUT =
  process.env.DEMO_OUT?.trim() ||
  path.join(os.homedir(), ".claude/design-diff", `.auth-${EMAIL?.split("@")[0] ?? "demo"}.json`);
const COOKIE_OUT = process.env.DEMO_COOKIE_OUT?.trim() || "/tmp/demo-cookies.txt";
const BASE = process.env.DEMO_BASE?.trim() || "http://127.0.0.1:3001";
const CHUNK = 3180;

if (!EMAIL) throw new Error("DEMO_EMAIL required");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
if (!url || !service || !anon) throw new Error("missing supabase env");

const admin = createClient(url, service, { auth: { persistSession: false } });
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: EMAIL,
});
if (linkErr || !link?.properties?.hashed_token) {
  throw new Error(`generateLink: ${linkErr?.message ?? "no token"}`);
}

const client = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: sess, error: otpErr } = await client.auth.verifyOtp({
  type: "magiclink",
  token_hash: link.properties.hashed_token,
});
if (otpErr || !sess.session) throw new Error(`verifyOtp: ${otpErr?.message}`);

const ref = "pluhdapdnuiulvxmyspd";
const storageKey = `sb-${ref}-auth-token`;
const payload = JSON.stringify({
  access_token: sess.session.access_token,
  token_type: sess.session.token_type,
  expires_in: sess.session.expires_in,
  expires_at: sess.session.expires_at,
  refresh_token: sess.session.refresh_token,
  user: sess.session.user,
});
const encoded = `base64-${Buffer.from(payload).toString("base64")}`;
const hostName = new URL(BASE).hostname;
const cookies: Array<{
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "Lax";
}> = [];
if (encoded.length <= CHUNK) {
  cookies.push({
    name: storageKey,
    value: encoded,
    domain: hostName,
    path: "/",
    secure: false,
    httpOnly: false,
    sameSite: "Lax",
  });
} else {
  let i = 0;
  for (let offset = 0; offset < encoded.length; offset += CHUNK) {
    cookies.push({
      name: `${storageKey}.${i}`,
      value: encoded.slice(offset, offset + CHUNK),
      domain: hostName,
      path: "/",
      secure: false,
      httpOnly: false,
      sameSite: "Lax",
    });
    i += 1;
  }
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies(cookies);
const page = await ctx.newPage();
await page.goto(`${BASE}/talent`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2000);
const ok = !/\/login/.test(page.url());
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await ctx.storageState({ path: OUT });
fs.chmodSync(OUT, 0o600);

const all = await ctx.cookies();
const lines = ["# Netscape HTTP Cookie File"];
for (const c of all) {
  lines.push(
    [
      c.domain.startsWith(".") ? c.domain : `.${c.domain}`,
      "TRUE",
      c.path,
      c.secure ? "TRUE" : "FALSE",
      c.expires && c.expires > 0 ? Math.floor(c.expires) : 0,
      c.name,
      c.value,
    ].join("\t"),
  );
}
fs.writeFileSync(COOKIE_OUT, lines.join("\n") + "\n");
console.log(JSON.stringify({ ok, url: page.url(), OUT, COOKIE_OUT, email: EMAIL }, null, 2));
await browser.close();
if (!ok) process.exit(1);
