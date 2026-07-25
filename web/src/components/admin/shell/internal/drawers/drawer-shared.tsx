"use client";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { useQueuedRouterRefresh } from "@/lib/ui/use-queued-router-refresh";
import { addTalentToRoster, bulkAddTalentToRoster } from "../actions";
import { parseTalentCsv } from "../csv-parser";
import { updateTalentIdentity } from "@/lib/server-actions/admin-talent-identity";
import { removeFromRoster } from "@/lib/server-actions/admin-talent-roster";
import {
  getFieldPrivacyCatalog,
  setWorkspaceFieldVisibility,
  resetWorkspaceFieldVisibility,
  getWorkspaceFieldCatalog,
  setWorkspaceFieldCatalog,
  setWorkspaceFieldGroup,
} from "@/lib/server-actions/admin-workspace-field-settings";
import {
  commitTalentProfileShellAdmin,
  getTalentProfileActivity,
  sendTalentClaimInvite,
  assignTalentTaxonomyBySlug,
  removeTalentTaxonomyBySlug,
  type ProfileActivityEntry,
} from "@/lib/server-actions/admin-talent-profile-sections";
import {
  updateSelfAbout, updateSelfLocation, updateSelfRates, updateSelfAvailability,
  updateSelfCredits, updateSelfLimits, updateSelfSocialProof, saveSelfLanguages, updateSelfIdentity,
  updateSelfProfileDrawerExtras,
  syncSelfTalentTypeTaxonomyFromShell,
  updateSelfProfileWorkflowFromShell,
  updateSelfProfileShellDynFields,
  updateSelfMediaAlbums,
  updateSelfTalentDocuments,
} from "@/lib/server-actions/talent-self-profile-sections";
import { loadTalentProfileEditorData } from "@/lib/server-actions/load-talent-profile-editor-data";
import { dbToUiProfileShellStatus } from "@/lib/talent/profile-shell-workflow";
import {
  extractShellVideoUrls,
  findShellBusinessLine,
  findShellWhatsappHref,
  limitsDataToEntries,
  limitsEntriesToData,
  type ShellLimitsEntry,
} from "@/lib/talent/profile-shell-drawer-persist";
import { updateAgencyBranding, updateWorkspaceAccount, updateWorkspaceFields, updateMediaWatermarkOverride, loadAgencyBrandingSettings, loadWorkspaceAccountSettings, type WatermarkPreset } from "@/lib/server-actions/admin-workspace-settings";
import { actionSetMediaWatermarkOverride, actionUploadAndAssignMedia, actionDeleteMediaAssets, actionReorderMediaAssets, actionLoadTalentMediaBundle, actionUploadTalentDocument, actionGetTalentDocumentSignedUrl, actionDeleteTalentDocument, actionImportFromGoogleDrive, actionListDriveFolder, actionImportSingleDriveFile, actionRevertCropToSource } from "@/app/(workspace)/[tenantSlug]/admin/media/actions";
import { MediaGalleryDrawer } from "@/components/talent/media-gallery-drawer";
import { setTalentAvatar, setTalentHero, registerPortfolioPhoto } from "@/app/(workspace)/[tenantSlug]/admin/roster/[id]/extended-actions";
import { DEFAULT_WATERMARK_PRESET } from "@/lib/server-actions/admin-workspace-settings-constants";
import { actionUploadAgencyLogo } from "@/lib/server-actions/admin-agency-logo-upload";
import { createManualBooking, duplicateBooking } from "@/lib/server-actions/admin-bookings";
import { createClientAccount } from "@/lib/server-actions/admin-inquiries";
import { updateAdminClientProfile } from "@/lib/server-actions/admin-clients";
import {
  patchAgencySettingsNamespace,
  loadAgencySettingsNamespace,
} from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import {
  getEnabledTaxonomyTree,
  getCategoryDetail,
  setTaxonomyEnabled,
  setTaxonomyFlags,
  addCustomSubType,
  removeCustomSubType,
  getFieldsForTalent,
  type TaxonomyNode,
  type ResolvedField,
  type CategoryDetail,
  type CategoryFieldEntry,
} from "@/lib/server-actions/admin-taxonomy";
import {
  effectiveFieldVisibility,
  canViewerSee,
  platformBaseVisibility,
  type FieldVisibility as EngineFieldVisibility,
  type ViewerRole,
} from "@/lib/field-engine/effective-visibility";
import { shortParentLabel } from "@/lib/taxonomy/parent-labels";
import { useLiveTaxonomy, type LiveTaxonomyParent } from "../use-taxonomy";
import { prefetchSkillsData, SkillSlotPanel } from "../skill-slot-panel";
import { ContextSlotPanel, prefetchContextsData } from "../context-slot-panel";
import { LanguageSlotPanel, prefetchLanguagesData } from "../language-slot-panel";
import { LiveCategoryFieldsHistoryModal } from "../live-category-fields-history";
import { LocationSlotPanel } from "../location-slot-panel";
import { useDashboardText } from "../dashboard-i18n";
import { MetricsRibbon } from "../metrics-ribbon";
import { patchProfileDraft, readProfileDraft, clearProfileDraft, type ProfileDraft } from "../profile-store";
import {
  CLIENT_TRUST_META,
  COLORS,
  FONTS,
  RADIUS,
  TRANSITION,
  PLANS,
  PLAN_LADDER,
  PLAN_LADDER_HEADER,
  PLAN_META,
  MY_TALENT_PROFILE,
  TALENT_PROFILES_BY_ID,
  getProfileById,
  setProfileOverride,
  talentIdOf,
  addPendingReview,
  clearPendingReview,
  type MyTalentProfile,
  PLAN_FEE_META,
  planPrice,
  PAYOUT_STATUS_META,
  PAYOUT_RECEIVER_KIND_LABEL,
  PAYOUT_RECEIVER_CANDIDATES,
  PAYMENT_STATUS_META,
  PAYMENT_SUMMARIES,
  WORKSPACE_PAYMENTS,
  NOTIFICATIONS,
  RICH_INQUIRIES,
  getRichInquiry,
  INQUIRY_STAGE_META,
  ROLE_META,
  TALENT_STATE_LABEL,
  TALENT_STATE_TONE,
  TENANT,
  TAXONOMY,
  TAXONOMY_FIELDS,
  PLAN_TAXONOMY_LIMITS,
  WORKSPACE_TAXONOMY_DEFAULT,
  SKILL_CATALOG,
  CONTEXT_CATALOG,
  PENDING_TALENT,
  ROSTER_AGENCY,
  ROSTER_FREE,
  TALENT_TRUST_META,
  PRONOUNS_OPTIONS,
  GENDER_OPTIONS,
  PROFICIENCY_META,
  PHOTO_TAG_META,
  TALENT_INVITES,
  deriveAge,
  ageRangeFor,
  getClients,
  getInquiries,
  getRoster,
  getTeam,
  getWorkspacePayout,
  getPaymentSummary,
  meetsPlan,
  meetsRole,
  useAdminShell,
  type DrawerId,
  type NotificationItem,
  type Plan,
  type Role,
  type PayoutReceiver,
  type RepresentationStatus,
  type TaxonomyParent,
  type TaxonomyParentId,
  type TaxonomyChild,
  type WorkspaceTaxonomySetting,
  type RegField,
  type WorkspaceCustomField,
  type FieldVisibility,
  type ProfileFieldId,
  PROFILE_FIELD_META,
  DEFAULT_FIELD_VISIBILITY,
  FIELD_PRIVACY_PLAN_RULES,
  ALWAYS_INTERNAL_FIELDS,
  VERIFICATION_TYPE_META,
  PROFILE_CLAIM_META,
  type VerificationRequest,
  type VerificationRequestStatus,
  type VerificationType,
  type VerificationMethodConfig,
  ALWAYS_VISIBLE_FIELDS,
  allowedVisibilities,
  type ProfileLanguage,
  type LanguageLevel,
  type ServiceArea,
  type PendingTalent,
  type AvailabilityCell,
  type AvailabilityStatus,
  type ProfileRate,
  type RateUnit,
  type ProfileAlbum,
  type LocaleCode,
  type LocaleBio,
  type Verifications,
  type TrustTier,
  type ProfileChange,
  type Pronouns,
  type GenderOption,
  type AgeDisplayMode,
  type ProfileIdentity,
  type SkillProficiency,
  type SkillEntry,
  type BioTone,
  type Personality,
  type PhotoTag,
  type PhotoMeta,
  parseVideoUrl,
  type VideoSlot,
  type SeasonalWindow,
  type RecurringPattern,
  type VacationWindow,
  type PackageRate,
  type PastClient,
  type FieldLockPath,
  type TalentInvite,
  type InviteStatus,
  TYPE_RATE_UNIT,
  LOCALE_LABEL,
  computeTrustTier,
  WEBSITE_STATE,
  splitShellContactPhone,
} from "../state";
import type { TalentSelfProfile as BridgeTalentSelfProfile } from "../data-bridge";
import {
  sectionAppliesToType,
  isRequiredForType,
  computeProfileCompleteness,
  FIELD_CATALOG,
  getDynamicFieldsForType,
  applyWorkspaceFieldOverride,
  setWorkspaceFieldOverride,
  clearWorkspaceFieldOverride,
  getWorkspaceFieldOverrides,
  resolvedFieldsForMode,
  validateField,
  type DrawerSectionId,
  type WorkspaceFieldOverride,
  type FieldCatalogEntry,
} from "../field-catalog";
import { useWorkspaceFieldOverrideSubscription } from "../field-catalog-client";
import {
  ActivityFeedItem,
  Affordance,
  Avatar,
  Bullet,
  CapsLabel,
  ChannelVisibilityStrip,
  ClientTrustChip,
  Divider,
  EmptyState,
  FieldRow,
  GhostButton,
  Icon,
  IconChip,
  ModalShell,
  PaymentStatusChip,
  PayoutStatusChip,
  PlanChip,
  Popover,
  PrimaryButton,
  RepresentationChip,
  RoleChip,
  SecondaryButton,
  StateChip,
  StatDot,
  StatusPill,
  TextArea,
  TextInput,
  Toggle,
  DrawerShell,
  SizeIcon,
  DRAWER_SIZE_PX,
  type DrawerSize,
  TrustBadgeGroup,
  RiskScorePill,
  DrawerDetailSkeleton,
} from "../primitives";
import { InquiryWorkspaceDrawer } from "../workspace";
import SkillOverridesPanel from "../skill-overrides-panel";
import { LiveCategoryFieldsEditor } from "../live-category-fields-editor";
import SkillHintsBanner from "../skill-hints-banner";
import SkillFreshnessBanner from "../skill-freshness-banner";
import {
  InboxSnippetsDrawer,
  NotificationsPrefsDrawer,
  DataExportDrawer,
  AuditLogDrawer,
  TenantSwitcherDrawer,
  TalentAgencySwitcherDrawer,
  WorkspaceProfileDrawer,
  TalentShareCardDrawer,
  InquiryTemplatesPicker,
  DoubleBookingWarning,
  WhatsNewDrawer,
  HelpDrawer,
  TalentNotificationsDrawer,
  downloadCsv,
} from "../wave2";
import {
  TalentTodayPulseDrawer,
  TalentOfferDetailDrawer,
  TalentAddEventDrawer,
  TalentBookingDetailDrawer,
  TalentClosedBookingDrawer,
  TalentHubDetailDrawer,
  // TalentProfileEditDrawer removed — replaced by unified TalentProfileShellDrawer.
  TalentProfileSectionDrawer,
  TalentAvailabilityDrawer,
  TalentBlockDatesDrawer,
  TalentPortfolioDrawer,
  TalentAgencyRelationshipDrawer,
  TalentLeaveAgencyDrawer,
  TalentPrivacyDrawer,
  TalentPayoutsDrawer,
  TalentContactPreferencesDrawer,
  TalentEarningsDetailDrawer,
  TalentPhotoEditDrawer,
  TalentPolaroidsDrawer,
  TalentCreditsDrawer,
  TalentSkillsDrawer,
  TalentLimitsDrawer,
  TalentRateCardDrawer,
  TalentTravelDrawer,
  TalentLinksDrawer,
  TalentReviewsDrawer,
  TalentShowreelDrawer,
  TalentMeasurementsDrawer,
  TalentDocumentsDrawer,
  TalentEmergencyContactDrawer,
  TalentPublicPreviewDrawer,
  TalentTierCompareDrawer,
  TalentPersonalPageDrawer,
  TalentPageTemplateDrawer,
  TalentMediaEmbedsDrawer,
  TalentPressDrawer,
  TalentMediaKitDrawer,
  TalentCustomDomainDrawer,
  TalentVerificationDrawer,
  TalentReferralsDrawer,
  TalentHubCompareDrawer,
  TalentTaxDocsDrawer,
  TalentConflictResolveDrawer,
  TalentNetworkDrawer,
  TalentVoiceReplyDrawer,
  TalentMultiAgencyPickerDrawer,
  TalentChatArchiveDrawer,
  ReplyTemplatesDrawer,
  TalentCareerAnalyticsDrawer,
  TalentReceiveReviewDrawer,
  TalentAgencyAnalyticsDrawer,
} from "../talent-drawers";
import {
  PlatformTodayPulseDrawer,
  PlatformTenantDetailDrawer,
  PlatformTenantImpersonateDrawer,
  PlatformTenantSuspendDrawer,
  PlatformTenantPlanOverrideDrawer,
  PlatformUserDetailDrawer,
  PlatformUserMergeDrawer,
  PlatformUserResetDrawer,
  PlatformHubSubmissionDrawer,
  PlatformHubRulesDrawer,
  PlatformBillingInvoiceDrawer,
  PlatformRefundDrawer,
  PlatformDunningDrawer,
  PlatformFeatureFlagDrawer,
  PlatformModerationItemDrawer,
  PlatformSystemJobDrawer,
  PlatformIncidentDrawer,
  PlatformSupportTicketDrawer,
  PlatformAuditExportDrawer,
  PlatformHqTeamDrawer,
  PlatformRegionConfigDrawer,
} from "../platform";

// ════════════════════════════════════════════════════════════════════
// drawer-shared — Phase 1d HUB (remediation-plan-2026-05-19 §4).
//
// drawers.tsx (31,468 LOC) decomposed into a byte-stable barrel +
// ./drawers/* . This module owns (a) the full external import surface,
// re-exported so every extracted drawer chunk imports from ONE place,
// and (b) the 94 cross-cutting helpers/atoms shared across drawer
// bodies. Bodies are byte-for-byte moves; no behavior change.
// ════════════════════════════════════════════════════════════════════

// ── external surface re-export (drawer chunks pull from here) ──
export { useQueuedRouterRefresh } from "@/lib/ui/use-queued-router-refresh";
export { addTalentToRoster, bulkAddTalentToRoster, createTalentDraft, patchTalentDraft, discardTalentDraft } from "../actions";
export { parseTalentCsv } from "../csv-parser";
export { updateTalentIdentity } from "@/lib/server-actions/admin-talent-identity";
export { removeFromRoster } from "@/lib/server-actions/admin-talent-roster";
export { getFieldPrivacyCatalog, setWorkspaceFieldVisibility, resetWorkspaceFieldVisibility, getWorkspaceFieldCatalog, setWorkspaceFieldCatalog, setWorkspaceFieldGroup } from "@/lib/server-actions/admin-workspace-field-settings";
export { commitTalentProfileShellAdmin, getTalentProfileActivity, sendTalentClaimInvite, assignTalentTaxonomyBySlug, removeTalentTaxonomyBySlug, type ProfileActivityEntry } from "@/lib/server-actions/admin-talent-profile-sections";
export { updateSelfAbout, updateSelfLocation, updateSelfRates, updateSelfAvailability, updateSelfCredits, updateSelfLimits, updateSelfSocialProof, saveSelfLanguages, updateSelfIdentity, updateSelfProfileDrawerExtras, syncSelfTalentTypeTaxonomyFromShell, updateSelfProfileWorkflowFromShell, updateSelfProfileShellDynFields, updateSelfMediaAlbums, updateSelfTalentDocuments } from "@/lib/server-actions/talent-self-profile-sections";
export { loadTalentProfileEditorData } from "@/lib/server-actions/load-talent-profile-editor-data";
export { dbToUiProfileShellStatus } from "@/lib/talent/profile-shell-workflow";
export { extractShellVideoUrls, findShellBusinessLine, findShellWhatsappHref, limitsDataToEntries, limitsEntriesToData, type ShellLimitsEntry } from "@/lib/talent/profile-shell-drawer-persist";
export { updateAgencyBranding, updateWorkspaceAccount, updateWorkspaceFields, updateMediaWatermarkOverride, loadAgencyBrandingSettings, loadWorkspaceAccountSettings, type WatermarkPreset } from "@/lib/server-actions/admin-workspace-settings";
export { actionSetMediaWatermarkOverride, actionUploadAndAssignMedia, actionDeleteMediaAssets, actionReorderMediaAssets, actionLoadTalentMediaBundle, actionUploadTalentDocument, actionGetTalentDocumentSignedUrl, actionDeleteTalentDocument, actionImportFromGoogleDrive, actionListDriveFolder, actionImportSingleDriveFile, actionRevertCropToSource } from "@/app/(workspace)/[tenantSlug]/admin/media/actions";
export { MediaGalleryDrawer } from "@/components/talent/media-gallery-drawer";
export { setTalentAvatar, setTalentHero, registerPortfolioPhoto } from "@/app/(workspace)/[tenantSlug]/admin/roster/[id]/extended-actions";
export { DEFAULT_WATERMARK_PRESET } from "@/lib/server-actions/admin-workspace-settings-constants";
export { actionUploadAgencyLogo } from "@/lib/server-actions/admin-agency-logo-upload";
export { createManualBooking, duplicateBooking } from "@/lib/server-actions/admin-bookings";
export { createClientAccount } from "@/lib/server-actions/admin-inquiries";
export { updateAdminClientProfile } from "@/lib/server-actions/admin-clients";
export { patchAgencySettingsNamespace, loadAgencySettingsNamespace } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
export { getEnabledTaxonomyTree, getCategoryDetail, setTaxonomyEnabled, setTaxonomyFlags, addCustomSubType, removeCustomSubType, getFieldsForTalent, type TaxonomyNode, type ResolvedField, type CategoryDetail, type CategoryFieldEntry } from "@/lib/server-actions/admin-taxonomy";
export { effectiveFieldVisibility, canViewerSee, platformBaseVisibility, type FieldVisibility as EngineFieldVisibility, type ViewerRole } from "@/lib/field-engine/effective-visibility";
export { shortParentLabel } from "@/lib/taxonomy/parent-labels";
export { useLiveTaxonomy, type LiveTaxonomyParent } from "../use-taxonomy";
export { prefetchSkillsData, SkillSlotPanel } from "../skill-slot-panel";
export { ContextSlotPanel, prefetchContextsData } from "../context-slot-panel";
export { LanguageSlotPanel, prefetchLanguagesData } from "../language-slot-panel";
export { LiveCategoryFieldsHistoryModal } from "../live-category-fields-history";
export { LocationSlotPanel } from "../location-slot-panel";
export { useDashboardText } from "../dashboard-i18n";
export { MetricsRibbon } from "../metrics-ribbon";
export { patchProfileDraft, readProfileDraft, clearProfileDraft, type ProfileDraft } from "../profile-store";
export { CLIENT_TRUST_META, COLORS, accentAlpha, ACCENT_FALLBACK, ACCENT_DEEP_FALLBACK, FONTS, RADIUS, TRANSITION, PLANS, PLAN_LADDER, PLAN_LADDER_HEADER, PLAN_META, MY_TALENT_PROFILE, TALENT_PROFILES_BY_ID, getProfileById, setProfileOverride, talentIdOf, addPendingReview, clearPendingReview, type MyTalentProfile, PLAN_FEE_META, planPrice, PAYOUT_STATUS_META, PAYOUT_RECEIVER_KIND_LABEL, PAYOUT_RECEIVER_CANDIDATES, PAYMENT_STATUS_META, PAYMENT_SUMMARIES, WORKSPACE_PAYMENTS, NOTIFICATIONS, RICH_INQUIRIES, getRichInquiry, INQUIRY_STAGE_META, ROLE_META, TALENT_STATE_LABEL, TALENT_STATE_TONE, TENANT, TAXONOMY, TAXONOMY_FIELDS, PLAN_TAXONOMY_LIMITS, WORKSPACE_TAXONOMY_DEFAULT, SKILL_CATALOG, CONTEXT_CATALOG, PENDING_TALENT, ROSTER_AGENCY, ROSTER_FREE, TALENT_TRUST_META, PRONOUNS_OPTIONS, GENDER_OPTIONS, PROFICIENCY_META, PHOTO_TAG_META, TALENT_INVITES, deriveAge, ageRangeFor, getClients, getInquiries, getRoster, getTeam, getWorkspacePayout, getPaymentSummary, meetsPlan, meetsRole, useAdminShell, type DrawerId, type NotificationItem, type Plan, type Role, type PayoutReceiver, type RepresentationStatus, type TaxonomyParent, type TaxonomyParentId, type TaxonomyChild, type WorkspaceTaxonomySetting, type RegField, type WorkspaceCustomField, type FieldVisibility, type ProfileFieldId, PROFILE_FIELD_META, DEFAULT_FIELD_VISIBILITY, FIELD_PRIVACY_PLAN_RULES, ALWAYS_INTERNAL_FIELDS, VERIFICATION_TYPE_META, PROFILE_CLAIM_META, type VerificationRequest, type VerificationRequestStatus, type VerificationType, type VerificationMethodConfig, ALWAYS_VISIBLE_FIELDS, allowedVisibilities, type ProfileLanguage, type LanguageLevel, type ServiceArea, type PendingTalent, type AvailabilityCell, type AvailabilityStatus, type ProfileRate, type RateUnit, type ProfileAlbum, type LocaleCode, type LocaleBio, type Verifications, type TrustTier, type ProfileChange, type Pronouns, type GenderOption, type AgeDisplayMode, type ProfileIdentity, type SkillProficiency, type SkillEntry, type BioTone, type Personality, type PhotoTag, type PhotoMeta, parseVideoUrl, type VideoSlot, type SeasonalWindow, type RecurringPattern, type VacationWindow, type PackageRate, type PastClient, type FieldLockPath, type TalentInvite, type InviteStatus, TYPE_RATE_UNIT, LOCALE_LABEL, computeTrustTier, WEBSITE_STATE, splitShellContactPhone } from "../state";
export type { TalentSelfProfile as BridgeTalentSelfProfile } from "../data-bridge";
export { sectionAppliesToType, isRequiredForType, computeProfileCompleteness, FIELD_CATALOG, getDynamicFieldsForType, applyWorkspaceFieldOverride, PROTO_TENANT_ID, setWorkspaceFieldOverride, clearWorkspaceFieldOverride, getWorkspaceFieldOverrides, resolvedFieldsForMode, validateField, type DrawerSectionId, type WorkspaceFieldOverride, type FieldCatalogEntry } from "../field-catalog";
export { useWorkspaceFieldOverrideSubscription } from "../field-catalog-client";
export { ActivityFeedItem, Affordance, Avatar, Bullet, CapsLabel, ChannelVisibilityStrip, ClientTrustChip, Divider, EmptyState, FieldRow, GhostButton, Icon, IconChip, ModalShell, PaymentStatusChip, PayoutStatusChip, PlanChip, Popover, PrimaryButton, RepresentationChip, RoleChip, SecondaryButton, StateChip, StatDot, StatusPill, TextArea, TextInput, Toggle, DrawerShell, SizeIcon, DRAWER_SIZE_PX, type DrawerSize, TrustBadgeGroup, RiskScorePill, DrawerDetailSkeleton, type AdminShellIconName } from "../primitives";
export { InquiryWorkspaceDrawer } from "../workspace";
export { LiveCategoryFieldsEditor } from "../live-category-fields-editor";
export { InboxSnippetsDrawer, NotificationsPrefsDrawer, DataExportDrawer, AuditLogDrawer, TenantSwitcherDrawer, TalentAgencySwitcherDrawer, WorkspaceProfileDrawer, TalentShareCardDrawer, InquiryTemplatesPicker, DoubleBookingWarning, WhatsNewDrawer, HelpDrawer, TalentNotificationsDrawer, downloadCsv } from "../wave2";
export { TalentTodayPulseDrawer, TalentOfferDetailDrawer, TalentAddEventDrawer, TalentBookingDetailDrawer, TalentClosedBookingDrawer, TalentHubDetailDrawer, // TalentProfileEditDrawer removed — replaced by unified TalentProfileShellDrawer.
  TalentProfileSectionDrawer, TalentAvailabilityDrawer, TalentBlockDatesDrawer, TalentPortfolioDrawer, TalentAgencyRelationshipDrawer, TalentLeaveAgencyDrawer, TalentPrivacyDrawer, TalentPayoutsDrawer, TalentContactPreferencesDrawer, TalentEarningsDetailDrawer, TalentPhotoEditDrawer, TalentPolaroidsDrawer, TalentCreditsDrawer, TalentSkillsDrawer, TalentLimitsDrawer, TalentRateCardDrawer, TalentTravelDrawer, TalentLinksDrawer, TalentReviewsDrawer, TalentShowreelDrawer, TalentMeasurementsDrawer, TalentDocumentsDrawer, TalentEmergencyContactDrawer, TalentPublicPreviewDrawer, TalentTierCompareDrawer, TalentPersonalPageDrawer, TalentPageTemplateDrawer, TalentMediaEmbedsDrawer, TalentPressDrawer, TalentMediaKitDrawer, TalentCustomDomainDrawer, TalentVerificationDrawer, TalentReferralsDrawer, TalentHubCompareDrawer, TalentTaxDocsDrawer, TalentConflictResolveDrawer, TalentNetworkDrawer, TalentVoiceReplyDrawer, TalentMultiAgencyPickerDrawer, TalentChatArchiveDrawer, ReplyTemplatesDrawer, TalentCareerAnalyticsDrawer, TalentReceiveReviewDrawer, TalentAgencyAnalyticsDrawer } from "../talent-drawers";
export { PlatformTodayPulseDrawer, PlatformTenantDetailDrawer, PlatformTenantImpersonateDrawer, PlatformTenantSuspendDrawer, PlatformTenantPlanOverrideDrawer, PlatformUserDetailDrawer, PlatformUserMergeDrawer, PlatformUserResetDrawer, PlatformHubSubmissionDrawer, PlatformHubRulesDrawer, PlatformBillingInvoiceDrawer, PlatformRefundDrawer, PlatformDunningDrawer, PlatformFeatureFlagDrawer, PlatformModerationItemDrawer, PlatformSystemJobDrawer, PlatformIncidentDrawer, PlatformSupportTicketDrawer, PlatformAuditExportDrawer, PlatformHqTeamDrawer, PlatformRegionConfigDrawer } from "../platform";
export { default as SkillOverridesPanel } from "../skill-overrides-panel";
export { default as SkillHintsBanner } from "../skill-hints-banner";
export { default as SkillFreshnessBanner } from "../skill-freshness-banner";

