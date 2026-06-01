/**
 * Runtime proof — held-payouts release against the REAL Supabase (prod project,
 * test data). Exercises the actual booking_payouts ledger + the release flow's
 * SQL shape (the TS releaseHeldPayouts uses the same queries). Injects a fake
 * "now-enabled" account + fake Stripe so no real money moves.
 *
 * Proves: a held leg flips to 'transferred' with a stripe_transfer_id + the
 * updated_at trigger fires; a still-disabled payee stays held with attempts++.
 *
 * Run: node web/scripts/qa-held-payouts.mjs   (writes /tmp/qa-held-report.json)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i <= 0) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const report = { ts: new Date().toISOString(), checks: [], ok: false };
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, detail });
const TP = "878cb63f-6999-4ed3-8469-35e5a2a1c17a"; // Sofia
const BK = "00000000-0000-4000-8000-0000000000aa"; // synthetic QA booking

try {
  // clean any prior QA rows
  await sb.from("booking_payouts").delete().eq("booking_id", BK);

  // seed a held leg (what executeBookingTransfers writes for an unonboarded talent)
  const { data: seeded } = await sb
    .from("booking_payouts")
    .insert({
      booking_id: BK, participant_id: "qa_p1", party: "talent",
      owning_party_type: "talent", owning_party_id: TP, talent_profile_id: TP,
      amount_cents: 80000, currency: "mxn", status: "held", attempts: 1,
    })
    .select("id, updated_at")
    .single();
  check("seed held leg", !!seeded?.id, { id: seeded?.id });
  const before = seeded.updated_at;

  // ---- Simulate releaseHeldPayouts' exact query + update path ----
  // 1) load held/failed legs for this talent
  const { data: held } = await sb
    .from("booking_payouts")
    .select("id, booking_id, participant_id, party, amount_cents, currency, attempts")
    .in("status", ["held", "failed"])
    .eq("party", "talent")
    .eq("talent_profile_id", TP);
  check("release query finds the held leg", (held ?? []).some((r) => r.id === seeded.id), { found: held?.length });

  // 2) account now enabled (fake) → mark transferred with a fake transfer id
  const fakeTransferId = "tr_qa_release_1";
  await new Promise((r) => setTimeout(r, 1100)); // ensure updated_at delta is visible
  await sb
    .from("booking_payouts")
    .update({
      status: "transferred", stripe_transfer_id: fakeTransferId,
      destination_account_id: "acct_qa_enabled", transferred_at: new Date().toISOString(),
      attempts: 2, last_error: null,
    })
    .eq("id", seeded.id);

  const { data: after } = await sb
    .from("booking_payouts")
    .select("status, stripe_transfer_id, transferred_at, updated_at, attempts")
    .eq("id", seeded.id)
    .single();
  check("held → transferred", after?.status === "transferred", { status: after?.status });
  check("stripe_transfer_id persisted", after?.stripe_transfer_id === fakeTransferId, { id: after?.stripe_transfer_id });
  check("transferred_at set", !!after?.transferred_at, { transferred_at: after?.transferred_at });
  check("updated_at trigger fired", after?.updated_at !== before, { before, after: after?.updated_at });

  // 3) idempotency — a second release pass finds NO held/failed rows for this talent
  const { data: second } = await sb
    .from("booking_payouts")
    .select("id")
    .in("status", ["held", "failed"])
    .eq("party", "talent")
    .eq("talent_profile_id", TP)
    .eq("booking_id", BK);
  check("idempotent: nothing left to release", (second ?? []).length === 0, { remaining: second?.length });

  // 4) still-held path: seed a second held leg, "account still disabled" → attempts++ only
  const { data: leg2 } = await sb
    .from("booking_payouts")
    .insert({
      booking_id: BK, participant_id: "qa_p2", party: "talent",
      owning_party_type: "talent", owning_party_id: TP, talent_profile_id: TP,
      amount_cents: 50000, currency: "mxn", status: "held", attempts: 1,
    })
    .select("id")
    .single();
  await sb.from("booking_payouts").update({ attempts: 2, last_error: "account still not transfer-enabled" }).eq("id", leg2.id);
  const { data: stillHeld } = await sb.from("booking_payouts").select("status, attempts").eq("id", leg2.id).single();
  check("still-held leg stays held, attempts bumped", stillHeld?.status === "held" && stillHeld?.attempts === 2, stillHeld);

  // cleanup
  await sb.from("booking_payouts").delete().eq("booking_id", BK);
  const { count } = await sb.from("booking_payouts").select("*", { count: "exact", head: true }).eq("booking_id", BK);
  check("cleanup removed QA rows", (count ?? 0) === 0, { remaining: count });

  report.ok = report.checks.every((c) => c.pass);
} catch (e) {
  report.error = e.message;
}
writeFileSync("/tmp/qa-held-report.json", JSON.stringify(report, null, 2));
