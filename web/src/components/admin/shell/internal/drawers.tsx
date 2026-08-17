"use client";

// ════════════════════════════════════════════════════════════════════
// drawers.tsx — Phase 1d THIN BARREL (remediation-plan-2026-05-19 §4).
//
// The 31,468-LOC god-file was decomposed into ./drawers/* (byte-for-byte
// bodies): drawer-shared.tsx (external re-export hub + 94 cross-cutting
// helpers), light-01..23.tsx (118 leaf drawer bodies), UpgradeModal.tsx,
// profile-shell/* (TalentProfileShellDrawer + ECO support cast). This
// file keeps ONLY DrawerRoot + DrawerSwitch (byte-for-byte) and re-
// exports the historical public surface so importers stay byte-unbroken.
// No behavior change. See remediation-plan §4 Phase 1d.
// ════════════════════════════════════════════════════════════════════

import { useEffect } from "react";
import { DrawerShell } from "./primitives";
import { useAdminShell, type DrawerId } from "./state";
import { OPEN_DRAWER_EVENT, type OpenDrawerEventDetail } from "./open-drawer-bridge";
import { InquiryWorkspaceDrawer } from "./workspace";
import { InboxSnippetsDrawer, NotificationsPrefsDrawer, DataExportDrawer, AuditLogDrawer, TenantSwitcherDrawer, TalentAgencySwitcherDrawer, WorkspaceProfileDrawer, TalentShareCardDrawer, InquiryTemplatesPicker, DoubleBookingWarning, WhatsNewDrawer, HelpDrawer, TalentNotificationsDrawer, downloadCsv } from "./wave2";
import { TalentTodayPulseDrawer, TalentOfferDetailDrawer, TalentAddEventDrawer, TalentBookingDetailDrawer, TalentClosedBookingDrawer, TalentHubDetailDrawer, TalentProfileSectionDrawer, TalentAvailabilityDrawer, TalentBlockDatesDrawer, TalentPortfolioDrawer, TalentAgencyRelationshipDrawer, TalentLeaveAgencyDrawer, TalentPrivacyDrawer, TalentPayoutsDrawer, TalentContactPreferencesDrawer, TalentEarningsDetailDrawer, TalentPhotoEditDrawer, TalentPolaroidsDrawer, TalentCreditsDrawer, TalentSkillsDrawer, TalentLimitsDrawer, TalentRateCardDrawer, TalentTravelDrawer, TalentLinksDrawer, TalentReviewsDrawer, TalentShowreelDrawer, TalentMeasurementsDrawer, TalentDocumentsDrawer, TalentEmergencyContactDrawer, TalentPublicPreviewDrawer, TalentTierCompareDrawer, TalentPersonalPageDrawer, TalentPageTemplateDrawer, TalentMediaEmbedsDrawer, TalentPressDrawer, TalentMediaKitDrawer, TalentCustomDomainDrawer, TalentConnectionsDrawer, TalentVerificationDrawer, TalentReferralsDrawer, TalentHubCompareDrawer, TalentTaxDocsDrawer, TalentConflictResolveDrawer, TalentNetworkDrawer, TalentVoiceReplyDrawer, TalentMultiAgencyPickerDrawer, TalentChatArchiveDrawer, ReplyTemplatesDrawer, TalentCareerAnalyticsDrawer, TalentReceiveReviewDrawer, TalentAgencyAnalyticsDrawer, RepresentationDrawer } from "./talent-drawers";
import { PlatformTodayPulseDrawer, PlatformTenantDetailDrawer, PlatformTenantImpersonateDrawer, PlatformTenantSuspendDrawer, PlatformTenantPlanOverrideDrawer, PlatformUserDetailDrawer, PlatformUserMergeDrawer, PlatformUserResetDrawer, PlatformHubSubmissionDrawer, PlatformHubRulesDrawer, PlatformBillingInvoiceDrawer, PlatformRefundDrawer, PlatformDunningDrawer, PlatformFeatureFlagDrawer, PlatformModerationItemDrawer, PlatformSystemJobDrawer, PlatformIncidentDrawer, PlatformSupportTicketDrawer, PlatformAuditExportDrawer, PlatformHqTeamDrawer, PlatformRegionConfigDrawer } from "./platform";
import { PaymentDetailDrawer, PaymentsSetupDrawer, PayoutReceiverPickerDrawer } from "./drawers/drawer-shared";
import { TalentProfileShellDrawer, NewTalentDrawer } from "./drawers/profile-shell";
import { ReviewModerationQueue } from "./drawers/profile-shell/profile-shell-modules/review-moderation-queue";
import { MediaReleaseRequestsPanel } from "@/components/admin/media/media-release-requests-panel";
import { TenantSummaryDrawer, SiteSetupDrawer, PlanBillingDrawer } from "./drawers/light-01";
import { TeamDrawer, TalentTypesDrawer } from "./drawers/light-02";
import { TalentRegistrationDrawer } from "./drawers/light-03";
import { TalentApprovalsDrawer, BrandingDrawer, WatermarkEditorDrawer } from "./drawers/light-04";
import { DomainDrawer, IdentityDrawer, WorkspaceSettingsDrawer, TalentProfileDrawer, MyProfileDrawer } from "./drawers/light-05";
import { GuestChatSettingsDrawer } from "./drawers/guest-chat-settings";
import { InquiryPeekDrawer, NewInquiryDrawer, DayDetailDrawer, NewBookingDrawer, ClientProfileDrawer } from "./drawers/light-06";
import { TodayPulseDrawer, PipelineDrawer, PipelineFilterDrawer, NotificationsDrawer, ActivityFeedDrawer, MyActivityDrawer } from "./drawers/light-07";
import { PagesDrawer, PostsDrawer, NavigationDrawer, MediaDrawer, SeoDrawer } from "./drawers/light-08";
import { FieldCatalogDrawer, FieldPrivacyDrawer } from "./drawers/light-10";
import { TrustVerificationQueueDrawer, DisputedClaimsDrawer } from "./drawers/light-11";
import { TalentTrustDetailDrawer, TalentClaimInviteDrawer, PlatformVerificationMethodsDrawer } from "./drawers/light-12";
import { TalentPhoneVerifyDrawer, TalentIdVerifyDrawer, TalentBusinessVerifyDrawer, TalentDomainVerifyDrawer, TalentPaymentVerifyDrawer, ClientCsvBulkAddDrawer, WidgetsDrawer, ApiKeysDrawer, SiteHealthDrawer } from "./drawers/light-13";
import { StorefrontVisibilityDrawer, HubDistributionDrawer, FilterConfigDrawer, DangerZoneDrawer, SimpleStubDrawer, PlanCompareDrawer, ClientTrustDetailDrawer } from "./drawers/light-14";
import { EscrowDetailDrawer, RefundFlowDrawer, DisputeFlowDrawer, KycVerificationDrawer, ProofOfFundsDrawer, PayoutMethodFailureDrawer, SubscriptionLifecycleDrawer, NotificationDetailDrawer, AiDraftAssistDrawer, AiSearchExplainDrawer, AiWeeklyDigestDrawer, ConversionFunnelDrawer } from "./drawers/light-15";
import { TopPerformersDrawer, CoordinatorWorkloadDrawer, MyQueueDrawer, SlaTimersDrawer, RulesBuilderDrawer, SavedRepliesDrawer } from "./drawers/light-16";
import { VacationHandoverDrawer, OnCallRotationDrawer, GdprExportDrawer, ConsentLogDrawer, ContractTemplatesDrawer, ReportContentDrawer } from "./drawers/light-17";
import { EmailTemplatesDrawer, EmailBrandingDrawer, EmailSequencesDrawer, NotificationPrefsDrawer, InviteFlowDrawer, ReferralDashboardDrawer } from "./drawers/light-18";
import { CalendarSyncDrawer, SystemStatusDrawer, TelemetryDashboardDrawer, BetaProgramDrawer, CsvImportDrawer, MigrationAssistantDrawer } from "./drawers/light-19";
import { BriefBuilderDrawer, BrandAssetsDrawer, ApprovalFlowDrawer, SiteContextSwitcherDrawer, PageSchedulerDrawer, CastingFlowDrawer, CallbackTrackerDrawer } from "./drawers/light-20";
import { CrewBookingDrawer, ProductionTimelineDrawer, UsageTrackerDrawer, RelicenseFlowDrawer, OwnershipTransferDrawer, MinorAccountDrawer, DiscoveryFeedDrawer, AvailSearchDrawer, CallSheetDrawer } from "./drawers/light-21";
import { OnsetCheckinDrawer, IncidentReportDrawer, DisputeResolutionDrawer, LocationsDrawer, AiWorkspaceDrawer } from "./drawers/light-22";
import { FeatureControlsDrawer, CircleManageDrawer, CircleRecommendDrawer } from "./drawers/light-23";

