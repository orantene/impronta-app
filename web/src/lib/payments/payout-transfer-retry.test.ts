/**
 * A failed payout leg can be retried without ever paying twice (paid run 2026-10-09: a transient
 * 'insufficient funds' stranded the leg because Stripe replays the failure under the same key for 24h).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { attemptLegTransfer, failureNote, isDeterministicTransferError, keyAttemptOf, keyForAttempt } from "./payout-transfer-retry";
import { legLastError } from "./transfers";

const BASE = "transfer_bk_p1_talent";
const LEG = { bookingId: "bk", participantId: "p1", party: "talent", baseKey: BASE, amountCents: 94_896, currency: "mxn", destination: "acct_1" };

type Created = { params: Record<string, unknown>; key?: string };
function fakeStripe(opts: { existing?: Array<{ id: string; metadata: Record<string, string>; reversed?: boolean }>; createError?: unknown; listError?: boolean }) {
  const created: Created[] = [];
  let listed = 0;
  const stripe = {
    transfers: {
      list: async () => {
        listed += 1;
        if (opts.listError) throw new Error("list down");
        return { data: opts.existing ?? [] };
      },
      create: async (params: Record<string, unknown>, o?: { idempotencyKey?: string }) => {
        created.push({ params, key: o?.idempotencyKey });
        if (opts.createError) throw opts.createError;
        return { id: `tr_${created.length}` };
      },
    },
  } as never;
  return { stripe, created, listedCount: () => listed };
}

const insufficient = Object.assign(new Error("You have insufficient available funds"), { statusCode: 400 });
const timeout = Object.assign(new Error("connection reset"), { statusCode: undefined });
const server5xx = Object.assign(new Error("api error"), { statusCode: 503 });
const rateLimited = Object.assign(new Error("rate limit"), { statusCode: 429 });

test("classifier: 4xx (not 429) is deterministic; network, 5xx and 429 are ambiguous", () => {
  assert.equal(isDeterministicTransferError(insufficient), true);
  assert.equal(isDeterministicTransferError(timeout), false);
  assert.equal(isDeterministicTransferError(server5xx), false);
  assert.equal(isDeterministicTransferError(rateLimited), false);
  assert.equal(isDeterministicTransferError(new TypeError("x")), false);
});

test("key attempt note: round trip, new key only after a deterministic failure", () => {
  assert.equal(keyAttemptOf(null), 0);
  assert.equal(keyAttemptOf("insufficient funds"), 0);
  assert.equal(keyAttemptOf(failureNote("insufficient", 0, true)), 1);
  assert.equal(keyAttemptOf(failureNote("insufficient", 1, true)), 2);
  assert.equal(keyAttemptOf(failureNote("timeout", 1, false)), 1, "ambiguous keeps the attempt");
  assert.equal(keyAttemptOf(failureNote("timeout", 0, false)), 0);
  assert.equal(keyForAttempt(BASE, 0), BASE);
  assert.equal(keyForAttempt(BASE, 2), `${BASE}_a2`);
  // the note never stacks
  assert.equal(failureNote(failureNote("x", 0, true), 1, true).match(/\[key_a:/g)?.length, 1);
});

test("first attempt: the stable key, no listing", async () => {
  const f = fakeStripe({});
  const res = await attemptLegTransfer(f.stripe, { ...LEG, lastError: null });
  assert.deepEqual(res, { kind: "transferred", transferId: "tr_1" });
  assert.equal(f.created[0].key, BASE);
  assert.equal(f.listedCount(), 0);
});

test("a DETERMINISTIC refusal records a note that makes the NEXT attempt use a new key", async () => {
  const f = fakeStripe({ createError: insufficient });
  const res = await attemptLegTransfer(f.stripe, { ...LEG, lastError: null });
  assert.equal(res.kind, "failed");
  const note = (res as { note: string }).note;
  assert.equal(keyAttemptOf(note), 1);
  // the retry, funds now available: a NEW key, after looking for an existing transfer
  const g = fakeStripe({});
  const retry = await attemptLegTransfer(g.stripe, { ...LEG, lastError: note });
  assert.deepEqual(retry, { kind: "transferred", transferId: "tr_1" });
  assert.equal(g.created[0].key, `${BASE}_a1`);
  assert.equal(g.listedCount(), 1);
});

test("an AMBIGUOUS failure keeps the SAME key on the next attempt", async () => {
  const f = fakeStripe({ createError: timeout });
  const res = await attemptLegTransfer(f.stripe, { ...LEG, lastError: null });
  assert.equal(res.kind, "failed");
  assert.equal(keyAttemptOf((res as { note: string }).note), 0);
  const g = fakeStripe({});
  await attemptLegTransfer(g.stripe, { ...LEG, lastError: (res as { note: string }).note });
  assert.equal(g.created[0].key, BASE, "same key, so a transfer that did succeed is replayed, never repeated");
  assert.equal(g.listedCount(), 0);
});

test("an existing transfer for the leg found before a new-key attempt: no new transfer", async () => {
  const f = fakeStripe({ existing: [{ id: "tr_old", metadata: { participant_id: "p1", party: "talent" } }] });
  const res = await attemptLegTransfer(f.stripe, { ...LEG, lastError: failureNote("insufficient", 0, true) });
  assert.deepEqual(res, { kind: "existing", transferId: "tr_old" });
  assert.equal(f.created.length, 0);
});

test("a reversed or other party's transfer does not count as the leg's; an unreadable list skips the attempt", async () => {
  const note = failureNote("insufficient", 0, true);
  const other = fakeStripe({ existing: [{ id: "tr_x", metadata: { participant_id: "p1", party: "workspace" } }, { id: "tr_r", metadata: { participant_id: "p1", party: "talent" }, reversed: true }] });
  assert.equal((await attemptLegTransfer(other.stripe, { ...LEG, lastError: note })).kind, "transferred");
  const down = fakeStripe({ listError: true });
  assert.deepEqual(await attemptLegTransfer(down.stripe, { ...LEG, lastError: note }), { kind: "unverified" });
  assert.equal(down.created.length, 0);
});

test("the initial fan-out marks a deterministic failure the same way; an ambiguous one keeps its plain text", () => {
  assert.equal(keyAttemptOf(legLastError({ status: "failed", detail: "insufficient", deterministic: true })), 1);
  assert.equal(legLastError({ status: "failed", detail: "boom" }), "boom");
  assert.equal(legLastError({ status: "failed", detail: "timeout", deterministic: false }), "timeout");
});

test("the release path uses the module and reads last_error", () => {
  const src = readFileSync("src/lib/payments/booking-payouts-ledger.ts", "utf8");
  assert.match(src, /attemptLegTransfer\(stripe, \{/);
  assert.match(src, /release_after, last_error"\)/);
  assert.match(src, /lastError: row\.last_error,/);
});
