#!/usr/bin/env node
// ============================================================================
// verify-command-lease.mjs — the command claim table's lease-race proof.
// ============================================================================
//
// command_idempotency (src/lib/commands/run.ts) is the idempotency claim for
// every command. A parallel track is adding lease columns to it — owner_token
// and lease_expires_at, plus command_claim / command_heartbeat / command_complete
// RPCs — so a claim can be stolen back after its holder goes silent, instead of
// only ever aging out by `created_at`. This proves TWO race properties of that
// mechanism once it exists:
//
//   1. FIRST CLAIM: N concurrent command_claim() calls for the same
//      (tenant, command, idempotency_key) — exactly ONE must land 'claimed',
//      the rest must see 'in_flight'. This is the same shape as the capacity
//      and resource proofs: the unique index (tenant_id, command,
//      idempotency_key) is the thing actually doing the work; command_claim's
//      ON CONFLICT DO NOTHING is how it surfaces that as a reply instead of a
//      raw 23505 to the caller.
//   2. LEASE TAKEOVER: once that claim's lease has expired (never completed —
//      the holder crashed), N concurrent command_claim() calls for the SAME
//      key must hand the claim to exactly ONE new owner_token, never zero and
//      never more than one — the compare-and-set in command_claim's UPDATE
//      (`owner_token IS NOT DISTINCT FROM v_row.owner_token AND (status =
//      'failed' OR lease_expires_at <= now())`) is what this proof is really
//      exercising.
//
// Ground truth for both is read from command_idempotency directly — row count
// and owner_token — never tallied from the RPC replies, for the same reason
// verify-capacity-concurrency.mjs reads capacity_allocations: a client-side
// socket failure under N parallel requests looks identical to a legitimate
// refusal in a reply-only tally, and only the row can tell them apart.
//
// DOES NOT TOUCH src/lib/commands. This is a proof against the live schema
// and its RPCs, not a caller of the TypeScript runner.
//
// APPLICABILITY. The lease columns (owner_token, lease_expires_at) and the
// command_claim/command_complete/command_heartbeat RPCs are being added by a
// parallel track, not this one. If they are not on the target yet, that is
// not a failure of this proof — it means the feature this proof exists for
// has not shipped. The script detects that and exits 0 with a clear
// "not yet applicable" line rather than failing.
//
// Isolated target only. Never production.
//
//   COMMAND_LEASE_PROOF_ISOLATED=1 JOURNEYS_ISOLATED=1 \
//     node --env-file=.env.capacity-isolated.local scripts/verify-command-lease.mjs
//
// Exit 0 = not-yet-applicable, OR both races proved clean.
// Exit 1 = the lease columns/RPCs exist and a race was lost (oversell/undersell
//          of the claim — a genuine finding, not a broken proof).
// Exit 2 = refused (missing flag, or pointed somewhere that isn't isolated).

import pg from "pg";
import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

