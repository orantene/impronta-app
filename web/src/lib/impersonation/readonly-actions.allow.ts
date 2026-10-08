/**
 * TUL-256. Allow-list entries for the read-only impersonation guard that live
 * outside the portal route trees (batch 1: shared messaging, onboarding,
 * talent self-service and agenda modules). Every entry is a pure loader.
 */
export const READ = "pure loader: reads only, no write path, nothing for read-only mode to protect";

export type AllowEntry = [suffix: string, names: string[], reason: string];

export const EXTRA_ALLOW: AllowEntry[] = [
  ["lib/reviews/review-actions.ts", ["loadReviewableBookingsAction", "loadClientReviewablesAction"], READ],
  ["lib/server-actions/messaging-engine.ts", ["staff", "messagingLoadInbox", "messagingResolveOrderThread", "messagingLoadThread", "messagingLoadEssentials", "loadConversationHistory", "messagingResolve", "messagingRelinkImpact", "messagingSearch"], READ],
  ["lib/server-actions/messaging-identity.ts", ["messagingMatchCustomers"], READ],
  ["lib/server-actions/messaging-items.ts", ["messagingLoadItemsCatalog", "messagingLoadPersonSlots"], READ],
  ["lib/server-actions/messaging-money-actions.ts", ["messagingPreviewCancel", "messagingLoadRefundableTransaction", "messagingCanReadNotes"], READ],
  ["lib/server-actions/messaging-offers.ts", ["messagingLoadOfferForEditor", "messagingListOffers"], READ],
  ["lib/server-actions/messaging-sheets.ts", ["messagingLoadHandOverTargets", "messagingLoadDelivery", "messagingLoadSnapshots", "messagingLoadOffers", "messagingLoadBasketDiff", "messagingLoadContextLines"], READ],
  ["lib/server-actions/messaging-talent.ts", ["messagingTalentLoadInbox", "messagingTalentLoadThread", "messagingTalentLoadEssentials", "messagingTalentLoadContextLines"], READ],
  ["lib/server-actions/onboarding-lookups.ts", ["searchOnboardingTypes", "searchOnboardingCities"], READ],
  ["lib/server-actions/onboarding-module.ts", ["loadOnboardingResume", "loadOnboardingCard", "getOnboardingBuildStatus"], READ],
  ["lib/server-actions/onboarding-setup.ts", ["loadOnboardingSetup"], READ],
  ["lib/server-actions/talent-self-profile-sections.ts", ["getTalentProfileEditorDataForSelf", "getTalentProfileDynFieldValuesForSelf"], READ],
  ["lib/server-actions/talent-self-services.ts", ["getResolvedSkillsAsTalent", "getAspirationsAsTalent", "getEnabledParentCategoriesForPickerAsTalent", "getTalentTypesUnderParentAsTalent", "getResolvedContextsAsTalent", "getContextCatalogAsTalent"], READ],
  ["lib/server-actions/talent-self.ts", ["loadCurrentTalentPayoutSnapshot", "loadMyInquiryTakeHome", "loadTalentPreferredLanguage", "loadTalentLanguages"], READ],
  ["lib/server-actions/user-prefs.ts", ["loadUserPrefs", "getNotificationPrefs"], READ],
  ["lib/talent-agenda/booking-actions.ts", ["requireOwnBooking"], READ],
  ["lib/talent-agenda/load-record-item.ts", ["loadTalentAgendaRecordItem", "loadTalentTimelessBookingStub"], READ],
  ["lib/talent-site/history/history-actions.ts", ["loadTalentHistoryAction", "loadTalentGoLiveAction"], READ],
  ["lib/talent-site/server/actions.ts", ["fetchTalentPersonalSiteDashboardStateAction"], READ],
  ["lib/talent-site/server/site-management-actions.ts", ["loadMaxSiteManagerAction"], READ],
  ["lib/talent/apply-actions.ts", ["listOwnApplications"], READ],
  ["lib/talent/clients-actions.ts", ["loadTalentClients"], READ],
  ["lib/talent/menu-offerings-actions.ts", ["loadWorkspaceMenuForEditor"], READ],
  ["lib/talent/offerings-actions.ts", ["loadTalentOfferingsForEditor", "listTalentPortfolioPhotos"], READ],
  ["lib/talent/services-menu-actions.ts", ["loadTalentServicesMenu", "loadTalentServicePerformance"], READ],
  ["lib/talent/talent-booking-terms-actions.ts", ["loadTalentBookingTerms"], READ],
];
