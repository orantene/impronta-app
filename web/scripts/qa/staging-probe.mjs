#!/usr/bin/env node
/**
 * QA-T Q2: one-command staging probe. READ-ONLY GETs only. Prints a card -> PASS/FAIL table.
 *
 * Usage (from web/):
 *   node scripts/qa/staging-probe.mjs [--expect-sha <40-hex>] [--hub-host staging.tulala.digital]
 *     [--app-host app.staging.tulala.digital] [--hub-sub-host hub.staging.tulala.digital]
 *     [--w-slug hub] [--talent-path /t/TAL-93940] [--en-path <talent page in English>]
 *     [--post-path /w/hub/posts] [--indexnow-key-path /indexnow-key.txt]
 *     [--payload-budget-bytes 150000] [--cold-ms 2500] [--ttfb-ms 1500]
 *
 * Gate: if the staging password gate is on, set STAGING_GATE_CI_TOKEN in the env (or in
 * ~/.tulala-qa.env); it is sent as the x-staging-gate-token header and never printed.
 *
 * Exit 0 all PASS (SKIP rows do not fail), 1 any FAIL, 2 refused host (no request made).
 * Refuses every production host and anything not *.staging.tulala.digital or localhost.
 * Cut checks: served JS bundle names fxlankepwnvelxjrahwk and never pluhdapdnuiulvxmyspd,
 * has no pk_live_ key; served sentry-release SHA equals --expect-sha.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { parseEnvText } from "../lib/group6-fixtures.mjs";
import { runProbe } from "./staging-probe.core.mjs";

const argv = process.argv.slice(2);
const flag = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i > -1 ? argv[i + 1] : undefined;
};
const num = (n) => (flag(n) === undefined ? undefined : Number(flag(n)));
let gateToken = process.env.STAGING_GATE_CI_TOKEN;
if (!gateToken) {
  try {
    gateToken = parseEnvText(readFileSync(join(homedir(), ".tulala-qa.env"), "utf8")).STAGING_GATE_CI_TOKEN;
  } catch {
    /* no gate token file */
  }
}
const opts = {
  hubHost: flag("hub-host"), appHost: flag("app-host"), hubSubHost: flag("hub-sub-host"),
  wSlug: flag("w-slug"), talentPath: flag("talent-path"), enPath: flag("en-path"), postPath: flag("post-path"),
  indexNowKeyPath: flag("indexnow-key-path"), expectSha: flag("expect-sha"),
  payloadBudgetBytes: num("payload-budget-bytes"), coldMs: num("cold-ms"), ttfbMs: num("ttfb-ms"),
};
for (const k of Object.keys(opts)) if (opts[k] === undefined || Number.isNaN(opts[k])) delete opts[k];

const { code } = await runProbe({ opts, fetchImpl: fetch, gateToken, out: (l) => console.log(l) });
process.exit(code);
