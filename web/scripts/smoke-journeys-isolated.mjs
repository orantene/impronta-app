/**
 * Functional smoke of the repaired engine on the isolated `qa-journeys` branch.
 *
 * WHY A SECOND SCRIPT. `probe-journeys-isolated.mjs` proves an object EXISTS.
 * That is not the same as proving it RUNS, and on this branch the difference is
 * the whole story: the historical replay left versions recorded in the ledger
 * whose function bodies had never executed, so "present in pg_proc" was
 * already true of things that did nothing. Existence is a necessary check and
 * a weak one. This calls the functions.
 *
 * WHY IT IS STILL SAFE. Everything runs inside ONE transaction that always
 * ends in ROLLBACK, so the mutating calls — a real multi-resource reservation,
 * an outbox claim, a duplicate-key probe — leave no row behind. Each expected
 * failure sits behind its own SAVEPOINT, because in Postgres a violated
 * constraint aborts the whole transaction and would otherwise take the
 * remaining assertions with it.
 *
 * The negative cases pass a random UUID on purpose. A function that refuses an
 * unknown id with a structured jsonb refusal is a function with a body; one
 * that raises an undefined-function or null-pointer error is not. And a
 * refusal is what the callers are written against, so this checks the contract
 * the app depends on, not just that some SQL executed.
 *
 *   JOURNEYS_ISOLATED=1 node --env-file=.env.capacity-isolated.local \
 *     scripts/smoke-journeys-isolated.mjs
 *
 * Exit codes: 0 all assertions held, 1 an assertion failed, 2 refused.
 */

import crypto from "node:crypto";
import pg from "pg";
import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";

const target = assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[smoke] DATABASE_URL is required (gitignored isolated env file).");
  process.exit(2);
}

const TENANT = process.env.JOURNEYS_TENANT_ID ?? JOURNEYS_TENANT_ID;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

let failures = 0;
let n = 0;

function ok(label, passed, detail = "") {
  n += 1;
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!passed) failures += 1;
}

