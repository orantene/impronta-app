import type { CapabilityKey } from "@/lib/access";

/**
 * TUL-1708 (area C — inquiries, pipeline & call sheets): the capability each
 * WRITE in this area requires. `requireWorkspaceStaffAction()` / the local
 * `staff()` alias — and, as of the P1 follow-up below, the staff fast-path
 * inside `requireInquiryManagerAction()` — default to `agency.workspace.view`,
 * which the `viewer` role holds — so without an explicit capability a viewer
 * could coordinate inquiries, convert bookings, cancel bookings, and edit
 * client records. Reads keep the default; every writer in these files passes
 * one of these (see `write-capabilities.ts` in `@/lib/messaging` for the
 * sibling map on the messaging surface — this is the same pattern for
 * pipeline/inquiry admin actions, call sheets and reservations).
 *
 * Re-keyed 2026-10-21 to the PM's final role scope:
 *   EDITOR   = content/site/CMS, roster, talent profiles, client records,
 *              menu, operate_venue, AND inquiry detail edits + messages
 *              (read/reply)                           → `edit_client_relationship`
 *   MANAGER  = deals and money in motion: create/convert/cancel bookings,
 *              offers, payment requests, coordinators → `create_inquiry`,
 *              `convert_to_booking`, `cancel_inquiry`, `send_client_offer`,
 *              `booking.payment.request`, `coordinate_inquiry`
 *   ADMIN    = workspace configuration                → `manage_agency_settings`
 *              and the narrower `agency.site_admin.*` / `manage_storefront_settings`
 *              / `booking.payment.*` keys (see `patchAgencySettingsNamespace`
 *              below, which gates PER NAMESPACE rather than one flat key)
 *   OWNER    = domains, billing, payouts               → `manage_agency_domains`
 *
 * A detail edit (contact info, location, call-sheet, attachment, pin /
 * archive / reassign / nudge / reschedule, message edit) sits at the EDITOR
 * bar even when the surface is staff-only today — it does not create,
 * convert, or cancel anything, and does not move money. Creating, converting,
 * cancelling, sending an offer, requesting payment, and assigning/reassigning
 * a COORDINATOR (not just "assigned staff") stay at MANAGER.
 *
 * No new capability was invented for this sweep — every value below is an
 * existing key in `@/lib/access/capabilities.ts` + `roles.ts`.
 */