// ── cross-cutting shared declarations (byte-for-byte from drawers.tsx) ──

// STATIC import (2026-07-23 prod incident): the async edge into the
// messages barrel participated in a cross-chunk cycle that deadlocked
// webpack module resolution on fresh builds — React never hydrated on
// the workspace admin surface. See pages-dynamic.tsx incident note.
export { InquiryComposer as InquiryComposerLazyD } from "../messages";

export function useSaveAndClose(message?: string) {
  const { closeDrawer, toast } = useAdminShell();
  const t = useT();
  return () => {
    toast(message ?? t("dashboard.adminDrawers.saved"));
    closeDrawer();
  };
}


export function openSupportEmail(subject: string, body: string) {
  const params = new URLSearchParams({ subject, body });
  window.location.href = `mailto:support@tulala.digital?${params.toString()}`;
}


export function StandardFooter({
  onSave,
  saveLabel,
  destructive,
  disabled = false,
}: {
  onSave?: () => void;
  saveLabel?: string;
  destructive?: { label: string; onClick: () => void };
  /** When true, the primary save button is disabled. Used by drawers that
   *  gate save on a pending mutation or "not yet loaded" state. */
  disabled?: boolean;
}) {
  const { closeDrawer } = useAdminShell();
  const t = useT();
  return (
    <>
      {destructive && (
        <button
          onClick={destructive.onClick}
          style={{
            background: "transparent",
            border: "none",
            color: COLORS.red,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            cursor: "pointer",
            padding: "8px 10px",
            marginRight: "auto",
          }}
        >
          {destructive.label}
        </button>
      )}
      <SecondaryButton onClick={closeDrawer}>{t("dashboard.adminDrawers.cancel")}</SecondaryButton>
      {onSave && (
        <PrimaryButton onClick={onSave} disabled={disabled}>
          {saveLabel ?? t("dashboard.adminDrawers.save")}
        </PrimaryButton>
      )}
    </>
  );
}


export function Section({
  title,
  description,
  children,
  framed = false,
  dense = false,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  /** When true the children sit in a bordered panel that gives the eye an anchor. Use for sections that are pure form-field stacks; leave off for sections whose contents already render their own cards/borders. */
  framed?: boolean;
  /** Tightens vertical gap between children for compact list-style sections. */
  dense?: boolean;
}) {
  const inner = (
    <div style={{ display: "flex", flexDirection: "column", gap: dense ? 10 : 14 }}>
      {children}
    </div>
  );
  return (
    <section style={{ marginBottom: 22 }}>
      {title && (
        <div className="mb-1.5">
          <CapsLabel>{title}</CapsLabel>
        </div>
      )}
      {description && (
        <p style={{ fontFamily: FONTS.body, fontSize: 12.5, margin: "0 0 10px", lineHeight: 1.5 }} className="text-admin-ink-muted">
          {description}
        </p>
      )}
      {framed ? (
        <div
          style={{
            // Match New Inquiry nested sub-panel: rounded-xl, soft COOL
            // hairline (was a warm rgba(35,29,16,*) that contradicted the
            // New Inquiry it claims to match), bg-background/70, no shadow.
            background: "rgba(255,255,255,0.7)",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: 12,
          }}
        >
          {inner}
        </div>
      ) : (
        inner
      )}
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════
// Tenant Summary
// ════════════════════════════════════════════════════════════════════


export function UsageRow({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(2, value * 100));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 500 }} className="text-admin-ink">
          {label}
        </span>
        <span style={{ fontFamily: FONTS.body, fontSize: 11.5 }} className="text-admin-ink-muted">
          {Math.round(pct)}%
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: "rgba(11,11,13,0.06)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{ '--progress-w': `${pct}%`, '--progress-bg': pct > 80 ? COLORS.amber : COLORS.fill }}
          className="w-[var(--progress-w)] h-full rounded-full bg-[var(--progress-bg)] [transition:width_.3s]"
        />
      </div>
    </div>
  );
}


export function teamCap(plan: Plan): number {
  return plan === "free" ? 1 : plan === "studio" ? 3 : plan === "agency" ? 25 : 999;
}

export function nextPlan(plan: Plan): Plan | null {
  if (plan === "free") return "studio";
  if (plan === "studio") return "agency";
  if (plan === "agency") return "network";
  return null;
}

// ════════════════════════════════════════════════════════════════════
// Site setup walkthrough
// ════════════════════════════════════════════════════════════════════


export function StateChipMini({ label, tone }: { label: string; tone: "green" | "amber" | "dim" }) {
  return <StatusPill tone={tone} label={label} size="sm" />;
}

// ════════════════════════════════════════════════════════════════════
// Team
// ════════════════════════════════════════════════════════════════════


// Hoisted from inside CategoryExpandPanel (Q4). Closure over tab/onTabChange
// lifted to active + onClick props; parent computes per call site.
type CategoryTabId = "subtypes" | "fields" | "settings";
function TabBtn({ label, count, active, onClick }: { id: CategoryTabId; label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 12px", fontSize: 12, fontWeight: 600,
        background: active ? "#fff" : "transparent",
        color: active ? COLORS.ink : COLORS.inkMuted,
        border: `1px solid ${active ? COLORS.border : "transparent"}`,
        borderRadius: 8, cursor: "pointer",
        fontFamily: FONTS.body,
        display: "inline-flex", alignItems: "center", gap: 6,
      }}
    >
      {label}
      {typeof count === "number" && (
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: active ? COLORS.surfaceAlt : "rgba(11,11,13,0.06)" }} className="text-admin-ink-muted">{count}</span>
      )}
    </button>
  );
}

/**
 * Display name for a taxonomy term in the reader's language.
 *
 * Every term carries a platform EN/ES pair (`name_en` / `name_es`) plus an
 * optional per-workspace override pair (`custom_label` / `custom_label_es`).
 * The drawer used to render `custom_label ?? name_en` unconditionally, so a
 * Spanish admin saw the whole category tree in English and the ES override
 * they had just typed was never shown back to them. Resolve the requested
 * locale first, then fall back through the other locale so a term with only
 * one side filled in still renders a name instead of an empty string.
 */
export function taxonomyDisplayName(
  node: { name_en: string; name_es?: string | null; custom_label?: string | null; custom_label_es?: string | null },
  isSpanish: boolean,
): string {
  if (isSpanish) {
    return node.custom_label_es || node.name_es || node.custom_label || node.name_en;
  }
  return node.custom_label || node.name_en || node.custom_label_es || node.name_es || "";
}

function reorderIds(ids: readonly string[], fromId: string, toId: string): string[] {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return [...ids];
  const next = [...ids];
  const [picked] = next.splice(from, 1);
  next.splice(to, 0, picked);
  return next;
}