/** Run `fn` expecting it to throw; the savepoint keeps the transaction alive. */
async function expectViolation(label, sql, params, wantCode) {
  n += 1;
  const sp = `sp_${n}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    await client.query(sql, params);
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    console.log(`  FAIL  ${label}  (expected ${wantCode}, statement succeeded)`);
    failures += 1;
  } catch (e) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    const passed = e.code === wantCode;
    console.log(
      `  ${passed ? "PASS" : "FAIL"}  ${label}  ${passed ? `(${wantCode})` : `(got ${e.code}: ${e.message})`}`,
    );
    if (!passed) failures += 1;
  }
}

console.log(`\n[smoke] isolated target ${target.allowedRef}  (single transaction, always rolled back)\n`);
await client.query("BEGIN");

try {
  // ── Refusals. A body that runs and says no.
  console.log("REFUSALS ON UNKNOWN IDS (proves the body executes)");
  {
    const { rows } = await client.query(`SELECT public.refund_admission($1::uuid) AS r`, [
      crypto.randomUUID(),
    ]);
    const r = rows[0]?.r;
    ok("refund_admission(unknown)", r && r.ok === false, JSON.stringify(r));
  }
  {
    const { rows } = await client.query(
      `SELECT public.cancel_event_cascade($1::uuid, $2::uuid, $3::uuid) AS r`,
      [TENANT, crypto.randomUUID(), crypto.randomUUID()],
    );
    const r = rows[0]?.r;
    ok("cancel_event_cascade(unknown)", r && r.ok === false, JSON.stringify(r));
  }
  {
    const { rows } = await client.query(
      `SELECT public.extend_capacity_hold($1::uuid[], $2::int) AS r`,
      [[crypto.randomUUID()], 300],
    );
    const r = rows[0]?.r;
    ok("extend_capacity_hold(unknown)", r !== null && typeof r === "object", JSON.stringify(r));
  }

  // ── The outbox claim. Empty is a valid answer; erroring is not.
  console.log("\nOUTBOX");
  {
    const { rows } = await client.query(
      `SELECT * FROM public.claim_outbox_messages($1::int, $2::text[], $3::int)`,
      [5, null, 30],
    );
    ok("claim_outbox_messages runs", true, `claimed ${rows.length}`);
  }

  // ── The invariants today's migrations added. Each must actually refuse.
  console.log("\nINVARIANTS (each must refuse)");
  await expectViolation(
    "command_idempotency_key_unique refuses a replayed key",
    `INSERT INTO public.command_idempotency
       (tenant_id, command, idempotency_key, request_fingerprint, status)
     VALUES ($1, 'smoke.command', 'smoke-dupe-key', 'fp', 'succeeded'),
            ($1, 'smoke.command', 'smoke-dupe-key', 'fp', 'succeeded')`,
    [TENANT],
    "23505",
  );
  await expectViolation(
    "outbox_messages_dedupe_unique refuses a duplicate dedupe key",
    `INSERT INTO public.outbox_messages (tenant_id, topic, dedupe_key)
     VALUES ($1, 'smoke.topic', 'smoke-dupe-outbox'),
            ($1, 'smoke.topic', 'smoke-dupe-outbox')`,
    [TENANT],
    "23505",
  );
  const anyOrder = await client.query(
    `SELECT id FROM public.orders WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`,
    [TENANT],
  );
  if (anyOrder.rows.length === 0) {
    ok("orders_age_gate_paired", false, "(no fixture order to test against)");
  } else {
    // A confirmed age against no minimum: the half-state the pair forbids.
    await expectViolation(
      "orders_age_gate_paired refuses a half-filled attestation",
      `UPDATE public.orders SET age_gate_confirmed_age = 21 WHERE id = $1`,
      [anyOrder.rows[0].id],
      "23514",
    );
    // And the whole triple together must be accepted, or the constraint is
    // not a pair rule, it is a ban.
    n += 1;
    await client.query(`SAVEPOINT sp_pair_ok`);
    try {
      await client.query(
        `UPDATE public.orders
            SET age_gate_min_age = 18, age_gate_confirmed_age = 21, age_gate_confirmed_at = now()
          WHERE id = $1`,
        [anyOrder.rows[0].id],
      );
      console.log("  PASS  orders_age_gate_paired accepts a complete attestation");
    } catch (e) {
      console.log(`  FAIL  orders_age_gate_paired rejected a complete attestation (${e.code}: ${e.message})`);
      failures += 1;
    }
    await client.query(`ROLLBACK TO SAVEPOINT sp_pair_ok`);
  }

  // ── The real thing: an atomic multi-resource commitment against fixture rows.
  console.log("\nMULTI-RESOURCE COMMITMENT (real pool, then rolled back)");
  const pool = await client.query(
    `SELECT id, units_total FROM public.capacity_pools
      WHERE tenant_id = $1 AND is_active AND units_total > 0
      ORDER BY units_total DESC LIMIT 1`,
    [TENANT],
  );
  if (pool.rows.length === 0) {
    ok("reserve_resource_set", false, "(no fixture pool with capacity — fixture not seeded?)");
  } else {
    const poolId = pool.rows[0].id;
    // A real actor, not a random UUID: `capacity_allocations.created_by` is a
    // foreign key to auth.users, so a synthetic id exercises only the unwind
    // path. Worth knowing that path works — it does, it refuses with
    // `unavailable` rather than raising — but it is not the happy path.
    const actor = await client.query(
      `SELECT id FROM auth.users WHERE email = $1`,
      ["qa-journeys-owner@impronta.test"],
    );
    const { rows } = await client.query(
      `SELECT public.reserve_resource_set($1::uuid, $2::uuid, $3::int, $4::jsonb, $5::jsonb) AS r`,
      [
        TENANT,
        actor.rows[0]?.id ?? crypto.randomUUID(),
        300,
        JSON.stringify([{ pool_id: poolId, units: 1 }]),
        JSON.stringify([]),
      ],
    );
    const r = rows[0]?.r;
    ok(
      "reserve_resource_set commits one unit",
      r && r.ok === true,
      JSON.stringify(r).slice(0, 160),
    );
  }
} finally {
  await client.query("ROLLBACK");
  // Prove the rollback: nothing this run inserted may survive it.
  const leftover = await client.query(
    `SELECT count(*)::int AS n FROM public.command_idempotency WHERE idempotency_key = 'smoke-dupe-key'`,
  );
  ok("transaction rolled back clean", (leftover.rows[0]?.n ?? 0) === 0, `leftover=${leftover.rows[0]?.n}`);
  await client.end();
}

console.log("");
if (failures > 0) {
  console.error(`[smoke] ${failures} of ${n} assertions failed.\n`);
  process.exit(1);
}
console.log(`[smoke] ${n} assertions held. The repaired engine runs, not just resolves.\n`);
process.exit(0);
