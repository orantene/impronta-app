"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers.tsx — Phase 1d THIN BARREL
// (remediation-plan-2026-05-19 §4 · WS-13.2 third-biggest god-file).
//
// The 6,204-LOC monolith was decomposed into ./talent-drawers/* (byte-
// for-byte bodies):
//   • shared.tsx              — cross-cutting helpers used in 2+ chunks
//   • today.tsx               — Today / Offer / Booking detail
//   • closed-booking.tsx      — Closed booking archive / Earnings detail
//   • events.tsx              — Hub detail + Add event (work / block forms)
//   • availability.tsx        — Profile section / Availability / Block / Portfolio
//   • agency.tsx              — Agency relationship / Leave / Privacy / Contact prefs
//   • monetization.tsx        — Payouts / Verification / Referrals / Hub-compare / Tax / Conflict
//   • network.tsx             — Network / Voice reply / Multi-agency / Reply templates / Chat archive
//   • analytics.tsx           — Career / Receive review / Agency analytics
//   • profile-essentials.tsx  — Photo / Polaroids / Credits / Skills / Limits / Rate / Travel
//   • profile-extras.tsx      — Links / Reviews / Showreel / Measurements / Documents / Emergency / Public preview
//   • premium-pages.tsx       — Tier compare / Personal page / Template / Embeds / Press / Media kit / Custom domain
//
// This file is now a pure re-export barrel so every historical importer
// keeps working untouched (drawers.tsx, drawer-shared.tsx, et al.).
// No behavior change. See remediation-plan §4 Phase 1d.
// ════════════════════════════════════════════════════════════════════

export {
  TalentTodayPulseDrawer,
  TalentOfferDetailDrawer,
  TalentBookingDetailDrawer,
} from "./talent-drawers/today";

export {
  TalentClosedBookingDrawer,
  TalentEarningsDetailDrawer,
} from "./talent-drawers/closed-booking";

export {
  TalentHubDetailDrawer,
  TalentAddEventDrawer,
} from "./talent-drawers/events";

export {
  TalentProfileSectionDrawer,
  TalentAvailabilityDrawer,
  TalentBlockDatesDrawer,
  TalentPortfolioDrawer,
} from "./talent-drawers/availability";

export {
  TalentAgencyRelationshipDrawer,
  TalentLeaveAgencyDrawer,
  TalentPrivacyDrawer,
  TalentContactPreferencesDrawer,
} from "./talent-drawers/agency";

export {
  TalentPayoutsDrawer,
  TalentVerificationDrawer,
  TalentReferralsDrawer,
  TalentHubCompareDrawer,
  TalentTaxDocsDrawer,
  TalentConflictResolveDrawer,
} from "./talent-drawers/monetization";

export {
  TalentNetworkDrawer,
  TalentVoiceReplyDrawer,
  TalentMultiAgencyPickerDrawer,
  ReplyTemplatesDrawer,
  TalentChatArchiveDrawer,
} from "./talent-drawers/network";

export {
  TalentCareerAnalyticsDrawer,
  TalentReceiveReviewDrawer,
  TalentAgencyAnalyticsDrawer,
} from "./talent-drawers/analytics";

export {
  TalentPhotoEditDrawer,
  TalentPolaroidsDrawer,
  TalentCreditsDrawer,
  TalentSkillsDrawer,
  TalentLimitsDrawer,
  TalentRateCardDrawer,
  TalentTravelDrawer,
} from "./talent-drawers/profile-essentials";

export {
  TalentLinksDrawer,
  TalentReviewsDrawer,
  TalentShowreelDrawer,
  TalentMeasurementsDrawer,
  TalentDocumentsDrawer,
  TalentEmergencyContactDrawer,
  TalentPublicPreviewDrawer,
} from "./talent-drawers/profile-extras";

export {
  TalentTierCompareDrawer,
  TalentPersonalPageDrawer,
  TalentPageTemplateDrawer,
  TalentMediaEmbedsDrawer,
  TalentPressDrawer,
  TalentMediaKitDrawer,
  TalentCustomDomainDrawer,
} from "./talent-drawers/premium-pages";
