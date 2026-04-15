/**
 * Inquiry workspace V2 — single data contract (SC-1, SC-15).
 * Raw DB inquiry.status is normalized to WorkspaceStatus in page.tsx only.
 */

export const WORKSPACE_STATUSES = [
  "draft",
  "submitted",
  "reviewing",
  "coordination",
  "offer_pending",
  "approved",
  "booked",
  "rejected",
  "expired",
  "closed_lost",
  "archived",
] as const;

export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

export type EffectiveWorkspaceRole = "admin" | "coordinator" | "client" | "talent";

export const VALID_INQUIRY_TABS = ["messages", "offer", "approvals", "history", "details"] as const;
export type InquiryTab = (typeof VALID_INQUIRY_TABS)[number];

export type OfferStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "superseded"
  | "invalidated";

export type WorkspacePermissions = {
  canSendMessage: boolean;
  canCreateOffer: boolean;
  canSendOffer: boolean;
  canEditOffer: boolean;
  canWithdrawOffer: boolean;
  canApprove: boolean;
  canConvertToBooking: boolean;
  canReassign: boolean;
  canClose: boolean;
  canReopen: boolean;
  canDuplicate: boolean;
  canAddTalent: boolean;
  canRemoveTalent: boolean;
  canSeePricing: boolean;
  canSeeMargins: boolean;
  canSeeOtherApprovals: boolean;
  canSeePrivateThread: boolean;
  canSeeGroupThread: boolean;
  canSeeStaffNotes: boolean;
  canSeeActivityLog: boolean;
};

export type PrimaryAction = {
  key: string;
  label: string;
  variant: "default" | "gold" | "link";
  disabled: boolean;
  disabledReason?: string;
  href?: string;
};

export type InquiryWorkspaceInquiry = {
  id: string;
  status: WorkspaceStatus;
  rawStatus: string;
  version: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  company: string | null;
  event_location: string | null;
  event_date: string | null;
  message: string | null;
  raw_ai_query: string | null;
  source_channel: string | null;
  staff_notes: string | null;
  assigned_staff_id: string | null;
  coordinator_id: string | null;
  next_action_by: string | null;
  current_offer_id: string | null;
  booked_at: string | null;
  uses_new_engine: boolean;
  created_at: string;
  updated_at: string;
  client_user_id: string | null;
  client_account_id: string | null;
  client_contact_id: string | null;
  closed_reason: string | null;
  priority?: string | null;
};

export type InquiryWorkspaceMessage = {
  id: string;
  thread_type: "private" | "group";
  body: string;
  created_at: string;
  sender_user_id: string | null;
  sender_name: string | null;
  sender_avatar_url: string | null;
  metadata: Record<string, unknown>;
};

export type InquiryWorkspaceOffer = {
  id: string;
  version: number;
  status: OfferStatus;
  total_client_price: number;
  coordinator_fee: number;
  currency_code: string;
  notes: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InquiryWorkspaceOfferLine = {
  talent_profile_id: string | null;
  label: string | null;
  pricing_unit: string;
  units: number;
  unit_price: number;
  total_price: number;
  talent_cost: number;
  notes: string | null;
  sort_order: number;
};

export type InquiryWorkspaceApproval = {
  id: string;
  status: string;
  participant_id: string;
  offer_id: string | null;
};

export type InquiryWorkspaceRosterEntry = {
  id: string;
  talent_profile_id: string;
  sort_order: number;
  profile_code: string;
  display_name: string | null;
  image_url: string | null;
  tag_label: string | null;
  status: string;
};

export type InquiryWorkspaceActivity = {
  id: string;
  created_at: string;
  event_type: string;
  payload: unknown;
  actor_user_id: string | null;
  actor_type?: "user" | "system";
};

export type InquiryWorkspaceBooking = {
  id: string;
  title: string;
  status: string;
  starts_at: string | null;
};

export type InquiryWorkspaceData = {
  inquiry: InquiryWorkspaceInquiry;
  roster: InquiryWorkspaceRosterEntry[];
  offer: InquiryWorkspaceOffer | null;
  offerLines: InquiryWorkspaceOfferLine[];
  approvals: InquiryWorkspaceApproval[];
  messagesPrivate: InquiryWorkspaceMessage[];
  messagesGroup: InquiryWorkspaceMessage[];
  bookings: InquiryWorkspaceBooking[];
  activity: InquiryWorkspaceActivity[];
  client: {
    accountName: string | null;
    contactName: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  staffLabel: string;
  unreadPrivate: boolean;
  unreadGroup: boolean;
  permissions: WorkspacePermissions;
  primaryAction: PrimaryAction;
  activeTab: InquiryTab;
  isLocked: boolean;
  viewerUserId: string;
  effectiveRole: EffectiveWorkspaceRole;
};

export type MessagesTabProps = Pick<
  InquiryWorkspaceData,
  "inquiry" | "messagesPrivate" | "messagesGroup" | "permissions" | "isLocked" | "effectiveRole"
> & { unreadPrivate: boolean; unreadGroup: boolean };

export type OfferTabProps = Pick<
  InquiryWorkspaceData,
  "inquiry" | "offer" | "offerLines" | "roster" | "permissions" | "isLocked"
>;

export type ApprovalsTabProps = Pick<
  InquiryWorkspaceData,
  "inquiry" | "approvals" | "offer" | "permissions" | "isLocked"
>;

export type HistoryTabProps = Pick<InquiryWorkspaceData, "inquiry" | "activity" | "bookings">;

export type SidebarProps = Pick<InquiryWorkspaceData, "inquiry" | "client" | "roster">;

export type ActionBarProps = Pick<
  InquiryWorkspaceData,
  "inquiry" | "primaryAction" | "permissions" | "isLocked" | "bookings"
>;

/** Shared input for getPrimaryAction + getWorkspacePermissions (SC-3). */
export type WorkspaceStateInput = {
  status: WorkspaceStatus;
  effectiveRole: EffectiveWorkspaceRole;
  userId: string;
  hasMessages: boolean;
  hasOffer: boolean;
  offerStatus: OfferStatus | null;
  allApprovalsAccepted: boolean;
  pendingApprovalCount: number;
  isOfferReady: boolean;
  hasLinkedBooking: boolean;
  linkedBookingId: string | null;
  isLocked: boolean;
  /**
   * Optional override for primary "View booking" href when `booked`.
   * `null` = no link (informational CTA only). Omit to derive from {@link WorkspaceStateInput.effectiveRole}.
   */
  bookingViewHref?: string | null;
  /**
   * Dashboard path for this inquiry (no query string), e.g. `/client/inquiries/{id}`.
   * Used for role-specific primary links (e.g. client "Review offer" → `?tab=offer`).
   */
  workspaceDetailPath?: string | null;
};
