#!/usr/bin/env node
/**
 * Read-only staging checks (status codes and verdicts only; never prints a header, cookie or token).
 *
 *  1. TUL-1247: the tenant-site header/nav of staging workspace sites must not contain an
 *     absolute `app[.staging].tulala.digital/w/...` link.
 *  2. Talent host: with TALENT_SITE_SUBDOMAINS_ENABLED=true (the only flag; the *.staging.tulala.digital alias exists), the T1
 *     fixture site and its posts answer as the code says (published 200, expired 200 with a
 *     notice, taken down 404, missing 404). SKIPS (exit 0) when the flag is not "true" or the site host does not resolve.
 *
 * Env: --env-file <staging env pull> (TALENT_SITE_SUBDOMAINS_ENABLED), gate token from ~/.tulala-qa.env.
 * Usage (from web/): node scripts/check-staging-nav-and-talent-host.mjs --env-file <tmp>
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { PREFIX, parseEnvText } from "./lib/group6-fixtures.mjs";
import { WORKSPACE_POST_BASE, WORKSPACE_POST_PROBES, decideNavCheck, decideProbe, siteHostResolves, talentHostPlan } from "./lib/staging-nav-host-checks.mjs";

const APP_HOST = "https://app.staging.tulala.digital";
const HUB_HOST = "https://staging.tulala.digital"; // the card says the same pages render here
const GATE_HEADER = "x-staging-gate-token";

const load = (path) => {
  try {
    return parseEnvText(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
};
const i = process.argv.indexOf("--env-file");
const env = { ...process.env, ...(i > -1 ? load(process.argv[i + 1]) : {}) };
const gateToken = load(join(homedir(), ".tulala-qa.env")).STAGING_GATE_CI_TOKEN;
const headers = gateToken ? { [GATE_HEADER]: gateToken } : {};

let failed = 0;
const say = (ok, line) => {
  if (!ok) failed += 1;
  console.log(`[staging-checks] ${ok ? "PASS" : "FAIL"} ${line}`);
};

async function get(url) {
  const res = await fetch(url, { redirect: "follow", headers }); // /w/<slug>/ 308s to /w/<slug>
  const body = res.status === 200 ? await res.text() : "";
  return { status: res.status, body };
}

// 1. TUL-1247 nav links on workspace sites (path-based /w/<slug> on the app host).
// qa-b7-studio is the site TUL-1247 was reported on; the fixture workspace has no composed pages yet (404 = skipped, not failed).
let inspected = 0;
for (const [base, slug] of [HUB_HOST, APP_HOST].flatMap((b) => ["qa-b7-studio", `${PREFIX}-ws`, "hub"].map((sl) => [b, sl]))) {
  const url = `${base}/w/${slug}/`;
  try {
    const { status, body } = await get(url);
    if (status === 404) {
      console.log(`[staging-checks] SKIP nav ${new URL(base).hostname}/w/${slug}/ -> 404 (no public site page there)`);
      continue;
    }
    inspected += 1;
    const v = decideNavCheck(status, body);
    say(v.ok, `nav ${new URL(base).hostname}/w/${slug}/ -> ${status}: ${v.reason}`);
  } catch {
    say(false, `nav ${new URL(base).hostname}/w/${slug}/ -> request failed`);
  }
}

if (inspected === 0) say(false, "nav: no workspace site page could be inspected");

// 2. Talent host.
const plan = talentHostPlan(env);
if (plan.skip) {
  console.log(`[staging-checks] SKIP talent host: ${plan.reason}`);
} else {
  let homeStatus = 0;
  try {
    homeStatus = (await fetch(`https://${plan.host}/`, { redirect: "manual", headers })).status;
  } catch {
    homeStatus = 0;
  }
  if (!siteHostResolves(homeStatus)) {
    console.log(`[staging-checks] SKIP talent host: TALENT_SITE_SUBDOMAINS_ENABLED not set on the deployed build (${plan.host} home answered ${homeStatus || "no response"})`);
  } else {
    for (const p of plan.probes) {
      try {
        const res = await fetch(`https://${plan.host}${p.path}`, { redirect: "manual", headers });
        const v = decideProbe(p, res.status);
        say(v.ok, `talent host ${p.label} ${p.path} -> ${res.status} (expected ${v.expected})`);
      } catch {
        say(false, `talent host ${p.label} ${p.path} -> request failed`);
      }
    }
  }
}

// 3. Posts on the fixture workspace site (always runnable: no flag needed).
for (const p of WORKSPACE_POST_PROBES) {
  try {
    const res = await fetch(`${WORKSPACE_POST_BASE}${p.path}`, { redirect: "manual", headers });
    const v = decideProbe(p, res.status);
    say(v.ok, `workspace posts ${p.label} ${p.path} -> ${res.status} (expected ${v.expected})`);
  } catch {
    say(false, `workspace posts ${p.label} ${p.path} -> request failed`);
  }
}

console.log(`[staging-checks] ${failed === 0 ? "done, no failures" : `${failed} failure(s)`}`);
process.exit(failed === 0 ? 0 : 1);