export function CategoryExpandPanel({
  parent,
  detail,
  isLoading,
  tab,
  onTabChange,
  onFlag,
  onLabel,
  canCustomize,
  canSetOrder,
  onToggleSubEnabled,
  onRemoveCustom,
  addingCustom,
  newSubName,
  onAddingChange,
  onNewSubName,
  onAddCustom,
  onReorderSubtypes,
  isSavingParent,
  isSavingSubtypes,
}: {
  parent: TaxonomyNode;
  detail: CategoryDetail | null;
  isLoading: boolean;
  tab: "subtypes" | "fields" | "settings";
  onTabChange: (t: "subtypes" | "fields" | "settings") => void;
  onFlag: (key: keyof TaxonomyNode, val: boolean) => void;
  /** Phase 2 (Sub-Task 3): persist custom_label or custom_label_es. */
  onLabel: (locale: "en" | "es", raw: string) => void;
  /** Plan-tier capability: Studio+ may flip enable/disable + relabel. */
  canCustomize: boolean;
  /** Plan-tier capability: Agency+ may set display order. */
  canSetOrder: boolean;
  onToggleSubEnabled: (sub: TaxonomyNode) => void;
  onRemoveCustom: (sub: TaxonomyNode) => void;
  addingCustom: boolean;
  newSubName: string;
  onAddingChange: (adding: boolean) => void;
  onNewSubName: (name: string) => void;
  onAddCustom: () => void;
  onReorderSubtypes: (parentId: string, orderedSubTypeIds: string[]) => void;
  isSavingParent?: boolean;
  isSavingSubtypes?: boolean;
}) {
  const t = useT();
  const { isSpanish } = useDashboardText();
  const [draggingSubId, setDraggingSubId] = useState<string | null>(null);
  const subtypeCount =
    parent.children.length +
    (detail
      ? detail.groups.reduce((acc, g) => acc + g.talentTypes.length, 0) +
        detail.directTalentTypes.length
      : 0);

  return (
    <div style={{ padding: "0 14px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }} className="bg-admin-surface-alt">
      {/* Tab strip */}
      <div style={{ display: "flex", gap: 6, paddingTop: 10 }}>
        <TabBtn id="subtypes" label={t("dashboard.adminDrawers.taxonomyTabSubtypes")} count={subtypeCount} active={tab === "subtypes"} onClick={() => onTabChange("subtypes")} />
        <TabBtn id="fields" label={t("dashboard.adminDrawers.taxonomyTabFields")} count={detail?.fields.length} active={tab === "fields"} onClick={() => onTabChange("fields")} />
        <TabBtn id="settings" label={t("dashboard.adminDrawers.taxonomyTabSettings")} active={tab === "settings"} onClick={() => onTabChange("settings")} />
      </div>

      {/* SUBTYPES TAB */}
      {tab === "subtypes" && (
        <div>
          {isSavingSubtypes && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-admin-sm text-admin-11 font-medium mb-1.5 bg-admin-surface text-admin-ink-muted border border-admin-border-soft">
              {t("dashboard.adminDrawers.taxonomySavingSubOrder")}
            </div>
          )}
          {isLoading && !detail && (
            <div style={{ padding: 12, fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-muted">
              {t("dashboard.adminDrawers.taxonomyLoadingSubtypes")}
            </div>
          )}
          {detail && detail.groups.length === 0 && detail.directTalentTypes.length === 0 && parent.children.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-muted">
              {t("dashboard.adminDrawers.taxonomyNoSubtypes")}
            </div>
          )}

          {/* Level-2 category_groups (from getEnabledTaxonomyTree)
              with their level-3 talent_types nested (from getCategoryDetail). */}
          {parent.children.map((sub) => {
            const groupRow = detail?.groups.find((g) => g.group.id === sub.id);
            const ttList = groupRow?.talentTypes ?? [];
            return (
              <div
                key={sub.id}
                draggable
                onDragStart={() => setDraggingSubId(sub.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!draggingSubId || draggingSubId === sub.id) return;
                  const ordered = reorderIds(
                    parent.children.map((child) => child.id),
                    draggingSubId,
                    sub.id,
                  );
                  onReorderSubtypes(parent.id, ordered);
                  setDraggingSubId(null);
                }}
                onDragEnd={() => setDraggingSubId(null)}
                style={{
                  marginBottom: 8, borderRadius: 8, background: "#fff",
                  border: `1px solid ${COLORS.borderSoft}`, overflow: "hidden",
                  fontFamily: FONTS.body,
                  cursor: "grab",
                }}
              >
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px",
                }}>
                  <span
                    aria-hidden
                    title={t("dashboard.adminDrawers.taxonomyDragSubtypes")}
                    className="select-none text-admin-ink-dim text-admin-11 font-bold"
                  >
                    ⋮⋮
                  </span>
                  <div className="flex-1">
                    <div className="text-admin-ink text-admin-12h font-semibold">
                      {taxonomyDisplayName(sub, isSpanish)}
                      {sub.is_custom && (
                        <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 4 }} className="bg-admin-indigo-soft text-admin-indigo-deep">{t("dashboard.adminDrawers.taxonomyCustomBadge")}</span>
                      )}
                    </div>
                    {ttList.length > 0 && (
                      <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">
                        {interpolate(t(ttList.length === 1 ? "dashboard.adminDrawers.taxonomyTalentTypesCountOne" : "dashboard.adminDrawers.taxonomyTalentTypesCountOther"), { count: ttList.length })}
                      </div>
                    )}
                  </div>
                  {!sub.is_custom && (
                    <button
                      type="button"
                      onClick={() => onToggleSubEnabled(sub)}
                      aria-pressed={sub.is_enabled}
                      style={{
                        width: 28, height: 16, borderRadius: 999,
                        background: sub.is_enabled ? COLORS.accent : "rgba(11,11,13,0.12)",
                        border: "none", cursor: "pointer", padding: 0,
                        position: "relative",
                      }}
                    >
                      <span style={{ position: "absolute", top: 2, left: sub.is_enabled ? 14 : 2, width: 12, height: 12, borderRadius: "50%", background: "#fff", }} />
                    </button>
                  )}
                  {sub.is_custom && (
                    <button
                      type="button"
                      onClick={() => onRemoveCustom(sub)}
                      style={{
                        padding: "3px 8px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${COLORS.border}`, background: "#fff", cursor: "pointer", fontFamily: FONTS.body }} className="text-admin-red">{t("dashboard.adminDrawers.remove")}</button>
                  )}
                </div>
                {ttList.length > 0 && (
                  <div style={{ padding: "6px 10px 10px 24px", display: "flex", flexWrap: "wrap", gap: 4, borderTop: `1px solid ${COLORS.borderSoft}` }} className="bg-admin-surface-alt">
                    {ttList.map((tt) => (
                      <span key={tt.id} style={{
                        padding: "3px 8px", fontSize: 11, color: COLORS.inkMuted,
                        background: "#fff", borderRadius: 999,
                        border: `1px solid ${COLORS.borderSoft}`,
                      }}>{tt.name_en}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Direct talent_types (rare). */}
          {detail && detail.directTalentTypes.length > 0 && (
            <div style={{
              marginBottom: 8, padding: "8px 10px", borderRadius: 8,
              background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
              fontFamily: FONTS.body,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: 0.4 }} className="text-admin-ink-muted">
                {t("dashboard.adminDrawers.taxonomyDirectTypes")}
              </div>
              <div className="flex flex-wrap gap-1">
                {detail.directTalentTypes.map((tt) => (
                  <span key={tt.id} style={{
                    padding: "3px 8px", fontSize: 11, color: COLORS.inkMuted,
                    background: COLORS.surfaceAlt, borderRadius: 999,
                    border: `1px solid ${COLORS.borderSoft}`,
                  }}>{tt.name_en}</span>
                ))}
              </div>
            </div>
          )}

          {/* Add custom sub-type. */}
          {addingCustom ? (
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <input
                value={newSubName}
                onChange={(e) => onNewSubName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onAddCustom(); }}
                placeholder={t("dashboard.adminDrawers.taxonomyAddCustomPlaceholder")}
                autoFocus
                style={{
                  flex: 1, padding: "8px 10px", borderRadius: 8,
                  border: `1px solid ${COLORS.border}`, fontSize: 13,
                  fontFamily: FONTS.body, background: "#fff",
                }}
              />
              <button
                type="button"
                onClick={onAddCustom}
                style={{
                  padding: "8px 12px", fontSize: 12, fontWeight: 600,
                  borderRadius: 8, border: "none",
                  background: COLORS.ink, color: "#fff", cursor: "pointer",
                  fontFamily: FONTS.body,
                }}
              >{t("dashboard.adminDrawers.add")}</button>
              <button
                type="button"
                onClick={() => { onAddingChange(false); onNewSubName(""); }}
                style={{
                  padding: "8px 12px", fontSize: 12, fontWeight: 600,
                  borderRadius: 8, border: `1px solid ${COLORS.border}`,
                  background: "#fff", color: COLORS.inkMuted, cursor: "pointer",
                  fontFamily: FONTS.body,
                }}
              >{t("dashboard.adminDrawers.cancel")}</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onAddingChange(true)}
              style={{
                padding: "6px 10px", fontSize: 12, fontWeight: 600,
                borderRadius: 8, border: `1px dashed ${COLORS.border}`,
                background: "transparent", color: COLORS.inkMuted, cursor: "pointer",
                fontFamily: FONTS.body, alignSelf: "flex-start",
              }}
            >{t("dashboard.adminDrawers.taxonomyAddCustomButton")}</button>
          )}
        </div>
      )}

      {/* FIELDS TAB */}
      {tab === "fields" && (
        <div>
          {isLoading && !detail && (
            <div style={{ padding: 12, fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-muted">
              {t("dashboard.adminDrawers.taxonomyLoadingFields")}
            </div>
          )}
          {detail && (() => {
            const grouped = new Map<string, CategoryFieldEntry[]>();
            for (const f of detail.fields) {
              const list = grouped.get(f.tier) ?? [];
              list.push(f);
              grouped.set(f.tier, list);
            }
            const tierOrder: Array<["universal" | "global" | "type-specific", string, string]> = [
              ["universal", t("dashboard.adminDrawers.taxonomyTierUniversal"), t("dashboard.adminDrawers.taxonomyTierUniversalDesc")],
              ["global", t("dashboard.adminDrawers.taxonomyTierGlobal"), t("dashboard.adminDrawers.taxonomyTierGlobalDesc")],
              ["type-specific", t("dashboard.adminDrawers.taxonomyTierCategory"), interpolate(t("dashboard.adminDrawers.taxonomyTierCategoryDesc"), { category: taxonomyDisplayName(parent, isSpanish) })],
            ];
            const rows = tierOrder.map(([tier, label, desc]) => {
              const list = grouped.get(tier) ?? [];
              if (list.length === 0) return null;
              return (
                <div key={tier} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, marginBottom: 4, fontFamily: FONTS.body }} className="text-admin-ink">{interpolate(t("dashboard.adminDrawers.taxonomyTierCount"), { label: label.toUpperCase(), count: list.length })}</div>
                  <div style={{ fontSize: 11, marginBottom: 6, fontFamily: FONTS.body }} className="text-admin-ink-muted">{desc}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {list.map((f) => (
                      <div key={f.field_definition_id} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "6px 10px", borderRadius: 6,
                        background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
                        fontFamily: FONTS.body,
                      }}>
                        <span style={{ flex: 1, fontSize: 12.5 }} className="text-admin-ink">
                          {f.label}
                          {f.is_required && (
                            <span style={{ marginLeft: 6, fontWeight: 700 }} className="text-admin-red">*</span>
                          )}
                        </span>
                        {f.tier === "type-specific" && (
                          <span className="text-admin-ink-muted text-admin-10">{f.source}</span>
                        )}
                        <span style={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }} className="text-admin-ink-muted">{f.kind}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }).filter(Boolean);
            if (rows.length === 0) {
              return (
                <div className="p-3 text-admin-12h text-admin-ink-muted">
                  {t("dashboard.adminDrawers.taxonomyNoFields")}
                </div>
              );
            }
            return rows;
          })()}
        </div>
      )}

      {/* SETTINGS TAB */}
      {tab === "settings" && (
        <div className="flex flex-col gap-2.5">
          {!parent.is_enabled && (
            <div style={{ padding: 10, borderRadius: 8, border: `1px solid ${COLORS.amber}`, fontSize: 11.5, fontFamily: FONTS.body }} className="bg-admin-amber-soft text-admin-ink">
              {t("dashboard.adminDrawers.taxonomySettingsDisabledNote")}
            </div>
          )}
          {/* Phase 4.2: visible async state for in-flight settings saves
              (toggles, label edits, reorder writes from this panel). */}
          {isSavingParent && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-admin-sm text-admin-11 font-medium bg-admin-surface text-admin-ink-muted border border-admin-border-soft">
              {t("dashboard.adminDrawers.saving")}
            </div>
          )}

          {/* Phase 2 (Sub-Task 3): EN/ES label override.
              Plan tier: Free is view-only; Studio+ can relabel. Platform
              default shown as muted placeholder so the admin always knows
              what they're overriding. Empty input → reset to platform. */}
          <div style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: `1px solid ${COLORS.borderSoft}`,
            background: "#fff",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontFamily: FONTS.body,
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink-muted">
              {t("dashboard.adminDrawers.taxonomyLabels")}
              {!canCustomize && (
                <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700 }} className="text-admin-indigo-deep">
                  {t("dashboard.adminDrawers.taxonomyStudioRequiredSuffix")}
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <label style={{ display: "block", fontSize: 10.5, fontWeight: 600, marginBottom: 3 }} className="text-admin-ink-muted">
                  {t("dashboard.adminDrawers.taxonomyLabelEnglish")} {parent.custom_label && <span className="text-admin-amber-deep">{t("dashboard.adminDrawers.taxonomyCustomTag")}</span>}
                </label>
                <input
                  type="text"
                  defaultValue={parent.custom_label ?? ""}
                  placeholder={parent.name_en}
                  disabled={!canCustomize}
                  onBlur={(e) => canCustomize && onLabel("en", e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "6px 9px",
                    borderRadius: 7,
                    border: `1px solid ${COLORS.borderSoft}`,
                    background: canCustomize ? "#fff" : "rgba(11,11,13,0.03)",
                    fontFamily: FONTS.body,
                    fontSize: 12,
                    color: COLORS.ink,
                    outline: "none",
                  }}
                />
              </div>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <label style={{ display: "block", fontSize: 10.5, fontWeight: 600, marginBottom: 3 }} className="text-admin-ink-muted">
                  {t("dashboard.adminDrawers.taxonomyLabelSpanish")} {parent.custom_label_es && <span className="text-admin-amber-deep">{t("dashboard.adminDrawers.taxonomyCustomTag")}</span>}
                </label>
                <input
                  type="text"
                  defaultValue={parent.custom_label_es ?? ""}
                  placeholder={parent.name_es ?? parent.name_en}
                  disabled={!canCustomize}
                  onBlur={(e) => canCustomize && onLabel("es", e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "6px 9px",
                    borderRadius: 7,
                    border: `1px solid ${COLORS.borderSoft}`,
                    background: canCustomize ? "#fff" : "rgba(11,11,13,0.03)",
                    fontFamily: FONTS.body,
                    fontSize: 12,
                    color: COLORS.ink,
                    outline: "none",
                  }}
                />
              </div>
            </div>
            <div style={{ fontSize: 10.5, lineHeight: 1.4 }} className="text-admin-ink-muted">
              {t("dashboard.adminDrawers.taxonomyLabelsHint")}
              {!canSetOrder && interpolate(t("dashboard.adminDrawers.taxonomyReorderAgencyHint"), { plan: "Agency" })}
            </div>
          </div>

          <TaxonomyToggleRow
            label={t("dashboard.adminDrawers.taxonomyAllowPrimary")}
            desc={t("dashboard.adminDrawers.taxonomyAllowPrimaryDesc")}
            value={parent.allow_as_primary}
            onChange={(v) => onFlag("allow_as_primary", v)}
            disabled={isSavingParent}
          />
          <TaxonomyToggleRow
            label={t("dashboard.adminDrawers.taxonomyAllowSecondary")}
            desc={t("dashboard.adminDrawers.taxonomyAllowSecondaryDesc")}
            value={parent.allow_as_secondary}
            onChange={(v) => onFlag("allow_as_secondary", v)}
            disabled={isSavingParent}
          />
          <TaxonomyToggleRow
            label={t("dashboard.adminDrawers.taxonomyShowInRegistration")}
            desc={t("dashboard.adminDrawers.taxonomyShowInRegistrationDesc")}
            value={parent.show_in_registration}
            onChange={(v) => onFlag("show_in_registration", v)}
            disabled={isSavingParent}
          />
          <TaxonomyToggleRow
            label={t("dashboard.adminDrawers.taxonomyShowInDirectory")}
            desc={t("dashboard.adminDrawers.taxonomyShowInDirectoryDesc")}
            value={parent.show_in_directory}
            onChange={(v) => onFlag("show_in_directory", v)}
            disabled={isSavingParent}
          />
          <TaxonomyToggleRow
            label={t("dashboard.adminDrawers.taxonomyRequireApproval")}
            desc={t("dashboard.adminDrawers.taxonomyRequireApprovalDesc")}
            value={parent.requires_approval}
            onChange={(v) => onFlag("requires_approval", v)}
            disabled={isSavingParent}
          />
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// LiveTalentTypesDrawer — real-DB view of taxonomy management.
//
// Reads getEnabledTaxonomyTree() (parent_category → talent_type), wires
// every toggle/flag to setTaxonomyEnabled / setTaxonomyFlags, and lets
// the workspace add a tenant-local sub-type via addCustomSubType.
//
// When this returns null (no tenant context, hooks not ready), the
// legacy WorkspaceTalentTypesDrawer below renders the prototype state
// so design QA without auth still works.
// ════════════════════════════════════════════════════════════════════


export function LiveTalentTypesDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { isSpanish } = useDashboardText();
  const { state, toast } = useAdminShell();
  // Phase 2 (Sub-Task 3): plan-tier gating mirrors light-09 (FIELD pattern).
  // canCustomize → Studio+ (enable/disable + relabel).
  // canSetOrder  → Agency+ (drag reorder; existing drag is gated below).
  const planRules =
    FIELD_PRIVACY_PLAN_RULES[state.plan as "free" | "studio" | "agency" | "network"]
    ?? FIELD_PRIVACY_PLAN_RULES.free;
  const canCustomize = planRules.canFlipPublicInternal;
  const canSetOrder = planRules.canSetRequired;
  const [tree, setTree] = useState<TaxonomyNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [savedRecently, setSavedRecently] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addingForParent, setAddingForParent] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState("");
  const [draggingTaxonomyId, setDraggingTaxonomyId] = useState<string | null>(null);
  // Lazy-loaded category detail (level-3 talent_types + recommended fields).
  // Keyed by parent_id; populated when the admin first expands a category.
  const [details, setDetails] = useState<Map<string, CategoryDetail>>(new Map());
  const [detailLoading, setDetailLoading] = useState<Set<string>>(new Set());
  const [detailTab, setDetailTab] = useState<Map<string, "subtypes" | "fields" | "settings">>(new Map());

  const loadDetail = async (parentId: string) => {
    if (details.has(parentId) || detailLoading.has(parentId)) return;
    setDetailLoading((p) => new Set(p).add(parentId));
    const res = await getCategoryDetail({ parent_id: parentId });
    setDetailLoading((p) => {
      const n = new Set(p);
      n.delete(parentId);
      return n;
    });
    if (res.ok) {
      setDetails((p) => new Map(p).set(parentId, res.detail));
    }
  };

  const toggleExpand = (parentId: string) => {
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(parentId)) n.delete(parentId);
      else {
        n.add(parentId);
        loadDetail(parentId);
      }
      return n;
    });
  };

  const getTab = (parentId: string) => detailTab.get(parentId) ?? "subtypes";
  const setTab = (parentId: string, tab: "subtypes" | "fields" | "settings") => {
    setDetailTab((p) => new Map(p).set(parentId, tab));
  };

  // Load tree on first open.
  useEffect(() => {
    if (!open || tree !== null || loading) return;
    setLoading(true);
    setError(null);
    getEnabledTaxonomyTree().then((res) => {
      if (res.ok) {
        setTree(res.tree);
      } else {
        setError(res.error);
      }
      setLoading(false);
    });
  }, [open, tree, loading]);

  const markSaving = (id: string, isSaving: boolean) => {
    setSaving((prev) => {
      const next = new Set(prev);
      if (isSaving) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const markSaveDone = (id: string, ok: boolean) => {
    setSaving((prev) => { const n = new Set(prev); n.delete(id); return n; });
    if (ok) {
      setSavedRecently((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setSavedRecently((prev) => { const n = new Set(prev); n.delete(id); return n; });
      }, 1500);
    }
  };

  // Optimistic mutation helper — patches the local tree, fires server
  // action, reverts on failure.
  const patchNode = (id: string, patch: Partial<TaxonomyNode>) => {
    setTree((cur) => {
      if (!cur) return cur;
      const apply = (list: TaxonomyNode[]): TaxonomyNode[] =>
        list.map((n) =>
          n.id === id
            ? { ...n, ...patch }
            : { ...n, children: apply(n.children) },
        );
      return apply(cur);
    });
  };

  const handleToggleEnabled = async (node: TaxonomyNode) => {
    // Phase 2 (Sub-Task 3) plan-tier floor: Free is read-only.
    if (!canCustomize) {
      toast(t("dashboard.adminDrawers.taxonomyUpgradeStudioEnable"));
      return;
    }
    markSaving(node.id, true);
    const before = node.is_enabled;
    patchNode(node.id, { is_enabled: !before });
    const res = await setTaxonomyEnabled({
      taxonomy_term_id: node.id,
      is_enabled: !before,
    });
    if (!res.ok) {
      patchNode(node.id, { is_enabled: before });
      toast(res.error);
    }
    markSaveDone(node.id, res.ok);
  };

  const handleFlag = async (node: TaxonomyNode, key: keyof TaxonomyNode, val: boolean) => {
    markSaving(node.id, true);
    const before = node[key] as boolean;
    patchNode(node.id, { [key]: val } as Partial<TaxonomyNode>);
    const res = await setTaxonomyFlags({
      taxonomy_term_id: node.id,
      [key]: val,
    });
    if (!res.ok) {
      patchNode(node.id, { [key]: before } as Partial<TaxonomyNode>);
      toast(res.error);
    }
    markSaveDone(node.id, res.ok);
  };

  // Phase 2 (Sub-Task 3): persist custom_label / custom_label_es. Trim +
  // empty-to-null normalization mirrors light-09's field-label edit pattern
  // (the override-vs-platform-default surface is symmetric). Optimistic
  // patch with rollback on failure so the input always reflects DB truth.
  const handleLabel = async (
    node: TaxonomyNode,
    locale: "en" | "es",
    raw: string,
  ) => {
    if (!canCustomize) {
      toast(t("dashboard.adminDrawers.taxonomyUpgradeStudioRename"));
      return;
    }
    const trimmed = raw.trim();
    const platformDefault = locale === "en" ? node.name_en : (node.name_es ?? "");
    const next = trimmed && trimmed !== platformDefault ? trimmed : null;
    const currentOverride = locale === "en" ? node.custom_label : node.custom_label_es;
    if ((currentOverride ?? null) === next) return;
    markSaving(node.id, true);
    patchNode(
      node.id,
      locale === "en" ? { custom_label: next } : { custom_label_es: next },
    );
    const res = await setTaxonomyFlags({
      taxonomy_term_id: node.id,
      ...(locale === "en" ? { custom_label: next } : { custom_label_es: next }),
    });
    if (!res.ok) {
      // Revert optimistic patch on failure.
      patchNode(
        node.id,
        locale === "en"
          ? { custom_label: currentOverride }
          : { custom_label_es: currentOverride },
      );
      toast(res.error);
    } else {
      toast(
        next
          ? interpolate(t("dashboard.adminDrawers.taxonomyRenamedForWorkspace"), { locale: locale.toUpperCase() })
          : interpolate(t("dashboard.adminDrawers.taxonomyResetToPlatform"), { locale: locale.toUpperCase() }),
      );
    }
    markSaving(node.id, false);
  };

  const persistRootOrder = async (nextTree: TaxonomyNode[], previousTree: TaxonomyNode[]) => {
    markSaving("taxonomy-order", true);
    for (let index = 0; index < nextTree.length; index += 1) {
      const node = nextTree[index];
      const displayOrder = (index + 1) * 10;
      const res = await setTaxonomyFlags({
        taxonomy_term_id: node.id,
        display_order: displayOrder,
      });
      if (!res.ok) {
        setTree(previousTree);
        markSaveDone("taxonomy-order", false);
        toast(res.error || t("dashboard.adminDrawers.taxonomyOrderSaveFailed"));
        return;
      }
    }
    markSaveDone("taxonomy-order", true);
    toast(t("dashboard.adminDrawers.taxonomyOrderSaved"));
  };

  const persistSubTypeOrder = async (
    parentId: string,
    orderedSubTypeIds: string[],
    previousTree: TaxonomyNode[],
  ) => {
    const savingKey = `taxonomy-order:${parentId}`;
    markSaving(savingKey, true);
    for (let index = 0; index < orderedSubTypeIds.length; index += 1) {
      const taxonomyTermId = orderedSubTypeIds[index]!;
      const displayOrder = (index + 1) * 10;
      const res = await setTaxonomyFlags({
        taxonomy_term_id: taxonomyTermId,
        display_order: displayOrder,
      });
      if (!res.ok) {
        setTree(previousTree);
        markSaveDone(savingKey, false);
        toast(res.error || t("dashboard.adminDrawers.taxonomySubOrderSaveFailed"));
        return;
      }
    }
    markSaveDone(savingKey, true);
    toast(t("dashboard.adminDrawers.taxonomySubOrderSaved"));
  };

  const reorderParentSubTypes = (parentId: string, orderedSubTypeIds: string[]) => {
    // Phase 2 (Sub-Task 3) plan-tier floor: ordering requires Agency+.
    if (!canSetOrder) {
      toast(t("dashboard.adminDrawers.taxonomyUpgradeAgencyReorderSub"));
      return;
    }
    if (!tree || orderedSubTypeIds.length < 2) return;
    const previousTree = tree;
    const orderMap = new Map(
      orderedSubTypeIds.map((id, index) => [id, (index + 1) * 10] as const),
    );
    setTree((current) =>
      current?.map((node) =>
        node.id === parentId
          ? {
              ...node,
              children: node.children
                .map((child) => ({
                  ...child,
                  display_order: orderMap.get(child.id) ?? child.display_order,
                }))
                .sort(
                  (a, b) =>
                    a.display_order - b.display_order ||
                    a.name_en.localeCompare(b.name_en),
                ),
            }
          : node,
      ) ?? current,
    );
    void persistSubTypeOrder(parentId, orderedSubTypeIds, previousTree);
  };

  const dropRootCategory = (target: TaxonomyNode) => {
    // Phase 2 (Sub-Task 3) plan-tier floor: ordering requires Agency+.
    if (!canSetOrder) {
      toast(t("dashboard.adminDrawers.taxonomyUpgradeAgencyReorderCat"));
      return;
    }
    if (!draggingTaxonomyId || draggingTaxonomyId === target.id || !tree) return;
    const previousTree = tree;
    const ordered = tree
      .slice()
      .sort((a, b) => a.display_order - b.display_order || a.name_en.localeCompare(b.name_en));
    const from = ordered.findIndex((node) => node.id === draggingTaxonomyId);
    const to = ordered.findIndex((node) => node.id === target.id);
    if (from < 0 || to < 0 || from === to) {
      setDraggingTaxonomyId(null);
      return;
    }
    const nextTree = [...ordered];
    const [picked] = nextTree.splice(from, 1);
    nextTree.splice(to, 0, picked);
    const orderMap = new Map(nextTree.map((node, index) => [node.id, (index + 1) * 10] as const));
    setTree((current) => current?.map((node) => ({
      ...node,
      display_order: orderMap.get(node.id) ?? node.display_order,
    })) ?? current);
    setDraggingTaxonomyId(null);
    void persistRootOrder(nextTree, previousTree);
  };

  const handleAddCustom = async (parent: TaxonomyNode) => {
    const name = newSubName.trim();
    if (!name) {
      toast(t("dashboard.adminDrawers.taxonomyEnterNameFirst"));
      return;
    }
    const res = await addCustomSubType({
      parent_id: parent.id,
      name_en: name,
    });
    if (!res.ok) {
      toast(res.error);
      return;
    }
    setNewSubName("");
    setAddingForParent(null);
    // Reload tree to pick up the new sub-type.
    const fresh = await getEnabledTaxonomyTree();
    if (fresh.ok) setTree(fresh.tree);
    toast(interpolate(t("dashboard.adminDrawers.taxonomyAddedCustom"), { name }));
  };

  const handleRemoveCustom = async (node: TaxonomyNode) => {
    const shownName = taxonomyDisplayName(node, isSpanish);
    if (!confirm(interpolate(t("dashboard.adminDrawers.taxonomyRemoveConfirm"), { name: shownName }))) return;
    const res = await removeCustomSubType({ id: node.id });
    if (!res.ok) {
      toast(res.error);
      return;
    }
    const fresh = await getEnabledTaxonomyTree();
    if (fresh.ok) setTree(fresh.tree);
    toast(interpolate(t("dashboard.adminDrawers.taxonomyRemoved"), { name: shownName }));
  };

  const totalEnabled = useMemo(
    () => (tree ?? []).filter((n) => n.is_enabled).length,
    [tree],
  );

  if (!open) return null;

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={t("dashboard.adminDrawers.taxonomyTitle")}
      description={t("dashboard.adminDrawers.taxonomyDescription")}
      footer={
        <PrimaryButton onClick={onClose}>{t("dashboard.adminDrawers.done")}</PrimaryButton>
      }
    >
      {error && (
        <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${COLORS.amber}`, fontSize: 12, marginBottom: 14, fontFamily: FONTS.body }} className="bg-admin-amber-soft text-admin-ink">
          {interpolate(t("dashboard.adminDrawers.taxonomyLoadError"), { error })}
        </div>
      )}

      {loading && (
        <div style={{ padding: 24, textAlign: "center", fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">{t("dashboard.adminDrawers.taxonomyLoading")}</div>
      )}

      {tree && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10, border: `1px solid rgba(91,107,160,0.18)`, fontFamily: FONTS.body, marginBottom: 14 }} className="bg-admin-indigo-soft">
            <div>
              <div className="text-admin-indigo-deep text-xs font-semibold">
                {interpolate(t("dashboard.adminDrawers.taxonomyEnabledCount"), { enabled: totalEnabled, total: tree.length })}
              </div>
              <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">
                {t("dashboard.adminDrawers.taxonomyChangesSaveInstantly")}
              </div>
            </div>
          </div>

          {saving.has("taxonomy-order") && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-admin-sm text-admin-11 font-medium mb-2 bg-admin-surface-alt text-admin-ink-muted border border-admin-border-soft">
              {t("dashboard.adminDrawers.taxonomySavingOrder")}
            </div>
          )}

          <div style={{
            background: "#fff", borderRadius: 12, overflow: "hidden",
            border: `1px solid ${COLORS.borderSoft}`,
            boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
          }}>
            {tree.map((parent, i) => {
              const isExpanded = expanded.has(parent.id);
              const isSaving = saving.has(parent.id);
              const isSavedRecently = savedRecently.has(parent.id);
              const childCount = parent.children.length;
              const customCount = parent.children.filter(c => c.is_custom).length;
              return (
                <div
                  key={parent.id}
                  draggable
                  onDragStart={() => setDraggingTaxonomyId(parent.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropRootCategory(parent)}
                  onDragEnd={() => setDraggingTaxonomyId(null)}
                  style={{
                    borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                    fontFamily: FONTS.body,
                    opacity: parent.is_enabled ? 1 : 0.55,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer" }} onClick={() => toggleExpand(parent.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="text-admin-ink text-admin-13h font-semibold">
                        <span
                          aria-hidden
                          title={t("dashboard.adminDrawers.taxonomyDragCategories")}
                          className="mr-2 select-none text-admin-ink-dim text-admin-11 font-bold"
                        >
                          ⋮⋮
                        </span>
                        {taxonomyDisplayName(parent, isSpanish)}
                      </div>
                      <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">
                        {interpolate(t(childCount === 1 ? "dashboard.adminDrawers.taxonomySubtypesCountOne" : "dashboard.adminDrawers.taxonomySubtypesCountOther"), { count: childCount })}
                        {customCount > 0 ? interpolate(t("dashboard.adminDrawers.taxonomyCustomSuffix"), { count: customCount }) : ""}
                        {parent.is_enabled ? "" : t("dashboard.adminDrawers.taxonomyDisabledSuffix")}
                      </div>
                    </div>
                    {/* Save-state indicator — persistent, not toast-only */}
                    {(isSaving || isSavedRecently) && (
                      <span className={`text-admin-10 font-semibold px-2 py-0.5 rounded shrink-0 ${isSaving ? "bg-[rgba(11,11,13,0.07)] text-admin-ink-muted" : "bg-admin-accent-soft text-admin-accent"}`}>
                        {isSaving ? t("dashboard.adminDrawers.saving") : `✓ ${t("dashboard.adminDrawers.saved")}`}
                      </span>
                    )}
                    {/* Chevron — signals the row is expandable */}
                    <span aria-hidden className="text-admin-13 text-admin-ink-muted shrink-0 select-none">
                      {isExpanded ? "▾" : "▸"}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleToggleEnabled(parent); }}
                      aria-pressed={parent.is_enabled}
                      disabled={isSaving}
                      style={{
                        width: 36, height: 22, borderRadius: 999,
                        background: parent.is_enabled ? COLORS.accent : "rgba(11,11,13,0.12)",
                        border: "none", cursor: "pointer", padding: 0,
                        position: "relative", transition: "background 0.15s",
                        flexShrink: 0,
                      }}
                    >
                      <span style={{
                        position: "absolute", top: 2, left: parent.is_enabled ? 16 : 2,
                        width: 18, height: 18, borderRadius: "50%", background: "#fff",
                        transition: "left 0.15s",
                      }} />
                    </button>
                  </div>

                  {isExpanded && (
                    <CategoryExpandPanel
                      parent={parent}
                      detail={details.get(parent.id) ?? null}
                      isLoading={detailLoading.has(parent.id)}
                      tab={getTab(parent.id)}
                      onTabChange={(t) => setTab(parent.id, t)}
                      onFlag={(key, val) => {
                        // Plan-tier safety floor — Free can read but not write.
                        if (!canCustomize) {
                          toast(t("dashboard.adminDrawers.taxonomyUpgradeStudioCustomize"));
                          return;
                        }
                        handleFlag(parent, key, val);
                      }}
                      onLabel={(locale, raw) => handleLabel(parent, locale, raw)}
                      canCustomize={canCustomize}
                      canSetOrder={canSetOrder}
                      onToggleSubEnabled={handleToggleEnabled}
                      onRemoveCustom={handleRemoveCustom}
                      addingCustom={addingForParent === parent.id}
                      newSubName={newSubName}
                      onAddingChange={(adding) => setAddingForParent(adding ? parent.id : null)}
                      onNewSubName={setNewSubName}
                      onAddCustom={() => handleAddCustom(parent)}
                      onReorderSubtypes={reorderParentSubTypes}
                      isSavingParent={saving.has(parent.id)}
                      isSavingSubtypes={saving.has(`taxonomy-order:${parent.id}`)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </DrawerShell>
  );
}


export function LegacyTalentTypesDrawer() {
  const t = useT();
  const { state, closeDrawer, openDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "talent-types";
  const [settings, setSettings] = useState(WORKSPACE_TAXONOMY_DEFAULT);
  const limit = PLAN_TAXONOMY_LIMITS[state.plan as keyof typeof PLAN_TAXONOMY_LIMITS] ?? 3;
  const enabledCount = settings.filter(s => s.isEnabled).length;
  const planLabel = state.plan.charAt(0).toUpperCase() + state.plan.slice(1);

  const planRank = (p: "free" | "studio" | "agency" | "network") =>
    ({ free: 0, studio: 1, agency: 2, network: 3 } as const)[p];
  const currentRank = planRank(state.plan as "free" | "studio" | "agency" | "network");

  const toggle = (parentId: string) => {
    const target = settings.find(s => s.parentId === parentId);
    if (!target) return;
    const parent = TAXONOMY.find(p => p.id === parentId);
    if (!parent) return;
    if (planRank(parent.minPlan) > currentRank) {
      toast(interpolate(t("dashboard.adminDrawers.legacyTaxonomyRequiresPlan"), {
        category: parent.label,
        plan: parent.minPlan.charAt(0).toUpperCase() + parent.minPlan.slice(1),
      }));
      return;
    }
    if (!target.isEnabled && enabledCount >= limit) {
      toast(t("dashboard.adminDrawers.legacyTaxonomyPlanLimitReached"));
      return;
    }
    setSettings(s => s.map(x => x.parentId === parentId ? { ...x, isEnabled: !x.isEnabled } : x));
  };

  const updateRule = (parentId: string, key: keyof WorkspaceTaxonomySetting, val: boolean) => {
    setSettings(s => s.map(x => x.parentId === parentId ? { ...x, [key]: val } : x));
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.adminDrawers.legacyTaxonomyTitle")}
      description={t("dashboard.adminDrawers.legacyTaxonomyDescription")}
      footer={
        <>
          <SecondaryButton onClick={() => openDrawer("talent-registration")}>{t("dashboard.adminDrawers.legacyTaxonomyPreviewRegistration")}</SecondaryButton>
          <PrimaryButton onClick={() => { toast(t("dashboard.adminDrawers.legacyTaxonomySaved")); closeDrawer(); }}>{t("dashboard.adminDrawers.save")}</PrimaryButton>
        </>
      }
    >
      {/* Plan usage strip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10, border: `1px solid rgba(91,107,160,0.18)`, fontFamily: FONTS.body, marginBottom: 14 }} className="bg-admin-indigo-soft">
        <div>
          <div className="text-admin-indigo-deep text-xs font-semibold">
            {limit === 999
              ? t("dashboard.adminDrawers.legacyTaxonomyAllGroups")
              : interpolate(t("dashboard.adminDrawers.legacyTaxonomyGroupsEnabled"), { enabled: enabledCount, limit })}
          </div>
          <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">
            {interpolate(t("dashboard.adminDrawers.legacyTaxonomyPlanLine"), {
              plan: planLabel,
              cap: limit === 999
                ? t("dashboard.adminDrawers.legacyTaxonomyNoCap")
                : t("dashboard.adminDrawers.legacyTaxonomyUpgradeForMore"),
            })}
          </div>
        </div>
        {limit !== 999 && (
          <button type="button" onClick={() => toast(t("dashboard.adminDrawers.legacyTaxonomyPlanCompare"))} style={{
            padding: "6px 12px", borderRadius: 999, border: "none",
            background: COLORS.indigoDeep, color: "#fff",
            fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>{t("dashboard.adminDrawers.legacyTaxonomyUpgrade")}</button>
        )}
      </div>

      {/* Available now (within plan tier) */}
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 8 }} className="text-admin-ink-muted">{t("dashboard.adminDrawers.legacyTaxonomyAvailableOnPlan")}</div>
      <div style={{
        background: "#fff", borderRadius: 12, overflow: "hidden",
        border: `1px solid ${COLORS.borderSoft}`,
        boxShadow: "0 1px 2px rgba(11,11,13,0.03)", marginBottom: 14,
      }}>
        {TAXONOMY.filter(p => planRank(p.minPlan) <= currentRank).map((parent, i) => {
          const setting = settings.find(s => s.parentId === parent.id)!;
          return (
            <TalentTypeRow
              key={parent.id} parent={parent} setting={setting}
              isFirst={i === 0}
              onToggle={() => toggle(parent.id)}
              onRule={(k, v) => updateRule(parent.id, k, v)}
              locked={false}
            />
          );
        })}
      </div>

      {/* Locked behind plan */}
      {TAXONOMY.some(p => planRank(p.minPlan) > currentRank) && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 8 }} className="text-admin-ink-muted">{t("dashboard.adminDrawers.legacyTaxonomyLocked")}</div>
          <div style={{
            background: "#fff", borderRadius: 12, overflow: "hidden",
            border: `1px solid ${COLORS.borderSoft}`,
            boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
          }}>
            {TAXONOMY.filter(p => planRank(p.minPlan) > currentRank).map((parent, i) => {
              const setting = settings.find(s => s.parentId === parent.id)!;
              return (
                <TalentTypeRow
                  key={parent.id} parent={parent} setting={setting}
                  isFirst={i === 0}
                  onToggle={() => toast(interpolate(t("dashboard.adminDrawers.legacyTaxonomyRequiresPlan"), {
                    category: parent.label,
                    plan: parent.minPlan.charAt(0).toUpperCase() + parent.minPlan.slice(1),
                  }))}
                  onRule={() => {}}
                  locked={true}
                />
              );
            })}
          </div>
        </>
      )}
    </DrawerShell>
  );
}


export function TalentTypeRow({
  parent, setting, isFirst, onToggle, onRule, locked,
}: {
  parent: TaxonomyParent;
  setting: WorkspaceTaxonomySetting;
  isFirst: boolean;
  onToggle: () => void;
  onRule: (key: keyof WorkspaceTaxonomySetting, val: boolean) => void;
  locked: boolean;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      borderTop: isFirst ? "none" : `1px solid ${COLORS.borderSoft}`,
      fontFamily: FONTS.body,
      opacity: locked ? 0.55 : 1,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 14px", cursor: locked ? "not-allowed" : "pointer",
      }} onClick={() => !locked && setting.isEnabled && setExpanded(e => !e)}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>{parent.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="text-admin-ink text-admin-13h font-semibold">
            {parent.label}
          </div>
          <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">
            {parent.helper}
          </div>
        </div>
        {locked ? (
          <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 999, textTransform: "capitalize" }} className="bg-admin-royal-soft text-admin-royal-deep">{parent.minPlan}</span>
        ) : (
          <button type="button"
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            aria-pressed={setting.isEnabled}
            style={{
              width: 36, height: 22, borderRadius: 999,
              background: setting.isEnabled ? COLORS.accent : "rgba(11,11,13,0.12)",
              border: "none", cursor: "pointer", padding: 0,
              position: "relative", transition: "background 0.15s",
              flexShrink: 0,
            }}>
            <span style={{
              position: "absolute", top: 2, left: setting.isEnabled ? 16 : 2,
              width: 18, height: 18, borderRadius: "50%", background: "#fff",
              transition: "left 0.15s",
            }} />
          </button>
        )}
      </div>
      {expanded && setting.isEnabled && !locked && (
        <div style={{
          padding: "0 14px 12px 50px", display: "flex", flexDirection: "column", gap: 8,
        }}>
          <TaxonomyToggleRow
            label={t("dashboard.adminDrawers.taxonomyShowInDirectory")}
            desc={t("dashboard.adminDrawers.legacyTaxonomyShowInDirectoryDesc")}
            value={setting.showInDirectory}
            onChange={(v) => onRule("showInDirectory", v)}
          />
          <TaxonomyToggleRow
            label={t("dashboard.adminDrawers.taxonomyShowInRegistration")}
            desc={t("dashboard.adminDrawers.legacyTaxonomyShowInRegistrationDesc")}
            value={setting.showInRegistration}
            onChange={(v) => onRule("showInRegistration", v)}
          />
          <TaxonomyToggleRow
            label={t("dashboard.adminDrawers.taxonomyRequireApproval")}
            desc={t("dashboard.adminDrawers.legacyTaxonomyRequireApprovalDesc")}
            value={setting.requiresApproval}
            onChange={(v) => onRule("requiresApproval", v)}
          />
        </div>
      )}
    </div>
  );
}


export function TaxonomyToggleRow({ label, desc, value, onChange, disabled }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5${disabled ? " opacity-50 pointer-events-none" : ""}`}>
      <button type="button" onClick={() => onChange(!value)}
        aria-pressed={value}
        disabled={disabled}
        style={{
          width: 32, height: 18, borderRadius: 999, border: "none", cursor: "pointer", padding: 0,
          background: value ? COLORS.accent : "rgba(11,11,13,0.12)",
          position: "relative", flexShrink: 0,
        }}>
        <span style={{ position: "absolute", top: 2, left: value ? 16 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", }} />
      </button>
      <div className="flex-1">
        <div className="text-admin-ink text-admin-12h font-medium">{label}</div>
        <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">{desc}</div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Phase 3 — Talent Registration Wizard
// 7-step mobile-first flow. Filtered by the agency's enabled taxonomy.
// Schema-driven dynamic fields per type (TAXONOMY_FIELDS).
// ════════════════════════════════════════════════════════════════════


export type RegValues = Record<string, string | string[]>;


export function RequiredPill({
  field,
  primaryType,
  tenantId,
}: {
  field: RegField;
  primaryType?: string | ReadonlyArray<string> | null;
  tenantId?: string | null;
}) {
  // Phase E — workspace override may flip required-ness. Subscribe so
  // the pill re-renders when an admin changes settings.
  useWorkspaceFieldOverrideSubscription();
  const t = useT();
  // Catalog wins for type-specific applicability; workspace override
  // wins on top for required-ness. Accepts either a single type id or
  // the multi-role array — required-ness is union'd across all roles.
  const types = primaryType
    ? (Array.isArray(primaryType) ? primaryType : [primaryType]) as ReadonlyArray<TaxonomyParentId>
    : null;
  // Resolve the catalog entry's id (matches the dynamic-field renderer's
  // legacyShortId pattern: a TAXONOMY_FIELDS entry "height" comes through
  // the catalog with id `<parent>.height`. We try the multi-role union
  // first, then fall back to the bare key.
  const catalogId = types && types.length > 0
    ? `${types[0]}.${field.id}`  // best guess for type-specific fields
    : field.id;
  const catalogEntry = FIELD_CATALOG.find(c => c.id === catalogId)
    ?? FIELD_CATALOG.find(c => c.id === field.id);
  // Workspace override (e.g. "make this required for our agency").
  const resolved = catalogEntry
    ? applyWorkspaceFieldOverride(catalogEntry, tenantId ?? null)
    : null;
  const wsRequired = resolved?.hasOverride && resolved.optional === false;
  const wsOptional = resolved?.hasOverride && resolved.optional === true;
  const catalogRequired = types && types.length > 0
    ? isRequiredForType(field.id, types)
    : null;
  const isOptional = wsRequired ? false
    : wsOptional ? true
    : catalogRequired !== null ? !catalogRequired
    : !!field.optional;
  return isOptional ? (
    <span style={{ padding: "1px 6px", borderRadius: 999, background: "rgba(11,11,13,0.04)", fontSize: 9.5, fontWeight: 600, letterSpacing: 0.3 }} className="text-admin-ink-dim">{t("dashboard.adminDrawers.optional")}</span>
  ) : (
    <span style={{
      padding: "1px 6px", borderRadius: 999,
      background: "rgba(15,79,62,0.08)",
      color: COLORS.accentDeep ?? COLORS.accent,
      fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
    }}>{t("dashboard.adminDrawers.required")}</span>
  );
}

// Single source of truth for text / number / textarea field inputs
// across every hardcoded section. Mirrors the engine editor's inputStyle
// (live-category-fields-editor.tsx) — same padding, radius, border,
// font — so Specialty details and the bespoke sections read as ONE
// surface instead of three slightly-different ones. Callers spread +
// extend (flex, paddingLeft for icons, error border, etc.).

export const SHARED_FIELD_INPUT_STYLE: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "8px 11px", borderRadius: 7,
  border: `1px solid ${COLORS.border}`,
  fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink,
  // Faint fill (not pure white) — 1:1 with New Inquiry ComposerInput so
  // fields read as soft, grouped inputs rather than flat boxes on a card.
  background: "rgba(11,11,13,0.025)", outline: "none",
};


export function RegFieldInput({ field, value, onChange, visibility, onVisibilityChange, primaryType, tenantId }: {
  field: RegField;
  value: string | string[];
  onChange: (v: string | string[]) => void;
  /** Optional per-field visibility array. When passed, the dynamic
   *  field renderer appends a channel-visibility chip strip below
   *  the input — same pattern as FieldRow's visibility prop. */
  visibility?: ReadonlyArray<"public" | "agency" | "private">;
  onVisibilityChange?: (next: ReadonlyArray<"public" | "agency" | "private">) => void;
  /** When provided, REQUIRED/OPTIONAL pill derives from the catalog
   *  (`isRequiredForType(field.id, primaryType)`) instead of the
   *  field's static `optional` flag. Accepts either a single type
   *  or the full multi-role array (primary + secondaries). */
  primaryType?: string | ReadonlyArray<string> | null;
  /** Workspace field overrides are tenant-scoped. Pass the live
   *  tenant id/slug where available so required badges stay aligned
   *  with the same resolver used by registration/publish. */
  tenantId?: string | null;
}) {
  // Resolved chip strip — renders below every input when the field is
  // marked sensitive. Falls back to defaultVisibility, then ["agency"].
  const showStrip = field.sensitive === true;
  const resolvedVis = visibility ?? field.defaultVisibility ?? ["agency" as const];
  const stripBelow = showStrip ? (
    <ChannelVisibilityStrip value={resolvedVis} onChange={onVisibilityChange} />
  ) : null;

  if (field.kind === "text" || field.kind === "number") {
    return (
      <div>
        <label style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12, fontWeight: 600, marginBottom: 5 }} className="text-admin-ink-muted">
          {field.label}
          <RequiredPill field={field} primaryType={primaryType} tenantId={tenantId} />
        </label>
        <input type={field.kind === "number" ? "number" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          style={SHARED_FIELD_INPUT_STYLE}
        />
        {field.helper && (
          <div style={{ fontSize: 11, marginTop: 4 }} className="text-admin-ink-dim">{field.helper}</div>
        )}
        {stripBelow}
      </div>
    );
  }
  if (field.kind === "select") {
    const v = typeof value === "string" ? value : "";
    return (
      <div>
        <label style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12, fontWeight: 600, marginBottom: 5 }} className="text-admin-ink-muted">
          {field.label}
          <RequiredPill field={field} primaryType={primaryType} tenantId={tenantId} />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map(opt => {
            const active = v === opt;
            return (
              <button key={opt} type="button" onClick={() => onChange(active ? "" : opt)} style={{
                padding: "7px 12px", borderRadius: 999,
                border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                background: active ? "rgba(15,79,62,0.08)" : "#fff",
                color: active ? COLORS.accentDeep : COLORS.ink,
                fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>{opt}</button>
            );
          })}
        </div>
        {stripBelow}
      </div>
    );
  }
  if (field.kind === "multiselect") {
    const v = Array.isArray(value) ? value : [];
    const toggle = (opt: string) => {
      const next = v.includes(opt) ? v.filter(x => x !== opt) : [...v, opt];
      onChange(next);
    };
    return (
      <div>
        <label style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12, fontWeight: 600, marginBottom: 5 }} className="text-admin-ink-muted">
          {field.label}
          <RequiredPill field={field} primaryType={primaryType} tenantId={tenantId} />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map(opt => {
            const active = v.includes(opt);
            return (
              <button key={opt} type="button" onClick={() => toggle(opt)} style={{
                padding: "7px 12px", borderRadius: 999,
                border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                background: active ? "rgba(15,79,62,0.08)" : "#fff",
                color: active ? COLORS.accentDeep : COLORS.ink,
                fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>{opt}</button>
            );
          })}
        </div>
        {stripBelow}
      </div>
    );
  }
  // chips — free-text repeating
  const arr = Array.isArray(value) ? value : [];
  return (
    <div>
      <ChipsInput
        label={field.label + (field.optional ? "  ·  optional" : "")}
        placeholder={field.placeholder ?? "Add…"}
        values={arr}
        onChange={(v) => onChange(v)}
      />
      {stripBelow}
    </div>
  );
}

/**
 * Talent-consent two-column table — shown at the end of the registration
 * wizard. Reads the agency's effective field-visibility settings and
 * renders two lists: "On the public profile" + "Agency admins will see".
 * Talent must explicitly agree (via the Submit for review CTA).
 */

export function ConsentTwoCol({ agencyName }: { agencyName: string }) {
  const t = useT();
  const { effectiveFieldVisibility, customFields } = useAdminShell();
  const allFieldIds = Object.keys(PROFILE_FIELD_META) as ProfileFieldId[];
  const publicLabels: string[] = [];
  const internalLabels: string[] = [];
  for (const id of allFieldIds) {
    const v = effectiveFieldVisibility(id);
    const label = PROFILE_FIELD_META[id].label;
    if (v === "public") publicLabels.push(label);
    else if (v === "internal") internalLabels.push(label);
    // hidden → not collected by this workspace; don't list
  }
  // Custom fields show up too with their workspace-defined visibility
  for (const cf of customFields.filter(c => c.appliesTo === "Talent")) {
    const v = cf.visibility ?? "internal";
    if (v === "public") publicLabels.push(cf.name + " ✦");
    else if (v === "internal") internalLabels.push(cf.name + " ✦");
  }
  return (
    <div data-tulala-consent style={{
      borderRadius: 12, border: `1px solid ${COLORS.borderSoft}`,
      background: "#fff", overflow: "hidden",
      fontFamily: FONTS.body,
    }}>
      <style>{`
        @media (max-width: 540px) {
          [data-tulala-consent] [data-cc-cols] { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${COLORS.borderSoft}` }} className="bg-admin-surface">
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 3 }} className="text-admin-ink-muted">{interpolate(t("dashboard.adminDrawers.consentPrivacyHeading"), { agency: agencyName })}</div>
        <div style={{ fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">
          {interpolate(t("dashboard.adminDrawers.consentPrivacyBody"), { agency: agencyName })}
        </div>
      </div>
      <div data-cc-cols style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0,
      }}>
        <div style={{ padding: 12, borderRight: `1px solid ${COLORS.borderSoft}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, marginBottom: 8 }} className="text-admin-success-deep">
            <span className="text-xs">🌐</span>
            <span style={{ letterSpacing: 0.4, textTransform: "uppercase" }}>{interpolate(t("dashboard.adminDrawers.consentPublicColumn"), { agency: agencyName })}</span>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
            {publicLabels.length === 0 && (
              <li className="text-admin-ink-dim text-admin-11">{t("dashboard.adminDrawers.consentPublicEmpty")}</li>
            )}
            {publicLabels.map(l => (
              <li key={l} style={{ fontSize: 11.5, color: COLORS.ink, lineHeight: 1.5 }}>
                <span style={{ marginRight: 4 }} className="text-admin-success-deep">✓</span>{l}
              </li>
            ))}
          </ul>
        </div>
        <div className="p-3">
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, marginBottom: 8 }} className="text-admin-amber-deep">
            <span className="text-xs">🔒</span>
            <span style={{ letterSpacing: 0.4, textTransform: "uppercase" }}>{t("dashboard.adminDrawers.consentInternalColumn")}</span>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
            {internalLabels.length === 0 && (
              <li className="text-admin-ink-dim text-admin-11">{t("dashboard.adminDrawers.consentInternalEmpty")}</li>
            )}
            {internalLabels.map(l => (
              <li key={l} style={{ fontSize: 11.5, color: COLORS.ink, lineHeight: 1.5 }}>
                <span style={{ marginRight: 4 }} className="text-admin-amber-deep">✓</span>{l}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div style={{ padding: "10px 14px", borderTop: `1px solid ${COLORS.borderSoft}`, fontSize: 10.5, lineHeight: 1.5 }} className="bg-admin-surface text-admin-ink-dim">
        {interpolate(t("dashboard.adminDrawers.consentFootnote"), { agency: agencyName })}
      </div>
    </div>
  );
}


export function ReviewKv({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", padding: "6px 0", borderTop: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body }}>
      <span style={{ width: 100, fontSize: 11, fontWeight: 600 }} className="text-admin-ink-muted">{label}</span>
      <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.4 }} className="text-admin-ink">{value}</span>
    </div>
  );
}


export type ChipsInputProps = {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (v: string[]) => void;
};

export const ChipsInput = React.memo(function ChipsInput({ label, placeholder, values, onChange }: ChipsInputProps) {
  const t = useT();
  const [draft, setDraft] = useState("");
  // Component-boundary normalization: never trust the caller to pass a
  // real array. A model profile (e.g. Sofía) hydrates `personality` from
  // a seeded `personality_traits` whose shape lacks `loves`/`avoids`, so
  // `values` arrives `undefined` here — `.map`/`.includes`/spread on that
  // is the "Cannot read properties of undefined (reading 'map')" crash.
  const safeValues = values ?? [];
  const commit = () => {
    const v = draft.trim();
    if (!v) return;
    if (!safeValues.includes(v)) onChange([...safeValues, v]);
    setDraft("");
  };
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 }} className="text-admin-ink-muted">
        {label}
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        {safeValues.map(v => (
          <span key={v} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 10px", borderRadius: 999,
            background: "rgba(15,79,62,0.08)", color: COLORS.accentDeep,
            fontSize: 12, fontWeight: 600, fontFamily: FONTS.body,
          }}>
            {v}
            <button type="button" onClick={() => onChange(safeValues.filter(x => x !== v))} style={{
              background: "transparent", border: "none", padding: 0, cursor: "pointer",
              color: COLORS.accentDeep, fontSize: 14, lineHeight: 1, fontWeight: 700,
            }}>×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input type="text" value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          placeholder={placeholder}
          style={{ ...SHARED_FIELD_INPUT_STYLE, flex: 1 }}
        />
        <button type="button" onClick={commit} disabled={!draft.trim()} style={{
          padding: "0 14px", borderRadius: 10, border: "none",
          background: draft.trim() ? COLORS.fill : "rgba(11,11,13,0.10)",
          color: draft.trim() ? "#fff" : COLORS.inkDim,
          fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: draft.trim() ? "pointer" : "default",
        }}>{t("dashboard.adminDrawers.add")}</button>
      </div>
    </div>
  );
});

// ════════════════════════════════════════════════════════════════════
// Phase 4 — Talent Profile Shell
//
// The unified profile builder used by:
//   • Admin create  (continued from NewTalentDrawer with seed)
//   • Admin edit    (existing roster talent)
//   • Talent self-edit (admin sections hidden)
//
// Section order is the binding hierarchy:
//   1. Status   2. Services (Talent Types) 3. Location & service area
//   4. Media    5. About    6. Type-specific details
//   7. Languages 8. Skills  9. Contexts    10. Admin (admin-only)
// ════════════════════════════════════════════════════════════════════


export function PhotoGalleryReal({ album, onUpdateAlbum }: {
  album: ProfileAlbum;
  onUpdateAlbum: (updater: (a: ProfileAlbum) => ProfileAlbum) => void;
}) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [cropIdx, setCropIdx] = useState<number | null>(null);
  const [pendingMain, setPendingMain] = useState<number | null>(null);

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, 8 - album.photos.length);
    const urls = arr.map(f => URL.createObjectURL(f));
    onUpdateAlbum(a => ({ ...a, photos: [...a.photos, ...urls] }));
  };
  const onPick = () => fileInputRef.current?.click();
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const removePhoto = (i: number) => {
    if (i === 0 && album.photos.length > 1) {
      setPendingMain(1);
      return;
    }
    onUpdateAlbum(a => ({ ...a, photos: a.photos.filter((_, idx) => idx !== i) }));
  };
  const confirmRemoveMain = () => {
    onUpdateAlbum(a => ({ ...a, photos: a.photos.slice(1) }));
    setPendingMain(null);
  };
  const movePhoto = (from: number, to: number) => {
    if (from === to) return;
    onUpdateAlbum(a => {
      const arr = [...a.photos];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return { ...a, photos: arr };
    });
  };
  const makeMain = (i: number) => movePhoto(i, 0);

  return (
    <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
         onDragLeave={() => setDragOver(false)}
         onDrop={onDrop}
         style={{
           position: "relative",
           padding: dragOver ? 8 : 0,
           borderRadius: dragOver ? 12 : 0,
           background: dragOver ? "rgba(15,79,62,0.05)" : "transparent",
           transition: "all .12s",
         }}
    >
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {album.photos.map((src, i) => (
          <div
            key={`${i}-${src}`}
            draggable
            onDragStart={(e) => { setDraggingIdx(i); e.dataTransfer.effectAllowed = "move"; }}
            onDragEnd={() => setDraggingIdx(null)}
            onDragEnter={(e) => { e.preventDefault(); }}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              if (draggingIdx !== null && draggingIdx !== i) movePhoto(draggingIdx, i);
              setDraggingIdx(null);
            }}
            style={{
              position: "relative", aspectRatio: "3 / 4", borderRadius: 8,
              background: `url(${src}) center/cover, ${COLORS.surfaceAlt}`,
              border: i === 0 ? `2px solid ${COLORS.accent}` : `1px solid ${COLORS.borderSoft}`,
              overflow: "hidden",
              cursor: "grab",
              opacity: draggingIdx === i ? 0.4 : 1,
              transition: "opacity .12s",
            }}
          >
            {i === 0 ? (
              <span style={{ position: "absolute", top: 4, left: 4, fontSize: 9, fontWeight: 700, fontFamily: FONTS.body, padding: "2px 6px", borderRadius: 999, color: "#fff" }} className="bg-admin-accent">{t("dashboard.adminDrawers.photoMain")}</span>
            ) : (
              <button type="button" onClick={(e) => { e.stopPropagation(); makeMain(i); }} aria-label={t("dashboard.adminDrawers.makeMainAria")}
                style={{
                  position: "absolute", top: 4, left: 4,
                  width: 22, height: 22, borderRadius: "50%",
                  border: "none", background: "rgba(11,11,13,0.55)", color: "#fff",
                  fontSize: 11, cursor: "pointer", lineHeight: 1,
                }}>★</button>
            )}
            <button type="button" onClick={(e) => { e.stopPropagation(); setCropIdx(i); }} aria-label={t("dashboard.adminDrawers.cropAria")}
              style={{
                position: "absolute", bottom: 4, left: 4,
                width: 22, height: 22, borderRadius: "50%",
                border: "none", background: "rgba(11,11,13,0.55)", color: "#fff",
                fontSize: 11, cursor: "pointer", lineHeight: 1,
              }}>✂</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); removePhoto(i); }} aria-label={t("dashboard.adminDrawers.removeAria")}
              style={{
                position: "absolute", top: 4, right: 4,
                width: 22, height: 22, borderRadius: "50%",
                border: "none", background: "rgba(11,11,13,0.55)", color: "#fff",
                fontSize: 12, cursor: "pointer", lineHeight: 1, fontWeight: 600,
              }}>×</button>
          </div>
        ))}
        {album.photos.length < 8 && (
          <button type="button" onClick={onPick} style={{
            aspectRatio: "3 / 4", borderRadius: 8,
            border: `1.5px dashed ${COLORS.borderSoft}`,
            background: dragOver ? "rgba(15,79,62,0.08)" : "#fff",
            cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
            fontSize: 10.5, color: COLORS.inkMuted, fontWeight: 600, fontFamily: FONTS.body,
            transition: "background .12s",
          }}>
            <span className="text-lg">+</span>
            <span>{dragOver ? t("dashboard.adminDrawers.photoDropHere") : t("dashboard.adminDrawers.photoDropOrPick")}</span>
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4, fontFamily: FONTS.body }} className="text-admin-ink-dim">
        {t("dashboard.adminDrawers.photoGalleryHint")}
      </div>

      {/* Confirm-replace-main */}
      {pendingMain !== null && (
        <ConfirmDialog
          title={t("dashboard.adminDrawers.confirmRemoveMainTitle")}
          body={interpolate(t("dashboard.adminDrawers.confirmRemoveMainBody"), { index: pendingMain + 1 })}
          confirmLabel={t("dashboard.adminDrawers.confirmRemoveMainConfirm")}
          onConfirm={confirmRemoveMain}
          onCancel={() => setPendingMain(null)}
        />
      )}

      {/* Crop modal */}
      {cropIdx !== null && album.photos[cropIdx] && (
        <CropModal
          src={album.photos[cropIdx]}
          onClose={() => setCropIdx(null)}
          onSave={() => setCropIdx(null)}
        />
      )}
    </div>
  );
}


export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: {
  title: string; body: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  const t = useT();
  return (
    <div onClick={onCancel} style={{
      position: "fixed", inset: 0, zIndex: 250,
      background: "rgba(11,11,13,0.42)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONTS.body,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 14, padding: 22,
        maxWidth: 420, width: "90%",
        boxShadow: "0 30px 60px -10px rgba(11,11,13,0.35)",
      }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }} className="text-admin-ink">{title}</h3>
        <p style={{ margin: "8px 0 16px", fontSize: 13, lineHeight: 1.5 }} className="text-admin-ink-muted">{body}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{
            padding: "9px 14px", borderRadius: 999,
            border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.ink,
            fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>{t("dashboard.adminDrawers.cancel")}</button>
          <button type="button" onClick={onConfirm} style={{
            padding: "9px 16px", borderRadius: 999, border: "none",
            background: COLORS.fill, color: "#fff",
            fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}


export function CropModal({ src, onClose, onSave }: {
  src: string; onClose: () => void; onSave: () => void;
}) {
  const t = useT();
  const [zoom, setZoom] = useState(1);
  const [ratio, setRatio] = useState<"4:5" | "1:1" | "16:9">("4:5");
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 260,
      background: "rgba(11,11,13,0.55)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONTS.body,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 14, padding: 18,
        maxWidth: 480, width: "92%",
        boxShadow: "0 30px 60px -10px rgba(11,11,13,0.4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }} className="text-admin-ink">{t("dashboard.adminDrawers.cropTitle")}</h3>
          <button type="button" onClick={onClose} aria-label={t("dashboard.adminDrawers.close")} style={{
            background: "transparent", border: "none", padding: 4, cursor: "pointer", fontSize: 16, color: COLORS.inkMuted,
          }}>✕</button>
        </div>
        <div style={{
          width: "100%", aspectRatio: ratio === "4:5" ? "4 / 5" : ratio === "1:1" ? "1 / 1" : "16 / 9",
          background: `url(${src}) center/cover, ${COLORS.surfaceAlt}`,
          borderRadius: 10, overflow: "hidden", position: "relative",
          border: `1px solid ${COLORS.borderSoft}`,
        }}>
          <div style={{ '--preview-bg': `url(${src})`, '--preview-bg-size': `${zoom * 100}%` }} className="absolute inset-0 bg-[image:var(--preview-bg)] bg-[size:var(--preview-bg-size)] bg-center bg-no-repeat" />
        </div>
        <div className="mt-3">
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }} className="text-admin-ink-muted">{t("dashboard.adminDrawers.cropAspectRatio")}</div>
          <div className="flex gap-1.5">
            {(["4:5", "1:1", "16:9"] as const).map(r => {
              const active = ratio === r;
              return (
                <button key={r} type="button" onClick={() => setRatio(r)} style={{
                  padding: "6px 12px", borderRadius: 999,
                  border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                  background: active ? "rgba(15,79,62,0.08)" : "#fff",
                  color: active ? COLORS.accentDeep : COLORS.ink,
                  fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                }}>{r}</button>
              );
            })}
          </div>
        </div>
        <div className="mt-3">
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }} className="text-admin-ink-muted">
            {interpolate(t("dashboard.adminDrawers.cropZoom"), { pct: Math.round(zoom * 100) })}
          </div>
          <input type="range" min={1} max={3} step={0.1} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ width: "100%", accentColor: COLORS.accent }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" onClick={onClose} style={{
            padding: "9px 14px", borderRadius: 999,
            border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.ink,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>{t("dashboard.adminDrawers.cancel")}</button>
          <button type="button" onClick={onSave} style={{
            padding: "9px 16px", borderRadius: 999, border: "none",
            background: COLORS.fill, color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>{t("dashboard.adminDrawers.cropSave")}</button>
        </div>
      </div>
    </div>
  );
}

// ── Albums editor ────────────────────────────────────────────────────

export function AlbumsEditor({ albums, activeId, onActivate, onChange }: {
  albums: ProfileAlbum[];
  activeId: string;
  onActivate: (id: string) => void;
  onChange: (a: ProfileAlbum[]) => void;
}) {
  const t = useT();
  const [newName, setNewName] = useState("");
  const addAlbum = () => {
    const name = newName.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/\s+/g, "-").slice(0, 30) + "-" + Math.random().toString(36).slice(2, 6);
    onChange([...albums, { id, name, photos: [] }]);
    setNewName("");
  };
  const renameAlbum = (id: string, name: string) =>
    onChange(albums.map(a => a.id === id ? { ...a, name } : a));
  const deleteAlbum = (id: string) => {
    if (albums.length <= 1) return;
    onChange(albums.filter(a => a.id !== id));
    if (activeId === id) onActivate(albums[0].id);
  };

  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {albums.map(a => {
          const active = a.id === activeId;
          return (
            <button key={a.id} type="button" onClick={() => onActivate(a.id)} style={{
              padding: "6px 11px", borderRadius: 999,
              border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
              background: active ? "rgba(15,79,62,0.08)" : "#fff",
              color: active ? COLORS.accentDeep : COLORS.ink,
              fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              {a.name} <span style={{ fontWeight: 500 }} className="text-admin-ink-dim">· {a.photos.length}</span>
            </button>
          );
        })}
      </div>
      <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${COLORS.borderSoft}` }} className="bg-admin-surface">
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }} className="text-admin-ink">
          {t("dashboard.adminDrawers.albumManage")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {albums.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="text" value={a.name}
                onChange={(e) => renameAlbum(a.id, e.target.value)}
                style={{
                  flex: 1, padding: "7px 10px", borderRadius: 8,
                  border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
                  fontSize: 12.5, color: COLORS.ink, outline: "none", background: "#fff",
                }}
              />
              <span className="text-admin-ink-muted text-admin-11">{interpolate(t(a.photos.length === 1 ? "dashboard.adminDrawers.albumPhotoCountOne" : "dashboard.adminDrawers.albumPhotoCountOther"), { count: a.photos.length })}</span>
              {albums.length > 1 && (
                <button type="button" onClick={() => deleteAlbum(a.id)} aria-label={t("dashboard.adminDrawers.albumDeleteAria")} style={{
                  width: 24, height: 24, borderRadius: 6,
                  border: "none", background: "transparent", color: COLORS.inkMuted,
                  fontSize: 14, cursor: "pointer", padding: 0,
                }}>×</button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input type="text" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAlbum(); } }}
            placeholder={t("dashboard.adminDrawers.albumNamePlaceholder")}
            style={{
              flex: 1, padding: "9px 12px", borderRadius: 8,
              border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
              fontSize: 12.5, color: COLORS.ink, outline: "none",
            }}
          />
          <button type="button" onClick={addAlbum} disabled={!newName.trim()} style={{
            padding: "0 14px", borderRadius: 8, border: "none",
            background: newName.trim() ? COLORS.fill : "rgba(11,11,13,0.10)",
            color: newName.trim() ? "#fff" : COLORS.inkDim,
            fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
            cursor: newName.trim() ? "pointer" : "default",
          }}>{t("dashboard.adminDrawers.albumAdd")}</button>
        </div>
      </div>
    </div>
  );
}

// ── Locale-aware bios editor ─────────────────────────────────────────

export type CoverPhotoEditorProps = {
  url: string | null;
  onChange: (u: string | null) => void;
  talentProfileId?: string;
  mediaAssetId?: string | null;
  onMediaAssetIdChange?: (id: string | null) => void;
};

export const CoverPhotoEditor = React.memo(function CoverPhotoEditor({ url, onChange, talentProfileId, mediaAssetId, onMediaAssetIdChange }: CoverPhotoEditorProps) {
  const t = useT();
  const { toast } = useAdminShell();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const handleFile = async (f: File) => {
    if (!talentProfileId) { onChange(URL.createObjectURL(f)); return; }
    onChange(URL.createObjectURL(f)); // optimistic preview
    const fd = new FormData(); fd.append("file", f);
    const res = await actionUploadAndAssignMedia(fd, talentProfileId, "hero");
    if (res.ok) {
      onChange(res.data.publicUrl);
      onMediaAssetIdChange?.(res.data.id);
    } else {
      toast(res.error || t("dashboard.adminDrawers.coverUploadFailed"));
      onChange(null);
    }
  };
  const handleRemove = () => {
    onChange(null);
    if (talentProfileId && mediaAssetId) void actionDeleteMediaAssets([mediaAssetId]);
    onMediaAssetIdChange?.(null);
  };
  return (
    <div className="mb-3">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, fontFamily: FONTS.body }} className="text-admin-ink-muted">{t("dashboard.adminDrawers.coverPhotoLabel")}</div>
        <span style={{ fontSize: 10.5, fontFamily: FONTS.body }} className="text-admin-ink-dim">{t("dashboard.adminDrawers.coverPhotoSpec")}</span>
      </div>
      {url ? (
        <div style={{
          position: "relative", aspectRatio: "16 / 9", borderRadius: 12,
          background: `url(${url}) center/cover, ${COLORS.surfaceAlt}`,
          border: `1px solid ${COLORS.borderSoft}`, overflow: "hidden",
        }}>
          <button type="button" onClick={() => fileRef.current?.click()} style={{
            position: "absolute", bottom: 8, right: 8,
            padding: "6px 11px", borderRadius: 999, border: "none",
            background: "rgba(11,11,13,0.7)", color: "#fff",
            fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONTS.body,
            backdropFilter: "blur(8px)",
          }}>{t("dashboard.adminDrawers.coverReplace")}</button>
          <button type="button" onClick={handleRemove} aria-label={t("dashboard.adminDrawers.coverRemoveAria")} style={{
            position: "absolute", top: 8, right: 8,
            width: 26, height: 26, borderRadius: "50%", border: "none",
            background: "rgba(11,11,13,0.6)", color: "#fff",
            fontSize: 14, lineHeight: 1, cursor: "pointer",
          }}>×</button>
        </div>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()} style={{
          width: "100%", aspectRatio: "16 / 9", borderRadius: 12,
          border: `1.5px dashed ${COLORS.borderSoft}`,
          background: COLORS.surface, cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
          fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, fontWeight: 600,
        }}>
          <span style={{ fontSize: 24, lineHeight: 1 }}>+</span>
          <span>{t("dashboard.adminDrawers.coverPickTitle")}</span>
          <span className="text-admin-ink-dim text-admin-10h font-medium">{t("dashboard.adminDrawers.coverPickHint")}</span>
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
});

// ── Polaroids editor ────────────────────────────────────────────────

export function PhotoGallery({ photos, onAdd, onRemove, onMakeMain, onReorder }: {
  photos: string[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onMakeMain: (i: number) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}) {
  const t = useT();
  // Drag-and-drop reorder state.
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const handleDragStart = (i: number) => (e: React.DragEvent) => {
    setDragFrom(i);
    e.dataTransfer.effectAllowed = "move";
    // Some browsers need data set to start the drag.
    try { e.dataTransfer.setData("text/plain", String(i)); } catch {}
  };
  const handleDragOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOver !== i) setDragOver(i);
  };
  const handleDrop = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragFrom !== null && dragFrom !== i && onReorder) {
      onReorder(dragFrom, i);
    }
    setDragFrom(null);
    setDragOver(null);
  };
  const handleDragEnd = () => {
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {photos.map((src, i) => {
          const isDragging = dragFrom === i;
          const isDropTarget = dragOver === i && dragFrom !== null && dragFrom !== i;
          return (
            <div
              key={`${i}-${src}`}
              draggable={!!onReorder}
              onDragStart={handleDragStart(i)}
              onDragOver={handleDragOver(i)}
              onDragLeave={() => dragOver === i && setDragOver(null)}
              onDrop={handleDrop(i)}
              onDragEnd={handleDragEnd}
              style={{
                position: "relative", aspectRatio: "3 / 4", borderRadius: 8,
                background: `url(${src}) center/cover, ${COLORS.surfaceAlt}`,
                border: isDropTarget
                  ? `2px dashed ${COLORS.accent}`
                  : i === 0
                    ? `2px solid ${COLORS.accent}`
                    : `1px solid ${COLORS.borderSoft}`,
                overflow: "hidden",
                cursor: onReorder ? "grab" : "default",
                opacity: isDragging ? 0.45 : 1,
                transition: "opacity .12s, border-color .12s",
              }}
            >
              {i === 0 ? (
                <span style={{ position: "absolute", top: 4, left: 4, fontSize: 9, fontWeight: 700, fontFamily: FONTS.body, padding: "2px 6px", borderRadius: 999, color: "#fff" }} className="bg-admin-accent">{t("dashboard.adminDrawers.photoMain")}</span>
              ) : (
                <button type="button" onClick={() => onMakeMain(i)} aria-label={t("dashboard.adminDrawers.makeMainAria")}
                  style={{
                    position: "absolute", top: 4, left: 4,
                    width: 22, height: 22, borderRadius: "50%",
                    border: "none", background: "rgba(11,11,13,0.55)", color: "#fff",
                    fontSize: 11, cursor: "pointer", lineHeight: 1,
                  }}>★</button>
              )}
              <button type="button" onClick={() => onRemove(i)} aria-label={t("dashboard.adminDrawers.removeAria")}
                style={{
                  position: "absolute", top: 4, right: 4,
                  width: 22, height: 22, borderRadius: "50%",
                  border: "none", background: "rgba(11,11,13,0.55)", color: "#fff",
                  fontSize: 12, cursor: "pointer", lineHeight: 1, fontWeight: 600,
                }}>×</button>
              {/* Drag handle indicator on hover (decorative; the whole tile is draggable) */}
              {onReorder && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute", bottom: 4, right: 4,
                    background: "rgba(11,11,13,0.55)",
                    color: "#fff",
                    fontSize: 10, lineHeight: 1,
                    padding: "2px 5px", borderRadius: 5,
                    opacity: 0.7,
                    pointerEvents: "none",
                  }}
                >⠿</span>
              )}
            </div>
          );
        })}
        {photos.length < 8 && (
          <button type="button" onClick={onAdd} style={{
            aspectRatio: "3 / 4", borderRadius: 8,
            border: `1.5px dashed ${COLORS.borderSoft}`,
            background: "#fff", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
            fontSize: 10.5, color: COLORS.inkMuted, fontWeight: 600, fontFamily: FONTS.body,
          }}>
            <span className="text-lg">+</span>
            <span>{t("dashboard.adminDrawers.photoDropOrPick")}</span>
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4, fontFamily: FONTS.body }} className="text-admin-ink-dim">
        {t("dashboard.adminDrawers.photoGalleryHintSimple")}
      </div>
    </div>
  );
}