// ════════════════════════════════════════════════════════════════════
// Drawer root — reads drawer state and dispatches to the right body
// ════════════════════════════════════════════════════════════════════
//
// Each drawer body is its own component so it can call `useAdminShell()` at
// the top level (rules of hooks). `DrawerRoot` is just a switch on the
// active drawer id; when no drawer is open it still renders an empty
// closed shell so the slide-out animation can play in both directions.

export function DrawerRoot() {
  const { state, closeDrawer, openDrawer } = useAdminShell();

  // Bridge listener: lets components that render OUTSIDE this provider
  // (e.g. the top-bar notification bell, which self-loads and has no
  // useAdminShell() access) ask the shell to open a specific drawer via a
  // window CustomEvent. See open-drawer-bridge.ts.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<OpenDrawerEventDetail>).detail;
      if (!detail?.drawerId) return;
      openDrawer(detail.drawerId, detail.payload);
    };
    window.addEventListener(OPEN_DRAWER_EVENT, handler);
    return () => window.removeEventListener(OPEN_DRAWER_EVENT, handler);
  }, [openDrawer]);

  const id = state.drawer.drawerId;
  if (!id) {
    // still render the shell closed so backdrop animates out
    return <DrawerShell open={false} onClose={closeDrawer} title=""><></></DrawerShell>;
  }
  return <DrawerSwitch id={id} />;
}

