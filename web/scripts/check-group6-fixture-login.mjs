#!/usr/bin/env node
/**
 * Read-only sign-in check for the Group 6 staging fixture users (STAGING ONLY).
 *
 * For each fixture login it (1) signs in with the Supabase password grant and
 * (2) opens the app host with that session (and the staging gate token header)
 * to see whether the page lands signed in. Prints status codes and verdicts
 * only: never a password, token, cookie value or email.
 *
 * Needs: --env-file <staging env pull> (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY),
 * ~/.tulala-qa-fixtures-g6.env (QA_FIXTURE_PASSWORD), ~/.tulala-qa.env (STAGING_GATE_CI_TOKEN).
 * Usage (from web/): node scripts/check-group6-fixture-login.mjs --env-file <tmp>
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { createServerClient } from "@supabase/ssr";

import { EMAILS, STAGING_PROJECT_REF, parseEnvText } from "./lib/group6-fixtures.mjs";

const APP_HOST = "https://app.staging.tulala.digital";
const GATE_HEADER = "x-staging-gate-token";

function load(path) {
  try {
    return parseEnvText(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

const i = process.argv.indexOf("--env-file");
const envFile = i > -1 ? process.argv[i + 1] : null;
const env = { ...(envFile ? load(envFile) : {}), ...load(join(homedir(), ".tulala-qa-fixtures-g6.env")) };
const gateToken = load(join(homedir(), ".tulala-qa.env")).STAGING_GATE_CI_TOKEN;

function fail(msg) {
  console.error(`[group6-login] ${msg}`);
  process.exit(2);
}

const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  /* handled below */
}
if (host !== `${STAGING_PROJECT_REF}.supabase.co`) fail("NEXT_PUBLIC_SUPABASE_URL must be the staging project; refusing");
if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) fail("NEXT_PUBLIC_SUPABASE_ANON_KEY missing in --env-file");
if (!env.QA_FIXTURE_PASSWORD) fail("QA_FIXTURE_PASSWORD missing in ~/.tulala-qa-fixtures-g6.env");

const USERS = [
  { key: "limpieza", email: EMAILS.limpieza, paths: ["/talent/today"] },
  { key: "quote", email: EMAILS.quote, paths: ["/talent/today"] },
  { key: "client", email: EMAILS.client, paths: ["/client", "/account"] },
  { key: "owner", email: EMAILS.owner, paths: ["/qa-fixture-g6-ws/admin"] },
];

let bad = 0;
for (const u of USERS) {
  let cookies = [];
  const supabase = createServerClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [],
      setAll: (c) => {
        cookies = c;
      },
    },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email: u.email, password: env.QA_FIXTURE_PASSWORD });
  const grant = error ? `FAIL(${error.status ?? "err"})` : data.session ? "200 session" : "no session";
  console.log(`[group6-login] ${u.key.padEnd(9)} password grant: ${grant}`);
  if (error || !data.session) {
    bad += 1;
    continue;
  }
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  for (const path of u.paths) {
    const res = await fetch(`${APP_HOST}${path}`, {
      redirect: "manual",
      headers: { cookie: cookieHeader, ...(gateToken ? { [GATE_HEADER]: gateToken } : {}) },
    });
    const loc = res.headers.get("location");
    const locPath = loc ? new URL(loc, APP_HOST).pathname : null;
    const signedIn = res.status === 200 || (res.status >= 300 && res.status < 400 && locPath && !/login|register|__staging-gate/.test(locPath));
    console.log(`[group6-login] ${u.key.padEnd(9)} ${path.padEnd(14)} -> ${res.status}${locPath ? ` redirect ${locPath}` : ""} : ${signedIn ? "signed in" : "NOT signed in"}`);
    if (!signedIn) bad += 1;
  }
}
console.log(`[group6-login] ${bad === 0 ? "all checks passed" : `${bad} check(s) failed`}`);
process.exit(bad === 0 ? 0 : 1);
