/**
 * Write-proof through the REAL client — supabase-js over PostgREST, not SQL.
 *
 * Every one of the six broken writers found today was a defect at THIS boundary:
 * the SQL was fine and the client could not name it. A migration's DO block
 * proves the function works when called from inside Postgres. It cannot prove
 * that `.rpc()` reaches it, that the arguments serialise, or that the jsonb
 * return arrives as an object rather than a string.
 *
 * Creates its own pool and allocations, exercises both new primitives, and
 * deletes everything it made. Prints a residue count at the end.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
};
const ok = (msg) => console.log(`  ok  ${msg}`);

const { data: tenantRow, error: tErr } = await db
  .from("agencies")
  .select("id")
  .order("created_at")
  .limit(1)
  .maybeSingle();
if (tErr || !tenantRow) {
  console.error("no tenant:", tErr);
  process.exit(1);
}
const tenant = tenantRow.id;
const subject = crypto.randomUUID();

// ── set up a pool through the RPC the app actually uses ─────────────────────
const { data: poolId, error: pErr } = await db.rpc("upsert_capacity_pool", {
  p_tenant_id: tenant,
  p_subject_kind: "offering",
  p_subject_id: subject,
  p_units_total: 5,
  p_pool_key: "default",
  p_overbook_units: 0,
  p_hold_ttl_seconds: 900,
  p_unit_label: "seat",
  p_is_active: true,
});
if (pErr) {
  console.error("upsert_capacity_pool failed through the client:", pErr);
  process.exit(1);
}
ok(`pool created through .rpc(): ${poolId}`);

let created = [];
try {
  // ── 1. per-leg TTL through the client ────────────────────────────────────
  const { data: batch, error: bErr } = await db.rpc("reserve_capacity_batch", {
    p_requests: [
      { pool_id: poolId, units: 1, ttl_seconds: 86400 },
      { pool_id: poolId, units: 1, ttl_seconds: 60 },
    ],
  });
  if (bErr) fail(`reserve_capacity_batch: ${bErr.message} (${bErr.code})`);
  else if (batch?.ok !== true) fail(`batch refused: ${JSON.stringify(batch)}`);
  else {
    created = batch.allocation_ids ?? [];
    ok(`batch reserved ${created.length} legs through .rpc()`);

    const { data: rows } = await db
      .from("capacity_allocations")
      .select("id, expires_at")
      .in("id", created)
      .order("expires_at");
    const span = new Date(rows.at(-1).expires_at) - new Date(rows[0].expires_at);
    if (span < 80_000_000) fail(`legs share a clock — span ${span}ms, expected ~86,340,000`);
    else ok(`two legs, two clocks: ${Math.round(span / 1000)}s apart`);
  }

  // ── 2. extend_capacity_hold through the client, MIXED state ──────────────
  // Pick the SHORTEST leg deliberately. The first version took created[0] and
  // happened to get the 24-hour leg, so asking for 3600s SHORTENED it — the
  // assertion "expiry moved forward" failed while the function was working
  // correctly. That accident is what found the reporting bug this proof now
  // checks: the call said `extended` for a hold it had cut from a day to an hour.
  const { data: ordered } = await db
    .from("capacity_allocations")
    .select("id, expires_at")
    .in("id", created)
    .order("expires_at");
  const shortLeg = ordered[0].id;
  const longLeg = ordered.at(-1).id;
  const { data: before } = await db
    .from("capacity_allocations")
    .select("expires_at")
    .eq("id", shortLeg)
    .maybeSingle();

  // Commit one leg so the array is genuinely mixed, as a reschedule's would be.
  const { error: cErr } = await db.rpc("commit_capacity", { p_allocation_ids: [longLeg] });
  if (cErr) fail(`commit_capacity: ${cErr.message}`);

  const { data: ext, error: eErr } = await db.rpc("extend_capacity_hold", {
    p_allocation_ids: created,
    p_ttl_seconds: 3600,
  });
  if (eErr) {
    fail(`extend_capacity_hold: ${eErr.message} (${eErr.code})`);
  } else if (typeof ext !== "object" || ext === null) {
    fail(`jsonb did not arrive as an object: ${typeof ext} ${JSON.stringify(ext)}`);
  } else if (ext.extended !== 1 || ext.skipped_committed !== 1 || ext.requested !== 2 ||
             ext.shortened !== 0 || ext.unchanged !== 0) {
    fail(`mixed-state counts wrong through the client: ${JSON.stringify(ext)}`);
  } else {
    ok(`mixed set: ${JSON.stringify(ext)}`);
    const { data: after } = await db
      .from("capacity_allocations")
      .select("expires_at")
      .eq("id", shortLeg)
      .maybeSingle();
    if (new Date(after.expires_at) <= new Date(before.expires_at)) {
      fail("the hold was not extended through the client");
    } else ok("the held leg really moved");
  }

  // ── 3. a released id must refuse, THROUGH the client ─────────────────────
  const { error: relErr } = await db.rpc("release_capacity", { p_allocation_ids: [created[0]] });
  if (relErr) fail(`release_capacity: ${relErr.message}`);
  const { error: refuseErr } = await db.rpc("extend_capacity_hold", {
    p_allocation_ids: created,
    p_ttl_seconds: 3600,
  });
  if (!refuseErr) fail("a released allocation was accepted through the client");
  else ok(`released refused through the client: ${refuseErr.code ?? ""} ${refuseErr.message}`);

  // ── 4. the 7-day ceiling still refuses ───────────────────────────────────
  const { error: ceilErr } = await db.rpc("extend_capacity_hold", {
    p_allocation_ids: [created[1]],
    p_ttl_seconds: 604801,
  });
  if (!ceilErr) fail("a TTL beyond the ceiling was accepted through the client");
  else ok(`ceiling refused through the client: ${ceilErr.code ?? ""} ${ceilErr.message}`);
} finally {
  await db.from("capacity_allocations").delete().eq("pool_id", poolId);
  await db.from("capacity_pools").delete().eq("id", poolId);
  const { count } = await db
    .from("capacity_allocations")
    .select("id", { count: "exact", head: true })
    .eq("pool_id", poolId);
  const { count: pools } = await db
    .from("capacity_pools")
    .select("id", { count: "exact", head: true })
    .eq("id", poolId);
  console.log(`  residue: ${count ?? 0} allocation(s), ${pools ?? 0} pool(s)`);
}