// This script's OWN flag, distinct from RESOURCE_PROOF_ISOLATED and
// CAPACITY_PROOF_ISOLATED — each proof owns its own confirmation so running
// one never silently authorizes another.
if (process.env.COMMAND_LEASE_PROOF_ISOLATED !== "1") {
  console.error(
    "[command-lease-proof] refusing. Set COMMAND_LEASE_PROOF_ISOLATED=1 (in addition to the isolated-target guard's own flag) on an isolated branch.\n" +
      "  COMMAND_LEASE_PROOF_ISOLATED=1 JOURNEYS_ISOLATED=1 node --env-file=.env.capacity-isolated.local scripts/verify-command-lease.mjs",
  );
  process.exit(2);
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING;
const TENANT = process.env.CAPACITY_PROOF_TENANT_ID ?? process.env.JOURNEYS_TENANT_ID ?? JOURNEYS_TENANT_ID;
const N = Number(process.env.COMMAND_LEASE_PROOF_CALLS ?? 50);

if (!URL_ || !KEY) {
  console.error(
    "[command-lease-proof] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Load an isolated env file. Do not use .env.vercel.local.",
  );
  process.exit(1);
}
if (!DB_URL) {
  console.error("[command-lease-proof] missing DATABASE_URL / POSTGRES_URL_NON_POOLING.");
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rpc(fn, body) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  let ready;
  try {
    const { rows: cols } = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'command_idempotency'
          AND column_name IN ('owner_token', 'lease_expires_at')`,
    );
    const { rows: fns } = await db.query(
      `SELECT proname FROM pg_proc
        WHERE proname IN ('command_claim', 'command_complete', 'command_heartbeat')`,
    );
    ready = cols.length === 2 && fns.length === 3;
  } finally {
    await db.end();
  }

  if (!ready) {
    console.log(
      "[command-lease-proof] NOT YET APPLICABLE — command_idempotency has no owner_token/lease_expires_at " +
        "columns and/or command_claim/command_complete/command_heartbeat are not deployed on this target. " +
        "This is the lease track not having shipped yet, not a failed proof.",
    );
    process.exit(0);
  }

  const command = "verify-command-lease.proof";
  const key = `lease-race-${crypto.randomUUID()}`;
  const fingerprint = "fixed-fingerprint-for-this-proof";
  let pass = true;

  // ── Phase 1: first claim ──────────────────────────────────────────────────
  console.log(`[command-lease-proof] phase 1: ${N} concurrent first claims on key ${key}`);
  const claims1 = await Promise.all(
    Array.from({ length: N }, () =>
      rpc("command_claim", {
        p_tenant_id: TENANT,
        p_command: command,
        p_idempotency_key: key,
        p_fingerprint: fingerprint,
        p_lease_seconds: 5, // short — phase 2 needs this lease to expire
      })
        .then((r) => r?.outcome ?? "unknown")
        .catch((e) => `client-error (${String(e.message).slice(0, 40)})`)),
  );
  const tally1 = claims1.reduce((acc, r) => ((acc[r] = (acc[r] ?? 0) + 1), acc), {});
  console.log(`[command-lease-proof] phase 1 replies: ${JSON.stringify(tally1)}`);

  const rows1 = await fetch(
    `${URL_}/rest/v1/command_idempotency?tenant_id=eq.${TENANT}&command=eq.${command}&idempotency_key=eq.${key}&select=id,status,owner_token,attempt_count`,
    { headers },
  ).then((r) => r.json());
  const truth1 = rows1.length === 1 && rows1[0].status === "in_flight" ? "ok" : "bad";
  console.log(
    `[command-lease-proof] phase 1 ground truth: ${rows1.length} row(s), status=${rows1[0]?.status}, attempt_count=${rows1[0]?.attempt_count}`,
  );
  const phase1Pass = rows1.length === 1 && (tally1.claimed ?? 0) === 1 && (tally1.in_flight ?? 0) === N - 1;
  console.log(
    phase1Pass
      ? "[command-lease-proof] phase 1 PASS — exactly one claim landed, table agrees"
      : `[command-lease-proof] phase 1 FAIL — expected 1 claimed row and 1 'claimed' reply, saw ${rows1.length} row(s) (${truth1}) and ${JSON.stringify(tally1)}`,
  );
  pass = pass && phase1Pass;
  const ownerBefore = rows1[0]?.owner_token;

  // ── Phase 2: let the lease expire, then race the takeover ────────────────
  console.log("[command-lease-proof] phase 2: waiting for the 5s lease to expire");
  await new Promise((resolve) => setTimeout(resolve, 6000));

  console.log(`[command-lease-proof] phase 2: ${N} concurrent takeover claims on the same key`);
  const claims2 = await Promise.all(
    Array.from({ length: N }, () =>
      rpc("command_claim", {
        p_tenant_id: TENANT,
        p_command: command,
        p_idempotency_key: key,
        p_fingerprint: fingerprint,
        p_lease_seconds: 90,
      })
        .then((r) => ({ outcome: r?.outcome ?? "unknown", owner_token: r?.owner_token ?? null }))
        .catch((e) => ({ outcome: `client-error (${String(e.message).slice(0, 40)})`, owner_token: null }))),
  );
  const tally2 = claims2.reduce((acc, r) => ((acc[r.outcome] = (acc[r.outcome] ?? 0) + 1), acc), {});
  const claimedTokens = new Set(claims2.filter((r) => r.outcome === "claimed").map((r) => r.owner_token));
  console.log(`[command-lease-proof] phase 2 replies: ${JSON.stringify(tally2)}, distinct claimed owner_tokens: ${claimedTokens.size}`);

  const rows2 = await fetch(
    `${URL_}/rest/v1/command_idempotency?tenant_id=eq.${TENANT}&command=eq.${command}&idempotency_key=eq.${key}&select=id,status,owner_token,attempt_count`,
    { headers },
  ).then((r) => r.json());
  console.log(
    `[command-lease-proof] phase 2 ground truth: ${rows2.length} row(s), status=${rows2[0]?.status}, owner_token changed=${rows2[0]?.owner_token !== ownerBefore}, attempt_count=${rows2[0]?.attempt_count}`,
  );
  const phase2Pass =
    rows2.length === 1 &&
    rows2[0].status === "in_flight" &&
    rows2[0].owner_token !== ownerBefore &&
    claimedTokens.size === 1 &&
    claimedTokens.has(rows2[0].owner_token) &&
    (tally2.claimed ?? 0) === 1;
  console.log(
    phase2Pass
      ? "[command-lease-proof] phase 2 PASS — exactly one caller took the expired lease over, table agrees"
      : "[command-lease-proof] phase 2 FAIL — the expired claim was taken by zero or more than one caller",
  );
  pass = pass && phase2Pass;

  // ── cleanup ────────────────────────────────────────────────────────────
  await fetch(
    `${URL_}/rest/v1/command_idempotency?tenant_id=eq.${TENANT}&command=eq.${command}&idempotency_key=eq.${key}`,
    { method: "DELETE", headers },
  );
  const leftover = await fetch(
    `${URL_}/rest/v1/command_idempotency?tenant_id=eq.${TENANT}&command=eq.${command}&idempotency_key=eq.${key}&select=id`,
    { headers },
  ).then((r) => r.json());
  console.log(`[command-lease-proof] cleaned up; rows left for this key: ${leftover.length}`);

  console.log(pass ? "[command-lease-proof] PASS — both races proved clean" : "[command-lease-proof] FAIL");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