// 2026 #1 — Native popover migration. The browser handles
// click-outside, Escape, focus trap, and accessible-anchor positioning.
// Falls back to JS state on browsers without `popover` support
// (caught by the `popover in HTMLElement.prototype` check).

export function ToggleControl({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  // Yes/No pill + mini switch — mirrors the engine editor's boolean
  // control (live-category-fields-editor.tsx) so a toggle reads the
  // same everywhere and the state is a literal word, not an inferred
  // switch position.
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: FONTS.body, opacity: disabled ? 0.55 : 1 }}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => { if (!disabled) onChange(!value); }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "5px 5px 5px 12px", borderRadius: 999,
          border: `1.5px solid ${value ? COLORS.accent : COLORS.border}`,
          background: value ? "rgba(15,79,62,0.08)" : "#fff",
          cursor: disabled ? "not-allowed" : "pointer",
          fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600,
          color: value ? COLORS.ink : COLORS.inkMuted, flexShrink: 0,
        }}
      >
        {value ? t("dashboard.adminDrawers.yes") : t("dashboard.adminDrawers.no")}
        <span style={{
          width: 30, height: 18, borderRadius: 999,
          background: value ? COLORS.accent : "rgba(11,11,13,0.18)",
          position: "relative", transition: "background 0.15s", flexShrink: 0,
        }}>
          <span style={{ position: "absolute", top: 2, left: value ? 14 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.15s", }} />
        </span>
      </button>
      <div style={{ fontSize: 12.5, lineHeight: 1.4 }} className="text-admin-ink">{label}</div>
    </div>
  );
}


