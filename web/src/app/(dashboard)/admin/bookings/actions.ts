// Phase 4 migration shim — canonical lives at @/lib/server-actions/admin-bookings.
// This file exists only so any remaining internal (dashboard)/ imports keep
// working until the rest of the legacy route group is deleted.
export {
  type BookingActionState,
  convertInquiryToBooking,
  updateBooking,
  quickUpdateBookingPeek,
  assignBookingToCurrentStaff,
  assignBookingToCurrentStaffForm,
  patchBookingEntityLinks,
  saveBookingTalentRow,
  addBookingTalentRow,
  deleteBookingTalentRow,
  createManualBooking,
  duplicateBooking,
} from "@/lib/server-actions/admin-bookings";
