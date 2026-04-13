/**
 * Commercial audit `event_type` values (booking_activity_log + inquiry_activity_log).
 * Keep payloads small and JSON-serializable; prefer IDs over PII.
 */
export const BOOKING_AUDIT = {
  CREATED_MANUAL: "booking.created_manual",
  DUPLICATED: "booking.duplicated",
  CONVERTED_FROM_INQUIRY: "booking.converted_from_inquiry",
  LINEUP_ATTACHED_FROM_INQUIRY: "booking.lineup_attached_from_inquiry",
  CREATED_FROM_INQUIRY_QUICK: "booking.created_from_inquiry_quick",
  CLIENT_ACCOUNT_CHANGED: "booking.client_account_changed",
  CLIENT_CONTACT_CHANGED: "booking.client_contact_changed",
  MANAGER_CHANGED: "booking.manager_changed",
  STATUS_CHANGED: "booking.status_changed",
  PAYMENT_STATE_CHANGED: "booking.payment_state_changed",
  TALENT_ROW_SAVED: "booking.talent_row_saved",
  TALENT_ROW_ADDED: "booking.talent_row_added",
  TALENT_ROW_REMOVED: "booking.talent_row_removed",
  CLIENT_PORTAL_VISIBILITY_CHANGED: "booking.client_portal_visibility_changed",
} as const;

export const INQUIRY_AUDIT = {
  CREATED_MANUAL: "inquiry.created_manual",
  DUPLICATED: "inquiry.duplicated",
  CONVERTED_TO_BOOKING: "inquiry.converted_to_booking",
  LINEUP_ADDED_TO_BOOKING: "inquiry.lineup_added_to_booking",
  CLIENT_ACCOUNT_CHANGED: "inquiry.client_account_changed",
  CLIENT_CONTACT_CHANGED: "inquiry.client_contact_changed",
  STATUS_CHANGED: "inquiry.status_changed",
} as const;
