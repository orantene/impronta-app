/**
 * The six Messages sheets that were doors onto nothing (audit E / D-116).
 * These pin the readers' shapes and the diff's meaning; the static test below
 * pins that the shell actually calls the engine.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { basketDiffFromSnapshot, loadCheckoutSnapshots, loadHandOverTargets, snapshotToDraft } from "./sheets";
import { deliveryRetryVerdict } from "./delivery-retry";

function chain(result: { data: unknown; error: null | { message: string } }) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "not", "order", "limit"]) q[m] = () => q;
  q.maybeSingle = async () => result;
  q.then = (resolve: (v: unknown) => void) => resolve(result);
  return q;
}

test("the diff of a stale save is the lines that moved under the sent basket", () => {
  const sent = snapshotToDraft({
    version: 3,
    currency: "USD",
    lines: [
      { id: "l1", label: "Pizza", units: 1, unit_cents: 1200 },
      { id: "l2", label: "Beer", units: 2, unit_cents: 500 },
    ],
  });
  const now = snapshotToDraft({
    version: 5,
    currency: "USD",
    lines: [
      { id: "l1", label: "Pizza", units: 2, unit_cents: 1200 },
      { id: "l3", label: "Water", units: 1, unit_cents: 200 },
    ],
  });
  // No earlier snapshot: everything the operator sent is "theirs vs mine".
  const diff = basketDiffFromSnapshot(sent, now);
  const fields = diff.map((d) => `${d.lineId}:${d.field}`).sort();
  // l1: units moved under the page; l2: mine still has it, theirs dropped it
  // (diffDraft calls that "added" on my side); l3: only theirs added it, not
  // a conflict, so "take theirs" already has it.
  assert.deepEqual(fields, ["l1:units", "l2:added"]);
  const units = diff.find((d) => d.lineId === "l1")!;
  assert.equal(units.theirs, 2);
  assert.equal(units.yours, 1);
  assert.deepEqual(basketDiffFromSnapshot(sent, sent), []);
  // With the earlier snapshot as base, a line both sides changed is the conflict.
  const base = snapshotToDraft({ version: 2, currency: "USD", lines: [{ id: "l1", label: "Pizza", units: 3, unit_cents: 1200 }] });
  const three = basketDiffFromSnapshot(sent, now, base);
  assert.deepEqual(three.map((d) => `${d.lineId}:${d.field}:${d.previous}`), ["l1:units:3", "l2:added:null"]);
});

test("hand-over targets are the workspace's active members, named, minus the caller", async () => {
  const admin = {
    from: (table: string) => {
      if (table === "agency_memberships") {
        return chain({
          data: [
            { profile_id: "u-me", role: "owner" },
            { profile_id: "u-ana", role: "member" },
            { profile_id: "u-bob", role: "manager" },
          ],
          error: null,
        });
      }
      return chain({ data: [{ id: "u-ana", display_name: "Ana" }, { id: "u-bob", display_name: "Bob" }], error: null });
    },
  };
  const targets = await loadHandOverTargets(admin, { tenantId: "t1", excludeUserId: "u-me" });
  assert.deepEqual(targets, [
    { userId: "u-ana", name: "Ana", role: "member" },
    { userId: "u-bob", name: "Bob", role: "manager" },
  ]);
});

test("snapshots carry the engine's uuid, the line count and whether they were recovered", async () => {
  const admin = {
    from: () =>
      chain({
        data: [
          { id: "11111111-1111-4111-8111-111111111111", created_at: "2026-09-15T10:00:00Z", basket: { lines: [{}, {}] }, basket_version: 4, recovered_order_id: null },
        ],
        error: null,
      }),
  };
  const rows = await loadCheckoutSnapshots(admin, { tenantId: "t1", inquiryId: "i1" });
  assert.deepEqual(rows, [
    { id: "11111111-1111-4111-8111-111111111111", createdAt: "2026-09-15T10:00:00Z", basketVersion: 4, lineCount: 2, recoveredOrderId: null },
  ]);
});

test("delivery retry: only a failed row on a channel with an adapter is retried", () => {
  assert.deepEqual(deliveryRetryVerdict({ channel: "email", state: "sent" }), { ok: false, reason: "already" });
  assert.deepEqual(deliveryRetryVerdict({ channel: "whatsapp", state: "failed" }), { ok: false, reason: "channel_unavailable" });
  assert.deepEqual(deliveryRetryVerdict({ channel: "pigeon", state: "failed" }), { ok: false, reason: "channel_unavailable" });
  assert.equal(deliveryRetryVerdict({ channel: "email", state: "failed" }), null);
});

test("the sheets call the engine: no snap-<id>, real actions behind offer / change / diff / delivery / agency / recover", () => {
  const root = join(process.cwd(), "src/components/admin/pos/messages");
  const shell = readFileSync(join(root, "MessagesShell.tsx"), "utf8");
  const sheets = readFileSync(join(root, "sheets/MessagingSheets.tsx"), "utf8");
  const items = readFileSync(join(root, "action-items.ts"), "utf8");
  const engine = readFileSync(join(process.cwd(), "src/lib/server-actions/messaging-sheets.ts"), "utf8");

  // recover: the pre-existing bug. The snapshot id must be the engine's uuid.
  assert.doesNotMatch(shell, /snap-\$\{/);
  assert.match(shell, /messagingRecoverSnapshot\(\{ snapshotId, orderId: chip\.recordId \}\)/);
  // agency
  assert.match(shell, /messagingHandOver\(\{ inquiryId: active\.id, ownerUserId: userId/);
  assert.match(sheets, /data-pos-messages-hand-over-to=/);
  // delivery
  assert.match(shell, /messagingRetryDelivery\(\{ deliveryId \}\)/);
  assert.match(sheets, /data-pos-messages-delivery-retry=/);
  assert.doesNotMatch(sheets, /sent · delivered · read · failed/);
  // offer
  assert.match(shell, /messagingSendOffer\(\{ inquiryId: active\.id, offerId \}\)/);
  assert.match(shell, /messagingReviseOffer\(/);
  assert.match(shell, /messagingScheduleReminder\(\{ inquiryId: active\.id, sendAt, body: copy\.offerRemindBody, recordKind: "offer"/);
  assert.match(sheets, /disabled title=\{copy\.disabled\.withdraw\}/);
  // change
  assert.match(shell, /messagingCancelBooking\(\{ inquiryId: active\.id, bookingId, reason \}\)/);
  assert.match(shell, /schedulingEngineSentence\(result\.reason, schedulingSentences\)/);
  assert.doesNotMatch(items, /sheet: "change", label: copy\.disabled\.change/);
  // diff
  assert.match(shell, /messagingLoadBasketDiff\(\{ inquiryId: id \}\)/);
  assert.match(shell, /messagingCancelPaymentLink\(\{ linkId \}\)/);
  assert.match(sheets, /data-pos-messages-diff-take=/);
  // the engine side exists
  for (const name of [
    "messagingLoadHandOverTargets",
    "messagingLoadDelivery",
    "messagingRetryDelivery",
    "messagingLoadSnapshots",
    "messagingLoadOffers",
    "messagingReviseOffer",
    "messagingLoadBasketDiff",
    "messagingCancelPaymentLink",
    "messagingCancelBooking",
  ]) {
    assert.match(engine, new RegExp(`export async function ${name}\\(`), `${name} missing`);
  }
});
