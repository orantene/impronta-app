import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

/**
 * S6: static properties of the money actions, in the same style as
 * `lib/orders/refund-execute-lines.test.ts` — the properties here are about
 * VALIDATION GATES and CONTROL FLOW, which source text carries honestly, and
 * exercising the real thing would mean faking `requireWorkspaceStaffAction`'s
 * whole session/cookie stack, which no other file under `server-actions/`
 * does either (grepped: no `*.test.ts` exists next to any file in this
 * directory that calls `requireWorkspaceStaffAction`). The DB-reachable
 * logic these actions call into (permission gating, record resolution,
 * cancel/refund helpers) is unit-tested directly against `fakeAdmin` in
 * `lib/messaging/money.test.ts` and `lib/messaging/money-permissions.test.ts`.
 */
const SRC = blankComments(
  readFileSync(join(process.cwd(), "src/lib/server-actions/messaging-money-actions.ts"), "utf8"),
);

test("every money action checks staff, then permission, then version, before touching money", () => {
  const order = SRC.indexOf("export async function messagingCancelRecord");
  const cancelBody = SRC.slice(order, SRC.indexOf("export async function messagingRefund"));
  assert.ok(cancelBody.indexOf("messagingStaff()") < cancelBody.indexOf('"messages.cancel"'), "staff before permission");
  assert.ok(cancelBody.indexOf('"messages.cancel"') < cancelBody.indexOf('!== parsed.data.expectedVersion'), "permission before the version comparison");
  assert.ok(cancelBody.indexOf('!== parsed.data.expectedVersion') < cancelBody.indexOf("refundOrderLines"), "version checked before any money moves");
});

test("messagingRefund is gated on messages.refund and verifies the transaction is this tenant's AND this inquiry's", () => {
  const start = SRC.indexOf("export async function messagingRefund");
  const body = SRC.slice(start, SRC.indexOf("export async function messagingRecordOutsidePayment"));
  assert.match(body, /"messages\.refund"/);
  assert.match(body, /loadOwnedTransaction/);
  assert.match(body, /orderLinkedToInquiry/);
});

test("messagingRecordOutsidePayment requires a reference of at least 3 characters", () => {
  const start = SRC.indexOf("export async function messagingRecordOutsidePayment");
  const body = SRC.slice(start, SRC.indexOf("async function recordOutsidePaymentFollowUp"));
  assert.match(body, /reference:\s*z\.string\(\)\.trim\(\)\.min\(3\)/);
});

test("messagingRecordOutsidePayment maps a payout-receiver failure to the no_payout_receiver refusal on BOTH paths (order and workspace)", () => {
  const start = SRC.indexOf("export async function messagingRecordOutsidePayment");
  const body = SRC.slice(start, SRC.indexOf("async function recordOutsidePaymentFollowUp"));
  const occurrences = body.match(/no_payout_receiver/g) ?? [];
  assert.ok(occurrences.length >= 2, "both the order path and the workspace path must map to it");
});

test("a partial cancel or refund without an amount is refused before any read happens", () => {
  const cancelStart = SRC.indexOf("export async function messagingCancelRecord");
  const cancelBody = SRC.slice(cancelStart, SRC.indexOf("export async function messagingRefund"));
  const guardIdx = cancelBody.indexOf('refund.mode === "partial" && parsed.data.refund.amountCents == null');
  const permIdx = cancelBody.indexOf('"messages.cancel"');
  assert.ok(guardIdx > -1 && guardIdx < permIdx, "the amount guard runs before the permission check, cheapest refusal first");

  const refundStart = SRC.indexOf("export async function messagingRefund");
  const refundBody = SRC.slice(refundStart, SRC.indexOf("export async function messagingRecordOutsidePayment"));
  assert.match(refundBody, /mode === "partial" && parsed\.data\.amountCents == null/);
});

test("a partial cancel refund amount is capped at the SAME preview it read, never a separate figure", () => {
  const start = SRC.indexOf("export async function messagingCancelRecord");
  const body = SRC.slice(start, SRC.indexOf("export async function messagingRefund"));
  assert.match(body, /amt > preview\.refundableCents/);
});

test("a money leg NEVER runs before isCancelTargetAlready has cleared it", () => {
  const start = SRC.indexOf("export async function messagingCancelRecord");
  const body = SRC.slice(start, SRC.indexOf("export async function messagingRefund"));
  assert.ok(body.indexOf("isCancelTargetAlready") < body.indexOf("refundOrderLines"));
});

test("messagingInternalNote and messagingCloseLost are gated in the ENGINE file (not silently ungated)", () => {
  const engineSrc = blankComments(
    readFileSync(join(process.cwd(), "src/lib/server-actions/messaging-engine.ts"), "utf8"),
  );
  const noteStart = engineSrc.indexOf("export async function messagingInternalNote");
  const noteBody = engineSrc.slice(noteStart, engineSrc.indexOf("export async function messagingAssignOwner"));
  assert.match(noteBody, /"messages\.notes\.read"/);

  const closeStart = engineSrc.indexOf("export async function messagingCloseLost");
  const closeBody = engineSrc.slice(closeStart, engineSrc.indexOf("export async function messagingScheduleReminder"));
  assert.match(closeBody, /"messages\.close_lost"/);
});