function DrawerSwitch({ id }: { id: DrawerId }) {
  switch (id) {
    case "tenant-summary":
      return <TenantSummaryDrawer />;
    case "site-setup":
      return <SiteSetupDrawer />;
    case "plan-billing":
      return <PlanBillingDrawer />;
    case "team":
      return <TeamDrawer />;
    case "talent-types":
      return <TalentTypesDrawer />;
    case "talent-registration":
      return <TalentRegistrationDrawer />;
    case "talent-profile-shell":
      return <TalentProfileShellDrawer />;
    case "talent-approvals":
      return <TalentApprovalsDrawer />;
    case "branding":
      return <BrandingDrawer />;
    case "watermark-editor":
      return <WatermarkEditorDrawer />;
    case "domain":
      return <DomainDrawer />;
    case "identity":
      return <IdentityDrawer />;
    case "workspace-settings":
      return <WorkspaceSettingsDrawer />;
    case "guest-chat-settings":
      return <GuestChatSettingsDrawer />;
    case "talent-profile":
      return <TalentProfileDrawer />;
    case "new-talent":
      return <NewTalentDrawer />;
    case "my-profile":
      return <MyProfileDrawer />;
    case "inquiry-peek":
      return <InquiryPeekDrawer />;
    case "new-inquiry":
      return <NewInquiryDrawer />;
    case "new-booking":
      return <NewBookingDrawer />;
    case "day-detail":
      return <DayDetailDrawer />;
    case "client-profile":
      return <ClientProfileDrawer />;
    case "client-csv-bulk-add":
      return <ClientCsvBulkAddDrawer />;
    case "today-pulse":
      return <TodayPulseDrawer />;
    case "pipeline":
      return <PipelineDrawer />;
    case "drafts-holds":
      return <PipelineFilterDrawer filter="drafts" />;
    case "awaiting-client":
      return <PipelineFilterDrawer filter="awaiting" />;
    case "confirmed-bookings":
      return <PipelineFilterDrawer filter="confirmed" />;
    case "archived-work":
      return <PipelineFilterDrawer filter="archived" />;
    case "notifications":
      return <NotificationsDrawer />;
    case "team-activity":
      return <ActivityFeedDrawer kind="team" />;
    case "talent-activity":
      return <ActivityFeedDrawer kind="talent" />;
    case "my-activity":
      return <MyActivityDrawer />;
    case "homepage":
      return <SimpleStubDrawer
        title="Homepage hero"
        description="The first thing your visitors see."
        sections={[
          { label: "Hero headline", input: "An agency built around our talent." },
          { label: "Sub-headline", input: "Editorial · commercial · runway. Worldwide." },
          { label: "CTA button", input: "See the roster" },
        ]}
      />;
    case "pages":
      return <PagesDrawer />;
    case "posts":
      return <PostsDrawer />;
    case "navigation":
      return <NavigationDrawer />;
    case "media":
      return <MediaDrawer />;
    case "seo":
      return <SeoDrawer />;
    case "field-catalog":
      return <FieldCatalogDrawer />;
    case "field-privacy":
      return <FieldPrivacyDrawer />;
    case "trust-verification-queue":
      return <TrustVerificationQueueDrawer />;
    case "trust-disputed-claims":
      return <DisputedClaimsDrawer />;
    case "platform-verification-methods":
      return <PlatformVerificationMethodsDrawer />;
    case "talent-trust-detail":
      return <TalentTrustDetailDrawer />;
    case "talent-claim-invite":
      return <TalentClaimInviteDrawer />;
    case "talent-phone-verify":
      return <TalentPhoneVerifyDrawer />;
    case "talent-id-verify":
      return <TalentIdVerifyDrawer />;
    case "talent-business-verify":
      return <TalentBusinessVerifyDrawer />;
    case "talent-domain-verify":
      return <TalentDomainVerifyDrawer />;
    case "talent-payment-verify":
      return <TalentPaymentVerifyDrawer />;
    case "taxonomy":
      return <TalentTypesDrawer />;
    case "widgets":
      return <WidgetsDrawer />;
    case "api-keys":
      return <ApiKeysDrawer />;
    case "site-health":
      return <SiteHealthDrawer />;
    case "storefront-visibility":
      return <StorefrontVisibilityDrawer />;
    case "hub-distribution":
      return <HubDistributionDrawer />;
    case "filter-config":
      return <FilterConfigDrawer />;
    case "danger-zone":
      return <DangerZoneDrawer />;
    case "activation-checklist":
      return <SiteSetupDrawer />;
    case "client-list":
    case "relationship-history":
    case "private-client-data":
    case "representation-requests":
    case "booking-peek":
      return <SimpleStubDrawer title="Coming up next" description="This drawer's full design lands in the next iteration." sections={[]} />;

    // ─── Shared messaging-first workspace (admin / client / talent) ─────
    case "inquiry-workspace":
      return <InquiryWorkspaceDrawer />;

    // ─── Talent surface drawers ─────────────────────────────────────────
    case "talent-today-pulse":
      return <TalentTodayPulseDrawer />;
    case "talent-offer-detail":
    case "talent-request-detail":
      return <TalentOfferDetailDrawer />;
    case "talent-booking-detail":
      return <TalentBookingDetailDrawer />;
    case "talent-closed-booking":
      return <TalentClosedBookingDrawer />;
    case "talent-add-event":
      return <TalentAddEventDrawer />;
    case "talent-hub-detail":
      return <TalentHubDetailDrawer />;
    case "talent-profile-edit":
      // Phase 4 — talent self-edit now uses the unified profile shell
      // with mode="edit-self" (admin-only sections gated off).
      return <TalentProfileShellDrawer />;
    case "talent-profile-section":
      return <TalentProfileSectionDrawer />;
    case "talent-availability":
      return <TalentAvailabilityDrawer />;
    case "talent-block-dates":
      return <TalentBlockDatesDrawer />;
    case "talent-portfolio":
      return <TalentPortfolioDrawer />;
    case "talent-agency-switcher":
      return <TalentAgencySwitcherDrawer />;
    case "talent-agency-relationship":
      return <TalentAgencyRelationshipDrawer />;
    case "representation":
      return <RepresentationDrawer />;
    case "talent-leave-agency":
      return <TalentLeaveAgencyDrawer />;
    case "talent-notifications":
      return <TalentNotificationsDrawer />;
    case "talent-privacy":
      return <TalentPrivacyDrawer />;
    case "talent-payouts":
      return <TalentPayoutsDrawer />;
    case "talent-contact-preferences":
      return <TalentContactPreferencesDrawer />;
    case "talent-earnings-detail":
      return <TalentEarningsDetailDrawer />;
    case "talent-connections":
      return <TalentConnectionsDrawer />;
    case "talent-photo-edit":
      return <TalentPhotoEditDrawer />;
    case "talent-polaroids":
      return <TalentPolaroidsDrawer />;
    case "talent-credits":
      return <TalentCreditsDrawer />;
    case "talent-skills":
      return <TalentSkillsDrawer />;
    case "talent-limits":
      return <TalentLimitsDrawer />;
    case "talent-rate-card":
      return <TalentRateCardDrawer />;
    case "talent-travel":
      return <TalentTravelDrawer />;
    case "talent-links":
      return <TalentLinksDrawer />;
    case "talent-reviews":
      return <TalentReviewsDrawer />;
    case "talent-showreel":
      return <TalentShowreelDrawer />;
    case "talent-measurements":
      return <TalentMeasurementsDrawer />;
    case "talent-documents":
      return <TalentDocumentsDrawer />;
    case "talent-emergency-contact":
      return <TalentEmergencyContactDrawer />;
    case "talent-public-preview":
      return <TalentPublicPreviewDrawer />;
    case "talent-tier-compare":
      return <TalentTierCompareDrawer />;
    case "talent-personal-page":
      return <TalentPersonalPageDrawer />;
    case "talent-page-template":
      return <TalentPageTemplateDrawer />;
    case "talent-media-embeds":
      return <TalentMediaEmbedsDrawer />;
    case "talent-press":
      return <TalentPressDrawer />;
    case "talent-media-kit":
      return <TalentMediaKitDrawer />;
    case "talent-custom-domain":
      return <TalentCustomDomainDrawer />;

    // ─── Phase D scaffolds ──────────────────────────────────────────────
    case "talent-verification":
      return <TalentVerificationDrawer />;
    case "talent-referrals":
      return <TalentReferralsDrawer />;
    case "talent-hub-compare":
      return <TalentHubCompareDrawer />;
    case "talent-tax-docs":
      return <TalentTaxDocsDrawer />;
    case "talent-conflict-resolve":
      return <TalentConflictResolveDrawer />;
    case "talent-network":
      return <TalentNetworkDrawer />;
    case "talent-voice-reply":
      return <TalentVoiceReplyDrawer />;
    case "talent-multi-agency-picker":
      return <TalentMultiAgencyPickerDrawer />;
    case "talent-chat-archive":
      return <TalentChatArchiveDrawer />;
    case "reply-templates":
      return <ReplyTemplatesDrawer />;
    case "talent-career-analytics":
      return <TalentCareerAnalyticsDrawer />;
    case "talent-receive-review":
      return <TalentReceiveReviewDrawer />;
    case "talent-agency-analytics":
      return <TalentAgencyAnalyticsDrawer />;

    // ─── Payments / payouts ─────────────────────────────────────────────
    case "payments-setup":
      return <PaymentsSetupDrawer />;
    case "payout-receiver-picker":
      return <PayoutReceiverPickerDrawer />;
    case "payment-detail":
      return <PaymentDetailDrawer />;


    // ─── Cross-cutting upgrade surfaces ─────────────────────────────────
    case "plan-compare":
      return <PlanCompareDrawer />;

    // ─── Platform / HQ drawers ──────────────────────────────────────────
    case "platform-today-pulse":
      return <PlatformTodayPulseDrawer />;
    case "platform-tenant-detail":
      return <PlatformTenantDetailDrawer />;
    case "platform-tenant-impersonate":
      return <PlatformTenantImpersonateDrawer />;
    case "platform-tenant-suspend":
      return <PlatformTenantSuspendDrawer />;
    case "platform-tenant-plan-override":
      return <PlatformTenantPlanOverrideDrawer />;
    case "platform-user-detail":
      return <PlatformUserDetailDrawer />;
    case "platform-user-merge":
      return <PlatformUserMergeDrawer />;
    case "platform-user-reset":
      return <PlatformUserResetDrawer />;
    case "platform-hub-submission":
      return <PlatformHubSubmissionDrawer />;
    case "platform-hub-rules":
      return <PlatformHubRulesDrawer />;
    case "platform-billing-invoice":
      return <PlatformBillingInvoiceDrawer />;
    case "platform-refund":
      return <PlatformRefundDrawer />;
    case "platform-dunning":
      return <PlatformDunningDrawer />;
    case "platform-feature-flag":
      return <PlatformFeatureFlagDrawer />;
    case "platform-moderation-item":
      return <PlatformModerationItemDrawer />;
    case "platform-system-job":
      return <PlatformSystemJobDrawer />;
    case "platform-incident":
      return <PlatformIncidentDrawer />;
    case "platform-support-ticket":
      return <PlatformSupportTicketDrawer />;
    case "platform-audit-export":
      return <PlatformAuditExportDrawer />;
    case "platform-hq-team":
      return <PlatformHqTeamDrawer />;
    case "platform-region-config":
      return <PlatformRegionConfigDrawer />;

    // ─── Wave 2 drawers ─────────────────────────────────────────────────
    case "inbox-snippets":
      return <InboxSnippetsDrawer />;
    case "notifications-prefs":
      return <NotificationsPrefsDrawer />;
    case "data-export":
      return <DataExportDrawer />;
    case "audit-log":
      return <AuditLogDrawer />;
    case "tenant-switcher":
      return <TenantSwitcherDrawer />;
    case "workspace-profile":
      return <WorkspaceProfileDrawer />;
    case "talent-share-card":
      return <TalentShareCardDrawer />;
    case "whats-new":
      return <WhatsNewDrawer />;
    case "help":
      return <HelpDrawer />;

    // ── WS-5 Money & Trust ──────────────────────────────────────────
    case "client-trust-detail":
      return <ClientTrustDetailDrawer />;
    case "escrow-detail":
      return <EscrowDetailDrawer />;
    case "refund-flow":
      return <RefundFlowDrawer />;
    case "dispute-flow":
      return <DisputeFlowDrawer />;
    case "kyc-verification":
      return <KycVerificationDrawer />;
    case "proof-of-funds":
      return <ProofOfFundsDrawer />;
    case "payout-method-failure":
      return <PayoutMethodFailureDrawer />;
    case "subscription-lifecycle":
      return <SubscriptionLifecycleDrawer />;

    // ── WS-11 Notifications ─────────────────────────────────────────
    case "notification-detail":
      return <NotificationDetailDrawer />;

    // ── WS-18 AI assist ─────────────────────────────────────────────
    case "ai-draft-assist":
      return <AiDraftAssistDrawer />;
    case "ai-search-explain":
      return <AiSearchExplainDrawer />;
    case "ai-weekly-digest":
      return <AiWeeklyDigestDrawer />;

    // ── WS-19 Reporting & analytics ──────────────────────────────────
    // "workspace-revenue" retired 2026-05-26 — see decision-log L46.
    case "conversion-funnel":
      return <ConversionFunnelDrawer />;
    case "top-performers":
      return <TopPerformersDrawer />;
    case "coordinator-workload":
      return <CoordinatorWorkloadDrawer />;

    // ── WS-20 Operations & workflow ───────────────────────────────────
    case "my-queue":
      return <MyQueueDrawer />;
    case "sla-timers":
      return <SlaTimersDrawer />;
    case "rules-builder":
      return <RulesBuilderDrawer />;
    case "saved-replies":
      return <SavedRepliesDrawer />;
    case "vacation-handover":
      return <VacationHandoverDrawer />;
    case "on-call-rotation":
      return <OnCallRotationDrawer />;

    // ── WS-21 Compliance, legal, audit ────────────────────────────────
    case "gdpr-export":
      return <GdprExportDrawer />;
    case "consent-log":
      return <ConsentLogDrawer />;
    case "contract-templates":
      return <ContractTemplatesDrawer />;
    case "report-content":
      return <ReportContentDrawer />;

    // ── WS-22 Email + transactional comms ─────────────────────────────
    case "email-templates":
      return <EmailTemplatesDrawer />;
    case "email-branding":
      return <EmailBrandingDrawer />;
    case "email-sequences":
      return <EmailSequencesDrawer />;
    case "notification-prefs":
      return <NotificationPrefsDrawer />;

    // ── WS-23 Marketing & growth ──────────────────────────────────────
    case "invite-flow":
      return <InviteFlowDrawer />;
    case "referral-dashboard":
      return <ReferralDashboardDrawer />;
    case "calendar-sync":
      return <CalendarSyncDrawer />;
    case "system-status":
      return <SystemStatusDrawer />;

    // ── WS-24 Quality & release engineering ───────────────────────────
    case "telemetry-dashboard":
      return <TelemetryDashboardDrawer />;
    case "beta-program":
      return <BetaProgramDrawer />;

    // ── WS-25 Bulk operations + migration ─────────────────────────────
    case "csv-import":
      return <CsvImportDrawer />;
    case "migration-assistant":
      return <MigrationAssistantDrawer />;

    // ── WS-26 Brand & creative tools ──────────────────────────────────
    case "brief-builder":
      return <BriefBuilderDrawer />;
    case "brand-assets":
      return <BrandAssetsDrawer />;
    case "approval-flow":
      return <ApprovalFlowDrawer />;

    // ── WS-27 Site & page-builder management ──────────────────────────
    case "site-context-switcher":
      return <SiteContextSwitcherDrawer />;
    case "page-scheduler":
      return <PageSchedulerDrawer />;

    // ── WS-28 Casting director ─────────────────────────────────────────
    case "casting-flow":
      return <CastingFlowDrawer />;
    case "callback-tracker":
      return <CallbackTrackerDrawer />;

    // ── WS-29 Production team & multi-discipline bookings ─────────────
    case "crew-booking":
      return <CrewBookingDrawer />;
    case "production-timeline":
      return <ProductionTimelineDrawer />;

    // ── WS-30 Image rights & post-booking lifecycle ───────────────────
    case "usage-tracker":
      return <UsageTrackerDrawer />;
    case "relicense-flow":
      return <RelicenseFlowDrawer />;

    // ── WS-31 Account lifecycle ────────────────────────────────────────
    case "ownership-transfer":
      return <OwnershipTransferDrawer />;
    case "minor-account":
      return <MinorAccountDrawer />;

    // ── WS-32 Discovery & marketplace ─────────────────────────────────
    case "discovery-feed":
      return <DiscoveryFeedDrawer />;
    case "avail-search":
      return <AvailSearchDrawer />;

    // ── WS-33 On-set / production-day live ────────────────────────────
    case "call-sheet":
      return <CallSheetDrawer />;
    case "onset-checkin":
      return <OnsetCheckinDrawer />;

    // ── WS-34 Safety, disputes, incident handling ─────────────────────
    case "incident-report":
      return <IncidentReportDrawer />;
    case "dispute-resolution":
      return <DisputeResolutionDrawer />;

    // ── WS-35 Production-feature reconciliation ───────────────────────
    case "locations-drawer":
      return <LocationsDrawer />;
    case "ai-workspace":
      return <AiWorkspaceDrawer />;

    // ── Feature controls ──────────────────────────────────────────────
    case "feature-controls":
      return <FeatureControlsDrawer />;

    // ── Talent circle (personal collaborator network) ─────────────────
    case "circle-manage":
      return <CircleManageDrawer />;
    case "circle-recommend":
      return <CircleRecommendDrawer />;

    // ── Reviews moderation (STANDING) ─────────────────────────────────
    case "reviews-moderation":
      return <ReviewModerationQueueDrawer />;

    // ── Media ownership / two-key release ─────────────────────────────
    // The workspace half of the two-key rule. The `media-releases`
    // notification (media-grants-shared.ts) used to fall through to the
    // "Coming up next" stub — execution plan P0-2. The talent half
    // (`talent-media`) is an alias, rewritten to `talent-profile-edit` +
    // section "media" by notification-drawer-targets.ts, so it needs no case
    // of its own.
    case "media-releases":
      return <MediaReleasesDrawer />;

    default:
      return <SimpleStubDrawer title="Coming up next" description="This drawer's full design lands in the next iteration." sections={[]} />;
  }
}

