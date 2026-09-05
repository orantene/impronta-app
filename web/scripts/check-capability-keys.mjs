#!/usr/bin/env node
/**
 * CI guard: every capability key referenced in `roles.ts` is registered in
 * `web/src/lib/access/capabilities.ts`.
 *
 * CREDENTIAL-FREE BY DESIGN. This half reads source files only, so it does real
 * work on every CI run.
 *
 * The `plan_capabilities` half moved to `check-capability-keys-db.mjs`
 * (`npm run manual:capability-keys-db`) when the CEO ruled that a guard which
 * skips without Supabase credentials is a green lane measuring nothing.
 * Service-role credentials never enter CI by standing rule, so that half was
 * never going to run here — it made this lane report success while checking
 * only half of what its name promised.
 *
 * Runs in `npm run ci` and is idempotent — safe to run anytime. That sentence
 * was in this header before it was true: on 2026-09-05 the script was in no
 * workflow and in no ci chain, so it had never run automatically. Wired in with
 * the split.
 *
 * Exit codes: 0 ok, 1 drift detected, 2 internal error.
 */


import { readRegistryKeys, readSource } from "./lib/capability-registry.mjs";

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


  if (exitCode === 0) {
    console.log("ok: every referenced capability key is in the registry");
  }
} catch (err) {
  console.error(`internal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}

process.exit(exitCode);
