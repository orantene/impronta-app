#!/usr/bin/env node
/**
 * Builds the signed-out guest thread link for the Group 6 guest inquiry fixture (TUL-1103 Lighthouse)
 * and writes it to ~/.tulala-qa-guest-thread-g6.url (mode 600). It never prints the token.
 *
 * The guest thread page `/c/t/<token>` needs no cookie and no login: the token is an HMAC of
 * (inquiry id, tenant id) with GUEST_COOKIE_SECRET (web/src/lib/messaging/thread-token.ts), valid 30 days.
 * Tenant = the hub, so the link opens on the app host or the hub host. Staging gate: send the
 * `x-staging-gate-token` header (value in ~/.tulala-qa.env) or sign in to the gate first.
 *
 * Usage (from web/): node scripts/print-group6-guest-thread-link.mjs --env-file <staging env pull> [--check]
 *   --check  also GETs the link on the app host (gate header) and prints the status code only.
 */
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { HUB_TENANT_ID, parseEnvText, signGuestThreadToken, stableId } from "./lib/group6-fixtures.mjs";

const OUT = join(homedir(), ".tulala-qa-guest-thread-g6.url");
const APP_HOST = "https://app.staging.tulala.digital";

const load = (path) => {
  try {
    return parseEnvText(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
};
const i = process.argv.indexOf("--env-file");
const env = i > -1 ? load(process.argv[i + 1]) : {};
if (!env.GUEST_COOKIE_SECRET) {
  console.error("[guest-link] GUEST_COOKIE_SECRET missing in --env-file");
  process.exit(2);
}
const token = signGuestThreadToken(env.GUEST_COOKIE_SECRET, stableId("inquiry:guest"), HUB_TENANT_ID);
const url = `${APP_HOST}/c/t/${encodeURIComponent(token)}?lang=es`;
writeFileSync(OUT, `${url}\n`, { mode: 0o600 });
chmodSync(OUT, 0o600);
console.log(`[guest-link] wrote the signed-out guest thread link (valid 30 days) to ${OUT}`);

if (process.argv.includes("--check")) {
  const gate = load(join(homedir(), ".tulala-qa.env")).STAGING_GATE_CI_TOKEN;
  const res = await fetch(url, { redirect: "manual", headers: gate ? { "x-staging-gate-token": gate } : {} });
  console.log(`[guest-link] GET /c/t/<token> on the app host -> ${res.status} (200 = the guest thread renders)`);
  process.exit(res.status === 200 ? 0 : 1);
}
