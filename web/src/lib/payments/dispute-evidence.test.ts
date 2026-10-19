import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  autoSubmitDisputeEvidence,
  buildDisputeEvidence,
  messageExcerpt,
  type DisputeEvidenceDeps,
  type DisputeEvidenceFacts,
  type DisputeEvidenceFields,
  type DisputeForEvidence,
} from "./dispute-evidence";

const ON = { DISPUTE_EVIDENCE_AUTOSUBMIT: "1" };

function facts(over: Partial<DisputeEvidenceFacts> = {}): DisputeEvidenceFacts {
  return {
    bookingId: "bk_1",
    title: "Bridal makeup",
    startsAt: "2026-11-02T16:00:00.000Z",
    endsAt: "2026-11-02T18:00:00.000Z",
    timeZone: "America/Cancun",
    venue: "Hotel Casa Blanca",
    clientName: "Pat Client",
    clientEmail: "pat@example.com",
    clientPhone: "+52 998 000 0000",
    amountPaidCents: 25000,
    currency: "usd",
    paidAt: "2026-10-20T12:00:00.000Z",
    paymentIntentId: "pi_1",
    receiptNumber: "CONF-0001",
    cancellationPolicy: "Free cancellation up to 48 hours before.",
    refundPolicyKey: "moderate",
    messages: [
      { at: "2026-10-21T10:00:00.000Z", body: "See you Saturday" },
      { at: "2026-10-22T10:00:00.000Z", body: "Confirmed, thanks" },
    ],
    ...over,
  };
}

function dispute(over: Partial<DisputeForEvidence> = {}): DisputeForEvidence {
  return { id: "dp_1", livemode: false, status: "needs_response", paymentIntentId: "pi_1", submissionCount: 0, ...over };
}

function fakeDeps(opts: { dispute?: DisputeForEvidence; facts?: DisputeEvidenceFacts | null } = {}) {
  const submitted: Array<{ id: string; evidence: DisputeEvidenceFields; key: string }> = [];
  const calls = { retrieve: 0, loadFacts: 0 };
  const deps: DisputeEvidenceDeps = {
    async retrieve() {
      calls.retrieve++;
      return opts.dispute ?? dispute();
    },
    async loadFacts() {
      calls.loadFacts++;
      return opts.facts === undefined ? facts() : opts.facts;
    },
    async submit(id, evidence, key) {
      submitted.push({ id, evidence, key });
    },
  };
  return { deps, submitted, calls };
}

describe("auto-submit dispute evidence", () => {
  test("flag OFF (unset or any other value): nothing is read, nothing is submitted", async () => {
    for (const env of [{}, { DISPUTE_EVIDENCE_AUTOSUBMIT: "true" }, { DISPUTE_EVIDENCE_AUTOSUBMIT: "0" }]) {
      const { deps, submitted, calls } = fakeDeps();
      assert.deepEqual(await autoSubmitDisputeEvidence({ disputeId: "dp_1", env }, deps), { kind: "disabled" });
      assert.equal(submitted.length, 0);
      assert.equal(calls.retrieve + calls.loadFacts, 0);
    }
  });

  test("flag ON, test-mode booking dispute: submits once with an idempotency key on the dispute id", async () => {
    const { deps, submitted } = fakeDeps();
    assert.deepEqual(await autoSubmitDisputeEvidence({ disputeId: "dp_1", env: ON }, deps), {
      kind: "submitted",
      disputeId: "dp_1",
    });
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].key, "dispute-evidence:dp_1");
    const e = submitted[0].evidence;
    assert.equal(e.customer_email_address, "pat@example.com");
    assert.equal(e.service_date, "2026-11-02");
    assert.match(e.product_description, /Bridal makeup/);
    assert.match(e.cancellation_policy_disclosure ?? "", /48 hours/);
    assert.match(e.uncategorized_text, /CONF-0001/);
    assert.match(e.uncategorized_text, /250\.00 USD/);
    assert.match(e.uncategorized_text, /Confirmed, thanks/);
  });

  test("a live-mode dispute is refused even with the flag on", async () => {
    const { deps, submitted } = fakeDeps({ dispute: dispute({ livemode: true }) });
    const r = await autoSubmitDisputeEvidence({ disputeId: "dp_1", env: ON }, deps);
    assert.equal(r.kind, "refused");
    assert.equal(submitted.length, 0);
  });

  test("closed, already-submitted and unplaceable disputes are refused", async () => {
    for (const d of [dispute({ status: "won" }), dispute({ submissionCount: 1 }), dispute({ paymentIntentId: null })]) {
      const { deps, submitted } = fakeDeps({ dispute: d });
      assert.equal((await autoSubmitDisputeEvidence({ disputeId: "dp_1", env: ON }, deps)).kind, "refused");
      assert.equal(submitted.length, 0);
    }
    const none = fakeDeps({ facts: null });
    assert.equal((await autoSubmitDisputeEvidence({ disputeId: "dp_1", env: ON }, none.deps)).kind, "refused");
    assert.equal(none.submitted.length, 0);
  });

  test("thin evidence (no client email, no service, no payment) is refused, not submitted", async () => {
    for (const over of [{ clientEmail: null }, { title: " " }, { amountPaidCents: 0 }, { startsAt: null }, { clientName: null }]) {
      const { deps, submitted } = fakeDeps({ facts: facts(over) });
      const r = await autoSubmitDisputeEvidence({ disputeId: "dp_1", env: ON }, deps);
      assert.equal(r.kind, "refused");
      assert.equal(submitted.length, 0);
    }
  });
});

