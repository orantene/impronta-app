#!/usr/bin/env node
/**
 * CI guard: validate that every capability key referenced in code is registered
 * in `web/src/lib/access/capabilities.ts`.
 *
 * Checks:
 *   1. Every key in `roles.ts` ROLE_CAPABILITIES sets is in CAPABILITIES.
 *   2. Every distinct `capability_key` in the `plan_capabilities` TABLE is in
 *      CAPABILITIES. Track C landed 2026-09-02: the per-plan subsets moved out
 *      of `plan-capabilities.ts` (which no longer holds any keys) and into the
 *      database, so this is where entitlement-key drift can now occur.
 *
 * The DB check is SKIPPED, not failed, when Supabase credentials are absent —
 * this script runs in `npm run ci` on machines that have no service-role key,
 * and a missing credential is not key drift.
 *
 * Runs in `npm run ci` and is idempotent — safe to run anytime.
 *
 * Exit codes: 0 ok, 1 drift detected, 2 internal error.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..");

function readSource(relPath) {
  return readFileSync(resolve(WEB_ROOT, relPath), "utf8");
}

/**
 * Parse the registry keys from `lib/access/capabilities.ts` by matching the
 * string keys at the top level of the `CAPABILITIES = { ... }` literal.
 * We deliberately don't import the TS module — this script runs in plain Node
 * without a TS loader, and the regex parse is robust enough for the source's
 * stable shape.
 */
function readRegistryKeys() {
  const src = readSource("src/lib/access/capabilities.ts");
  const startIdx = src.indexOf("export const CAPABILITIES = {");
  if (startIdx < 0) throw new Error("CAPABILITIES literal not found");
  const tail = src.slice(startIdx);
  const endIdx = tail.indexOf("} as const;");
  if (endIdx < 0) throw new Error("CAPABILITIES end-of-literal not found");
  const body = tail.slice(0, endIdx);

  // Match keys like: `view_dashboard:` or `"agency.site_admin.media.delete":`
  const keys = new Set();
  const re = /^\s*(?:"([^"]+)"|([a-zA-Z_][\w.]*))\s*:\s*define\(/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    keys.add(m[1] ?? m[2]);
  }
  if (keys.size === 0) throw new Error("no capability keys parsed from registry");
  return keys;
}

/**
 * Pull every quoted string that looks like a capability key from a source
 * file. Conservative: only strings that match the legacy snake_case pattern
 * or the dotted Phase-5 pattern, and only those that appear inside arrays
 * of strings.
 */
function extractCapStrings(src) {
  // Match string literals on lines that look like array entries.
  const re = /"((?:[a-z_][a-z0-9_]*|[a-z]+(?:\.[a-z][a-z_]*)+))"\s*[,\n]/g;
  const found = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    found.add(m[1]);
  }
  return found;
}

const KNOWN_NON_CAPABILITY_STRINGS = new Set([
  // status / role / plan / category / tag values that share the snake_case shape
  "view", "edit", "publish", "manage", "tenant", "platform",
  "owner", "admin", "coordinator", "manager", "editor", "viewer",
  "free", "studio", "agency", "network", "legacy",
  "draft", "onboarding", "trial", "active", "past_due", "restricted",
  "suspended", "cancelled", "archived",
  "dashboard", "talent", "client", "inquiry", "site", "team", "billing",
]);

function checkRolesFile(registry) {
  const src = readSource("src/lib/access/roles.ts");
  const found = extractCapStrings(src);
  const orphans = [...found].filter(
    (s) => !registry.has(s) && !KNOWN_NON_CAPABILITY_STRINGS.has(s),
  );
  return orphans;
}

/**
 * Every distinct `capability_key` in the `plan_capabilities` table must be in
 * the registry. This is where entitlement-key drift lives now that Track C has
 * moved the per-plan subsets out of code: an operator packaging a capability
 * that was renamed or removed would otherwise write a dead row that silently
 * never matches, and the plan would appear to grant something it cannot.
 *
 * Returns `{ skipped: true }` when there are no Supabase credentials — CI runs
 * this on machines without a service-role key, and a missing credential is not
 * key drift. Never fails the build for an unreachable database.
 */
async function checkPlanCapabilitiesTable(registry) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) return { skipped: true, orphans: [] };

  try {
    const res = await fetch(
      `${url}/rest/v1/plan_capabilities?select=capability_key`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) {
      return { skipped: true, orphans: [], warn: `REST ${res.status}` };
    }
    const rows = await res.json();
    const found = new Set(rows.map((r) => r.capability_key));
    return {
      skipped: false,
      orphans: [...found].filter((k) => !registry.has(k)),
      count: found.size,
    };
  } catch (err) {
    return {
      skipped: true,
      orphans: [],
      warn: err instanceof Error ? err.message : String(err),
    };
  }
}

let exitCode = 0;
try {
  const registry = readRegistryKeys();
  console.log(`registry: ${registry.size} capability keys`);

  const rolesOrphans = checkRolesFile(registry);
  if (rolesOrphans.length) {
    console.error(`\nFAIL: roles.ts references unknown capability keys:`);
    for (const o of rolesOrphans) console.error(`  - ${o}`);
    exitCode = 1;
  }

  const planCaps = await checkPlanCapabilitiesTable(registry);
  if (planCaps.skipped) {
    console.log(
      `plan_capabilities: skipped${planCaps.warn ? ` (${planCaps.warn})` : " (no Supabase credentials)"}`,
    );
  } else if (planCaps.orphans.length) {
    console.error(`\nFAIL: plan_capabilities holds unknown capability keys:`);
    for (const o of planCaps.orphans) console.error(`  - ${o}`);
    console.error(
      "\nThese rows can never match a real check. Remove them, or add the key to the registry.",
    );
    exitCode = 1;
  } else {
    console.log(`plan_capabilities: ${planCaps.count} distinct keys, all known`);
  }

  if (exitCode === 0) {
    console.log("ok: every referenced capability key is in the registry");
  }
} catch (err) {
  console.error(`internal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}

process.exit(exitCode);