export function CatalogChips({ items, selected, onToggle }: {
  items: { id: string; label: string; group?: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const groups = items.reduce<Record<string, typeof items>>((acc, it) => {
    const g = it.group ?? "All";
    (acc[g] ??= []).push(it);
    return acc;
  }, {});
  return (
    <div className="flex flex-col gap-3">
      {Object.entries(groups).map(([group, rows]) => (
        <div key={group}>
          {group !== "All" && (
            <div style={{ fontSize: 10.5, fontWeight: 500, marginBottom: 4 }} className="text-admin-ink-dim">
              {group}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {rows.map(it => {
              const active = selected.has(it.id);
              return (
                <button key={it.id} type="button" onClick={() => onToggle(it.id)} style={{
                  padding: "6px 11px", borderRadius: 999,
                  border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                  background: active ? "rgba(15,79,62,0.08)" : "#fff",
                  color: active ? COLORS.accentDeep : COLORS.ink,
                  fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 500, cursor: "pointer",
                }}>
                  {it.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}


export type LanguagesEditorProps = {
  value: ProfileLanguage[];
  onChange: (v: ProfileLanguage[]) => void;
};

export const LanguagesEditor = React.memo(function LanguagesEditor({ value, onChange }: LanguagesEditorProps) {
  const t = useT();
  const [draftLang, setDraftLang] = useState("");
  const [draftLevel, setDraftLevel] = useState<LanguageLevel>("fluent");
  const add = () => {
    const l = draftLang.trim();
    if (!l) return;
    if (value.some(x => x.language.toLowerCase() === l.toLowerCase())) return;
    onChange([...value, { language: l, level: draftLevel }]);
    setDraftLang("");
  };
  const update = (i: number, patch: Partial<ProfileLanguage>) =>
    onChange(value.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const remove = (i: number) =>
    onChange(value.filter((_, idx) => idx !== i));

  const levelLabel: Record<LanguageLevel, string> = {
    native: t("dashboard.adminDrawers.langLevelNative"),
    fluent: t("dashboard.adminDrawers.langLevelFluent"),
    conversational: t("dashboard.adminDrawers.langLevelConversational"),
    basic: t("dashboard.adminDrawers.langLevelBasic"),
  };

  return (
    <div style={{ fontFamily: FONTS.body }}>
      {value.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {value.map((row, i) => (
            <div key={i} style={{
              border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10,
              padding: 10, background: "#fff",
            }}>
              <div className="flex items-center gap-2 mb-2">
                <input type="text" value={row.language}
                  onChange={(e) => update(i, { language: e.target.value })}
                  style={{
                    flex: 1, padding: "7px 10px", borderRadius: 8,
                    border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
                    fontSize: 13, color: COLORS.ink, outline: "none",
                  }}
                />
                <select value={row.level}
                  onChange={(e) => update(i, { level: e.target.value as LanguageLevel })}
                  style={{
                    padding: "7px 10px", borderRadius: 8,
                    border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
                    fontSize: 12, color: COLORS.ink, outline: "none", background: "#fff",
                  }}>
                  {(Object.keys(levelLabel) as LanguageLevel[]).map(lv => (
                    <option key={lv} value={lv}>{levelLabel[lv]}</option>
                  ))}
                </select>
                <button type="button" onClick={() => remove(i)} aria-label={t("dashboard.adminDrawers.removeAria")} style={{
                  background: "transparent", border: "none", padding: 4, cursor: "pointer",
                  color: COLORS.inkMuted, fontSize: 16, lineHeight: 1, fontWeight: 700,
                }}>×</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { key: "canHost",      label: t("dashboard.adminDrawers.langCanHost") },
                  { key: "canSell",      label: t("dashboard.adminDrawers.langCanSell") },
                  { key: "canTranslate", label: t("dashboard.adminDrawers.langCanTranslate") },
                  { key: "canTeach",     label: t("dashboard.adminDrawers.langCanTeach") },
                ] as const).map(opt => {
                  const active = !!row[opt.key];
                  return (
                    <button key={opt.key} type="button"
                      onClick={() => update(i, { [opt.key]: !active })}
                      style={{
                        padding: "4px 10px", borderRadius: 999,
                        border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                        background: active ? "rgba(15,79,62,0.08)" : "#fff",
                        color: active ? COLORS.accentDeep : COLORS.inkMuted,
                        fontSize: 11, fontWeight: 600, cursor: "pointer",
                      }}>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input type="text" value={draftLang}
          onChange={(e) => setDraftLang(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={t("dashboard.adminDrawers.langAddPlaceholder")}
          style={{
            flex: 1, padding: "10px 12px", borderRadius: 10,
            border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
            fontSize: 13, color: COLORS.ink, outline: "none",
          }}
        />
        <select value={draftLevel} onChange={(e) => setDraftLevel(e.target.value as LanguageLevel)} style={{
          padding: "10px 12px", borderRadius: 10,
          border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
          fontSize: 12, color: COLORS.ink, outline: "none", background: "#fff",
        }}>
          {(Object.keys(levelLabel) as LanguageLevel[]).map(lv => (
            <option key={lv} value={lv}>{levelLabel[lv]}</option>
          ))}
        </select>
        <button type="button" onClick={add} disabled={!draftLang.trim()} style={{
          padding: "0 14px", borderRadius: 10, border: "none",
          background: draftLang.trim() ? COLORS.fill : "rgba(11,11,13,0.10)",
          color: draftLang.trim() ? "#fff" : COLORS.inkDim,
          fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600,
          cursor: draftLang.trim() ? "pointer" : "default",
        }}>{t("dashboard.adminDrawers.add")}</button>
      </div>
    </div>
  );
});

// ════════════════════════════════════════════════════════════════════
// Phase H — Talent approvals queue
// Pending self-registrations land here. Admin approves / rejects /
// requests changes. Surfaced via a Roster pill ("Pending · 3").
// ════════════════════════════════════════════════════════════════════


export type PhotoGalleryProProps = {
  items: PhotoMeta[];
  onChange: (items: PhotoMeta[]) => void;
  talentProfileId?: string;
  albumId?: string;
};

export const PhotoGalleryPro = React.memo(function PhotoGalleryPro({ items, onChange, talentProfileId, albumId }: PhotoGalleryProProps) {
  const t = useT();
  const { toast } = useAdminShell();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  // Refs to the latest items so async upload completions can patch the
  // right index even when several files are uploading in parallel.
  // Q5: ref writes happen in an effect (not in render body) per
  // react-hooks/refs.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [videoUrlError, setVideoUrlError] = useState<string | null>(null);
  const addVideoUrl = () => {
    const parsed = parseVideoUrl(videoUrlInput);
    if (!parsed) {
      setVideoUrlError(t("dashboard.adminDrawers.photoProVideoBad"));
      return;
    }
    const next: PhotoMeta = {
      url: parsed.thumbUrl ?? "",
      videoUrl: videoUrlInput.trim(),
      videoProvider: parsed.provider,
    };
    onChange([...items, next]);
    setVideoUrlInput("");
    setVideoUrlError(null);
  };

  const addFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, 12 - items.length);
    if (arr.length === 0) return;
    void improntaLog("admin_drawer_shared.info", {
      message: "[PhotoGalleryPro] addFiles",
      count: arr.length,
      talentProfileId,
      hasId: !!talentProfileId,
    });
    // Optimistic — show blob previews immediately so the user sees something.
    const blobs: PhotoMeta[] = arr.map(f => ({
      url: URL.createObjectURL(f),
      uploading: !!talentProfileId,
    }));
    const startIdx = items.length;
    onChange([...items, ...blobs]);

    // No talentId → mock mode, can't persist. Show an error overlay so
    // the user sees the problem instead of silently storing blobs.
    if (!talentProfileId) {
      const next = [...itemsRef.current];
      for (let i = 0; i < blobs.length; i++) {
        const idx = startIdx + i;
        if (idx < next.length) {
          next[idx] = { ...next[idx], uploading: false, uploadError: t("dashboard.adminDrawers.photoProNoTalentInline") };
        }
      }
      onChange(next);
      toast(t("dashboard.adminDrawers.photoProNoTalentToast"));
      return;
    }

    // Upload each file in parallel; patch the corresponding row in place.
    await Promise.all(arr.map(async (file, i) => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const meta = albumId ? { albumId } : {};
        const res = await actionUploadAndAssignMedia(fd, talentProfileId, "gallery", meta);
        void improntaLog("admin_drawer_shared.info", {
          message: "[PhotoGalleryPro] upload result",
          fileName: file.name,
          albumId,
          ok: res.ok,
          error: res.ok ? null : res.error,
        });
        const next = [...itemsRef.current];
        const idx = startIdx + i;
        if (idx >= next.length) return;
        if (res.ok) {
          next[idx] = { ...next[idx], url: res.data.publicUrl, mediaAssetId: res.data.id, uploading: false, uploadError: undefined };
        } else {
          // Keep the failed entry visible with an error overlay so the user
          // sees what went wrong instead of the photo silently disappearing.
          next[idx] = { ...next[idx], uploading: false, uploadError: res.error || t("dashboard.adminDrawers.coverUploadFailed") };
          toast(res.error || t("dashboard.adminDrawers.coverUploadFailed"));
        }
        onChange(next);
      } catch (err) {
        const message = err instanceof Error ? err.message : t("dashboard.adminDrawers.coverUploadFailed");
        const next = [...itemsRef.current];
        const idx = startIdx + i;
        if (idx < next.length) {
          next[idx] = { ...next[idx], uploading: false, uploadError: message };
          onChange(next);
        }
        toast(interpolate(t("dashboard.adminDrawers.photoProUploadFailedWith"), { message }));
        logServerError("photogallerypro_upload", err);
      }
    }));
  };
  const onPick = () => fileInputRef.current?.click();
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const removeAt = (i: number) => {
    const target = items[i];
    onChange(items.filter((_, idx) => idx !== i));
    if (talentProfileId && target?.mediaAssetId) {
      void actionDeleteMediaAssets([target.mediaAssetId]);
    }
  };
  const movePhoto = (from: number, to: number) => {
    if (from === to) return;
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    onChange(next);
    if (talentProfileId) {
      const orderedIds = next.map(p => p.mediaAssetId).filter((id): id is string => !!id);
      if (orderedIds.length > 0) void actionReorderMediaAssets(orderedIds);
    }
  };
  const makeMain = (i: number) => movePhoto(i, 0);
  const updateAt = (i: number, patch: Partial<PhotoMeta>) =>
    onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  return (
    <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
         onDragLeave={() => setDragOver(false)}
         onDrop={onDrop}
         style={{
           position: "relative",
           padding: dragOver ? 8 : 0,
           borderRadius: dragOver ? 12 : 0,
           background: dragOver ? "rgba(15,79,62,0.05)" : "transparent",
           transition: "all .12s",
         }}
    >
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }}
        onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {items.map((it, i) => (
          <div
            key={`${i}-${it.url}-${it.videoUrl ?? ""}`}
            draggable
            onDragStart={(e) => { setDraggingIdx(i); e.dataTransfer.effectAllowed = "move"; }}
            onDragEnd={() => setDraggingIdx(null)}
            onDragEnter={(e) => { e.preventDefault(); }}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              if (draggingIdx !== null && draggingIdx !== i) movePhoto(draggingIdx, i);
              setDraggingIdx(null);
            }}
            style={{
              position: "relative", aspectRatio: "3 / 4", borderRadius: 8,
              background: it.url
                ? `url(${it.url}) center/cover, ${COLORS.surfaceAlt}`
                : `linear-gradient(135deg, ${COLORS.surfaceAlt}, rgba(11,11,13,0.06))`,
              border: i === 0 ? `2px solid ${COLORS.accent}` : `1px solid ${COLORS.borderSoft}`,
              overflow: "hidden",
              cursor: "grab",
              opacity: draggingIdx === i ? 0.4 : 1,
              transition: "opacity .12s",
            }}
            onClick={() => setEditIdx(i)}
          >
            {it.uploading && (
              <div style={{
                position: "absolute", inset: 0,
                background: "rgba(11,11,13,0.55)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontFamily: FONTS.body, fontSize: 11, fontWeight: 600,
                gap: 6,
              }}>
                <span style={{
                  width: 14, height: 14, borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  animation: "tulala-spin 0.8s linear infinite",
                }} />
                <style>{`@keyframes tulala-spin { to { transform: rotate(360deg); } }`}</style>
                {t("dashboard.adminDrawers.photoProUploading")}
              </div>
            )}
            {it.uploadError && (
              <div style={{
                position: "absolute", inset: 0,
                background: "rgba(176,48,58,0.85)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                color: "#fff", fontFamily: FONTS.body, fontSize: 10, fontWeight: 600,
                padding: 6, textAlign: "center", gap: 4,
              }}>
                <span className="text-lg">⚠</span>
                <span style={{ fontSize: 9.5, lineHeight: 1.3 }}>{it.uploadError}</span>
              </div>
            )}
            {i === 0 && (
              <span style={{ position: "absolute", top: 4, left: 4, fontSize: 9, fontWeight: 700, fontFamily: FONTS.body, padding: "2px 6px", borderRadius: 999, color: "#fff" }} className="bg-admin-accent">{t("dashboard.adminDrawers.photoMain")}</span>
            )}
            {it.tag && (
              <span style={{
                position: "absolute", bottom: 4, left: 4,
                fontSize: 9, fontWeight: 600, fontFamily: FONTS.body,
                padding: "2px 6px", borderRadius: 999,
                background: "rgba(11,11,13,0.65)", color: "#fff",
                backdropFilter: "blur(4px)",
              }}>{PHOTO_TAG_META[it.tag].emoji} {PHOTO_TAG_META[it.tag].label}</span>
            )}
            {/* Video play-overlay — appears on any tile with a videoUrl.
                Provider chip top-right (YouTube / Vimeo / mp4) so the
                source is obvious at a glance. */}
            {it.videoUrl && (
              <>
                <div aria-hidden style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(180deg, rgba(11,11,13,0) 50%, rgba(11,11,13,0.6) 100%)",
                  pointerEvents: "none",
                }} />
                <div aria-hidden style={{
                  position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
                  width: 36, height: 36, borderRadius: "50%",
                  background: "rgba(255,255,255,0.92)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 4px 12px rgba(11,11,13,0.25)",
                }}>
                  <span style={{ fontSize: 14, marginLeft: 2 }} className="text-admin-ink">▶</span>
                </div>
                <span style={{
                  position: "absolute", top: 4, right: 28,
                  fontSize: 9, fontWeight: 700, fontFamily: FONTS.body, letterSpacing: 0.4,
                  padding: "2px 6px", borderRadius: 999,
                  background: it.videoProvider === "youtube" ? "#FF0000"
                    : it.videoProvider === "vimeo" ? "#1AB7EA"
                    : "rgba(11,11,13,0.65)",
                  color: "#fff", textTransform: "uppercase",
                  backdropFilter: "blur(4px)",
                }}>{it.videoProvider}</span>
              </>
            )}
            <button type="button" onClick={(e) => { e.stopPropagation(); removeAt(i); }} aria-label={t("dashboard.adminDrawers.removeAria")}
              style={{
                position: "absolute", top: 4, right: 4,
                width: 22, height: 22, borderRadius: "50%",
                border: "none", background: "rgba(11,11,13,0.55)", color: "#fff",
                fontSize: 12, cursor: "pointer", lineHeight: 1, fontWeight: 600,
              }}>×</button>
          </div>
        ))}
        {items.length < 12 && (
          <button type="button" onClick={onPick} style={{
            aspectRatio: "3 / 4", borderRadius: 8,
            border: `1.5px dashed ${COLORS.borderSoft}`,
            background: dragOver ? "rgba(15,79,62,0.08)" : "#fff",
            cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
            fontSize: 10.5, color: COLORS.inkMuted, fontWeight: 600, fontFamily: FONTS.body,
            transition: "background .12s",
          }}>
            <span className="text-lg">+</span>
            <span>{dragOver ? t("dashboard.adminDrawers.photoDropHere") : t("dashboard.adminDrawers.photoProPickDropCapture")}</span>
          </button>
        )}
      </div>
      {/* Add-by-URL row — paste a YouTube / Vimeo / .mp4 link to add a
          video card to the gallery. Sits below the photo grid so the
          primary action (upload) stays first; secondary surface for
          motion work that lives somewhere else already. */}
      {items.length < 12 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
            <input
              type="url"
              value={videoUrlInput}
              onChange={(e) => { setVideoUrlInput(e.target.value); if (videoUrlError) setVideoUrlError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVideoUrl(); } }}
              placeholder={t("dashboard.adminDrawers.photoProVideoPlaceholder")}
              style={{
                flex: 1, padding: "8px 11px",
                borderRadius: 8, border: `1px solid ${videoUrlError ? COLORS.coral : COLORS.borderSoft}`,
                fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, outline: "none",
              }}
            />
            <button type="button" onClick={addVideoUrl} disabled={!videoUrlInput.trim()} style={{
              padding: "8px 14px", borderRadius: 8, border: "none",
              background: videoUrlInput.trim() ? COLORS.ink : "rgba(11,11,13,0.10)",
              color: videoUrlInput.trim() ? "#fff" : COLORS.inkDim,
              fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
              cursor: videoUrlInput.trim() ? "pointer" : "default",
            }}>{t("dashboard.adminDrawers.photoProAddVideo")}</button>
          </div>
          {videoUrlError && (
            <div style={{ fontSize: 10.5, fontFamily: FONTS.body }} className="text-admin-coral">{videoUrlError}</div>
          )}
        </div>
      )}
      <div style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4, fontFamily: FONTS.body }} className="text-admin-ink-dim">
        {t("dashboard.adminDrawers.photoProHint")}
      </div>

      {editIdx !== null && items[editIdx] && (
        <PhotoMetaModal
          item={items[editIdx]}
          onClose={() => setEditIdx(null)}
          onSave={(patch) => { updateAt(editIdx, patch); setEditIdx(null); }}
          onMakeMain={editIdx > 0 ? () => { makeMain(editIdx); setEditIdx(null); } : undefined}
        />
      )}
    </div>
  );
});


export function PhotoMetaModal({ item, onClose, onSave, onMakeMain }: {
  item: PhotoMeta;
  onClose: () => void;
  onSave: (patch: Partial<PhotoMeta>) => void;
  onMakeMain?: () => void;
}) {
  const t = useT();
  const [tag, setTag] = useState<PhotoTag | undefined>(item.tag);
  const [altText, setAltText] = useState(item.altText ?? "");
  const [caption, setCaption] = useState(item.caption ?? "");
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 270,
      background: "rgba(11,11,13,0.55)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONTS.body,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 14, padding: 18,
        maxWidth: 460, width: "92%",
        boxShadow: "0 30px 60px -10px rgba(11,11,13,0.4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }} className="text-admin-ink">
            {item.videoUrl ? t("dashboard.adminDrawers.photoMetaVideoTitle") : t("dashboard.adminDrawers.photoMetaPhotoTitle")}
          </h3>
          <button type="button" onClick={onClose} aria-label={t("dashboard.adminDrawers.close")} style={{
            background: "transparent", border: "none", padding: 4, cursor: "pointer", fontSize: 16, color: COLORS.inkMuted,
          }}>✕</button>
        </div>
        {/* Preview — embedded video player when we have a URL we can
            recognize, else photo. Falls back to thumbnail for any
            unparseable URL so the modal always shows *something*. */}
        {item.videoUrl ? (() => {
          const parsed = parseVideoUrl(item.videoUrl);
          if (parsed && (parsed.provider === "youtube" || parsed.provider === "vimeo")) {
            return (
              <div style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 10, marginBottom: 12, overflow: "hidden", border: `1px solid ${COLORS.borderSoft}` }} className="bg-admin-surface-alt">
                <iframe
                  src={parsed.embedUrl}
                  title={t("dashboard.adminDrawers.photoMetaVideoPreviewTitle")}
                  style={{ width: "100%", height: "100%", border: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            );
          }
          if (parsed && parsed.provider === "mp4") {
            return (
              <video
                src={parsed.embedUrl}
                controls
                style={{
                  width: "100%", aspectRatio: "16 / 9", borderRadius: 10, marginBottom: 12,
                  border: `1px solid ${COLORS.borderSoft}`, background: "#000",
                }}
              />
            );
          }
          return (
            <div style={{
              width: "100%", aspectRatio: "16 / 9", borderRadius: 10, marginBottom: 12,
              background: `url(${item.url}) center/cover, ${COLORS.surfaceAlt}`,
              border: `1px solid ${COLORS.borderSoft}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 11, fontWeight: 600,
            }}>{interpolate(t("dashboard.adminDrawers.photoMetaPreviewUnavailable"), { url: item.videoUrl })}</div>
          );
        })() : (
          <div style={{
            width: "100%", aspectRatio: "4 / 3", borderRadius: 10, marginBottom: 12,
            background: `url(${item.url}) center/cover, ${COLORS.surfaceAlt}`,
            border: `1px solid ${COLORS.borderSoft}`,
          }} />
        )}
        <FieldRow label={t("dashboard.adminDrawers.photoMetaTag")}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {(Object.keys(PHOTO_TAG_META) as PhotoTag[]).map(tagKey => {
              const active = tag === tagKey;
              const m = PHOTO_TAG_META[tagKey];
              return (
                <button key={tagKey} type="button" onClick={() => setTag(active ? undefined : tagKey)} style={{
                  padding: "6px 11px", borderRadius: 999,
                  border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                  background: active ? "rgba(15,79,62,0.08)" : "#fff",
                  color: active ? COLORS.accentDeep : COLORS.ink,
                  fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}>
                  <span aria-hidden>{m.emoji}</span>
                  {m.label}
                </button>
              );
            })}
          </div>
        </FieldRow>
        <FieldRow label={t("dashboard.adminDrawers.photoMetaAltLabel")} hint={t("dashboard.adminDrawers.photoMetaAltHint")}>
          <input type="text" value={altText}
            onChange={(e) => setAltText(e.target.value)}
            placeholder={t("dashboard.adminDrawers.photoMetaAltPlaceholder")}
            style={{
              width: "100%", boxSizing: "border-box", padding: "10px 12px",
              borderRadius: 10, border: `1px solid ${COLORS.border}`,
              fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
            }}
          />
        </FieldRow>
        <FieldRow label={t("dashboard.adminDrawers.photoMetaCaption")} optional>
          <input type="text" value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={t("dashboard.adminDrawers.photoMetaCaptionPlaceholder")}
            style={{
              width: "100%", boxSizing: "border-box", padding: "10px 12px",
              borderRadius: 10, border: `1px solid ${COLORS.border}`,
              fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
            }}
          />
        </FieldRow>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          {onMakeMain ? (
            <button type="button" onClick={onMakeMain} style={{
              padding: "8px 12px", borderRadius: 999, border: `1px solid ${COLORS.borderSoft}`,
              background: "#fff", color: COLORS.ink,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>{t("dashboard.adminDrawers.photoMetaMakeMain")}</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} style={{
              padding: "9px 14px", borderRadius: 999,
              border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.ink,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>{t("dashboard.adminDrawers.cancel")}</button>
            <button type="button" onClick={() => onSave({ tag, altText, caption })} style={{
              padding: "9px 16px", borderRadius: 999, border: "none",
              background: COLORS.fill, color: "#fff",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>{t("dashboard.adminDrawers.save")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Albums Pro — uses albumsPro shape ────────────────────────────────
// NOTE: talent-owned "albums" are NOT the same concept as workspace
// `media_folders`. Albums are per-talent curated photo groupings that
// appear on the public profile (saved via the profile Save button into
// the talent's `albums` field). Media folders are agency-internal
// organizational containers in the admin Media page. They serve
// different audiences and should not be consolidated.

export type WmPos = WatermarkPreset["position"];

export const WM_POSITIONS: WmPos[] = ["tl","tc","tr","ml","mc","mr","bl","bc","br"];

export function WatermarkPositionGrid({ value, onChange }: { value: WmPos; onChange: (p: WmPos) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 28px)", gap: 4, width: "fit-content" }}>
      {WM_POSITIONS.map((pos) => {
        const active = pos === value;
        return (
          <button key={pos} type="button" title={pos.toUpperCase()} onClick={() => onChange(pos)} style={{
            width: 28, height: 28, borderRadius: 6, border: "none",
            background: active ? COLORS.fill : COLORS.surfaceAlt,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: active ? "#fff" : COLORS.inkDim }} />
          </button>
        );
      })}
    </div>
  );
}


export function WatermarkPreviewCard({ preset, logoUrl }: { preset: WatermarkPreset; logoUrl: string | null }) {
  const t = useT();
  const posMap: Record<WmPos, React.CSSProperties> = {
    tl: { top: `${preset.padding_pct}%`, left: `${preset.padding_pct}%` },
    tc: { top: `${preset.padding_pct}%`, left: "50%", transform: "translateX(-50%)" },
    tr: { top: `${preset.padding_pct}%`, right: `${preset.padding_pct}%` },
    ml: { top: "50%", left: `${preset.padding_pct}%`, transform: "translateY(-50%)" },
    mc: { top: "50%", left: "50%", transform: "translate(-50%,-50%)" },
    mr: { top: "50%", right: `${preset.padding_pct}%`, transform: "translateY(-50%)" },
    bl: { bottom: `${preset.padding_pct}%`, left: `${preset.padding_pct}%` },
    bc: { bottom: `${preset.padding_pct}%`, left: "50%", transform: "translateX(-50%)" },
    br: { bottom: `${preset.padding_pct}%`, right: `${preset.padding_pct}%` },
  };
  return (
    <div style={{
      position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden",
      background: "linear-gradient(135deg,#e8e4df 0%,#d4cfc9 100%)", border: `1px solid ${COLORS.borderSoft}`,
    }}>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontFamily: FONTS.body, fontSize: 11, color: "rgba(11,11,13,0.3)", letterSpacing: 0.5 }}>{t("dashboard.adminDrawers.wmSamplePhoto")}</span>
      </div>
      {preset.enabled && (
        <div style={{
          position: "absolute", ...posMap[preset.position],
          width: `${preset.size_pct}%`, opacity: preset.opacity, pointerEvents: "none",
        }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" style={{ width: "100%", height: "auto", display: "block" }} />
          ) : (
            <div style={{ background: "#fff", borderRadius: 4, padding: "3px 6px", fontFamily: FONTS.body, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }} className="text-admin-ink">{t("dashboard.adminDrawers.wmYourLogo")}</div>
          )}
        </div>
      )}
    </div>
  );
}


export function SelectInput({
  options,
  defaultValue,
  value,
  onChange,
}: {
  options: string[];
  defaultValue?: string;
  /** Controlled value. When provided, must be paired with onChange. */
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <select
      defaultValue={value === undefined ? defaultValue : undefined}
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      style={{
        padding: "9px 12px",
        fontFamily: FONTS.body,
        fontSize: 13,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        background: "#fff",
        color: COLORS.ink,
        width: "100%",
      }}
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

// ════════════════════════════════════════════════════════════════════
// Talent profile + new talent + my profile
// ════════════════════════════════════════════════════════════════════


export function StateExplainer({ state }: { state: "draft" | "invited" | "published" | "awaiting-approval" | "claimed" }) {
  const map: Record<string, { title: string; body: string }> = {
    draft: {
      title: "Draft — not visible to anyone",
      body: "You can keep editing. Publish when ready.",
    },
    invited: {
      title: "Invited — waiting for talent to accept",
      body: "We sent an email so they can claim and edit their own profile. Until they do, what you write is what shows.",
    },
    published: {
      title: "Published — live in your roster",
      body: "Anyone with the link can see this profile. Inquiries can come in.",
    },
    "awaiting-approval": {
      title: "Awaiting approval",
      body: "Talent has edited their profile and submitted changes. Review and publish when ready.",
    },
    claimed: {
      title: "Claimed by talent",
      body: "Talent owns this profile. They edit, you approve significant changes.",
    },
  };
  const m = map[state];
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600 }} className="text-admin-ink">
        {m.title}
      </div>
      <div style={{ fontFamily: FONTS.body, fontSize: 12, marginTop: 4, lineHeight: 1.5 }} className="text-admin-ink-muted">
        {m.body}
      </div>
    </div>
  );
}

/**
 * RepresentationCard — explains the talent's current representation
 * status and what it implies for inquiry ownership across surfaces
 * (agency portal, hub page, personal page). Mirrors the rules in
 * `resolveInquiryOwnership()` so admins see the routing they will get.
 */

export function RepresentationCard({
  representation,
  talentName,
}: {
  representation: RepresentationStatus;
  talentName: string;
}) {
  const t = useT();
  const surfaceAgency = t("dashboard.adminDrawers.repSurfaceAgencyPage");
  const surfaceHub = t("dashboard.adminDrawers.repSurfaceHubPage");
  const surfacePersonal = t("dashboard.adminDrawers.repSurfacePersonalPage");
  const subtitle =
    representation.kind === "exclusive"
      ? interpolate(t("dashboard.adminDrawers.repSubtitleExclusive"), { agency: representation.agencyName })
      : representation.kind === "non-exclusive"
        ? interpolate(t("dashboard.adminDrawers.repSubtitleNonExclusive"), { agencies: representation.agencyNames.join(", ") })
        : interpolate(t("dashboard.adminDrawers.repSubtitleFreelance"), { talent: talentName });

  const ownershipBullets =
    representation.kind === "freelance"
      ? [
          { surface: surfaceAgency, owner: "—" },
          { surface: surfaceHub, owner: interpolate(t("dashboard.adminDrawers.repOwnerHubFreelance"), { talent: talentName }) },
          { surface: surfacePersonal, owner: interpolate(t("dashboard.adminDrawers.repOwnerPersonalFreelance"), { talent: talentName }) },
        ]
      : representation.kind === "exclusive"
        ? [
            { surface: surfaceAgency, owner: representation.agencyName },
            { surface: surfaceHub, owner: interpolate(t("dashboard.adminDrawers.repOwnerHubExclusive"), { talent: talentName, agency: representation.agencyName }) },
            { surface: surfacePersonal, owner: interpolate(t("dashboard.adminDrawers.repOwnerPersonalExclusive"), { talent: talentName, agency: representation.agencyName }) },
          ]
        : [
            { surface: surfaceAgency, owner: t("dashboard.adminDrawers.repOwnerAgencyNonExclusive") },
            { surface: surfaceHub, owner: interpolate(t("dashboard.adminDrawers.repOwnerHubNonExclusive"), { talent: talentName }) },
            { surface: surfacePersonal, owner: interpolate(t("dashboard.adminDrawers.repOwnerPersonalNonExclusive"), { talent: talentName }) },
          ];

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <RepresentationChip representation={representation} />
      </div>
      <p style={{ fontFamily: FONTS.body, fontSize: 12.5, margin: "0 0 12px", lineHeight: 1.55 }} className="text-admin-ink">
        {subtitle}
      </p>
      <CapsLabel>{t("dashboard.adminDrawers.repInquiryRoutingBySource")}</CapsLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        {ownershipBullets.map((row) => (
          <div
            key={row.surface}
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: 10,
              fontFamily: FONTS.body,
              fontSize: 12,
              alignItems: "baseline",
            }}
          >
            <span className="text-admin-ink-muted">{row.surface}</span>
            <span className="text-admin-ink">{row.owner}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


export function ToggleRow({
  label, defaultOn = false, onChange,
}: { label: string; defaultOn?: boolean; onChange?: (v: boolean) => void }) {
  const [on, setOn] = useState(defaultOn);
  // Sync to defaultOn when the parent changes it (controlled-ish pattern
  // so callers can drive state without passing a value prop everywhere).
  useEffect(() => { setOn(defaultOn); }, [defaultOn]);
  const handle = (v: boolean) => {
    setOn(v);
    onChange?.(v);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
      <Toggle on={on} onChange={handle} label={label} />
      <span style={{ fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink">{label}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// NewTalentDrawer (admin "Quick Add") — proper 1-screen quick-add.
// Captures contact essentials (first/last/display name, email, phone,
// photo) + Talent Type + Home Base + management method.
// CTAs adapt to method: invite / continue editing / save draft.
// ════════════════════════════════════════════════════════════════════


export function RadioCardGroup({ options, defaultId }: { options: { id: string; title: string; desc: string }[]; defaultId: string }) {
  const [selected, setSelected] = useState(defaultId);
  return (
    <div className="flex flex-col gap-2">
      {options.map((o) => {
        const isSelected = selected === o.id;
        return (
          <button
            key={o.id}
            onClick={() => setSelected(o.id)}
            style={{
              background: "#fff",
              border: `1.5px solid ${isSelected ? COLORS.accent : COLORS.borderSoft}`,
              borderRadius: 10,
              padding: 12,
              cursor: "pointer",
              fontFamily: FONTS.body,
              textAlign: "left",
              display: "flex",
              gap: 10,
              transition: `border-color ${TRANSITION.micro}`,
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: `1.5px solid ${isSelected ? COLORS.accent : "rgba(11,11,13,0.18)"}`,
                background: isSelected ? COLORS.fill : "transparent",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              {isSelected && (
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />
              )}
            </span>
            <div className="flex-1">
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{o.title}</div>
              <div style={{ fontSize: 12, marginTop: 2, lineHeight: 1.5 }} className="text-admin-ink-muted">
                {o.desc}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}


export function InquiryTrustPanel({ clientName, talentNames }: { clientName: string; talentNames: string[] }) {
  const t = useT();
  const { getTrustSummary, getRiskScore } = useAdminShell();
  const allRoster = [...ROSTER_AGENCY, ...ROSTER_FREE];
  // Resolve first talent (most inquiries are single-talent for the demo)
  const talentName = talentNames[0];
  const talentId = talentName ? allRoster.find(r => r.name === talentName)?.id : undefined;
  const talentTrust = talentId ? getTrustSummary("talent_profile", talentId) : null;
  // Client trust — Vogue Italia is the seeded business-verified
  const clientId = clientName === "Vogue Italia" ? "c1" : `c-${clientName.toLowerCase().replace(/\s+/g, "-")}`;
  const clientTrust = getTrustSummary("client_profile", clientId);
  const clientRisk = getRiskScore("client_profile", clientId);
  const talentRisk = talentId ? getRiskScore("talent_profile", talentId) : null;
  return (
    <Section title={t("dashboard.adminDrawers.trustPanelTitle")}>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
        fontFamily: FONTS.body,
      }}>
        <div style={{
          padding: 12, borderRadius: 10,
          background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 }} className="text-admin-ink-muted">{t("dashboard.adminDrawers.trustPanelClient")}</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }} className="text-admin-ink">{clientName}</div>
          <TrustBadgeGroup trust={clientTrust} surface="coordinator_workspace" size="sm" max={3} />
          <div className="mt-2"><RiskScorePill score={clientRisk} label={t("dashboard.adminDrawers.trustPanelScore")} /></div>
        </div>
        <div style={{
          padding: 12, borderRadius: 10,
          background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 }} className="text-admin-ink-muted">{t("dashboard.adminDrawers.trustPanelTalent")}</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }} className="text-admin-ink">{talentName ?? "—"}</div>
          {talentTrust ? (
            <>
              <TrustBadgeGroup trust={talentTrust} surface="coordinator_workspace" size="sm" max={3} />
              {talentRisk !== null && <div className="mt-2"><RiskScorePill score={talentRisk} label={t("dashboard.adminDrawers.trustPanelScore")} /></div>}
            </>
          ) : (
            <span className="text-admin-ink-muted text-admin-11">{t("dashboard.adminDrawers.trustPanelNotOnRoster")}</span>
          )}
        </div>
      </div>
    </Section>
  );
}


export function SummaryTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" }} className="text-admin-ink-muted">
        {label}
      </div>
      <div style={{ fontFamily: FONTS.body, fontSize: 14, fontWeight: 600, marginTop: 4 }} className="text-admin-ink">
        {value}
      </div>
    </div>
  );
}


export function StageBadgeMini({ stage }: { stage: string }) {
  const map: Record<string, { label: string; tone: "amber" | "green" | "dim" }> = {
    draft: { label: "Draft", tone: "dim" },
    hold: { label: "On hold", tone: "amber" },
    "awaiting-client": { label: "Awaiting", tone: "amber" },
    confirmed: { label: "Confirmed", tone: "green" },
    archived: { label: "Archived", tone: "dim" },
  };
  const m = map[stage] ?? { label: stage, tone: "dim" as const };
  return <StateChipMini label={m.label} tone={m.tone} />;
}


export function ConversationBubble({
  who,
  name,
  when,
  body,
  mine = false,
}: {
  who: string;
  name: string;
  when: string;
  body: string;
  mine?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexDirection: mine ? "row-reverse" : "row",
      }}
    >
      <Avatar initials={name.split(" ").map(w=>w[0]).slice(0,2).join("")} size={28} tone={mine ? "ink" : "neutral"} />
      <div
        style={{
          flex: 1,
          background: mine ? COLORS.fill : "#fff",
          color: mine ? "#fff" : COLORS.ink,
          border: `1px solid ${mine ? "transparent" : COLORS.borderSoft}`,
          borderRadius: 10,
          padding: "10px 12px",
          maxWidth: 380,
        }}
      >
        <div style={{ fontFamily: FONTS.body, fontSize: 11.5, opacity: mine ? 0.7 : 0.6, marginBottom: 4 }}>
          {name} <Bullet /> {when}
        </div>
        <div style={{ fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.55 }}>{body}</div>
      </div>
    </div>
  );
}


export type BatchedNotif = {
  kind: "batch";
  id: string;
  batchKind: NotificationItem["kind"];
  inquiryId?: string;
  count: number;
  actors: string[];        // distinct actor names
  summary: string;         // "3 new messages from Vogue Italia"
  ts: string;              // ts of the latest item
  items: NotificationItem[];
  targetDrawer: NotificationItem["targetDrawer"];
  targetPayload?: NotificationItem["targetPayload"];
};


export type NotifListItem = NotificationItem | BatchedNotif;

/** Group consecutive same-kind+same-inquiryId notifications into batches. */

export function batchNotifications(items: NotificationItem[]): NotifListItem[] {
  const out: NotifListItem[] = [];
  let i = 0;
  while (i < items.length) {
    const curr = items[i];
    // Only batch unread messages from the same inquiry
    if (curr.kind === "message" && !curr.read && curr.inquiryId) {
      const group: NotificationItem[] = [curr];
      while (
        i + group.length < items.length &&
        items[i + group.length].kind === "message" &&
        !items[i + group.length].read &&
        items[i + group.length].inquiryId === curr.inquiryId
      ) {
        group.push(items[i + group.length]);
      }
      if (group.length >= 2) {
        // Infer a readable entity name from the inquiry ID
        const entityName =
          group[0].title.split(" ")[0] + (group[0].title.split(" ")[1] ? " " + group[0].title.split(" ")[1] : "");
        const actors = [...new Set(group.map((g) => g.actorName))];
        out.push({
          kind: "batch",
          id: `batch-${curr.id}`,
          batchKind: "message",
          inquiryId: curr.inquiryId,
          count: group.length,
          actors,
          summary: `${group.length} new messages from ${entityName}`,
          ts: group[group.length - 1].ts,
          items: group,
          targetDrawer: curr.targetDrawer,
          targetPayload: curr.targetPayload,
        });
        i += group.length;
        continue;
      }
    }
    out.push(curr);
    i++;
  }
  return out;
}


export type MyAction = {
  id: string;
  icon: "mail" | "check" | "bolt" | "calendar" | "user" | "settings" | "archive" | "plus";
  label: string;
  sub?: string;
  ts: string;
  category: "message" | "inquiry" | "booking" | "roster" | "settings";
};


export const MY_ACTIONS: MyAction[] = [
  { id: "a1",  icon: "mail",     label: "Replied in Valentino SS26 thread",         sub: "Confirmed Kai Lin availability",           ts: "22m ago",  category: "message"  },
  { id: "a2",  icon: "bolt",     label: "Sent counter-offer to Vogue Italia",        sub: "RI-202 · €12,400 for 2 talent",            ts: "2h ago",   category: "inquiry"  },
  { id: "a3",  icon: "check",    label: "Approved Lina Park's profile changes",      sub: "3 new photos + measurements",              ts: "1h ago",   category: "roster"   },
  { id: "a4",  icon: "plus",     label: "Added Tomás Navarro to the roster",         sub: "Freelance model · New face tier",          ts: "Yesterday", category: "roster"  },
  { id: "a5",  icon: "calendar", label: "Confirmed booking BK-203",                  sub: "Bvlgari · Kai Lin · Rome · May 8",         ts: "Yesterday", category: "booking" },
  { id: "a6",  icon: "mail",     label: "Sent inquiry to Casa Pero",                 sub: "RI-207 · E/W shoot · 2 talent",            ts: "2d ago",   category: "inquiry"  },
  { id: "a7",  icon: "archive",  label: "Archived 4 expired inquiries",              sub: "RI-200, RI-198, RI-196, RI-193",           ts: "2d ago",   category: "inquiry"  },
  { id: "a8",  icon: "settings", label: "Updated workspace branding",                sub: "Logo + accent color",                      ts: "3d ago",   category: "settings" },
  { id: "a9",  icon: "user",     label: "Invited Andrés Lopez to the team",          sub: "Editor role",                              ts: "3d ago",   category: "roster"   },
  { id: "a10", icon: "mail",     label: "Sent offer to Net-a-Porter",                sub: "RI-204 · Marta Reyes · €3,400",            ts: "4d ago",   category: "inquiry"  },
  { id: "a11", icon: "check",    label: "Marked BK-198 as complete",                 sub: "Zara capsule · Kai Lin",                   ts: "5d ago",   category: "booking"  },
  { id: "a12", icon: "plus",     label: "Created new shortlist for Prada",           sub: "8 talent shortlisted",                     ts: "6d ago",   category: "inquiry"  },
];


export type ActivityCategory = MyAction["category"] | "all";


export function ReorderList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it, idx) => (
        <div
          key={it}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.ink,
          }}
        >
          <span style={{ cursor: "grab", fontSize: 14 }} className="text-admin-ink-dim">⋮⋮</span>
          <span style={{ fontSize: 11.5, minWidth: 16 }} className="text-admin-ink-muted">{idx + 1}</span>
          <span className="flex-1">{it}</span>
          <Icon name="external" size={11} color={COLORS.inkDim} />
        </div>
      ))}
    </div>
  );
}


export type CustomFieldKind = "Text" | "Number" | "Select" | "Multi-select" | "Date" | "Toggle";

export type CustomFieldAppliesTo = "Talent" | "Client" | "Booking" | "Inquiry";


export type CustomField = {
  id: string;
  name: string;
  kind: CustomFieldKind;
  appliesTo: CustomFieldAppliesTo;
  required: boolean;
  helper?: string;
};

// =====================================================================
// Phase E — Workspace Field Settings drawer
// =====================================================================
//
// Per-tenant overrides on top of the platform field catalog. This is
// the write surface — agencies pick which platform fields are required,
// public, talent-editable, hidden, etc. Catalog stays platform-curated;
// agencies can't add new fields here (use FieldCatalogDrawer for that —
// agency-specific custom fields).
//
// Storage: `__workspaceOverrides` in `_field-catalog.ts` + localStorage.
// Production target: `workspace_profile_field_settings` table (see
// supabase/migrations/20260901120200_*.sql).
//
// Reads: every consumer that uses `applyWorkspaceFieldOverride()` or
// `resolvedFieldsForMode()` automatically respects the toggles set
// here. The talent drawer's REQUIRED/OPTIONAL pills already do.

// Phase 2 (finish) — real per-field settings table over the SAME engine
// FieldCatalogDrawer uses (getWorkspaceFieldCatalog / setWorkspaceFieldCatalog
// / setWorkspaceFieldGroup). Searchable + group-sectioned + expandable
// rows. Real backend persists exactly: enabled / required / custom_label /
// custom_helper (+ group enable/relabel). The old mock's registration /
// editor / directory / talent-editable / review toggles had NO backend —
// per the plan's locked Phase-2 scope + the no-fake-UI rule they are NOT
// shown. Visibility (public/admin/hidden) is Field Privacy's surface →
// cross-linked, not duplicated here.

export function SettingToggleRow({
  label, hint, value, disabled, onChange, isOverridden,
}: {
  label: string;
  hint?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  isOverridden: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "6px 0",
      opacity: disabled ? 0.55 : 1,
    }}>
      <button
        type="button"
        onClick={() => !disabled && onChange(!value)}
        aria-pressed={value}
        disabled={disabled}
        style={{
          flexShrink: 0,
          width: 32, height: 19, borderRadius: 999,
          border: "none",
          background: value ? COLORS.accent : "rgba(11,11,13,0.12)",
          position: "relative", padding: 0,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span style={{ position: "absolute", top: 2, left: value ? 15 : 2, width: 15, height: 15, borderRadius: "50%", background: "#fff", transition: "left .15s", }} />
      </button>
      <div className="flex-1 min-w-0">
        <div style={{
          fontSize: 12.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }} className="text-admin-ink">
          <span>{label}</span>
          {isOverridden && (
            <span style={{ padding: "0 5px", borderRadius: 999, fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }} className="bg-admin-amber-soft text-admin-amber-deep">overridden</span>
          )}
        </div>
        {hint && (
          <div style={{ fontSize: 10.5, marginTop: 1, lineHeight: 1.35 }} className="text-admin-ink-muted">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}


export function FieldPrivacyCount({
  label, count, icon, tone, bg, borderLeft,
}: { label: string; count: number; icon: string; tone: string; bg: string; borderLeft?: boolean }) {
  return (
    <div style={{
      padding: "12px 14px",
      borderLeft: borderLeft ? `1px solid ${COLORS.borderSoft}` : "none",
      background: bg,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 11, fontWeight: 600, color: tone, marginBottom: 4,
      }}>
        <span>{icon}</span>
        {label}
      </div>
      <div style={{
        fontFamily: FONTS.display, fontSize: 22, fontWeight: 500,
        color: tone, letterSpacing: -0.4, lineHeight: 1,
      }}>{count}</div>
    </div>
  );
}


export function FieldPrivacyRow({
  isFirst, label, description, defaultVis, current, onChange, canFlip, canHide,
}: {
  isFirst: boolean;
  label: string;
  description?: string;
  defaultVis: FieldVisibility;
  current: FieldVisibility;
  onChange: (v: FieldVisibility) => void;
  canFlip: boolean;
  canHide: boolean;
}) {
  // Legacy ES_TEXT map — matches FieldPrivacyDrawer (light-10.tsx), this
  // component's only caller, so the row and its drawer speak one system.
  const { t: tt } = useDashboardText();
  const isOverridden = current !== defaultVis;
  const options: { id: FieldVisibility; label: string; hint: string; emoji: string; tone: string; bg: string; available: boolean }[] = [
    { id: "public",   label: tt("Public"), hint: tt("shows on the public site"), emoji: "🌐", tone: COLORS.successDeep, bg: COLORS.successSoft, available: canFlip || defaultVis === "public" },
    { id: "internal", label: tt("Admin"),  hint: tt("admin view only"),          emoji: "🔒", tone: COLORS.amberDeep,   bg: COLORS.amberSoft,   available: canFlip || defaultVis === "internal" },
    { id: "hidden",   label: tt("Hidden"), hint: tt("not collected at all"),     emoji: "–",  tone: COLORS.inkMuted,    bg: "rgba(11,11,13,0.06)", available: canHide || defaultVis === "hidden" },
  ];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px",
      borderTop: isFirst ? "none" : `1px solid ${COLORS.borderSoft}`,
      fontFamily: FONTS.body,
    }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-admin-ink text-admin-12h font-medium">{label}</span>
          {isOverridden && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999, letterSpacing: 0.4, textTransform: "uppercase" }} className="bg-admin-indigo-soft text-admin-indigo-deep">{tt("changed")}</span>
          )}
        </div>
        {description && (
          <div style={{ fontSize: 10.5, marginTop: 2, lineHeight: 1.4 }} className="text-admin-ink-muted">{description}</div>
        )}
      </div>
      <div style={{ display: "inline-flex", padding: 2, borderRadius: 999, background: "rgba(11,11,13,0.04)" }}>
        {options.map((o) => {
          const active = current === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => o.available && onChange(o.id)}
              disabled={!o.available}
              title={!o.available
                ? tt("Upgrade your plan to use “{option}”").replace("{option}", o.label)
                : `${o.label}: ${o.hint}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "5px 11px", borderRadius: 999, border: "none",
                background: active ? o.bg : "transparent",
                color: active ? o.tone : (o.available ? COLORS.inkMuted : COLORS.inkDim),
                fontSize: 11, fontWeight: 600, cursor: o.available ? "pointer" : "not-allowed",
                opacity: o.available ? 1 : 0.5,
                fontFamily: FONTS.body,
              }}
            >
              <span aria-hidden className="text-admin-11">{o.emoji}</span>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Trust & Verification Queue — admin review surface for verification
// requests. Tabs by status, drawer-based detail with approve/reject/info.
// ════════════════════════════════════════════════════════════════════


export const VR_STATUS_META: Record<VerificationRequestStatus, { label: string; tone: "amber" | "green" | "dim" }> = {
  draft:               { label: "Draft",            tone: "dim" },
  pending_user_action: { label: "Pending user",     tone: "amber" },
  submitted:           { label: "Submitted",        tone: "amber" },
  in_review:           { label: "In review",        tone: "amber" },
  approved:            { label: "Approved",         tone: "green" },
  rejected:            { label: "Rejected",         tone: "amber" },
  expired:             { label: "Expired",          tone: "dim" },
  cancelled:           { label: "Cancelled",        tone: "dim" },
  needs_more_info:     { label: "Needs more info",  tone: "amber" },
};

// Localized labels — additive to VR_STATUS_META (whose English `.label`
// stays for non-localized consumers). Localized render sites resolve
// t(VR_STATUS_LABEL_KEYS[status]); the raw union above stays for tone/logic.
export const VR_STATUS_LABEL_KEYS: Record<VerificationRequestStatus, string> = {
  draft:               "dashboard.adminDrawers.vrStatusDraft",
  pending_user_action: "dashboard.adminDrawers.vrStatusPendingUser",
  submitted:           "dashboard.adminDrawers.vrStatusSubmitted",
  in_review:           "dashboard.adminDrawers.vrStatusInReview",
  approved:            "dashboard.adminDrawers.vrStatusApproved",
  rejected:            "dashboard.adminDrawers.vrStatusRejected",
  expired:             "dashboard.adminDrawers.vrStatusExpired",
  cancelled:           "dashboard.adminDrawers.vrStatusCancelled",
  needs_more_info:     "dashboard.adminDrawers.vrStatusNeedsMoreInfo",
};

// ExistingRequestRow uses its own action-oriented headings (distinct from
// the neutral VR_STATUS_META labels above). Only the four statuses the row
// can render have a key; any other status falls back to the raw value.
export const EXISTING_REQUEST_HEADING_KEYS: Partial<Record<VerificationRequestStatus, string>> = {
  pending_user_action: "dashboard.adminDrawers.existingReqHeadingPendingUserAction",
  submitted:           "dashboard.adminDrawers.existingReqHeadingSubmitted",
  in_review:           "dashboard.adminDrawers.existingReqHeadingInReview",
  needs_more_info:     "dashboard.adminDrawers.existingReqHeadingNeedsMoreInfo",
};

// Activity log — timeline derived from a request's lifecycle fields.
// We don't store full event history yet; instead we synthesize the
// likely sequence from createdAt/updatedAt/reviewedAt + current status.
// Compact risk-score row for admin detail panels — pulls live from
// getRiskScore. Admin-only — never shown publicly.

export function SubjectRiskScoreRow({ subjectType, subjectId }: { subjectType: VerificationRequest["subjectType"]; subjectId: string }) {
  const { getRiskScore } = useAdminShell();
  const score = getRiskScore(subjectType, subjectId);
  return (
    <div style={{ marginTop: 14, marginBottom: 4, fontFamily: FONTS.body }}>
      <RiskScorePill score={score} />
    </div>
  );
}


export function ActivityLogPanel({ request }: { request: VerificationRequest }) {
  type Event = { label: string; ts?: string | null; tone: "ink" | "amber" | "green" | "red" | "dim" };
  const events: Event[] = [];

  events.push({ label: "Request created", ts: request.createdAt, tone: "ink" });

  if (request.status === "pending_user_action") {
    events.push({ label: "Awaiting talent action", ts: null, tone: "amber" });
  }
  if (request.status === "submitted" || request.status === "in_review"
      || request.status === "approved" || request.status === "rejected"
      || request.status === "needs_more_info") {
    events.push({ label: "Submitted by talent", ts: request.updatedAt, tone: "ink" });
  }
  if (request.status === "in_review") {
    events.push({ label: "Marked in review by admin", ts: request.updatedAt, tone: "amber" });
  }
  if (request.status === "needs_more_info") {
    events.push({ label: "Admin requested more info", ts: request.updatedAt, tone: "amber" });
  }
  if (request.status === "approved") {
    events.push({ label: "Approved by Tulala admin", ts: request.reviewedAt ?? request.updatedAt, tone: "green" });
    events.push({ label: "Verification badge issued", ts: request.reviewedAt ?? request.updatedAt, tone: "green" });
  }
  if (request.status === "rejected") {
    events.push({ label: "Rejected by Tulala admin", ts: request.reviewedAt ?? request.updatedAt, tone: "red" });
  }
  if (request.status === "expired") {
    events.push({ label: "Request expired (72h window)", ts: request.updatedAt, tone: "dim" });
  }
  if (request.status === "cancelled") {
    events.push({ label: "Cancelled by talent", ts: request.updatedAt, tone: "dim" });
  }

  const fmt = (iso?: string | null) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };
  const dotColor = (tone: Event["tone"]) => {
    if (tone === "green") return COLORS.successDeep;
    if (tone === "amber") return COLORS.amberDeep;
    if (tone === "red")   return COLORS.red;
    if (tone === "dim")   return COLORS.inkDim;
    return COLORS.ink;
  };

  return (
    <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 12, border: `1px solid ${COLORS.borderSoft}` }} className="bg-admin-surface">
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }} className="text-admin-ink-dim">Activity</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {events.map((ev, i) => {
          const last = i === events.length - 1;
          return (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 12, flexShrink: 0 }}>
                <div style={{
                  width: 9, height: 9, borderRadius: "50%",
                  background: dotColor(ev.tone),
                  marginTop: 4, flexShrink: 0,
                  boxShadow: `0 0 0 2px #fff`,
                }} />
                {!last && (
                  <div style={{ flex: 1, width: 1, background: COLORS.borderSoft, marginTop: 2, marginBottom: 2 }} />
                )}
              </div>
              <div style={{ flex: 1, paddingBottom: last ? 0 : 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3 }} className="text-admin-ink">
                  {ev.label}
                </div>
                <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-dim">
                  {ev.ts ? fmt(ev.ts) : "—"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


export function TalentTrustHealthPanel({ talentId }: { talentId: string }) {
  const t = useT();
  const { getTrustSummary, getRiskScore, listEnabledMethods, openDrawer } = useAdminShell();
  const trust = getTrustSummary("talent_profile", talentId);
  const score = getRiskScore("talent_profile", talentId);
  const activeBadgeCount = trust.badges.filter(b => b.status === "active" && b.methodEnabled !== false).length;

  // Build suggestions — methods enabled platform-wide that the talent
  // doesn't have yet. Ranked by approximate score lift.
  const SUGGESTION_META: Record<VerificationType, { lift: number; emoji: string; copyKey: string; drawer: DrawerSuggestion }> = {
    instagram_verified: { lift: 12, emoji: "📸", copyKey: "dashboard.adminDrawers.trustSuggestInstagram", drawer: "talent-trust-detail" },
    tulala_verified:    { lift: 12, emoji: "✓",  copyKey: "dashboard.adminDrawers.trustSuggestTulala",    drawer: "talent-trust-detail" },
    agency_confirmed:   { lift: 10, emoji: "✦",  copyKey: "dashboard.adminDrawers.trustSuggestAgency",    drawer: "talent-trust-detail" },
    phone_verified:     { lift: 5,  emoji: "📱", copyKey: "dashboard.adminDrawers.trustSuggestPhone",     drawer: "talent-phone-verify" },
    id_verified:        { lift: 12, emoji: "🪪", copyKey: "dashboard.adminDrawers.trustSuggestId",        drawer: "talent-id-verify" },
    business_verified:  { lift: 10, emoji: "🏢", copyKey: "dashboard.adminDrawers.trustSuggestBusiness",  drawer: "talent-business-verify" },
    domain_verified:    { lift: 8,  emoji: "🌐", copyKey: "dashboard.adminDrawers.trustSuggestDomain",    drawer: "talent-domain-verify" },
    payment_verified:   { lift: 5,  emoji: "💳", copyKey: "dashboard.adminDrawers.trustSuggestPayment",   drawer: "talent-payment-verify" },
  };
  const enabled = listEnabledMethods();
  const hasType = (vt: VerificationType) => trust.badges.some(b => b.type === vt && b.status === "active");
  const suggestions = enabled
    .filter(vt => !hasType(vt))
    .filter(vt => SUGGESTION_META[vt].drawer !== "talent-trust-detail" || vt === "instagram_verified" || vt === "tulala_verified")
    .map(vt => ({ type: vt, ...SUGGESTION_META[vt] }))
    .sort((a, b) => b.lift - a.lift)
    .slice(0, 3);

  return (
    <Section title={t("dashboard.adminDrawers.trustHealthTitle")} framed>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: suggestions.length > 0 ? 14 : 0 }}>
        <RiskScorePill score={score} label={t("dashboard.adminDrawers.trustHealthScoreLabel")} />
        <div style={{ fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">
          {activeBadgeCount === 0
            ? t("dashboard.adminDrawers.trustHealthNoBadges")
            : interpolate(t(activeBadgeCount === 1 ? "dashboard.adminDrawers.trustHealthBadgesOne" : "dashboard.adminDrawers.trustHealthBadgesOther"), { count: activeBadgeCount })}
        </div>
      </div>
      {suggestions.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }} className="text-admin-ink-dim">{t("dashboard.adminDrawers.trustHealthEarnMore")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
            {suggestions.map(s => (
              <button key={s.type} type="button" onClick={() => openDrawer(s.drawer as DrawerSuggestion)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`,
                  background: "#fff", cursor: "pointer",
                  fontFamily: FONTS.body, textAlign: "left",
                }}>
                <span className="text-lg">{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-admin-ink text-admin-12h font-semibold">{t(s.copyKey)}</div>
                  <div style={{ fontSize: 11, marginTop: 1, fontWeight: 600 }} className="text-admin-success-deep">{interpolate(t("dashboard.adminDrawers.trustHealthScoreLift"), { lift: s.lift })}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

// Subset of DrawerId we route to from suggestions — keeps the type
// narrow at the call site without dragging the whole DrawerId union in.

export type DrawerSuggestion =
  | "talent-trust-detail"
  | "talent-phone-verify"
  | "talent-id-verify"
  | "talent-business-verify"
  | "talent-domain-verify"
  | "talent-payment-verify";


export function ExistingRequestRow({
  request, onMarkSent, onCancel,
}: {
  request: VerificationRequest;
  onMarkSent: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const tone = request.status === "needs_more_info" ? "amber" : "amber";
  const headingKey = EXISTING_REQUEST_HEADING_KEYS[request.status];
  const heading = headingKey ? t(headingKey) : request.status;
  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, fontFamily: FONTS.body }} className="bg-admin-amber-soft">
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, marginBottom: 6 }} className="text-admin-amber-deep">
        <span>◌</span>
        {heading}
      </div>
      {request.claimedIdentifier && request.verificationCode && (() => {
        // Split the localized sentence on the {code} token so the code
        // keeps its mono/letter-spaced styling; the surrounding text stays
        // one translatable string with correct per-locale word order.
        const parts = t("dashboard.adminDrawers.existingReqDmLine").split("{code}");
        const before = parts[0];
        const after = parts[1] ?? "";
        const fill = (s: string) => interpolate(s, { handle: "@tulala.digital", identifier: request.claimedIdentifier });
        return (
          <div style={{ fontSize: 11.5, marginBottom: 8, lineHeight: 1.5 }} className="text-admin-ink">
            {fill(before)}
            <strong style={{ fontFamily: FONTS.mono ?? FONTS.body, letterSpacing: 1 }}>{request.verificationCode}</strong>
            {fill(after)}
          </div>
        );
      })()}
      {request.publicMessage && (
        <div style={{ fontSize: 11.5, marginTop: 4, marginBottom: 8, lineHeight: 1.5 }} className="text-admin-ink">
          <strong>{t("dashboard.adminDrawers.existingReqNoteLabel")}</strong> {request.publicMessage}
        </div>
      )}
      <div className="flex gap-1.5">
        {request.status === "pending_user_action" && (
          <button type="button" onClick={onMarkSent} style={{
            padding: "7px 12px", borderRadius: 999, border: "none",
            background: COLORS.fill, color: "#fff",
            fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
          }}>{t("dashboard.adminDrawers.existingReqSentDm")}</button>
        )}
        <button type="button" onClick={onCancel} style={{
          padding: "7px 12px", borderRadius: 999,
          background: "transparent", color: COLORS.inkMuted,
          border: `1px solid ${COLORS.borderSoft}`,
          fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 500, cursor: "pointer",
        }}>{t("dashboard.adminDrawers.existingReqCancel")}</button>
      </div>
    </div>
  );
}


export function InstagramVerificationInstructions({
  existingHandle, onChangeHandle, onSubmit, onCancel,
  evidenceUrl, onChangeEvidenceUrl,
  evidenceNote, onChangeEvidenceNote,
}: {
  existingHandle: string;
  onChangeHandle: (h: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  evidenceUrl: string;
  onChangeEvidenceUrl: (v: string) => void;
  evidenceNote: string;
  onChangeEvidenceNote: (v: string) => void;
}) {
  // Show a placeholder code preview — real code is generated on submit.
  // Q5: stabilize the random preview to one value per mount via useState's
  // lazy initializer (the render-body Math.random() call tripped
  // react-hooks/purity, and re-rolling on every render would flicker).
  const [previewCode] = useState(() => "TUL-" + Math.floor(1000 + Math.random() * 9000));
  const t = useT();
  return (
    <div onClick={onCancel} style={{
      position: "fixed", inset: 0, zIndex: 220,
      background: "rgba(11,11,13,0.42)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONTS.body,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "calc(100% - 48px)", maxWidth: 480,
        background: "#fff", borderRadius: 16, padding: 22,
        boxShadow: "0 24px 80px -20px rgba(11,11,13,0.45)",
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "3px 10px", borderRadius: 999,
          background: "linear-gradient(135deg, #F09433 0%, #E6683C 25%, #DC2743 50%, #CC2366 75%, #BC1888 100%)",
          color: "#fff", fontSize: 10.5, fontWeight: 700,
          marginBottom: 10, letterSpacing: 0.5, textTransform: "uppercase",
        }}>
          <span aria-hidden className="text-admin-11">📸</span> {t("dashboard.adminDrawers.igVerifyBadge")}
        </div>
        <div style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 600, letterSpacing: -0.2, marginBottom: 6 }} className="text-admin-ink">{t("dashboard.adminDrawers.igVerifyTitle")}</div>
        <div style={{ fontSize: 12.5, marginBottom: 16, lineHeight: 1.5 }} className="text-admin-ink-muted">
          {interpolate(t("dashboard.adminDrawers.igVerifyIntro"), { handle: "@tulala.digital" })}
        </div>

        {/* Step 1: handle */}
        <div className="mb-3.5">
          <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6, display: "block" }} className="text-admin-ink-muted">
            {t("dashboard.adminDrawers.igVerifyStep1Label")}
          </label>
          <input
            type="text"
            value={existingHandle}
            onChange={(e) => onChangeHandle(e.target.value)}
            placeholder={t("dashboard.adminDrawers.igVerifyHandlePlaceholder")}
            autoFocus
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "10px 12px", borderRadius: 10,
              border: `1px solid ${COLORS.border}`,
              fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
            }}
          />
        </div>

        {/* Step 2: send DM */}
        <div className="mb-3.5">
          <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6, display: "block" }} className="text-admin-ink-muted">
            {t("dashboard.adminDrawers.igVerifyStep2Label")}
          </label>
          <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.55 }} className="bg-admin-surface text-admin-ink">
            <div className="mb-1.5">
              {interpolate(t("dashboard.adminDrawers.igVerifyDmTo"), { handle: "@tulala.digital" })}
            </div>
            <div style={{ fontFamily: FONTS.mono ?? FONTS.body, fontSize: 12 }} className="text-admin-ink-muted">
              {t("dashboard.adminDrawers.igVerifyDmBody")}<br />
              https://atelier-roma.tulala.app/{(existingHandle || "marta").replace("@", "")}<br />
              <br />
              {t("dashboard.adminDrawers.igVerifyDmCodeLine")} <strong className="text-admin-ink">{previewCode}</strong>
            </div>
          </div>
          <div style={{ fontSize: 10.5, marginTop: 6 }} className="text-admin-ink-dim">
            {t("dashboard.adminDrawers.igVerifyCodeLocked")}
          </div>
        </div>

        {/* Step 3: optional evidence */}
        <div className="mb-3.5">
          <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6, display: "block" }} className="text-admin-ink-muted">
            {t("dashboard.adminDrawers.igVerifyStep3Label")}
          </label>
          <input
            type="url"
            value={evidenceUrl}
            onChange={(e) => onChangeEvidenceUrl(e.target.value)}
            placeholder={t("dashboard.adminDrawers.igVerifyEvidenceUrlPlaceholder")}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "9px 12px", borderRadius: 10,
              border: `1px solid ${COLORS.border}`,
              fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, outline: "none",
              marginBottom: 6,
            }}
          />
          <textarea
            value={evidenceNote}
            onChange={(e) => onChangeEvidenceNote(e.target.value)}
            placeholder={t("dashboard.adminDrawers.igVerifyEvidenceNotePlaceholder")}
            rows={2}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "9px 12px", borderRadius: 10,
              border: `1px solid ${COLORS.border}`,
              fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, outline: "none",
              resize: "vertical",
            }}
          />
        </div>

        {/* Step 4: confirm */}
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(91,107,160,0.08)", fontFamily: FONTS.body, fontSize: 11, lineHeight: 1.5, marginBottom: 14 }} className="text-admin-indigo-deep">
          <strong>{t("dashboard.adminDrawers.igVerifyStep4Lead")}</strong> {t("dashboard.adminDrawers.igVerifyStep4Body")}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{
            padding: "9px 16px", borderRadius: 999, border: `1px solid ${COLORS.border}`,
            background: "transparent", color: COLORS.ink,
            fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          }}>{t("dashboard.adminDrawers.igVerifyCancel")}</button>
          <button type="button" onClick={onSubmit} disabled={!existingHandle.trim().startsWith("@")} style={{
            padding: "9px 16px", borderRadius: 999, border: "none",
            background: existingHandle.trim().startsWith("@") ? COLORS.fill : "rgba(11,11,13,0.10)",
            color: existingHandle.trim().startsWith("@") ? "#fff" : COLORS.inkDim,
            fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600,
            cursor: existingHandle.trim().startsWith("@") ? "pointer" : "default",
          }}>{t("dashboard.adminDrawers.igVerifyGenerate")}</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Talent Claim Invite — talent-side acceptance flow when agency creates
// a profile and emails the talent. Three actions: Accept · Not me · Report.
// ════════════════════════════════════════════════════════════════════


export const REVIEW_MODE_LABEL: Record<"automated" | "manual" | "hybrid", string> = {
  automated: "Automated",
  manual:    "Manual review",
  hybrid:    "Hybrid",
};

// Localized-label sibling maps (enum → catalog key). English maps above
// stay for non-localized consumers; localized render sites use t(...KEYS[v]).
export const REVIEW_MODE_LABEL_KEYS: Record<"automated" | "manual" | "hybrid", string> = {
  automated: "dashboard.adminDrawers.reviewModeAutomated",
  manual:    "dashboard.adminDrawers.reviewModeManual",
  hybrid:    "dashboard.adminDrawers.reviewModeHybrid",
};

export const VISIBILITY_LABEL: Record<"public_profile" | "admin_only" | "internal", string> = {
  public_profile: "Public profile",
  admin_only:     "Admin only",
  internal:       "Internal",
};

export const VISIBILITY_LABEL_KEYS: Record<"public_profile" | "admin_only" | "internal", string> = {
  public_profile: "dashboard.adminDrawers.visibilityPublicProfile",
  admin_only:     "dashboard.adminDrawers.visibilityAdminOnly",
  internal:       "dashboard.adminDrawers.visibilityInternal",
};

export const TIER_LABEL: Record<"basic" | "pro" | "portfolio" | "all", string> = {
  basic:     "Basic",
  pro:       "Pro",
  portfolio: "Portfolio",
  all:       "All tiers",
};

export const TIER_LABEL_KEYS: Record<"basic" | "pro" | "portfolio" | "all", string> = {
  basic:     "dashboard.adminDrawers.methodTierBasic",
  pro:       "dashboard.adminDrawers.methodTierPro",
  portfolio: "dashboard.adminDrawers.methodTierPortfolio",
  all:       "dashboard.adminDrawers.methodTierAll",
};


export function ConfigRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "10px 0", borderBottom: `1px solid ${COLORS.borderSoft}`,
    }}>
      <div className="flex-1 min-w-0">
        <div className="text-admin-ink text-admin-12h font-semibold">{label}</div>
        {hint && <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function vmSelectStyle(): React.CSSProperties {
  return {
    padding: "7px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`,
    fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
    background: "#fff", cursor: "pointer",
  };
}

export function vmChipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "5px 11px", borderRadius: 999,
    border: `1px solid ${active ? COLORS.successDeep : COLORS.border}`,
    background: active ? "rgba(15,79,62,0.10)" : "#fff",
    color: active ? COLORS.successDeep : COLORS.inkMuted,
    fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600,
    cursor: "pointer",
  };
}

// ════════════════════════════════════════════════════════════════════
// Phone OTP, ID, Business, Domain, Payment verification drawers.
// ════════════════════════════════════════════════════════════════════


export function MethodDisabledNotice() {
  const t = useT();
  return (
    <div style={{ padding: "20px 18px", borderRadius: 12, border: `1px solid ${COLORS.borderSoft}`, textAlign: "center", fontSize: 13, lineHeight: 1.55 }} className="bg-admin-surface text-admin-ink-muted">
      {t("dashboard.adminDrawers.methodDisabledLine1")}<br />{t("dashboard.adminDrawers.methodDisabledLine2")}
    </div>
  );
}

export function VmFieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6, marginTop: 12, display: "block" }} className="text-admin-ink-muted">{children}</label>
  );
}

export function vmTextInputStyle(): React.CSSProperties {
  return {
    width: "100%", boxSizing: "border-box",
    padding: "10px 12px", borderRadius: 10,
    border: `1px solid ${COLORS.border}`,
    fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
    marginBottom: 4,
  };
}

export function vmSmallHelpStyle(): React.CSSProperties {
  return { fontSize: 11, color: COLORS.inkMuted, marginBottom: 14, marginTop: 4 };
}


export function ConfirmTypedAction({
  actionLabel,
  confirmPhrase,
  tone,
  onConfirm,
}: {
  actionLabel: string;
  confirmPhrase: string;
  tone: "amber" | "red";
  onConfirm: () => void;
}) {
  const t = useT();
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === confirmPhrase.toLowerCase();
  const palette =
    tone === "red"
      ? { fg: COLORS.red, bg: "rgba(176,48,58,0.06)", border: "rgba(176,48,58,0.30)", solid: COLORS.red }
      : { fg: COLORS.amberDeep, bg: "rgba(82,96,109,0.08)", border: "rgba(82,96,109,0.30)", solid: COLORS.amber };

  if (!armed) {
    return (
      <button
        onClick={() => setArmed(true)}
        style={{
          padding: "9px 16px",
          background: "transparent",
          color: palette.fg,
          border: `1px solid ${palette.fg}`,
          borderRadius: 8,
          fontFamily: FONTS.body,
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        {actionLabel}
      </button>
    );
  }

  return (
    <div
      style={{
        padding: "12px 14px",
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 10,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink">
        {t("dashboard.adminDrawers.confirmTypePrefix")}{" "}
        <code
          style={{
            background: "#fff",
            border: `1px solid ${palette.border}`,
            padding: "1px 6px",
            borderRadius: 4,
            fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
            fontSize: 12,
            color: palette.fg,
          }}
        >
          {confirmPhrase}
        </code>{" "}
        {t("dashboard.adminDrawers.confirmTypeSuffix")}
      </div>
      <TextInput
        autoFocus
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={confirmPhrase}
      />
      <div className="flex gap-2">
        <SecondaryButton onClick={() => { setArmed(false); setTyped(""); }}>{t("dashboard.adminDrawers.cancel")}</SecondaryButton>
        <button
          disabled={!matches}
          onClick={() => { onConfirm(); setArmed(false); setTyped(""); }}
          style={{
            padding: "9px 16px",
            background: matches ? palette.solid : "transparent",
            color: matches ? "#fff" : palette.fg,
            border: `1px solid ${matches ? palette.solid : palette.border}`,
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 500,
            cursor: matches ? "pointer" : "not-allowed",
            opacity: matches ? 1 : 0.7,
          }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}


export function defaultUnlocks(plan: Plan): string[] {
  switch (plan) {
    case "studio":
      return [
        "Custom domain",
        "Private inquiries",
        "Owned client list",
        "Verified email-from",
        "Logo watermark on photos",
      ];
    case "agency":
      return [
        "Branded site design",
        "Custom fields",
        "Team & roles (up to 25)",
        "Translations",
        "Reports",
        "Branded media gallery",
        "Photo usage tracking",
        "Bulk watermark apply",
      ];
    case "network":
      return ["Multi-brand workspaces", "Cross-roster pool", "Hub-level analytics", "Dedicated success"];
    default:
      return [];
  }
}

// ════════════════════════════════════════════════════════════════════
// Plan compare drawer
// ────────────────────────────────────────────────────────────────────
// A wide drawer that frames the plan ladder as **operational dimensions**
// (throughput, control, scale, branding, distribution, multi-entity)
// rather than a feature checkbox grid. The buyer is making a scaling
// decision, not buying features — this layout reflects that.
// ════════════════════════════════════════════════════════════════════

// ─── Plan tier visual config ─────────────────────────────────────────

export const PLAN_TIER_STYLE: Record<Plan, {
  accent: string;
  accentSoft: string;
  accentText: string;
  popular?: boolean;
}> = {
  free:    { accent: "#94a3b8",  accentSoft: "rgba(148,163,184,0.12)", accentText: "#475569" },
  studio:  { accent: "#3b82f6",  accentSoft: "rgba(59,130,246,0.08)",  accentText: "#1d4ed8" },
  agency:  { accent: "#0f4f3e",  accentSoft: "rgba(15,79,62,0.08)",    accentText: COLORS.accentDeep, popular: true },
  network: { accent: "#7c3aed",  accentSoft: "rgba(124,58,237,0.08)", accentText: "#5b21b6" },
};


export function PaymentsSetupDrawer() {
  const t = useT();
  const { state, closeDrawer, openUpgrade, toast } = useAdminShell();
  const payout = getWorkspacePayout(state.plan);
  const fee = PLAN_FEE_META[state.plan];
  const isFree = state.plan === "free";
  const receiver = payout.defaultReceiver;
  const receiverMeta = PAYOUT_STATUS_META[receiver.status];
  const requestPaymentsHelp = () => {
    openSupportEmail(
      t("dashboard.adminDrawers.payoutSetupEmailSubject"),
      interpolate(t("dashboard.adminDrawers.payoutSetupEmailBody"), { receiver: receiver.displayName, plan: state.plan }),
    );
    toast(t("dashboard.adminDrawers.payoutSetupEmailToast"));
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={t("dashboard.adminDrawers.payoutSetupTitle")}
      description={t("dashboard.adminDrawers.payoutSetupDescription")}
      width={580}
      footer={
        isFree ? (
          <>
            <SecondaryButton onClick={closeDrawer}>{t("dashboard.adminDrawers.close")}</SecondaryButton>
            <PrimaryButton
              onClick={() =>
                openUpgrade({
                  feature: t("dashboard.adminDrawers.payoutUpgradeFeature"),
                  why: t("dashboard.adminDrawers.payoutUpgradeWhy"),
                  requiredPlan: "studio",
                })
              }
            >
              {t("dashboard.adminDrawers.payoutUpgradeCta")}
            </PrimaryButton>
          </>
        ) : (
          <>
            <SecondaryButton onClick={closeDrawer}>{t("dashboard.adminDrawers.close")}</SecondaryButton>
            <PrimaryButton onClick={requestPaymentsHelp}>{t("dashboard.adminDrawers.payoutContactSupport")}</PrimaryButton>
          </>
        )
      }
    >
      <Section
        title={t("dashboard.adminDrawers.payoutFeeSectionTitle")}
        description={t("dashboard.adminDrawers.payoutFeeSectionDesc")}
      >
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 500 }} className="text-admin-ink">
              {fee.label}
            </span>
            <PlanChip plan={state.plan} variant="solid" />
          </div>
          <p style={{ fontFamily: FONTS.body, fontSize: 12.5, margin: "8px 0 0", lineHeight: 1.55 }} className="text-admin-ink-muted">
            {fee.controlsHint}
          </p>
        </div>
      </Section>

      <Section
        title={t("dashboard.adminDrawers.payoutReceiverSectionTitle")}
        description={t("dashboard.adminDrawers.payoutReceiverSectionDesc")}
      >
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Avatar initials={receiver.initials} size={40} />
          <div className="flex-1 min-w-0">
            <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 600 }} className="text-admin-ink">
              {receiver.displayName}
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
              {PAYOUT_RECEIVER_KIND_LABEL[receiver.kind]}
              {receiver.legalName ? ` · ${receiver.legalName}` : ""}
            </div>
          </div>
          <PayoutStatusChip status={receiver.status} />
        </div>
        <p style={{ fontFamily: FONTS.body, fontSize: 12, margin: 0, lineHeight: 1.5 }} className="text-admin-ink-muted">
          {receiverMeta.hint}
        </p>
      </Section>

      {!isFree && (
        <Section title={t("dashboard.adminDrawers.payoutAcceptanceTitle")} description={t("dashboard.adminDrawers.payoutAcceptanceDesc")}>
          <FieldRow label={t("dashboard.adminDrawers.payoutAcceptCards")}>
            <StubToggle defaultOn={payout.acceptCards} />
          </FieldRow>
          <FieldRow label={t("dashboard.adminDrawers.payoutSendReceipts")}>
            <StubToggle defaultOn={true} />
          </FieldRow>
          <FieldRow label={t("dashboard.adminDrawers.payoutEmailConfirmations")}>
            <StubToggle defaultOn={true} />
          </FieldRow>
        </Section>
      )}

      <Section title={t("dashboard.adminDrawers.payoutActivityTitle")}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <MiniMetric label={t("dashboard.adminDrawers.payoutVolume")} value={payout.recentVolume30d} />
          <MiniMetric label={t("dashboard.adminDrawers.payoutPending")} value={payout.pendingPayouts} />
        </div>
      </Section>
    </DrawerShell>
  );
}


export function StubToggle({ defaultOn }: { defaultOn?: boolean }) {
  const t = useT();
  const on = !!defaultOn;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={t("dashboard.adminDrawers.payoutStubToggleLabel")}
      disabled
      title={t("dashboard.adminDrawers.payoutStubToggleLabel")}
      style={{
        position: "relative",
        width: 36,
        height: 20,
        borderRadius: 999,
        background: on ? COLORS.fill : "rgba(11,11,13,0.16)",
        border: "none",
        cursor: "not-allowed",
        padding: 0,
        flexShrink: 0,
        opacity: 0.5,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}


export function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink-muted">
        {label}
      </div>
      <div style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, marginTop: 4 }} className="text-admin-ink">
        {value}
      </div>
    </div>
  );
}

/**
 * PayoutReceiverPickerDrawer
 *
 * Per-booking receiver selector — pick which connected entity legally
 * receives the net payout. Eligibility = `meta.canReceive`. Non-
 * eligible candidates are shown but disabled with their hint visible.
 *
 * Payload: `{ inquiryId: string }` so the picker can show the booking
 * and write the selected receiver back. (Picker is read-only mock —
 * the real write lands when payments are wired into state mutations.)
 */

export function PayoutReceiverPickerDrawer() {
  const t = useT();
  const { state, closeDrawer, toast } = useAdminShell();
  const payload = state.drawer.payload ?? {};
  const inquiryId = (payload as { inquiryId?: string }).inquiryId;
  const summary = inquiryId ? getPaymentSummary(inquiryId) : undefined;
  const [selectedKind, setSelectedKind] = useState<string | null>(
    summary?.receiver ? `${summary.receiver.kind}:${summary.receiver.displayName}` : null,
  );
  const unknownLabel = t("dashboard.adminDrawers.payoutPickUnknown");
  const bookingLabel = summary
    ? (summary.bookingId !== "—" ? summary.bookingId : inquiryId ?? unknownLabel)
    : inquiryId ?? unknownLabel;
  const requestReceiverChange = () => {
    openSupportEmail(
      t("dashboard.adminDrawers.payoutPickEmailSubject"),
      interpolate(t("dashboard.adminDrawers.payoutPickEmailBody"), {
        booking: bookingLabel,
        current: summary?.receiver?.displayName ?? unknownLabel,
        requested: selectedKind ?? t("dashboard.adminDrawers.payoutPickNoChange"),
        net: summary?.netPayout ?? unknownLabel,
      }),
    );
    toast(t("dashboard.adminDrawers.payoutPickEmailToast"));
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={t("dashboard.adminDrawers.payoutPickTitle")}
      description={
        summary
          ? interpolate(t("dashboard.adminDrawers.payoutPickDescNet"), { booking: summary.bookingId !== "—" ? summary.bookingId : inquiryId, net: summary.netPayout })
          : t("dashboard.adminDrawers.payoutPickDescFallback")
      }
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>{t("dashboard.adminDrawers.cancel")}</SecondaryButton>
          <PrimaryButton
            onClick={requestReceiverChange}
          >
            {t("dashboard.adminDrawers.payoutPickEmailRequest")}
          </PrimaryButton>
        </>
      }
    >
      <Section
        title={t("dashboard.adminDrawers.payoutPickEligibleTitle")}
        description={t("dashboard.adminDrawers.payoutPickEligibleDesc")}
      >
        <div className="flex flex-col gap-2">
          {PAYOUT_RECEIVER_CANDIDATES.map((rec) => {
            const meta = PAYOUT_STATUS_META[rec.status];
            const key = `${rec.kind}:${rec.displayName}`;
            const isSelected = selectedKind === key;
            const eligible = meta.canReceive;
            return (
              <button
                key={key}
                onClick={() => eligible && setSelectedKind(key)}
                disabled={!eligible}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  background: isSelected ? "rgba(11,11,13,0.04)" : "#fff",
                  border: `1px solid ${isSelected ? COLORS.accent : COLORS.borderSoft}`,
                  borderRadius: 10,
                  cursor: eligible ? "pointer" : "not-allowed",
                  opacity: eligible ? 1 : 0.6,
                  textAlign: "left",
                  fontFamily: FONTS.body,
                  transition: `border-color ${TRANSITION.micro}`,
                }}
              >
                <Avatar initials={rec.initials} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-admin-ink text-admin-13h font-semibold">
                    {rec.displayName}
                  </div>
                  <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
                    {PAYOUT_RECEIVER_KIND_LABEL[rec.kind]}
                    {rec.legalName && rec.legalName !== "—" ? ` · ${rec.legalName}` : ""}
                  </div>
                </div>
                <PayoutStatusChip status={rec.status} />
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={t("dashboard.adminDrawers.payoutPickDistributionTitle")}>
        <p style={{ fontFamily: FONTS.body, fontSize: 12.5, margin: 0, lineHeight: 1.55 }} className="text-admin-ink-muted">
          {t("dashboard.adminDrawers.payoutPickDistributionBody")}
        </p>
        {summary?.distributionNote && (
          <div style={{ padding: "10px 12px", background: "rgba(11,11,13,0.03)", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.55 }} className="text-admin-ink">
            <CapsLabel>{t("dashboard.adminDrawers.payoutPickCoordinatorNote")}</CapsLabel>
            <div className="mt-1">{summary.distributionNote}</div>
          </div>
        )}
      </Section>
    </DrawerShell>
  );
}

/**
 * PaymentDetailDrawer
 *
 * Per-row drilldown from the workspace billing/payments table. Shows
 * money breakdown, receiver, status, paid-via card if charged, and
 * the audit history. Read-only — actions like refund / re-send live in
 * the full payment console (not part of this prototype).
 *
 * Payload: `{ id: string }` where `id` is a `WorkspacePaymentRow.id`.
 */

export function PaymentDetailDrawer() {
  const t = useT();
  const { state, closeDrawer } = useAdminShell();
  const payload = state.drawer.payload ?? {};
  const rowId = (payload as { id?: string }).id;
  const row = WORKSPACE_PAYMENTS.find((r) => r.id === rowId) ?? WORKSPACE_PAYMENTS[0];

  // Try to find a matching rich summary by booking ref, falling back to
  // a synthesized one constructed from the row.
  const summary =
    Object.values(PAYMENT_SUMMARIES).find((s) => s.bookingId === row.ref) ?? null;
  const statusMeta = PAYMENT_STATUS_META[row.status];

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={row.ref}
      description={`${row.client} · ${row.brief}`}
      width={580}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>{t("dashboard.adminDrawers.close")}</SecondaryButton>
        </>
      }
    >
      <Section title={t("dashboard.adminDrawers.paymentDetailStatus")}>
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div className="flex items-center gap-2.5">
            <PaymentStatusChip status={row.status} />
            <span style={{ fontFamily: FONTS.body, fontSize: 12 }} className="text-admin-ink-muted">
              {row.date}
            </span>
          </div>
          <p style={{ fontFamily: FONTS.body, fontSize: 12.5, margin: 0, lineHeight: 1.55 }} className="text-admin-ink-muted">
            {statusMeta.description}
          </p>
        </div>
      </Section>

      <Section title={t("dashboard.adminDrawers.paymentDetailBreakdown")}>
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <BreakdownRow label={t("dashboard.adminDrawers.paymentDetailClientTotal")} value={row.total} first />
          <BreakdownRow label={t("dashboard.adminDrawers.paymentDetailPlatformFee")} value={row.fee} muted />
          <BreakdownRow label={t("dashboard.adminDrawers.paymentDetailNetPayout")} value={row.netPayout} emphasis />
        </div>
        {summary?.paidVia && (
          <div style={{ fontFamily: FONTS.body, fontSize: 12, padding: "0 2px" }} className="text-admin-ink-muted">
            {interpolate(t("dashboard.adminDrawers.paymentDetailPaidVia"), { brand: summary.paidVia.brand, last4: summary.paidVia.last4 })}
          </div>
        )}
      </Section>

      <Section title={t("dashboard.adminDrawers.paymentDetailReceiver")}>
        {summary?.receiver ? (
          <div
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 12,
              padding: 12,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Avatar initials={summary.receiver.initials} size={36} />
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 600 }} className="text-admin-ink">
                {summary.receiver.displayName}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
                {PAYOUT_RECEIVER_KIND_LABEL[summary.receiver.kind]}
                {summary.receiver.legalName ? ` · ${summary.receiver.legalName}` : ""}
              </div>
            </div>
            <PayoutStatusChip status={summary.receiver.status} />
          </div>
        ) : (
          <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12, padding: 12, fontFamily: FONTS.body, fontSize: 12.5 }} className="text-admin-ink">
            {row.receiverName}
          </div>
        )}
        {summary?.downstreamNote && (
          <p style={{ fontFamily: FONTS.body, fontSize: 12, margin: 0, lineHeight: 1.5 }} className="text-admin-ink-muted">
            {summary.downstreamNote}
          </p>
        )}
      </Section>

      {summary?.history && summary.history.length > 0 && (
        <Section title={t("dashboard.adminDrawers.paymentDetailHistory")}>
          <div
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {summary.history.map((entry, idx) => (
              <div
                key={`${entry.ts}-${idx}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 1fr",
                  gap: 12,
                  padding: "10px 14px",
                  borderTop: idx > 0 ? `1px solid ${COLORS.borderSoft}` : "none",
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                }}
              >
                <span className="text-admin-ink-muted">{entry.ts}</span>
                <span className="text-admin-ink">{entry.label}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </DrawerShell>
  );
}


export function BreakdownRow({
  label,
  value,
  muted,
  emphasis,
  first,
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasis?: boolean;
  first?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "11px 14px",
        borderTop: first ? "none" : `1px solid ${COLORS.borderSoft}`,
        fontFamily: FONTS.body,
      }}
    >
      <span style={{ fontSize: 12.5, color: muted ? COLORS.inkMuted : COLORS.ink }}>{label}</span>
      <span
        style={{
          fontSize: emphasis ? 14 : 13,
          fontWeight: emphasis ? 600 : 500,
          color: muted ? COLORS.inkMuted : COLORS.ink,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-5.9 — Client Trust Detail Drawer
// ════════════════════════════════════════════════════════════════════


export type FeatureToggle = {
  key: string;
  label: string;
  desc: string;
  defaultOn: boolean;
  badge?: string;
};


export type FeatureGroup = {
  id: string;
  label: string;
  audience: "agency" | "coordinator" | "talent" | "client";
  features: FeatureToggle[];
};


export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: "agency-ops",
    label: "Agency operations",
    audience: "agency",
    features: [
      { key: "analytics-dashboard", label: "Analytics dashboard", desc: "Revenue, conversion funnel, top performers, and workload charts.", defaultOn: true },
      { key: "sla-timers", label: "SLA timers", desc: "Countdown timers on inquiries; escalate when SLA is breached.", defaultOn: true },
      { key: "automation-rules", label: "Automation rules", desc: "Trigger actions on status changes, deadlines, or field conditions.", defaultOn: true },
      { key: "coordinator-queue", label: "My queue", desc: "Per-coordinator task queue with priority sorting.", defaultOn: true },
      { key: "on-call-rotation", label: "On-call rotation", desc: "Weekly schedule for who covers which hours.", defaultOn: false, badge: "Studio+" },
      { key: "vacation-handover", label: "Vacation handover", desc: "Temporary task delegation to another coordinator.", defaultOn: true },
      { key: "bulk-ops", label: "Bulk operations", desc: "Mass-select and update status, tags, or assignee across rows.", defaultOn: true },
      { key: "csv-import", label: "CSV import", desc: "Import talent, clients, or bookings from a spreadsheet.", defaultOn: true },
      { key: "audit-log", label: "Audit log", desc: "Full event trail — logins, edits, permission changes.", defaultOn: true, badge: "Agency+" },
      { key: "ai-workspace", label: "AI workspace", desc: "Provider registry, usage controls, and prompt console.", defaultOn: false, badge: "Studio+" },
      // ── Coordinator authority model — see CHARTER comment block ──
      { key: "auto-assign-owner-coordinator", label: "Owner is primary coordinator", desc: "Auto-assign the agency owner as the primary coordinator on every new inquiry. Off → coordinator role auto-falls to the lead talent.", defaultOn: true },
      { key: "allow-talent-direct-chat", label: "Talent-coordinator can chat with client", desc: "When a talent is the coordinator, allow them to message the client directly. Off restricts them to read-only on the client thread. Default ON for hubs, OFF for agencies.", defaultOn: false },
      { key: "talent-can-add-crew", label: "Talent-coordinator can add crew", desc: "When a talent is the coordinator, allow them to add talent or crew (e.g., from their Circle) to the booking without admin approval.", defaultOn: false },
    ],
  },
  {
    id: "booking-pipeline",
    label: "Booking pipeline",
    audience: "coordinator",
    features: [
      { key: "inquiry-inbox", label: "Unified inbox", desc: "All inquiries, replies, and status changes in one view.", defaultOn: true },
      { key: "offer-flow", label: "Offer flow", desc: "Send, revise, and accept structured offers.", defaultOn: true },
      { key: "contract-templates", label: "Contract templates", desc: "Reusable templates with merge fields for bookings.", defaultOn: true },
      { key: "approval-queue", label: "Approval queue", desc: "Coordinator-submitted items waiting for admin sign-off.", defaultOn: true },
      { key: "saved-replies", label: "Saved replies", desc: "Canned response library for inbox threads.", defaultOn: true },
      { key: "email-sequences", label: "Email sequences", desc: "Automated follow-up chains after key booking events.", defaultOn: false, badge: "Studio+" },
      { key: "casting-flow", label: "Casting flow", desc: "Open/closed casting with configurable rounds.", defaultOn: true },
      { key: "callback-tracker", label: "Callback tracker", desc: "Per-round talent status with feedback dimensions.", defaultOn: true },
      { key: "crew-booking", label: "Crew booking", desc: "Book talent, photographer, HMU, and studio in one form.", defaultOn: false, badge: "Studio+" },
      { key: "production-timeline", label: "Production timeline", desc: "Call-sheet order of events exported as a document.", defaultOn: false, badge: "Studio+" },
      { key: "dispute-resolution", label: "Dispute resolution", desc: "Track disputes through Filed → Mediation → Decision stages.", defaultOn: true },
    ],
  },
  {
    id: "talent-features",
    label: "Talent tools",
    audience: "talent",
    features: [
      { key: "talent-profile", label: "Public profile page", desc: "Canonical talent page at tulala.digital/t/<slug>.", defaultOn: true },
      { key: "talent-availability", label: "Availability calendar", desc: "Talent can mark available/blocked dates for discovery.", defaultOn: true },
      { key: "talent-inbox", label: "Talent inbox", desc: "Talent sees and responds to inquiry messages.", defaultOn: true },
      { key: "talent-bookings", label: "Booking history", desc: "Talent can view confirmed bookings and export invoices.", defaultOn: true },
      { key: "talent-documents", label: "Document vault", desc: "Talent can upload and download their own contracts/IDs.", defaultOn: true },
      { key: "talent-analytics", label: "Talent analytics", desc: "Personal stats: views, inquiries, bookings, earnings.", defaultOn: false, badge: "Pro tier" },
      { key: "talent-portfolio", label: "Portfolio builder", desc: "Extended media grid, case studies, testimonials.", defaultOn: false, badge: "Portfolio tier" },
      { key: "talent-contact-policy", label: "Contact policy", desc: "Talent sets per-tier who can initiate contact.", defaultOn: true },
      { key: "minor-guardian", label: "Guardian co-pilot", desc: "Under-18 accounts require attached guardian approval.", defaultOn: true },
      { key: "talent-agencies", label: "Agency connections", desc: "Talent sees and manages their agency relationships.", defaultOn: true },
      // ── Circle ──
      { key: "talent-circle", label: "My Circle", desc: "Personal address book of trusted collaborators. One-tap recommend into bookings instead of searching the whole roster.", defaultOn: true },
      { key: "talent-circle-recommend", label: "Recommend from Circle", desc: "When talent is on a booking, surface their Circle as the first crew-suggestion source ahead of the global roster.", defaultOn: true },
    ],
  },
  {
    id: "client-features",
    label: "Client experience",
    audience: "client",
    features: [
      { key: "client-discovery", label: "Roster discovery", desc: "Clients can browse and filter the public talent roster.", defaultOn: true },
      { key: "client-shortlist", label: "Shortlists", desc: "Clients can save and share talent shortlists.", defaultOn: true },
      { key: "client-inquiries", label: "Submit inquiries", desc: "Clients can submit booking requests via the portal.", defaultOn: true },
      { key: "client-portal", label: "Client portal", desc: "Dedicated portal with dashboard, pipeline, and documents.", defaultOn: true },
      { key: "client-trust-badges", label: "Trust badges", desc: "Display verification tier (Basic / Verified / Silver / Gold).", defaultOn: true },
      { key: "client-avail-search", label: "Availability search", desc: "Clients can search talent by date range and location.", defaultOn: true },
      { key: "client-payments", label: "Online payments", desc: "Clients can pay deposits and fees via the portal.", defaultOn: false, badge: "Studio+" },
      { key: "client-documents", label: "Document access", desc: "Clients receive signed contracts and receipts.", defaultOn: true },
      { key: "client-referrals", label: "Referral programme", desc: "Clients earn credits for referring new business.", defaultOn: false, badge: "Studio+" },
    ],
  },
  {
    id: "site-comms",
    label: "Site & comms",
    audience: "agency",
    features: [
      { key: "site-context-switcher", label: "Multi-site management", desc: "Manage agency, talent hub, and client portal as separate sites.", defaultOn: true },
      { key: "page-scheduler", label: "Page scheduler", desc: "Queue publish/unpublish events for any page.", defaultOn: true },
      { key: "email-branding", label: "Email branding", desc: "Custom from-address, logo, and color in outbound emails.", defaultOn: false, badge: "Studio+" },
      { key: "notification-prefs", label: "Notification controls", desc: "Per-event email, in-app, and push notification rules.", defaultOn: true },
      { key: "invite-flow", label: "Talent invite flow", desc: "Send invite links to talent with pre-filled profile data.", defaultOn: true },
      { key: "referral-dashboard", label: "Referral dashboard", desc: "Track referral links, conversions, and credit balances.", defaultOn: false, badge: "Studio+" },
      { key: "calendar-sync", label: "Calendar sync", desc: "Two-way sync with Google Calendar and Outlook.", defaultOn: false, badge: "Studio+" },
      { key: "system-status", label: "System status", desc: "Live uptime, incident feed, and maintenance notices.", defaultOn: true },
    ],
  },
  {
    id: "rights-safety",
    label: "Rights & safety",
    audience: "agency",
    features: [
      { key: "usage-tracker", label: "Usage tracker", desc: "Monitor image rights and licence expiry per booking.", defaultOn: true },
      { key: "relicense-flow", label: "Relicence flow", desc: "Extend or expand usage rights with a structured offer.", defaultOn: true },
      { key: "incident-report", label: "Incident reports", desc: "On-set safety and conduct reports with anonymous channel.", defaultOn: true },
      { key: "gdpr-export", label: "GDPR data export", desc: "Download a full data package for a subject on request.", defaultOn: true },
      { key: "consent-log", label: "Consent log", desc: "Timestamped record of every consent action per user.", defaultOn: true },
      { key: "call-sheet", label: "Live call sheet", desc: "Real-time production roster with check-in status.", defaultOn: true },
      { key: "onset-checkin", label: "On-set check-in", desc: "Tap-to-confirm arrival for talent and crew.", defaultOn: true },
      { key: "locations-db", label: "Locations database", desc: "Studios, venues, and outdoor locations as first-class entities.", defaultOn: true },
    ],
  },
];


export const audienceColor = (a: string) =>
  a === "agency" ? COLORS.accent
  : a === "coordinator" ? COLORS.indigo
  : a === "talent" ? COLORS.royal
  : COLORS.amber;


export const audienceLabel = (a: string) =>
  a === "agency" ? "Agency admin"
  : a === "coordinator" ? "Coordinators"
  : a === "talent" ? "Talent"
  : "Clients";


export const MOCK_CIRCLE: Array<{ id: string; name: string; role: string; tags: string[]; lastCollab: string; note?: string }> = [
  { id: "c-1", name: "Lucas Ferreira",  role: "Photographer",   tags: ["fashion","editorial"],  lastCollab: "Mar 2026 · Vogue Italia spread",       note: "Knows my best angles." },
  { id: "c-2", name: "Nia Clarkson",    role: "HMU artist",     tags: ["beauty","clean glam"],  lastCollab: "Feb 2026 · Mango lookbook",            note: "Fast, calm, great with skin." },
  { id: "c-3", name: "Ana Reyes",       role: "Stylist",        tags: ["editorial","luxury"],   lastCollab: "Feb 2026 · Bvlgari campaign",          note: "Eye for jewelry styling." },
  { id: "c-4", name: "Tomás Navarro",   role: "Talent",         tags: ["commercial","fitness"], lastCollab: "Jan 2026 · Nike commercial",           note: "Reliable, on-time, books well." },
  { id: "c-5", name: "Studio One",      role: "Studio (venue)", tags: ["shoreditch","loft"],    lastCollab: "Dec 2025 · 3-day campaign",            note: "Daylight from 9-3pm." },
  { id: "c-6", name: "Chiara Bianchi",  role: "Talent",         tags: ["lifestyle","commercial"], lastCollab: "Dec 2025 · Stella McCartney",        note: "Pairs well on couple shoots." },
];

// ── Circle management drawer ──
// Talent's view of their own circle: search, add, remove, note. Used
// from talent settings + (in future) auto-opens in the inquiry workspace
// when a hub-freelancer-coordinator clicks "Add crew".