export const PIPELINE_WRITE_CAPABILITY = {
  // ─── Inquiry DETAIL edits (editor+: contact info, location, links, flags,
  // reschedule, attachments, call sheets, message edits — no create/convert/
  // cancel, no money) ──────────────────────────────────────────────────────
  rescheduleInquiry: "edit_client_relationship",
  setInquiryUserFlag: "edit_client_relationship",
  bulkNudgeInquiries: "edit_client_relationship",
  bulkReassignInquiriesToMe: "edit_client_relationship",
  bulkSetInquiryArchived: "edit_client_relationship",
  rescheduleBookingAction: "edit_client_relationship",
  updateInquiry: "edit_client_relationship",
  updateInquiryClientInfo: "edit_client_relationship",
  updateInquiryLocation: "edit_client_relationship",
  updateInquiryRequestDetails: "edit_client_relationship",
  updateInquiryJobFields: "edit_client_relationship",
  updateBookingJobFields: "edit_client_relationship",
  patchInquiryEntityLinks: "edit_client_relationship",
  assignInquiryToCurrentStaff: "edit_client_relationship",
  uploadInquiryAttachment: "edit_client_relationship",
  deleteInquiryAttachment: "edit_client_relationship",
  inquiryAttachmentSignedScope: "edit_client_relationship",
  editOrDeleteInquiryMessage: "edit_client_relationship",
  updateCallSheet: "edit_client_relationship",
  callSheetSaveClear: "edit_client_relationship",

  // ─── Inquiry coordination / lineup / coordinator assignment (manager+) ─
  quickPatchInquiryStatus: "coordinate_inquiry",
  sendInquiryMessageAsAdmin: "coordinate_inquiry",
  rosterMoveParticipant: "coordinate_inquiry",
  rosterAddTalent: "coordinate_inquiry",
  rosterRemoveParticipant: "coordinate_inquiry",
  proposeReservationTime: "coordinate_inquiry",
  submitTalentRate: "coordinate_inquiry",
  counterOfferAction: "coordinate_inquiry",
  approveOfferAction: "coordinate_inquiry",
  acceptOfferForTalentAction: "coordinate_inquiry",
  rejectOfferAction: "coordinate_inquiry",
  reopenOfferAction: "coordinate_inquiry",
  removeInquiryLineupParticipant: "coordinate_inquiry",
  addInquiryLineupTalent: "coordinate_inquiry",
  reorderInquiryLineup: "coordinate_inquiry",
  reassignCoordinatorAction: "coordinate_inquiry",
  addSecondaryCoordinatorAction: "coordinate_inquiry",
  removeSecondaryCoordinatorAction: "coordinate_inquiry",
  promoteToPrimaryCoordinatorAction: "coordinate_inquiry",
  closeBookingAction: "coordinate_inquiry",

  // ─── Create a new inquiry (manager+, same bar as coordinate) ──────────
  createAgencyInquiry: "create_inquiry",
  createManualInquiry: "create_inquiry",
  duplicateInquiry: "create_inquiry",

  // ─── Convert an inquiry's lineup into a confirmed booking (manager+) ──
  convertInquiryToBookingAction: "convert_to_booking",
  createBooking: "convert_to_booking",
  duplicateInquiryBooking: "convert_to_booking",

  // ─── Cancel a booking (manager+, same bar as cancelling an inquiry) ───
  cancelBookingAction: "cancel_inquiry",

  // ─── Client-account record edits (editor+, lower bar: client, not inquiry) ──
  createClientAccount: "edit_client_relationship",
  createClientAccountContact: "edit_client_relationship",
  updateClientLocation: "edit_client_relationship",

  // ─── Booking transactions / payment lifecycle (manager/admin per existing
  // booking.payment.* tiers in roles.ts — unchanged by this sweep) ───────
  markBookingPaymentMethodAction: "booking.payment.request",
  createInquiryTransactionDraft: "booking.payment.request",
  requestInquiryPayment: "booking.payment.request",
  setInquiryPayoutReceiver: "booking.payment.select_receiver",
  markInquiryPaymentReceived: "booking.payment.mark_received",
  markInquiryPaymentPending: "booking.payment.mark_received",
  markInquiryPaymentDisputed: "booking.payment.mark_received",
  markInquiryPaymentFailed: "booking.payment.mark_received",
  markInquiryPaidInCash: "booking.payment.mark_received",
  // TUL-1708: this only voids a payment REQUEST and moves no money (same bar
  // as main's cancelTransactionAction) — not a refund of money already paid.
  cancelInquiryTransaction: "booking.payment.request",
  initiateInquiryPayout: "booking.payment.payout_mark_external",
  markInquiryPayoutSent: "booking.payment.payout_mark_external",

  // ─── Workspace-level commercial terms (admin+) — patchAgencySettingsNamespace
  // gates PER NAMESPACE (see PATCH_AGENCY_SETTINGS_NAMESPACE_CAPABILITY below)
  // and is no longer a single flat key here. ─────────────────────────────
  requestPlatformRateOverrideAction: "manage_agency_settings",
} as const satisfies Record<string, CapabilityKey>;

export type PipelineWriteAction = keyof typeof PIPELINE_WRITE_CAPABILITY;

/**
 * `patchAgencySettingsNamespace` patches one namespace of `agencies.settings`
 * at a time. A single flat capability (the old `manage_agency_settings` for
 * every namespace) over-grants: `navigation` is an EDITOR-tier site-admin
 * edit, `domain` is an OWNER-tier action (same bar as `manage_agency_domains`
 * — domains are OWNER per the PM's final role scope), and the rest
 * (`theme`, `seo`, `languages`, `visibility`, `filters`) sit at ADMIN via the
 * existing `agency.site_admin.design.edit` / `manage_storefront_settings`
 * keys. Each namespace is matched to the narrowest existing capability that
 * already covers it in `@/lib/access/capabilities.ts` — no new capability
 * was invented.
 */
export const PATCH_AGENCY_SETTINGS_NAMESPACE_CAPABILITY = {
  navigation: "agency.site_admin.navigation.edit",
  theme: "agency.site_admin.design.edit",
  seo: "manage_storefront_settings",
  languages: "manage_storefront_settings",
  visibility: "manage_storefront_settings",
  filters: "manage_storefront_settings",
  domain: "manage_agency_domains",
} as const satisfies Record<string, CapabilityKey>;

export type PatchAgencySettingsNamespace = keyof typeof PATCH_AGENCY_SETTINGS_NAMESPACE_CAPABILITY;
