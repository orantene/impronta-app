// Shared plain types for the inquiry waitlist / alternates feature (Deep-plan W9).
//
// Lives in a plain (non-"use server") module so both the engine, loaders, the
// server-action wrappers, and UI agents can import these types. A "use server"
// module may export ONLY async functions — types must live here.

export type InquiryAlternate = {
  id: string;
  inquiryId: string;
  tenantId: string;
  requirementGroupId: string | null;
  talentProfileId: string;
  talentName: string | null;
  rank: number;
  note: string | null;
  createdAt: string;
};

export type GroupShortfall = {
  groupId: string;
  roleKey: string | null;
  quantityRequired: number;
  approvedCount: number;
  shortfall: number;
};
