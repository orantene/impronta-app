#!/usr/bin/env node
/**
 * MANUAL gate: every `capability_key` in `public.plan_capabilities` must exist
 * in the registry.
 *
 * WHY IT IS SEPARATE FROM check-capability-keys.mjs
 * ────────────────────────────────────────────────
 * That guard had two halves. The registry half (does `roles.ts` reference a key
 * that is not in `CAPABILITIES`) needs no credentials and does real work in CI.
 * This half reads a table, and service-role credentials never enter CI by
 * standing rule — so as one script it was a lane that ran, went green, and
 * silently checked only half of what its name promised.
 *
 * WHY IT FAILS RATHER THAN SKIPS
 * ──────────────────────────────
 * "Skip" could not tell "nothing to check" from "could not check": both printed
 * green. It fails hard on missing credentials and on a failed read.
 *
 * THE ZERO-ROWS EXCEPTION, WHICH IS REAL HERE
 * ───────────────────────────────────────────
 * The sibling compare-table guard treats zero rows as a failure, because
 * `product_features` is never legitimately empty. `plan_capabilities` is the
 * opposite: it SHIPPED empty on purpose, a missing row means granted, and that
 * fail-open default is the whole reason introducing the table changed no
 * behaviour. An empty matrix means "nothing has been packaged yet", which is a
 * valid state, and failing on it would make this guard cry wolf on the one
 * condition the design explicitly allows.
 *
 * So zero rows PASSES — but never silently. It prints its own line and the
 * count goes in the manual Gates row, because the rule is that a green run
 * which checked nothing must never look like one that checked everything. The
 * distinction that makes this safe is that a successful read returning an empty
 * array is distinguishable from a read that failed. Skip could not tell those
 * apart; this can.
 *
 * Exit codes: 0 checked (possibly zero rows), 1 unknown keys or unreadable,
 * 2 internal error.
 */

import { readRegistryKeys } from "./lib/capability-registry.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

if (!url || !key) {
  console.error(
    "FAIL: no Supabase credentials.\n\n" +
      "This gate reads live plan_capabilities and cannot run without them. It\n" +
      "does NOT skip: a green run that checked nothing is indistinguishable\n" +
      "from a green run that checked everything.\n\n" +
      "Run it with credentials:\n" +
      "  npm run manual:capability-keys-db\n",
  );
  process.exit(1);
}

try {
  const registry = readRegistryKeys();
  console.log(`registry: ${registry.size} capability keys`);

  const res = await fetch(
    `${url}/rest/v1/plan_capabilities?select=capability_key`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );

  if (!res.ok) {
    console.error(
      `FAIL: could not read plan_capabilities (REST ${res.status}).\n` +
        "A read that did not happen is not a pass.",
    );
    process.exit(1);
  }

  const rows = await res.json();
  const found = new Set(rows.map((r) => r.capability_key));

  // Zero rows is VALID here — see the header. Printed on its own line so it can
  // never be mistaken for "checked everything, found nothing wrong".
  if (found.size === 0) {
    console.log(
      "plan_capabilities: 0 rows, matrix is empty (fail-open default) — read succeeded, nothing to validate",
    );
    console.log("ok: registry parsed, table readable, no rows to check");
    process.exit(0);
  }

  const orphans = [...found].filter((k) => !registry.has(k));

  if (orphans.length > 0) {
    console.error(`\nFAIL: plan_capabilities holds unknown capability keys:`);
    for (const o of orphans) console.error(`  - ${o}`);
    console.error(
      "\nThese rows can never match a real check: the resolver looks up a key\n" +
        "that does not exist, so the plan appears to withhold something while\n" +
        "the product grants it. Remove the row, or add the key to the registry.\n",
    );
    process.exit(1);
  }

  console.log(
    `plan_capabilities: ${found.size} distinct key(s) across ${rows.length} row(s), all known`,
  );
  process.exit(0);
} catch (err) {
  console.error(
    `internal error: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(2);
}
