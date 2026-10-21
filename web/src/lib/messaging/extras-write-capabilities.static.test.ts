/**
 * TUL-1708 (messaging extras): the remaining Messages writers (start a conversation, create a client for a thread,
 * confirm a record, retry delivery, revise an offer, cancel a payment link, cancel a booking) require their capability
 * so a `viewer` is refused. Static wiring + the role matrix. The money writers (refund, discount, cancel record) keep
 * their existing `requirePermission` gate. No baseline: an export of these modules that is neither a listed writer nor
 * a listed read fails by name.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";
import { MESSAGING_EXTRAS_WRITE_CAPABILITY } from "./extras-write-capabilities";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const exportsIn = (src: string) => [...src.matchAll(/export async function (\w+)/g)].map((m) => ({ name: m[1]!, at: m.index! }));
const bodyOf = (src: string, name: string) => {
  const ex = exportsIn(src);
  const i = ex.findIndex((e) => e.name === name);
  assert.ok(i >= 0, `${name} not exported`);
  return src.slice(ex[i]!.at, i + 1 < ex.length ? ex[i + 1]!.at : src.length);
};

const MODULES: Array<{ file: string; writers: Record<string, keyof typeof MESSAGING_EXTRAS_WRITE_CAPABILITY>; reads: string[]; gatedByPermission?: string[] }> = [
  {
    file: "src/lib/server-actions/messaging-sheets.ts",
    writers: { messagingRetryDelivery: "retryDelivery", messagingReviseOffer: "reviseOffer", messagingCancelPaymentLink: "cancelPaymentLink", messagingCancelBooking: "cancelBooking" },
    reads: ["messagingLoadHandOverTargets", "messagingLoadDelivery", "messagingLoadSnapshots", "messagingLoadOffers", "messagingLoadBasketDiff", "messagingThreadLink", "messagingLoadContextLines"],
  },
  { file: "src/lib/server-actions/messaging-start.ts", writers: { messagingStartConversation: "startConversation", messagingCreateClientForThread: "createClientForThread" }, reads: [] },
  { file: "src/lib/server-actions/messaging-confirm.ts", writers: { messagingConfirmRecord: "confirmRecord" }, reads: [] },
  {
    file: "src/lib/server-actions/messaging-money-actions.ts",
    writers: {},
    reads: ["messagingPreviewCancel", "messagingLoadRefundableTransaction", "messagingCanReadNotes"],
    gatedByPermission: ["messagingCancelRecord", "messagingRefund", "messagingRecordOutsidePayment"],
  },
  { file: "src/lib/server-actions/messaging-items.ts", writers: {}, reads: ["messagingLoadItemsCatalog", "messagingLoadPersonSlots"] },
];

test("every writer in these modules requires its capability; every export is classified", () => {
  for (const m of MODULES) {
    const src = read(m.file);
    const known = new Set([...Object.keys(m.writers), ...m.reads, ...(m.gatedByPermission ?? [])]);
    const unknown = exportsIn(src).map((e) => e.name).filter((n) => !known.has(n));
    assert.deepEqual(unknown, [], `${m.file}: classify these exports (writer with a capability, read, or permission-gated)`);
    for (const [fn, key] of Object.entries(m.writers)) {
      const body = bodyOf(src, fn);
      assert.match(body, new RegExp(`EXTRAS_CAP\\.${key}\\b`), `${fn} must require MESSAGING_EXTRAS_WRITE_CAPABILITY.${key}`);
    }
    for (const fn of m.gatedByPermission ?? []) assert.match(bodyOf(src, fn), /requirePermission\(/, `${fn} keeps its requirePermission gate`);
  }
});

test("behaviour on the role matrix: a viewer is refused every capability these writers require; a manager and an owner are allowed", () => {
  for (const cap of new Set(Object.values(MESSAGING_EXTRAS_WRITE_CAPABILITY))) {
    assert.equal(roleGrantsCapability("viewer", cap as never), false, `viewer must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("editor", cap as never), false, `editor must NOT hold ${cap} (client conversations and money are manager+)`);
    assert.equal(roleGrantsCapability("manager", cap as never), true, `manager must hold ${cap}`);
    assert.equal(roleGrantsCapability("owner", cap as never), true, `owner must hold ${cap}`);
  }
  assert.equal(roleGrantsCapability("viewer", "agency.workspace.view"), true, "the viewer default still reads");
});
