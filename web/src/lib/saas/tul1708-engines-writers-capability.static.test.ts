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

test("messaging engine/sheets readers and the pipeline settings readers are explicit about view", () => {
  for (const f of ["src/lib/server-actions/messaging-engine.ts", "src/lib/server-actions/messaging-sheets.ts"]) {
    assert.doesNotMatch(read(f), /\bawait staff\(\s*\)/, f);
  }
  const pipe = read("src/app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts");
  assert.doesNotMatch(pipe, /\brequireWorkspaceStaffAction\(\s*\)/);
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
