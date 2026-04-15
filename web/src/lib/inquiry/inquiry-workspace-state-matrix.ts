import type {
  EffectiveWorkspaceRole,
  InquiryTab,
  PrimaryAction,
  WorkspacePermissions,
  WorkspaceStateInput,
  WorkspaceStatus,
} from "./inquiry-workspace-types";
import { WORKSPACE_STATUSES } from "./inquiry-workspace-types";

export const DISABLED_REASONS = {
  not_in_review: "Start a review before creating an offer",
  no_offer_draft: "Create an offer draft first",
  offer_not_ready: "Add event details or send a message before creating an offer",
  offer_not_sent: "Send the offer to the client first",
  offer_already_sent: "Offer has already been sent — withdraw to edit",
  offer_approved: "Offer has been approved and cannot be edited",
  withdraw_first: "Withdraw the current offer before creating a new one",
  awaiting_client_response: "Waiting for the client to respond to the offer",
  missing_approvals: "Waiting for {count} approval(s): {names}",
  roster_locked_offer_sent: "Withdraw the offer before changing the roster",
  details_locked_offer_sent: "Withdraw the offer before editing event details",
  locked_status: "This inquiry is {status}",
  deal_locked_approved: "This deal is approved — close and reopen to change terms",
  close_requires_reason: "Select a reason for closing this inquiry",
  permission_denied: "You do not have permission for this action",
} as const;

export type DisabledReasonCode = keyof typeof DISABLED_REASONS;

export function interpolateDisabledReason(
  code: DisabledReasonCode,
  vars: { count?: number; names?: string; status?: string } = {},
): string {
  let s = DISABLED_REASONS[code] as string;
  if (vars.count != null) s = s.replace("{count}", String(vars.count));
  if (vars.names != null) s = s.replace("{names}", vars.names);
  if (vars.status != null) s = s.replace("{status}", vars.status);
  return s;
}

const ROLE_ACTION_MATRIX: Record<string, Set<EffectiveWorkspaceRole>> = {
  start_review: new Set(["admin", "coordinator"]),
  send_message: new Set(["admin", "coordinator", "client", "talent"]),
  create_offer: new Set(["admin", "coordinator"]),
  edit_offer: new Set(["admin", "coordinator"]),
  send_offer: new Set(["admin", "coordinator"]),
  withdraw_offer: new Set(["admin", "coordinator"]),
  approve: new Set(["client", "talent"]),
  convert_to_booking: new Set(["admin"]),
  reassign: new Set(["admin"]),
  close: new Set(["admin", "coordinator"]),
  reopen: new Set(["admin"]),
  duplicate: new Set(["admin"]),
  add_talent: new Set(["admin", "coordinator"]),
  remove_talent: new Set(["admin", "coordinator"]),
};

export const ENGINE_ACTION_KEYS = [
  "start_review",
  "send_message",
  "create_offer",
  "edit_offer",
  "send_offer",
  "withdraw_offer",
  "approve",
  "convert_to_booking",
  "reassign",
  "close",
  "reopen",
  "duplicate",
  "add_talent",
  "remove_talent",
] as const;

export type EngineActionKey = (typeof ENGINE_ACTION_KEYS)[number];

export function roleMayPerform(action: string, role: EffectiveWorkspaceRole): boolean {
  const set = ROLE_ACTION_MATRIX[action];
  if (!set) return false;
  return set.has(role);
}

export type StatusOfferGateContext = {
  hasOffer: boolean;
  offerStatus: string | null;
  isOfferReady: boolean;
  allApprovalsAccepted: boolean;
};

type GateResult = { ok: boolean; reason?: DisabledReasonCode };

function deny(reason: DisabledReasonCode): GateResult {
  return { ok: false, reason };
}

function allow(): GateResult {
  return { ok: true };
}

export type WorkspaceTabPresence = "active" | "empty_state";

export type WorkspaceMessagingMode = "full" | "read_only" | "booked_followup" | "none";

export type WorkspaceStateMatrixRow = {
  /** When true, generic mutation affordances should be suppressed (except status-specific carve-outs). */
  lockedForMutations: boolean;
  messaging: WorkspaceMessagingMode;
  tabs: Record<InquiryTab, WorkspaceTabPresence>;
};

const TAB_ALL_ACTIVE: Record<InquiryTab, WorkspaceTabPresence> = {
  messages: "active",
  offer: "active",
  approvals: "active",
  history: "active",
  details: "active",
};

