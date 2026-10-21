/**
 * TUL-1746 hardening: before ANY leg transfer is created, look for one that already exists under the
 * booking's transfer_group (booking_<id>) with this leg's participant_id and party. A transfer that
 * Stripe made but our ledger never recorded (a crash between the two) must be ADOPTED, not repeated, even
 * when the amount has since changed (a refund landed) or Stripe's 24h idempotency window has lapsed.
 * Never a blind create: an unreadable list holds the leg; a reversed transfer is never re-paid automatically.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { disburse } from "./disburse";
import { REVERSED_NOTE, attemptLegTransfer, findExistingLegTransfer } from "./payout-transfer-retry";

type T = { id: string; amount: number; amount_reversed?: number; reversed?: boolean; metadata: Record<string, string>; destination?: string };

function stripeWith(existing: T[] | "list_fails" | "no_list", created: number[] = []) {
  const transfers: Record<string, unknown> = {
    create: async (p: { amount: number }) => {
      created.push(p.amount);
      return { id: `tr_new_${created.length}` };
    },
  };
  if (existing !== "no_list") {
    transfers.list = async () => {
      if (existing === "list_fails") throw new Error("stripe unreachable");
      return { data: existing };
    };
  }
  return { created, stripe: { transfers } as unknown as Stripe };
}

const mine = (over: Partial<T> = {}): T => ({ id: "tr_old", amount: 80000, metadata: { participant_id: "p1", party: "talent" }, ...over });
const INPUT = {
  party: "talent" as const,
  participantId: "p1",
  bookingId: "bk_1",
  amountCents: 56000,
  currency: "usd",
  route: { rail: "connect_transfer" as const, connectAccountId: "acct_t" },
};
const live = () => ({ ok: true as const });

test("an existing transfer for this leg is ADOPTED: no new transfer, even though the amount differs", async () => {
  const { stripe, created } = stripeWith([mine()]);
  const out = await disburse(INPUT, { stripe, assertLivePayoutSafe: live });
  assert.equal(out.status, "transferred");
  assert.equal(out.transferId, "tr_old");
  assert.equal(created.length, 0);
});

test("only this leg's transfer counts: another participant or party does not block the payout", async () => {
  const { stripe, created } = stripeWith([mine({ id: "tr_x", metadata: { participant_id: "p2", party: "talent" } }), mine({ id: "tr_y", metadata: { participant_id: "p1", party: "workspace" } })]);
  const out = await disburse(INPUT, { stripe, assertLivePayoutSafe: live });
  assert.equal(out.status, "transferred");
  assert.deepEqual(created, [56000]);
});

test("a reversed (fully or partly) existing transfer is never re-paid: the leg fails with the needs-attention note", async () => {
  for (const reversed of [{ reversed: true }, { amount_reversed: 100 }]) {
    const { stripe, created } = stripeWith([mine(reversed)]);
    const out = await disburse(INPUT, { stripe, assertLivePayoutSafe: live });
    assert.equal(out.status, "failed");
    assert.match(String(out.detail), new RegExp(REVERSED_NOTE));
    assert.equal(created.length, 0);
  }
});

test("an unreadable transfer list holds the leg: never a blind create", async () => {
  const { stripe, created } = stripeWith("list_fails");
  const out = await disburse(INPUT, { stripe, assertLivePayoutSafe: live });
  assert.equal(out.status, "failed");
  assert.equal(out.deterministic, false, "retryable, not a refusal");
  assert.match(String(out.detail), /could not verify/i);
  assert.equal(created.length, 0);
});

test("nothing existing: the transfer is created as before, under the same stable key", async () => {
  const { stripe, created } = stripeWith([]);
  const out = await disburse(INPUT, { stripe, assertLivePayoutSafe: live });
  assert.equal(out.status, "transferred");
  assert.deepEqual(created, [56000]);
});

test("a test double without transfers.list skips the lookup (production Stripe always has it)", async () => {
  const { stripe, created } = stripeWith("no_list");
  const out = await disburse(INPUT, { stripe, assertLivePayoutSafe: live });
  assert.equal(out.status, "transferred");
  assert.deepEqual(created, [56000]);
});

test("findExistingLegTransfer reports none / existing / reversed / unreadable", async () => {
  const ref = { bookingId: "bk_1", participantId: "p1", party: "talent" };
  assert.deepEqual(await findExistingLegTransfer(stripeWith([]).stripe, ref), { kind: "none" });
  assert.deepEqual(await findExistingLegTransfer(stripeWith([mine()]).stripe, ref), { kind: "existing", transferId: "tr_old" });
  assert.deepEqual(await findExistingLegTransfer(stripeWith([mine({ reversed: true })]).stripe, ref), { kind: "reversed", transferId: "tr_old" });
  assert.deepEqual(await findExistingLegTransfer(stripeWith("list_fails").stripe, ref), { kind: "unreadable" });
});

test("the release path (attemptLegTransfer) looks up on EVERY attempt now, not only after a refusal", async () => {
  const leg = { bookingId: "bk_1", participantId: "p1", party: "talent", baseKey: "transfer_bk_1_p1_talent", amountCents: 56000, currency: "usd", destination: "acct_t", lastError: null };
  const adopted = stripeWith([mine()]);
  assert.deepEqual(await attemptLegTransfer(adopted.stripe, leg), { kind: "existing", transferId: "tr_old" });
  assert.equal(adopted.created.length, 0);
  const clear = stripeWith([]);
  assert.deepEqual(await attemptLegTransfer(clear.stripe, leg), { kind: "transferred", transferId: "tr_new_1" });
  const unreadable = stripeWith("list_fails");
  assert.deepEqual(await attemptLegTransfer(unreadable.stripe, leg), { kind: "unverified" });
  assert.equal(unreadable.created.length, 0);
});
