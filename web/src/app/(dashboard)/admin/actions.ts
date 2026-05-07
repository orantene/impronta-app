// Phase 4 migration shim — canonical lives at @/lib/server-actions/admin-inquiries.
// This file exists only so any remaining internal (dashboard)/ imports keep
// working until the rest of the legacy route group is deleted.
export {
  type AdminActionState,
  updateInquiry,
  updateInquiryClientInfo,
  updateInquiryLocation,
  updateInquiryRequestDetails,
  addInquiryTalent,
  removeInquiryTalent,
  moveInquiryTalent,
  patchInquiryEntityLinks,
  createBooking,
  createClientAccount,
  updateClientLocation,
  createClientAccountContact,
  assignInquiryToCurrentStaff,
  createManualInquiry,
  assignInquiryToCurrentStaffForm,
  quickPatchInquiryStatus,
  duplicateInquiry,
} from "@/lib/server-actions/admin-inquiries";