/** Full matrix: every {@link WorkspaceStatus} has UI + workflow metadata (SC workspace spec). */
export const WORKSPACE_STATE_MATRIX: Record<WorkspaceStatus, WorkspaceStateMatrixRow> = {
  draft: {
    lockedForMutations: false,
    messaging: "full",
    tabs: { messages: "active", offer: "empty_state", approvals: "empty_state", history: "active", details: "active" },
  },
  submitted: {
    lockedForMutations: false,
    messaging: "full",
    tabs: { messages: "active", offer: "empty_state", approvals: "empty_state", history: "active", details: "active" },
  },
  reviewing: {
    lockedForMutations: false,
    messaging: "full",
    tabs: TAB_ALL_ACTIVE,
  },
  coordination: {
    lockedForMutations: false,
    messaging: "full",
    tabs: TAB_ALL_ACTIVE,
  },
  offer_pending: {
    lockedForMutations: false,
    messaging: "read_only",
    tabs: { messages: "active", offer: "active", approvals: "active", history: "active", details: "active" },
  },
  approved: {
    lockedForMutations: false,
    messaging: "read_only",
    tabs: { messages: "active", offer: "active", approvals: "active", history: "active", details: "active" },
  },
  booked: {
    lockedForMutations: true,
    messaging: "booked_followup",
    tabs: { messages: "active", offer: "active", approvals: "active", history: "active", details: "active" },
  },
  rejected: {
    lockedForMutations: true,
    messaging: "none",
    tabs: { messages: "active", offer: "empty_state", approvals: "empty_state", history: "active", details: "active" },
  },
  expired: {
    lockedForMutations: true,
    messaging: "none",
    tabs: { messages: "active", offer: "empty_state", approvals: "empty_state", history: "active", details: "active" },
  },
  closed_lost: {
    lockedForMutations: true,
    messaging: "none",
    tabs: { messages: "active", offer: "empty_state", approvals: "empty_state", history: "active", details: "active" },
  },
  archived: {
    lockedForMutations: true,
    messaging: "none",
    tabs: { messages: "active", offer: "empty_state", approvals: "empty_state", history: "active", details: "active" },
  },
};

/** Exhaustive: every engine action is classified for every workspace status. */
export function statusAllowsAction(
  status: WorkspaceStatus,
  action: string,
  ctx: StatusOfferGateContext,
): GateResult {
  const row = WORKSPACE_STATE_MATRIX[status];
  if (!row) return allow();

  if (status === "archived") {
    return deny("locked_status");
  }

  if (status === "booked") {
    if (action === "send_message") return allow();
    if (action === "convert_to_booking") return deny("locked_status");
    return deny("locked_status");
  }

  if (status === "rejected" || status === "expired" || status === "closed_lost") {
    if (action === "reopen" || action === "duplicate") return allow();
    return deny("locked_status");
  }

  if (status === "approved") {
    if (action === "convert_to_booking" && !ctx.allApprovalsAccepted) {
      return deny("missing_approvals");
    }
    if (["send_message", "convert_to_booking", "reassign", "close"].includes(action)) return allow();
    if (["edit_offer", "create_offer", "withdraw_offer", "send_offer", "add_talent", "remove_talent"].includes(action)) {
      return deny("deal_locked_approved");
    }
    return allow();
  }

  if (status === "offer_pending") {
    if (["send_message", "reassign", "close"].includes(action)) return allow();
    if (["edit_offer", "create_offer", "add_talent", "remove_talent"].includes(action)) {
      return deny(action.includes("talent") ? "roster_locked_offer_sent" : "offer_already_sent");
    }
    return allow();
  }

  if (status === "submitted") {
    if (action === "create_offer") return deny("not_in_review");
    return allow();
  }

  if (status === "reviewing" || status === "coordination") {
    if (action === "create_offer" && !ctx.isOfferReady) return deny("offer_not_ready");
    if (action === "send_offer" && (!ctx.hasOffer || ctx.offerStatus !== "draft")) {
      return deny("no_offer_draft");
    }
    return allow();
  }

  if (status === "draft") {
    if (action === "create_offer") return deny("not_in_review");
    return allow();
  }

  return allow();
}

/** Validates {@link WORKSPACE_STATE_MATRIX} keys match {@link WORKSPACE_STATUSES} at module load. */
function assertMatrixComplete(): void {
  const keys = new Set(Object.keys(WORKSPACE_STATE_MATRIX));
  for (const s of WORKSPACE_STATUSES) {
    if (!keys.has(s)) throw new Error(`WORKSPACE_STATE_MATRIX missing status: ${s}`);
  }
}
assertMatrixComplete();

/**
 * Single source for header + sticky primary CTA (uses permissions from {@link getWorkspacePermissions}).
 */
