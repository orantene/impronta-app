import assert from "node:assert/strict";
import test from "node:test";
import { getProgressStep } from "./inquiry-progress";
import { getPrimaryAction } from "./inquiry-primary-action";
import { getWorkspacePermissions } from "./inquiry-workspace-permissions";
import {
  ENGINE_ACTION_KEYS,
  WORKSPACE_STATE_MATRIX,
  resolvePrimaryActionFromMatrix,
  statusAllowsAction,
} from "./inquiry-workspace-state-matrix";
import { WORKSPACE_STATUSES, type WorkspaceStateInput } from "./inquiry-workspace-types";

function baseInput(over: Partial<WorkspaceStateInput>): WorkspaceStateInput {
  return {
    status: "submitted",
    effectiveRole: "admin",
    userId: "u1",
    hasMessages: true,
    hasOffer: false,
    offerStatus: null,
    allApprovalsAccepted: false,
    pendingApprovalCount: 0,
    isOfferReady: true,
    hasLinkedBooking: false,
    linkedBookingId: null,
    isLocked: false,
    ...over,
  };
}

test("WORKSPACE_STATE_MATRIX covers every workspace status", () => {
  for (const s of WORKSPACE_STATUSES) {
    assert.ok(WORKSPACE_STATE_MATRIX[s], `missing matrix row for ${s}`);
  }
});

test("statusAllowsAction is defined for every status × engine action key", () => {
  const ctx = { hasOffer: true, offerStatus: "draft", isOfferReady: true, allApprovalsAccepted: true };
  for (const status of WORKSPACE_STATUSES) {
    for (const action of ENGINE_ACTION_KEYS) {
      const r = statusAllowsAction(status, action, ctx);
      assert.equal(typeof r.ok, "boolean");
    }
  }
});

test("submitted + create_offer is blocked until review starts", () => {
  const r = statusAllowsAction("submitted", "create_offer", {
    hasOffer: false,
    offerStatus: null,
    isOfferReady: true,
    allApprovalsAccepted: false,
  });
  assert.equal(r.ok, false);
});

test("getPrimaryAction: booked + staff → admin booking href", () => {
  const a = getPrimaryAction(
    baseInput({
      status: "booked",
      hasLinkedBooking: true,
      linkedBookingId: "bk-111",
      isLocked: true,
    }),
  );
  assert.equal(a.key, "view_booking");
  assert.match(a.href ?? "", /\/admin\/bookings\/bk-111/);
});

test("getPrimaryAction: booked + client → client booking href", () => {
  const a = getPrimaryAction(
    baseInput({
      status: "booked",
      effectiveRole: "client",
      hasLinkedBooking: true,
      linkedBookingId: "bk-222",
      isLocked: true,
    }),
  );
  assert.equal(a.key, "view_booking");
  assert.match(a.href ?? "", /\/client\/bookings\/bk-222/);
});

test("getPrimaryAction: booked + talent → informational CTA (no href)", () => {
  const a = getPrimaryAction(
    baseInput({
      status: "booked",
      effectiveRole: "talent",
      hasLinkedBooking: true,
      linkedBookingId: "bk-333",
      isLocked: true,
    }),
  );
  assert.equal(a.key, "booking_confirmed");
  assert.equal(a.href, undefined);
});

test("getPrimaryAction: approved + client → awaiting final booking", () => {
  const a = getPrimaryAction(
    baseInput({
      status: "approved",
      effectiveRole: "client",
      allApprovalsAccepted: true,
      hasOffer: true,
      offerStatus: "accepted",
    }),
  );
  assert.equal(a.key, "awaiting_booking");
  assert.equal(a.disabled, true);
});

test("getWorkspacePermissions: client cannot message on locked rejected inquiry", () => {
  const p = getWorkspacePermissions(
    baseInput({
      status: "rejected",
      effectiveRole: "client",
      isLocked: true,
    }),
  );
  assert.equal(p.canSendMessage, false);
});

test("resolvePrimaryActionFromMatrix matches getPrimaryAction for admin staff", () => {
  const input = baseInput({
    status: "coordination",
    hasOffer: true,
    offerStatus: "draft",
    isOfferReady: true,
  });
  const perms = getWorkspacePermissions(input);
  const a = getPrimaryAction(input);
  const b = resolvePrimaryActionFromMatrix(input, perms);
  assert.deepEqual(a, b);
});

test("getProgressStep: offer_pending is non-terminal step 3", () => {
  const p = getProgressStep("offer_pending");
  assert.equal(p.step, 3);
  assert.equal(p.isTerminal, false);
});
