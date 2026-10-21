/**
 * TUL-1708 slice 2: the venue, scheduling and POS engines, the Messages money actions and the readers in
 * the Messages engine/sheets name their capability on the staff guard. The engines' local `staff(capability)`
 * wrapper takes it as an argument and also checks it with `userHasCapability`, so a bare `staff()` cannot compile.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const BARE = /\brequireWorkspaceStaffAction\(\s*\)|\bmessagingStaff\(\s*\)|\bawait staff\(\s*\)/;

test("pos, venue and scheduling engines: wrapper forwards the capability; every call is booking.payment.request", () => {
  for (const f of ["pos-engine", "venue-engine", "scheduling-engine"]) {
    const src = read(`src/lib/server-actions/${f}.ts`);
    assert.doesNotMatch(src, BARE, f);
    assert.match(src, /requireWorkspaceStaffAction\(\{ capability \}\)/, f);
    assert.match(src, /userHasCapability\(capability, guard\.tenantId\)/, f);
    const calls = src.match(/await staff\([^)]*\)/g) ?? [];
    assert.ok(calls.length >= 11, f);
    for (const c of calls) assert.equal(c, 'await staff("booking.payment.request")', `${f}: ${c}`);
  }
});

test("messaging money actions: cancel, refund and outside payment are keyed; the three reads say view", () => {
  const src = read("src/lib/server-actions/messaging-money-actions.ts");
  const guardOf = (fn: string) => {
    const i = src.indexOf(`export async function ${fn}`);
    return src.slice(i).match(/messagingStaff\("([^"]+)"\)/)?.[1];
  };
  assert.equal(guardOf("messagingCancelRecord"), "cancel_inquiry");
  assert.equal(guardOf("messagingRefund"), "booking.payment.refund");
  assert.equal(guardOf("messagingRecordOutsidePayment"), "booking.payment.request");
  for (const fn of ["messagingPreviewCancel", "messagingLoadRefundableTransaction", "messagingCanReadNotes"]) {
    assert.equal(guardOf(fn), "agency.workspace.view", fn);
  }
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ""), /messagingStaff\(\s*\)/);
});

test("messaging sheets readers are explicit about view", () => {
  assert.doesNotMatch(read("src/lib/server-actions/messaging-sheets.ts"), /\bawait staff\(\s*\)/);
});

test("role matrix: viewer and editor are refused the money capabilities; manager takes cancel and outside payment, admin takes refund", () => {
  for (const cap of ["booking.payment.request", "cancel_inquiry"] as const) {
    assert.equal(roleGrantsCapability("viewer", cap), false, cap);
    assert.equal(roleGrantsCapability("editor", cap), false, cap);
    assert.equal(roleGrantsCapability("manager", cap), true, cap);
  }
  assert.equal(roleGrantsCapability("manager", "booking.payment.refund"), false);
  for (const cap of ["booking.payment.refund"] as const) {
    assert.equal(roleGrantsCapability("manager", cap), false, cap);
    assert.equal(roleGrantsCapability("admin", cap), true, cap);
    assert.equal(roleGrantsCapability("owner", cap), true, cap);
  }
});

test("recording a received/cash payment is one manager key end to end; pending/disputed/failed and refunds stay admin", async () => {
  const { PIPELINE_WRITE_CAPABILITY: W } = await import("@/lib/inquiry/pipeline-write-capabilities");
  assert.equal(W.markInquiryPaidInCash, "booking.payment.request");
  assert.equal(W.markInquiryPaymentReceived, "booking.payment.request");
  for (const k of ["markInquiryPaymentPending", "markInquiryPaymentDisputed", "markInquiryPaymentFailed"] as const) {
    assert.equal(W[k], "booking.payment.mark_received", k);
  }
  assert.equal(roleGrantsCapability("manager", W.markInquiryPaidInCash), true);
  assert.equal(roleGrantsCapability("editor", W.markInquiryPaidInCash), false);
  assert.equal(roleGrantsCapability("manager", "booking.payment.refund"), false);
});

test("slice 3: promos, rent, talent albums, role limits and the POS staff gate name their capability", () => {
  const promos = read("src/app/(workspace)/[tenantSlug]/admin/discounts/actions.ts");
  assert.equal((promos.match(/requireWorkspaceStaffAction\(\{ capability: "manage_billing" \}\)/g) ?? []).length, 2);
  assert.match(read("src/lib/service-hub/rent/rent-actions.ts"), /requireWorkspaceStaffAction\(\{ capability: "booking\.payment\.request" \}\)/);
  assert.match(read("src/lib/site-admin/builder-node/portfolio-albums-actions.ts"), /requireWorkspaceStaffAction\(\{ capability: "agency\.roster\.edit" \}\)/);
  assert.match(read("src/lib/server-actions/role-limits-settings.ts"), /capability: write \? "manage_memberships" : "agency\.workspace\.view"/);
  assert.match(read("src/lib/pos/staff-actor.ts"), /requireWorkspaceStaffAction\(\{ capability \}\)/);
  assert.equal(roleGrantsCapability("viewer", "manage_billing"), false);
  assert.equal(roleGrantsCapability("viewer", "agency.roster.edit"), false);
  assert.equal(roleGrantsCapability("editor", "agency.roster.edit"), true);
});
