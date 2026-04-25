#!/usr/bin/env node
/**
 * CI guard: validate that every capability key referenced in code is registered
 * in `web/src/lib/access/capabilities.ts`.
 *
 * Phase 1 (today): no DB tables yet, so this checks code only:
 *   1. Every key in `roles.ts` ROLE_CAPABILITIES sets is in CAPABILITIES.
 *   2. Every key in `plan-capabilities.ts` PLAN_CAPABILITIES sets is in CAPABILITIES.
 *
 * Phase 1+ (post Track C): also queries the `plan_capabilities` table
 * (Supabase REST) and validates every distinct `capability_key` is in
 * CAPABILITIES.
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
  "owner", "admin", "coordinator", "editor", "viewer",
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

function checkPlanCapabilitiesFile(registry) {
  const src = readSource("src/lib/access/plan-capabilities.ts");
  const found = extractCapStrings(src);
  const orphans = [...found].filter(
    (s) => !registry.has(s) && !KNOWN_NON_CAPABILITY_STRINGS.has(s),
  );
  return orphans;
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

  const planCapsOrphans = checkPlanCapabilitiesFile(registry);
  if (planCapsOrphans.length) {
    console.error(`\nFAIL: plan-capabilities.ts references unknown capability keys:`);
    for (const o of planCapsOrphans) console.error(`  - ${o}`);
    exitCode = 1;
  }

  if (exitCode === 0) {
    console.log("ok: every referenced capability key is in the registry");
  }
} catch (err) {
  console.error(`internal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}

process.exit(exitCode);