// ════════════════════════════════════════════════════════════════════
// Reviews moderation drawer (STANDING) — thin wrapper so ReviewModerationQueue
// can be reached from the shell. The report notification
// (review-actions.ts notifyStaffOfReport → targetDrawer: "reviews-moderation")
// opens this. Tenant id comes from the admin-shell identity bridge; the queue
// self-loads (staff-gated at the server-action boundary) and shows empty lists
// for a non-staff or tenant-less session rather than erroring.
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// Media release requests drawer — the workspace half of the two-key rule.
// The approve/decline/revoke notification (media-grants-shared.ts
// notifyWorkspaceStaff → targetDrawer: "media-releases") opens this. Before
// this case existed the notification opened the "Coming up next" stub
// (execution-plan-2026-08-15 §1 P0-2). The panel self-loads and is staff-gated
// at the server-action boundary, so a non-staff session sees an empty list
// rather than an error — same contract as ReviewModerationQueue.
// ════════════════════════════════════════════════════════════════════

function MediaReleasesDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "media-releases";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Photo release requests"
      description="Talents you represent asking to use photos you own outside your site."
      defaultSize="half"
    >
      <div className="p-[16px]">
        <MediaReleaseRequestsPanel />
      </div>
    </DrawerShell>
  );
}

function ReviewModerationQueueDrawer() {
  const { state, closeDrawer, bridgeTenantIdentity } = useAdminShell();
  const open = state.drawer.drawerId === "reviews-moderation";
  const tenantId = bridgeTenantIdentity?.tenantId ?? "";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Reported reviews"
      description="Flagged reviews and rating-integrity signals for this workspace."
      defaultSize="half"
    >
      <div className="p-[16px]">
        <ReviewModerationQueue tenantId={tenantId} />
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Helpers used across drawer bodies
// ════════════════════════════════════════════════════════════════════


// ── Phase 1d public-surface re-exports (byte-stable) ──
export { UpgradeModal } from "./drawers/UpgradeModal";
export type { DiffEntry } from "./drawers/profile-shell";
