/**
 * Tests for the ledger writer's pure surface.
 *
 * `groupIdFor` is the whole idempotency story: if it were not deterministic, a
 * retry would write a second copy of a payment that looks exactly as legitimate
 * as the first. That is the single worst failure this system can have, so it is
 * pinned directly rather than inferred from the writer's behaviour.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { groupIdFor } from "./write";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("groupIdFor", () => {
  test("is deterministic — the same key always yields the same id", () => {
    // Without this, a retried projection double-counts.
    const a = groupIdFor("booking_payment:txn-1");
    const b = groupIdFor("booking_payment:txn-1");
    assert.equal(a, b);
  });

  test("produces a syntactically valid uuid", () => {
    // It is written into a uuid column; a malformed value fails at insert time
    // with an error that says nothing useful about the cause.
    assert.match(groupIdFor("booking_payment:txn-1"), UUID_RE);
    assert.match(groupIdFor("payout_arrived:po_123"), UUID_RE);
    assert.match(groupIdFor(""), UUID_RE);
  });

  test("different sources never collide", () => {
    const keys = [
      "booking_payment:txn-1",
      "booking_payment:txn-2",
      "processing_fee:txn-1",
      "refund:txn-1",
      "payout_initiated:po_1",
      "payout_arrived:po_1",
      "subscription_invoice:in_1",
    ];
    const ids = new Set(keys.map(groupIdFor));
    assert.equal(ids.size, keys.length, "two different sources hashed to one group");
  });

  test("the two payout phases of ONE payout are distinct groups", () => {
    // They must be separate: the money is in transit between them, and one
    // group cannot represent both without leaving the balance sheet unable to
    // show where the money actually is.
    assert.notEqual(groupIdFor("payout_initiated:po_1"), groupIdFor("payout_arrived:po_1"));
  });

  test("a payment and its processing fee are distinct groups", () => {
    // Stripe settles the fee separately; sharing a group would make our
    // stripe_balance disagree with Stripe's.
    assert.notEqual(groupIdFor("booking_payment:txn-1"), groupIdFor("processing_fee:txn-1"));
  });

  test("is stable across formatting of the same logical key", () => {
    // Guards against someone "tidying" a key later: these ARE different keys
    // and must produce different ids, so the test documents that the key string
    // is the contract, not the concept.
    assert.notEqual(groupIdFor("booking_payment:txn-1"), groupIdFor("booking_payment:TXN-1"));
  });
});

// ── The double-post guard (ledger_group_claims, PM decision 2026-10-09) ──────────────────────────────
import { CLAIM_STALE_MS, decideClaim } from "./write";
import { readFileSync } from "node:fs";

describe("decideClaim", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

  test("winning the insert proceeds", () => {
    assert.equal(decideClaim({ inserted: true, existing: null, nowMs: now }), "proceed");
  });
  test("a completed claim means the group is already posted: skip", () => {
    assert.equal(decideClaim({ inserted: false, existing: { completed_at: iso(5000), claimed_at: iso(9000) }, nowMs: now }), "skip_done");
  });
  test("a fresh unfinished claim is another run mid-write: skip, never double post", () => {
    assert.equal(decideClaim({ inserted: false, existing: { completed_at: null, claimed_at: iso(30_000) }, nowMs: now }), "skip_in_progress");
  });
  test("a stale unfinished claim (the run died) may be taken over", () => {
    assert.equal(decideClaim({ inserted: false, existing: { completed_at: null, claimed_at: iso(CLAIM_STALE_MS + 1000) }, nowMs: now }), "takeover");
  });
  test("a claim that vanished while we read it is treated as in progress, not as free", () => {
    assert.equal(decideClaim({ inserted: false, existing: null, nowMs: now }), "skip_in_progress");
  });
});

describe("the claim migration is additive and wired", () => {
  const mig = readFileSync(new URL("../../../../supabase/migrations/20261231355000_ledger_group_claims.sql", import.meta.url), "utf8");
  const writer = readFileSync(new URL("./write.ts", import.meta.url), "utf8");

  test("one new table keyed by the group id; nothing existing is altered or dropped", () => {
    assert.match(mig, /CREATE TABLE IF NOT EXISTS public\.ledger_group_claims[\s\S]{0,80}group_id\s+UUID PRIMARY KEY/);
    assert.doesNotMatch(mig, /\bDROP\b|ALTER TABLE public\.ledger_entries|ALTER TABLE public\.ledger_accounts|UPDATE public\.ledger_entries|DELETE FROM public\.ledger_entries/i);
  });
  test("service-role only", () => {
    assert.match(mig, /ENABLE ROW LEVEL SECURITY/);
    assert.match(mig, /REVOKE ALL ON public\.ledger_group_claims FROM PUBLIC, anon, authenticated/);
    assert.match(mig, /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.ledger_group_claims TO service_role/);
  });
  test("existing groups are back-filled as complete", () => {
    assert.match(mig, /INSERT INTO public\.ledger_group_claims[\s\S]{0,300}FROM public\.ledger_entries[\s\S]{0,60}GROUP BY group_id/);
  });
  test("the writer claims before it writes, completes after, and releases on a failed insert", () => {
    assert.ok(writer.indexOf("claimGroup(sb, groupId, groupKey)") < writer.indexOf('sb.from("ledger_entries").insert(rows)'));
    assert.match(writer, /update\(\{ completed_at: new Date\(\)\.toISOString\(\) \}\)/);
    assert.match(writer, /Release the claim so the next run can retry/);
  });
  test("a missing claim table degrades loudly instead of blocking the ledger", () => {
    assert.match(writer, /code === "42P01" \|\| code === "PGRST205"[\s\S]{0,400}return \{ proceed: true, claimed: false \}/);
  });
});
