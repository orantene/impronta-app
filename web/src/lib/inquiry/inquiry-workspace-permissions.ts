import type { WorkspacePermissions, WorkspaceStateInput } from "./inquiry-workspace-types";
import { roleMayPerform, statusAllowsAction } from "./inquiry-workspace-state-matrix";

function intersect(
  input: WorkspaceStateInput,
  action: string,
  ctx: { hasOffer: boolean; offerStatus: string | null; isOfferReady: boolean; allApprovalsAccepted: boolean },
): boolean {
  const st = statusAllowsAction(input.status, action, ctx);
  if (!st.ok) return false;
  return roleMayPerform(action, input.effectiveRole);
}

export function getWorkspacePermissions(input: WorkspaceStateInput): WorkspacePermissions {
  const ctx = {
    hasOffer: input.hasOffer,
    offerStatus: input.offerStatus,
    isOfferReady: input.isOfferReady,
    allApprovalsAccepted: input.allApprovalsAccepted,
  };

  const staff = input.effectiveRole === "admin" || input.effectiveRole === "coordinator";

  let canSendMessage =
    intersect(input, "send_message", ctx) && (!input.isLocked || input.status === "booked");
  if (input.status === "booked" && input.effectiveRole === "talent") {
    canSendMessage = false;
  }
  if (input.isLocked && input.status !== "booked") {
    canSendMessage = false;
  }

  return {
    canSendMessage,
    canCreateOffer: intersect(input, "create_offer", ctx) && !input.isLocked,
    canSendOffer: intersect(input, "send_offer", ctx) && !input.isLocked,
    canEditOffer: intersect(input, "edit_offer", ctx) && !input.isLocked,
    canWithdrawOffer: intersect(input, "withdraw_offer", ctx) && !input.isLocked,
    canApprove: intersect(input, "approve", ctx) && !input.isLocked,
    canConvertToBooking:
      intersect(input, "convert_to_booking", ctx) &&
      input.allApprovalsAccepted &&
      input.status === "approved" &&
      !input.isLocked,
    canReassign: intersect(input, "reassign", ctx) && !input.isLocked,
    canClose: intersect(input, "close", ctx) && !input.isLocked,
    canReopen: intersect(input, "reopen", ctx) && input.isLocked && ["rejected", "expired", "closed_lost"].includes(input.status),
    canDuplicate: intersect(input, "duplicate", ctx),
    canAddTalent:
      intersect(input, "add_talent", ctx) &&
      !input.isLocked &&
      !["offer_pending", "approved"].includes(input.status),
    canRemoveTalent:
      intersect(input, "remove_talent", ctx) &&
      !input.isLocked &&
      !["offer_pending", "approved"].includes(input.status),
    canSeePricing: staff,
    canSeeMargins: staff,
    canSeeOtherApprovals: input.effectiveRole !== "talent",
    canSeePrivateThread: staff || input.effectiveRole === "client",
    canSeeGroupThread: true,
    canSeeStaffNotes: staff,
    canSeeActivityLog: staff,
  };
}