function resolveBookedPrimaryHref(input: WorkspaceStateInput, linkedBookingId: string): string | undefined {
  if (input.bookingViewHref === null) return undefined;
  if (typeof input.bookingViewHref === "string" && input.bookingViewHref.trim().length > 0) {
    return input.bookingViewHref.trim();
  }
  if (input.effectiveRole === "client") {
    return `/client/bookings/${linkedBookingId}`;
  }
  if (input.effectiveRole === "talent") {
    return undefined;
  }
  return `/admin/bookings/${linkedBookingId}`;
}

export function resolvePrimaryActionFromMatrix(
  input: WorkspaceStateInput,
  perms: WorkspacePermissions,
): PrimaryAction {
  const { status, isLocked, hasLinkedBooking, linkedBookingId, pendingApprovalCount } = input;

  if (status === "booked" && hasLinkedBooking && linkedBookingId) {
    const href = resolveBookedPrimaryHref(input, linkedBookingId);
    if (!href) {
      return {
        key: "booking_confirmed",
        label: "Booking confirmed",
        variant: "gold",
        disabled: false,
      };
    }
    return {
      key: "view_booking",
      label: "View booking",
      variant: "gold",
      disabled: false,
      href,
    };
  }

  if (["rejected", "expired", "closed_lost"].includes(status) && perms.canReopen) {
    return { key: "reopen", label: "Reopen inquiry", variant: "gold", disabled: false };
  }

  if (status === "archived") {
    return { key: "unarchive", label: "Unarchive", variant: "gold", disabled: !perms.canReopen };
  }

  if (status === "approved") {
    if (perms.canConvertToBooking) {
      return {
        key: "convert_booking",
        label: "Convert to booking",
        variant: "gold",
        disabled: false,
      };
    }
    if (input.effectiveRole === "admin" || input.effectiveRole === "coordinator") {
      return {
        key: "convert_booking",
        label: "Convert to booking",
        variant: "gold",
        disabled: true,
        disabledReason: interpolateDisabledReason("missing_approvals", {
          count: pendingApprovalCount,
          names: "",
        }),
      };
    }
    return {
      key: "awaiting_booking",
      label: "Awaiting final booking",
      variant: "gold",
      disabled: true,
      disabledReason:
        input.effectiveRole === "talent"
          ? "The agency will finalize the booking after all confirmations."
          : "The agency will convert this inquiry once everything is ready.",
    };
  }

  if (status === "offer_pending") {
    if (
      perms.canApprove &&
      (input.effectiveRole === "client" || input.effectiveRole === "talent") &&
      typeof input.workspaceDetailPath === "string" &&
      input.workspaceDetailPath.length > 0
    ) {
      const href =
        input.effectiveRole === "client"
          ? `${input.workspaceDetailPath}?tab=offer`
          : `${input.workspaceDetailPath}#talent-approval`;
      return {
        key: "review_offer",
        label: input.effectiveRole === "client" ? "Review offer" : "Respond to offer",
        variant: "gold",
        disabled: false,
        href,
      };
    }
    return {
      key: "awaiting",
      label: "Awaiting response",
      variant: "gold",
      disabled: true,
      disabledReason: interpolateDisabledReason("awaiting_client_response"),
    };
  }

  if (status === "coordination" && input.hasOffer && input.offerStatus === "draft") {
    return {
      key: "send_offer",
      label: "Send offer",
      variant: "gold",
      disabled: !perms.canSendOffer,
    };
  }

  if ((status === "reviewing" || status === "coordination") && input.isOfferReady && perms.canCreateOffer) {
    return {
      key: "create_offer",
      label: "Create offer",
      variant: "gold",
      disabled: false,
    };
  }

  if (status === "submitted" && perms.canSendMessage && roleMayPerform("start_review", input.effectiveRole)) {
    return { key: "start_review", label: "Start review", variant: "gold", disabled: false };
  }

  // Client on submitted: offer a message CTA since they can communicate with the agency.
  if (status === "submitted" && input.effectiveRole === "client" && perms.canSendMessage) {
    return { key: "send_message", label: "Send message", variant: "gold", disabled: false };
  }

  // Talent / other roles on submitted: nothing actionable yet, wait for review.
  if (status === "submitted") {
    return { key: "awaiting", label: "Awaiting review", variant: "default", disabled: true };
  }

  if (status === "reviewing" || status === "coordination") {
    return { key: "send_message", label: "Send message", variant: "gold", disabled: !perms.canSendMessage };
  }

  if (isLocked) {
    return {
      key: "locked",
      label: "View",
      variant: "default",
      disabled: true,
      disabledReason: interpolateDisabledReason("locked_status", { status }),
    };
  }

  return { key: "default", label: "Continue", variant: "default", disabled: false };
}
