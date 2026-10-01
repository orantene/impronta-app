#!/usr/bin/env node
// One-command demo rebuild (Template Factory goal #6).
//   npm run demos:rebuild                         dry run, every design
//   npm run demos:rebuild -- --design folio --write
//   npm run demos:rebuild -- --only TAL-93020,TAL-93011 --write --no-publish
//   npm run demos:rebuild -- --restore <runId>
// Needs the dev server up (default http://localhost:3005). Auth is the
// CRON_SECRET from web/.env.local, sent as a bearer token and never printed.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { anyFailed, buildRebuildBody, checkBaseUrl, formatRows, parseArgs, parseEnv } from "./rebuild-lib.mjs";

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(2);
}
const { opts } = parsed;
const base = checkBaseUrl(opts.baseUrl, opts.allowRemote);
if (!base.ok) {
  console.error(base.error);
  process.exit(2);
}

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env.local");
let secret = process.env.CRON_SECRET ?? "";
if (!secret) {
  try {
    secret = parseEnv(readFileSync(envPath, "utf8")).CRON_SECRET ?? "";
  } catch {
    /* fall through to the message below */
  }
}
if (!secret) {
  console.error("CRON_SECRET not found in web/.env.local or the environment.");
  process.exit(2);
}

async function post(path, body) {
  const res = await fetch(`${base.origin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json };
}

if (opts.restore) {
  const { status, json } = await post("/api/platform/demos/restore", { runId: opts.restore });
  if (status === 200 && json?.ok) {
    console.log(`Restored run ${opts.restore}.`);
    process.exit(0);
  }
  console.error(`Restore failed (HTTP ${status}): ${json?.error ?? "no detail"}`);
  process.exit(1);
}

const body = buildRebuildBody(opts);
console.log(
  `${body.dryRun ? "DRY RUN (add --write to apply)" : "WRITING"} against ${base.origin}` +
    `${body.publish ? "" : ", no publish"}${opts.design ? `, design ${opts.design}` : ""}`,
);
const { status, json } = await post("/api/platform/demos/rebuild", body);
if (status !== 200 || !Array.isArray(json?.rows)) {
  console.error(`Rebuild request failed (HTTP ${status}): ${json?.error ?? "no detail"}`);
  process.exit(1);
}
console.log(formatRows(json.rows));
if (anyFailed(json.rows)) {
  console.error("At least one demo failed or was refused.");
  process.exit(1);
}
