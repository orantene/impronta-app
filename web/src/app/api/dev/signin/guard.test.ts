import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { devSigninAllowed, supabaseTarget, type DevSigninEnv } from "./guard";

const PROD = "https://pluhdapdnuiulvxmyspd.supabase.co";
const FXLANK = "https://fxlankepwnvelxjrahwk.supabase.co";
const LOCAL = "http://127.0.0.1:54321";
const hdr = (token?: string) => ({ get: (n: string) => (n === "x-dev-signin-token" && token ? token : null) });
const allow = (env: DevSigninEnv, token?: string) => devSigninAllowed(env, hdr(token));

test("supabaseTarget classifies the project ref", () => {
  assert.equal(supabaseTarget(PROD), "prod");
  assert.equal(supabaseTarget(FXLANK), "isolated");
  assert.equal(supabaseTarget(LOCAL), "local");
  assert.equal(supabaseTarget("http://localhost:54321"), "local");
  assert.equal(supabaseTarget("https://other.supabase.co"), "other");
  assert.equal(supabaseTarget(undefined), "other");
});

test("TUL-1269: the lh localhost slot (NODE_ENV=production, VERCEL_ENV=preview, VERCEL unset, fxlank) is allowed", () => {
  const lh = { NODE_ENV: "production", VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: FXLANK };
  assert.equal(allow(lh), true);
  assert.equal(allow({ ...lh, NEXT_PUBLIC_SUPABASE_URL: PROD }), false, "same slot pointed at prod is denied");
});

test("the prod project ref is denied whatever the flags or header say", () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: PROD, DEV_SIGNIN_TOKEN: "tok", LOCAL_QA: "1", NODE_ENV: "development" };
  assert.equal(allow(env, "tok"), false);
  assert.equal(allow(env), false);
});

test("Vercel preview without the token is denied (QA host pool uses the prod DB; previews)", () => {
  const vercel = { VERCEL: "1", VERCEL_ENV: "preview", NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: FXLANK, LOCAL_QA: "1" };
  assert.equal(allow(vercel), false);
  assert.equal(allow({ ...vercel, DEV_SIGNIN_TOKEN: "tok" }), false, "token configured, none sent");
});

test("the token: correct allows, wrong denies, unset env is closed", () => {
  const vercel = { VERCEL: "1", VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: FXLANK };
  assert.equal(allow({ ...vercel, DEV_SIGNIN_TOKEN: "tok" }, "tok"), true);
  assert.equal(allow({ ...vercel, DEV_SIGNIN_TOKEN: "tok" }, "nope"), false);
  assert.equal(allow(vercel, "anything"), false, "DEV_SIGNIN_TOKEN unset");
  assert.equal(allow({ ...vercel, DEV_SIGNIN_TOKEN: "tok", VERCEL_ENV: "production" }, "tok"), false, "Vercel production");
});

test("CI lane: not on Vercel with local supabase is allowed without any token", () => {
  assert.equal(allow({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: LOCAL }), true);
});

test("LOCAL_QA=1 off Vercel is allowed for a non-prod ref only", () => {
  assert.equal(allow({ LOCAL_QA: "1", NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }), true);
  assert.equal(allow({ LOCAL_QA: "1", VERCEL: "1", NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }), false);
  assert.equal(allow({ NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }), false, "unknown ref, no flag");
});

test("INVARIANT the route uses devSigninAllowed and keeps passwordless sign-in to @impronta.test", () => {
  const src = readFileSync(join(process.cwd(), "src/app/api/dev/signin/route.ts"), "utf8");
  assert.match(src, /devSigninAllowed\(process\.env, request\.headers\)/);
  assert.doesNotMatch(src, /if \(!isDev && !isPreview\)/);
  assert.match(src, /!password && email\.toLowerCase\(\)\.endsWith\("@impronta\.test"\)/);
});