describe("evidence content", () => {
  test("missing policy and messages degrade honestly; optional fields are omitted", () => {
    const e = buildDisputeEvidence(facts({ cancellationPolicy: null, refundPolicyKey: null, messages: [] }));
    assert.equal(e.cancellation_policy_disclosure, undefined);
    assert.equal(e.refund_policy_disclosure, undefined);
    assert.match(e.uncategorized_text, /no client-visible text messages/);
  });

  test("message excerpt keeps the newest messages within budget, oldest first, whitespace collapsed", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ at: `t${i}`, body: `msg   ${i}\n` }));
    const out = messageExcerpt(many);
    assert.ok(out.length <= 3000);
    assert.ok(out.endsWith("msg 39"));
    assert.ok(!out.includes("msg 0\n"));
    const huge = messageExcerpt([{ at: "t", body: "x".repeat(5000) }]);
    assert.equal(huge, "");
  });

  test("free text fields are capped at Stripe's 20,000 characters", () => {
    const e = buildDisputeEvidence(facts({ cancellationPolicy: "p".repeat(50_000), title: "t".repeat(50_000) }));
    assert.ok((e.cancellation_policy_disclosure ?? "").length <= 20_000);
    assert.ok(e.product_description.length <= 20_000);
  });
});

describe("what is NEVER submitted (private content stays out)", () => {
  const src = readFileSync(new URL("./dispute-evidence-deps.ts", import.meta.url), "utf8");
  const selects = [...src.matchAll(/\.select\(\s*"([^"]+)"/g)].map((m) => m[1]);

  test("the loader reads exactly these columns, nothing else", () => {
    assert.deepEqual(selects, [
      "booking_id, gross_amount_cents, currency, paid_at, payer_email, source_inquiry_id",
      "id, title, starts_at, ends_at, timezone, venue_name, venue_address, contact_name, contact_email, contact_phone, policy_version_id, refund_policy_key, source_inquiry_id",
      "rendered_text_en, rendered_text_es",
      "created_at, body",
    ]);
  });

  test("no private or internal column or table is selected", () => {
    const joined = selects.join(",");
    for (const banned of [
      "internal_notes", "notes", "payment_notes", "lodging_notes", "meals_notes", "transport_notes", "wardrobe_notes",
      "equipment_notes", "access_notes", "override_reason", "total_talent_cost", "gross_profit", "call_sheet_payload",
      "talent_cost", "payout", "client_summary",
    ]) {
      assert.ok(!new RegExp(`\\b${banned}\\b`).test(joined), banned);
    }
    assert.doesNotMatch(src, /talent_profiles|talent_private|talent_bookings|from\("messages"\)/);
  });

  test("messages: client thread, text kind only, internal notes and the talent group thread excluded", () => {
    assert.match(src, /\.eq\("thread_type", CLIENT_THREAD\)/);
    assert.match(src, /\.eq\("message_kind", "text"\)/);
    assert.match(src, /\.neq\("message_kind", INTERNAL_NOTE_KIND\)/);
    assert.match(src, /\.is\("deleted_at", null\)/);
    assert.doesNotMatch(src, /TALENT_THREAD|"group"/);
  });

  test("the evidence object has only the documented fields", () => {
    const e = buildDisputeEvidence(facts());
    assert.deepEqual(Object.keys(e).sort(), [
      "cancellation_policy_disclosure", "customer_email_address", "customer_name", "product_description",
      "refund_policy_disclosure", "service_date", "uncategorized_text",
    ]);
  });
});
