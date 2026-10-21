import type { CapabilityKey } from "@/lib/access";

/**
 * TUL-1708 (area C — inquiries, pipeline & call sheets): the capability each
 * WRITE in this area requires. `requireWorkspaceStaffAction()` / the local
 * `staff()` alias default to `agency.workspace.view`, which the `viewer`
 * role holds — so without an explicit capability a viewer could coordinate
 * inquiries, convert bookings, cancel bookings, and edit client records.
 * Reads keep the default; every writer in these files passes one of these
 * (see `write-capabilities.ts` in `@/lib/messaging` for the sibling map on
 * the messaging surface — this is the same pattern for pipeline/inquiry
 * admin actions, call sheets and reservations).
 *
 * `coordinate_inquiry`, `convert_to_booking`, `cancel_inquiry`,
 * `create_inquiry`, `edit_client_relationship`, `booking.payment.request`
 * and `manage_agency_settings` are all existing capabilities (see
 * `@/lib/access/capabilities.ts` + `roles.ts`) — no new capability was
 * invented for this sweep.
 */
export const PIPELINE_WRITE_CAPABILITY = {
  // ─── Inquiry coordination (manager+) ───────────────────────────────────
  rescheduleInquiry: "coordinate_inquiry",
  setInquiryUserFlag: "coordinate_inquiry",
  bulkNudgeInquiries: "coordinate_inquiry",
  bulkReassignInquiriesToMe: "coordinate_inquiry",
  bulkSetInquiryArchived: "coordinate_inquiry",
  rescheduleBookingAction: "coordinate_inquiry",
  closeBookingAction: "coordinate_inquiry",
  updateInquiry: "coordinate_inquiry",
  updateInquiryClientInfo: "coordinate_inquiry",
  updateInquiryLocation: "coordinate_inquiry",
  updateInquiryRequestDetails: "coordinate_inquiry",
  patchInquiryEntityLinks: "coordinate_inquiry",
  assignInquiryToCurrentStaff: "coordinate_inquiry",
  quickPatchInquiryStatus: "coordinate_inquiry",
  sendInquiryMessageAsAdmin: "coordinate_inquiry",
  uploadInquiryAttachment: "coordinate_inquiry",
  deleteInquiryAttachment: "coordinate_inquiry",
  inquiryAttachmentSignedScope: "coordinate_inquiry",
  editOrDeleteInquiryMessage: "coordinate_inquiry",
  rosterMoveParticipant: "coordinate_inquiry",
  updateCallSheet: "coordinate_inquiry",
  callSheetSaveClear: "coordinate_inquiry",
  proposeReservationTime: "coordinate_inquiry",

  // ─── Create a new inquiry (manager+, same bar as coordinate) ──────────
  createAgencyInquiry: "create_inquiry",
  createManualInquiry: "create_inquiry",
  duplicateInquiry: "create_inquiry",

  // ─── Convert an inquiry's lineup into a confirmed booking (manager+) ──
  createBooking: "convert_to_booking",
  duplicateInquiryBooking: "convert_to_booking",

  // ─── Cancel a booking (manager+, same bar as cancelling an inquiry) ───
  cancelBookingAction: "cancel_inquiry",

  // ─── Client-account record edits (editor+, lower bar: client, not inquiry) ──
  createClientAccount: "edit_client_relationship",
  createClientAccountContact: "edit_client_relationship",
  updateClientLocation: "edit_client_relationship",

  // ─── Payment-rail config on a booking (manager+, same bar as requesting payment) ──
  markBookingPaymentMethodAction: "booking.payment.request",

  // ─── Workspace-level settings / commercial terms (admin+) ─────────────
  patchAgencySettingsNamespace: "manage_agency_settings",
  requestPlatformRateOverrideAction: "manage_agency_settings",
} as const satisfies Record<string, CapabilityKey>;

export type PipelineWriteAction = keyof typeof PIPELINE_WRITE_CAPABILITY;
