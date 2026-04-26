"use client";

import { useState, type ReactNode } from "react";
import {
  CLIENT_TRUST_META,
  COLORS,
  FONTS,
  PLANS,
  PLAN_LADDER,
  PLAN_LADDER_HEADER,
  PLAN_META,
  PLAN_FEE_META,
  planPrice,
  PAYOUT_STATUS_META,
  PAYOUT_RECEIVER_KIND_LABEL,
  PAYOUT_RECEIVER_CANDIDATES,
  PAYMENT_STATUS_META,
  PAYMENT_SUMMARIES,
  WORKSPACE_PAYMENTS,
  ROLE_META,
  TALENT_STATE_LABEL,
  TALENT_STATE_TONE,
  TENANT,
  getClients,
  getInquiries,
  getRoster,
  getTeam,
  getWorkspacePayout,
  getPaymentSummary,
  meetsPlan,
  meetsRole,
  useProto,
  type DrawerId,
  type Plan,
  type Role,
  type PayoutReceiver,
  type RepresentationStatus,
} from "./_state";
import {
  Affordance,
  Avatar,
  Bullet,
  CapsLabel,
  ClientTrustChip,
  Divider,
  FieldRow,
  GhostButton,
  Icon,
  IconChip,
  ModalShell,
  PaymentStatusChip,
  PayoutStatusChip,
  PlanChip,
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
} from "./_primitives";
import { InquiryWorkspaceDrawer } from "./_workspace";
import {
  InboxSnippetsDrawer,
  NotificationsPrefsDrawer,
  DataExportDrawer,
  AuditLogDrawer,
  TenantSwitcherDrawer,
  TalentShareCardDrawer,
  InquiryTemplatesPicker,
  DoubleBookingWarning,
} from "./_wave2";
import {
  TalentTodayPulseDrawer,
  TalentOfferDetailDrawer,
  TalentBookingDetailDrawer,
  TalentProfileEditDrawer,
  TalentProfileSectionDrawer,
  TalentAvailabilityDrawer,
  TalentBlockDatesDrawer,
  TalentPortfolioDrawer,
  TalentAgencyRelationshipDrawer,
  TalentLeaveAgencyDrawer,
  TalentNotificationsDrawer,
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
} from "./_talent";
import {
  ClientTodayPulseDrawer,
  ClientTalentCardDrawer,
  ClientShortlistDetailDrawer,
  ClientNewShortlistDrawer,
  ClientShareShortlistDrawer,
  ClientSendInquiryDrawer,
  ClientInquiryDetailDrawer,
  ClientCounterOfferDrawer,
  ClientBookingDetailDrawer,
  ClientContractsDrawer,
  ClientTeamDrawer,
  ClientBillingDrawer,
  ClientBrandSwitcherDrawer,
  ClientSavedSearchDrawer,
  ClientSettingsDrawer,
  ClientQuickQuestionDrawer,
} from "./_client";
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
} from "./_platform";

// ════════════════════════════════════════════════════════════════════
// Drawer root — reads drawer state and dispatches to the right body
// ════════════════════════════════════════════════════════════════════
//
// Each drawer body is its own component so it can call `useProto()` at
// the top level (rules of hooks). `DrawerRoot` is just a switch on the
// active drawer id; when no drawer is open it still renders an empty
// closed shell so the slide-out animation can play in both directions.

export function DrawerRoot() {
  const { state, closeDrawer } = useProto();
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
    case "theme-foundations":
      return <ThemeFoundationsDrawer />;
    case "plan-billing":
      return <PlanBillingDrawer />;
    case "team":
      return <TeamDrawer />;
    case "branding":
      return <BrandingDrawer />;
    case "domain":
      return <DomainDrawer />;
    case "identity":
      return <IdentityDrawer />;
    case "workspace-settings":
      return <WorkspaceSettingsDrawer />;
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
    case "client-profile":
      return <ClientProfileDrawer />;
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
    case "translations":
      return <TranslationsDrawer />;
    case "seo":
      return <SeoDrawer />;
    case "field-catalog":
      return <FieldCatalogDrawer />;
    case "taxonomy":
      return <TaxonomyDrawer />;
    case "design":
      return <ThemeFoundationsDrawer />;
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
    case "talent-profile-edit":
      return <TalentProfileEditDrawer />;
    case "talent-profile-section":
      return <TalentProfileSectionDrawer />;
    case "talent-availability":
      return <TalentAvailabilityDrawer />;
    case "talent-block-dates":
      return <TalentBlockDatesDrawer />;
    case "talent-portfolio":
      return <TalentPortfolioDrawer />;
    case "talent-agency-relationship":
      return <TalentAgencyRelationshipDrawer />;
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

    // ─── Payments / payouts ─────────────────────────────────────────────
    case "payments-setup":
      return <PaymentsSetupDrawer />;
    case "payout-receiver-picker":
      return <PayoutReceiverPickerDrawer />;
    case "payment-detail":
      return <PaymentDetailDrawer />;

    // ─── Client surface drawers ─────────────────────────────────────────
    case "client-today-pulse":
      return <ClientTodayPulseDrawer />;
    case "client-talent-card":
      return <ClientTalentCardDrawer />;
    case "client-saved-search":
      return <ClientSavedSearchDrawer />;
    case "client-shortlist-detail":
      return <ClientShortlistDetailDrawer />;
    case "client-new-shortlist":
      return <ClientNewShortlistDrawer />;
    case "client-share-shortlist":
      return <ClientShareShortlistDrawer />;
    case "client-send-inquiry":
      return <ClientSendInquiryDrawer />;
    case "client-inquiry-detail":
      return <ClientInquiryDetailDrawer />;
    case "client-counter-offer":
      return <ClientCounterOfferDrawer />;
    case "client-booking-detail":
      return <ClientBookingDetailDrawer />;
    case "client-contracts":
      return <ClientContractsDrawer />;
    case "client-team":
      return <ClientTeamDrawer />;
    case "client-billing":
      return <ClientBillingDrawer />;
    case "client-brand-switcher":
      return <ClientBrandSwitcherDrawer />;
    case "client-settings":
      return <ClientSettingsDrawer />;
    case "client-quick-question":
      return <ClientQuickQuestionDrawer />;

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
    case "talent-share-card":
      return <TalentShareCardDrawer />;

    default:
      return <SimpleStubDrawer title="Coming up next" description="This drawer's full design lands in the next iteration." sections={[]} />;
  }
}

// ════════════════════════════════════════════════════════════════════
// Helpers used across drawer bodies
// ════════════════════════════════════════════════════════════════════

function useSaveAndClose(message = "Saved") {
  const { closeDrawer, toast } = useProto();
  return () => {
    toast(message);
    closeDrawer();
  };
}

function StandardFooter({
  onSave,
  saveLabel = "Save",
  destructive,
}: {
  onSave?: () => void;
  saveLabel?: string;
  destructive?: { label: string; onClick: () => void };
}) {
  const { closeDrawer } = useProto();
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
      <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
      {onSave && <PrimaryButton onClick={onSave}>{saveLabel}</PrimaryButton>}
    </>
  );
}

function Section({
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
        <div style={{ marginBottom: 6 }}>
          <CapsLabel>{title}</CapsLabel>
        </div>
      )}
      {description && (
        <p
          style={{
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.inkMuted,
            margin: "0 0 10px",
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}
      {framed ? (
        <div
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: 14,
            boxShadow: COLORS.shadow,
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

function TenantSummaryDrawer() {
  const { state, closeDrawer, openDrawer, openUpgrade } = useProto();
  const planMeta = PLAN_META[state.plan];
  const rosterCount = getRoster(state.plan).length;
  const rosterCap = state.plan === "free" ? 5 : state.plan === "studio" ? 50 : state.plan === "agency" ? 200 : 999;
  const teamCount = getTeam(state.plan).length;

  const jumpItems: { label: string; icon: any; drawer: DrawerId }[] = [
    { label: "Plan & billing", icon: "credit", drawer: "plan-billing" },
    { label: "Recent invoices", icon: "mail", drawer: "plan-billing" },
    { label: "Team & permissions", icon: "team", drawer: "team" },
    { label: "Branding", icon: "palette", drawer: "branding" },
    { label: "Custom domain", icon: "globe", drawer: "domain" },
  ];

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={TENANT.name.toUpperCase()}
      description={`${planMeta.label} plan · ${planPrice(state.plan)}`}
      footer={
        <>
          {state.plan !== "network" && (
            <PrimaryButton
              onClick={() => {
                closeDrawer();
                openDrawer("plan-compare");
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="arrow-right" size={12} stroke={1.8} />
                Compare plans
              </span>
            </PrimaryButton>
          )}
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        </>
      }
    >
      <Section title="At a glance">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: 12,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: COLORS.amber,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>
              {planMeta.label} plan
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, marginTop: 1 }}>
              {planPrice(state.plan)} {state.plan !== "free" && "· billed monthly"}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Roster">
        <UsageRow label={`${rosterCount} / ${rosterCap === 999 ? "∞" : rosterCap} talents`} value={rosterCap === 999 ? 0.4 : rosterCount / rosterCap} />
        <UsageRow label={`${teamCount} / ${teamCap(state.plan)} seats`} value={teamCap(state.plan) === 999 ? 0.2 : teamCount / teamCap(state.plan)} />
        <UsageRow label="Storage · 1.4 / 25 GB" value={1.4 / 25} />
      </Section>

      <Section title="Jump to">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {jumpItems.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                openDrawer(item.drawer);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10,
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 13,
                color: COLORS.ink,
                textAlign: "left",
                transition: "border-color .12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(11,11,13,0.18)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.borderSoft)}
            >
              <IconChip size={28}>
                <Icon name={item.icon} size={13} stroke={1.7} />
              </IconChip>
              <span style={{ flex: 1, fontWeight: 500 }}>{item.label}</span>
              <Icon name="external" size={12} color={COLORS.inkDim} />
            </button>
          ))}
        </div>
      </Section>

      <Section title="Plan ladder">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(["free", "studio", "agency", "network"] as Plan[]).map((p) => {
            const isCurrent = state.plan === p;
            const isReached = meetsPlan(state.plan, p);
            return (
              <div
                key={p}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: 7,
                  background: isCurrent ? "rgba(11,11,13,0.05)" : "transparent",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: isReached ? COLORS.ink : COLORS.inkDim,
                  }}
                />
                <span style={{ fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, color: COLORS.ink, minWidth: 70 }}>
                  {PLAN_META[p].label}
                </span>
                <span style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, flex: 1 }}>
                  {PLAN_META[p].theme}
                </span>
                {isCurrent && (
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: COLORS.inkMuted, textTransform: "uppercase" }}>
                    Current
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </DrawerShell>
  );
}

function UsageRow({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(2, value * 100));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, fontWeight: 500 }}>
          {label}
        </span>
        <span style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted }}>
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
          style={{
            width: `${pct}%`,
            height: "100%",
            background: pct > 80 ? COLORS.amber : COLORS.ink,
            borderRadius: 999,
            transition: "width .3s",
          }}
        />
      </div>
    </div>
  );
}

function teamCap(plan: Plan): number {
  return plan === "free" ? 1 : plan === "studio" ? 3 : plan === "agency" ? 25 : 999;
}
function nextPlan(plan: Plan): Plan | null {
  if (plan === "free") return "studio";
  if (plan === "studio") return "agency";
  if (plan === "agency") return "network";
  return null;
}

// ════════════════════════════════════════════════════════════════════
// Site setup walkthrough
// ════════════════════════════════════════════════════════════════════

function SiteSetupDrawer() {
  const { closeDrawer, openDrawer, toast } = useProto();
  const [done, setDone] = useState<Set<string>>(new Set(["homepage"]));
  const steps = [
    { id: "homepage", label: "Homepage hero", desc: "Headline, sub, CTA. Sets the tone.", drawer: "homepage" },
    { id: "pages", label: "Pages", desc: "About, Press, FAQ, Contact.", drawer: "pages" },
    { id: "posts", label: "Posts", desc: "Editorial features, news, BTS.", drawer: "posts" },
    { id: "navigation", label: "Navigation & footer", desc: "Header structure, footer columns.", drawer: "navigation" },
    { id: "theme", label: "Theme & foundations", desc: "Type, color, density, layout.", drawer: "theme-foundations" },
    { id: "seo", label: "SEO & defaults", desc: "Meta, sitemap, redirects.", drawer: "seo" },
  ];
  const completedCount = done.size;

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Get your site live"
      description={`${completedCount} of ${steps.length} steps complete. Most agencies finish in under 30 minutes.`}
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              toast("Setup progress saved");
              closeDrawer();
            }}
          >
            Save progress
          </PrimaryButton>
        </>
      }
    >
      <div
        style={{
          background: COLORS.surfaceAlt,
          border: `1px solid rgba(15,79,62,0.18)`,
          borderRadius: 12,
          padding: 14,
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 22,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 500, color: COLORS.ink }}>
            {Math.round((completedCount / steps.length) * 100)}% complete
          </div>
          <div style={{ height: 6, background: "rgba(15,79,62,0.18)", borderRadius: 999, marginTop: 6, overflow: "hidden" }}>
            <div
              style={{
                width: `${(completedCount / steps.length) * 100}%`,
                height: "100%",
                background: COLORS.accentDeep,
                borderRadius: 999,
                transition: "width .3s",
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {steps.map((step, idx) => {
          const isDone = done.has(step.id);
          return (
            <div
              key={step.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: 14,
                background: "#fff",
                border: `1px solid ${isDone ? "rgba(46,125,91,0.30)" : COLORS.borderSoft}`,
                borderRadius: 12,
              }}
            >
              <button
                onClick={() => {
                  setDone((prev) => {
                    const next = new Set(prev);
                    if (next.has(step.id)) next.delete(step.id);
                    else next.add(step.id);
                    return next;
                  });
                }}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  border: `1.5px solid ${isDone ? COLORS.green : "rgba(11,11,13,0.18)"}`,
                  background: isDone ? COLORS.green : "transparent",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  cursor: "pointer",
                }}
                aria-label={isDone ? "Mark incomplete" : "Mark complete"}
              >
                {isDone ? (
                  <Icon name="check" size={14} stroke={2.5} color="#fff" />
                ) : (
                  <span style={{ fontSize: 11, color: COLORS.inkMuted, fontWeight: 600 }}>
                    {idx + 1}
                  </span>
                )}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: FONTS.body,
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: COLORS.ink,
                    textDecoration: isDone ? "line-through" : "none",
                    opacity: isDone ? 0.6 : 1,
                  }}
                >
                  {step.label}
                </div>
                <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  {step.desc}
                </div>
              </div>
              <SecondaryButton size="sm" onClick={() => openDrawer(step.drawer as DrawerId)}>
                {isDone ? "Edit" : "Open"}
              </SecondaryButton>
            </div>
          );
        })}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Theme & foundations
// ════════════════════════════════════════════════════════════════════

function ThemeFoundationsDrawer() {
  const { closeDrawer } = useProto();
  const onSave = useSaveAndClose("Theme saved");
  const [theme, setTheme] = useState<"editorial-noir" | "modern-mono" | "warm-light">("editorial-noir");
  const [headingFont, setHeadingFont] = useState("Cormorant Garamond");
  const [bodyFont, setBodyFont] = useState("Inter");
  const [accent, setAccent] = useState("#B8860B");
  const [density, setDensity] = useState<"compact" | "comfortable" | "spacious">("comfortable");

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Theme & foundations"
      description="Typography, color, and density — applied across your site."
      width={580}
      footer={<StandardFooter onSave={onSave} />}
    >
      <Section title="Theme preset" description="Three starting points. Customize anything below.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {[
            { id: "editorial-noir", label: "Editorial Noir", swatch: ["#0B0B0D", "#FAFAF7", "#B8860B"] },
            { id: "modern-mono", label: "Modern Mono", swatch: ["#0F0F11", "#FFFFFF", "#5B5B62"] },
            { id: "warm-light", label: "Warm Light", swatch: ["#3D2A18", "#FBF5EC", "#C68A1E"] },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id as any)}
              style={{
                background: "#fff",
                border: `1.5px solid ${theme === t.id ? COLORS.ink : COLORS.borderSoft}`,
                borderRadius: 10,
                padding: 12,
                cursor: "pointer",
                fontFamily: FONTS.body,
                textAlign: "left",
                transition: "border-color .12s",
              }}
            >
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                {t.swatch.map((c) => (
                  <span key={c} style={{ width: 18, height: 18, borderRadius: 4, background: c, border: `1px solid ${COLORS.borderSoft}` }} />
                ))}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>{t.label}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <FieldRow label="Heading font">
          <select
            value={headingFont}
            onChange={(e) => setHeadingFont(e.target.value)}
            style={{
              padding: "9px 12px",
              fontFamily: FONTS.body,
              fontSize: 13,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              background: "#fff",
              color: COLORS.ink,
            }}
          >
            <option>Cormorant Garamond</option>
            <option>EB Garamond</option>
            <option>Playfair Display</option>
            <option>Inter</option>
          </select>
        </FieldRow>
        <FieldRow label="Body font">
          <select
            value={bodyFont}
            onChange={(e) => setBodyFont(e.target.value)}
            style={{
              padding: "9px 12px",
              fontFamily: FONTS.body,
              fontSize: 13,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              background: "#fff",
              color: COLORS.ink,
            }}
          >
            <option>Inter</option>
            <option>Söhne</option>
            <option>Neue Haas Grotesk</option>
            <option>Helvetica Neue</option>
          </select>
        </FieldRow>
        <div
          style={{
            background: "#fff",
            padding: 16,
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
          }}
        >
          <div style={{ fontFamily: headingFont, fontSize: 26, fontWeight: 500, letterSpacing: -0.5, color: COLORS.ink, lineHeight: 1.15 }}>
            Editorial preview
          </div>
          <div style={{ fontFamily: bodyFont, fontSize: 13, color: COLORS.inkMuted, marginTop: 6, lineHeight: 1.55 }}>
            The quick brown fox jumps over the lazy dog. The five boxing wizards jump quickly.
          </div>
        </div>
      </Section>

      <Section title="Brand color">
        <FieldRow label="Accent">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              style={{ width: 38, height: 32, border: `1px solid ${COLORS.border}`, borderRadius: 6, cursor: "pointer" }}
            />
            <TextInput defaultValue={accent} />
          </div>
        </FieldRow>
      </Section>

      <Section title="Density">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {[
            { id: "compact", label: "Compact", sub: "Tighter rows" },
            { id: "comfortable", label: "Comfortable", sub: "Default" },
            { id: "spacious", label: "Spacious", sub: "Editorial" },
          ].map((d) => (
            <button
              key={d.id}
              onClick={() => setDensity(d.id as any)}
              style={{
                background: "#fff",
                border: `1.5px solid ${density === d.id ? COLORS.ink : COLORS.borderSoft}`,
                borderRadius: 10,
                padding: 12,
                cursor: "pointer",
                fontFamily: FONTS.body,
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>{d.label}</div>
              <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>{d.sub}</div>
            </button>
          ))}
        </div>
      </Section>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Plan & billing
// ════════════════════════════════════════════════════════════════════

function PlanBillingDrawer() {
  const { state, closeDrawer, openUpgrade, toast } = useProto();
  const planMeta = PLAN_META[state.plan];

  const invoices = [
    { id: "i1", date: "Apr 1", amount: planPrice(state.plan), status: "Paid" },
    { id: "i2", date: "Mar 1", amount: planPrice(state.plan), status: "Paid" },
    { id: "i3", date: "Feb 1", amount: planPrice(state.plan), status: "Paid" },
  ];

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Plan & billing"
      description="Manage your subscription and see past invoices."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          {state.plan !== "network" && (
            <PrimaryButton
              onClick={() =>
                openUpgrade({
                  feature: `${PLAN_META[nextPlan(state.plan)!].label} plan`,
                  why: PLAN_META[nextPlan(state.plan)!].theme,
                  requiredPlan: nextPlan(state.plan)!,
                })
              }
            >
              Upgrade plan
            </PrimaryButton>
          )}
        </>
      }
    >
      <Section title="Current plan">
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <PlanChip plan={state.plan} variant="solid" />
              <span style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, color: COLORS.ink }}>
                {planMeta.label}
              </span>
            </div>
            <span style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, fontWeight: 600 }}>
              {planPrice(state.plan)}
            </span>
          </div>
          <p style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
            {planMeta.theme}. {state.plan === "free" ? "Upgrade any time." : "Cancel any time."}
          </p>
        </div>
      </Section>

      {state.plan !== "free" && (
        <Section title="Payment method">
          <div
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <IconChip size={28}>
              <Icon name="credit" size={13} />
            </IconChip>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500, color: COLORS.ink }}>
                Visa ending 4242
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted }}>
                Expires 09 / 2028
              </div>
            </div>
            <GhostButton
              size="sm"
              onClick={() => toast("Card update opens in your billing portal.")}
            >
              Update
            </GhostButton>
          </div>
        </Section>
      )}

      {state.plan !== "free" && (
        <Section title="Recent invoices">
          <div
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {invoices.map((inv, idx) => (
              <div
                key={inv.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 80px 60px",
                  alignItems: "center",
                  padding: "10px 14px",
                  borderTop: idx > 0 ? `1px solid ${COLORS.borderSoft}` : "none",
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                }}
              >
                <span style={{ color: COLORS.ink }}>{inv.date}</span>
                <span style={{ color: COLORS.inkMuted }}>{inv.amount}</span>
                <StateChipMini label={inv.status} tone="green" />
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  style={{ color: COLORS.inkMuted, fontSize: 12, textDecoration: "none", justifySelf: "end" }}
                >
                  PDF
                </a>
              </div>
            ))}
          </div>
        </Section>
      )}
    </DrawerShell>
  );
}

/**
 * Compact tone+label pill (no dot). Thin alias over StatusPill — kept for
 * call-site naming clarity.
 */
function StateChipMini({ label, tone }: { label: string; tone: "green" | "amber" | "dim" }) {
  return <StatusPill tone={tone} label={label} size="sm" />;
}

// ════════════════════════════════════════════════════════════════════
// Team
// ════════════════════════════════════════════════════════════════════

function TeamDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const team = getTeam(state.plan);
  const canManage = meetsRole(state.role, "admin");

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Team"
      description={`${team.length} members. Roles: viewer / editor / coordinator / admin / owner.`}
      width={560}
      footer={
        canManage ? (
          <StandardFooter onSave={() => { toast("Invitation sent"); closeDrawer(); }} saveLabel="Send invite" />
        ) : (
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        )
      }
    >
      <Section title="Members">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {team.map((m) => {
            // Match team member by name to a payout receiver candidate
            // so the member row can show their payout connection state.
            const payoutCandidate = PAYOUT_RECEIVER_CANDIDATES.find(
              (c) => c.displayName === m.name,
            );
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  background: "#fff",
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 10,
                }}
              >
                <Avatar initials={m.initials} tone={m.role === "owner" ? "ink" : "neutral"} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                    {m.name}
                  </div>
                  <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted }}>
                    {m.email}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {payoutCandidate && <PayoutStatusChip status={payoutCandidate.status} />}
                  <RoleChip role={m.role} />
                  {m.status === "invited" && <StateChipMini label="Invited" tone="amber" />}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {canManage && (
        <Section title="Invite a teammate" description="They'll get an email to join the workspace at the role you set.">
          <FieldRow label="Email">
            <TextInput type="email" placeholder="someone@your-agency.com" />
          </FieldRow>
          <FieldRow label="Role" hint="Owners change billing. Admins manage team and branding. Coordinators move work. Editors draft. Viewers watch.">
            <select
              defaultValue="editor"
              style={{
                padding: "9px 12px",
                fontFamily: FONTS.body,
                fontSize: 13,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                background: "#fff",
                color: COLORS.ink,
              }}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="coordinator">Coordinator</option>
              <option value="admin">Admin</option>
            </select>
          </FieldRow>
        </Section>
      )}
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Branding
// ════════════════════════════════════════════════════════════════════

function BrandingDrawer() {
  const { closeDrawer, toast } = useProto();
  const onSave = useSaveAndClose("Branding saved");
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Branding"
      description="Logo, voice, brand colors. What clients see across emails and storefront."
      width={560}
      footer={<StandardFooter onSave={onSave} />}
    >
      <Section title="Logo & icon">
        <FieldRow label="Wordmark" hint="SVG preferred. Used in storefront header and emails.">
          <div
            style={{
              border: `1px dashed ${COLORS.border}`,
              borderRadius: 10,
              padding: 18,
              display: "flex",
              alignItems: "center",
              gap: 14,
              background: "#fff",
            }}
          >
            <span
              style={{
                width: 56,
                height: 56,
                borderRadius: 8,
                background: COLORS.ink,
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FONTS.display,
                fontSize: 22,
                fontWeight: 500,
              }}
            >
              {TENANT.initials}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500, color: COLORS.ink }}>
                acme-models-logo.svg
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>
                Uploaded · 312 KB
              </div>
            </div>
            <SecondaryButton
              size="sm"
              onClick={() => toast("Drag a file or click to upload.")}
            >
              Replace
            </SecondaryButton>
          </div>
        </FieldRow>
      </Section>

      <Section title="Brand voice" framed>
        <FieldRow label="Tagline" optional>
          <TextInput defaultValue="An agency built around our talent." />
        </FieldRow>
        <FieldRow label="Brand description" hint="Used in social previews and footer.">
          <TextArea
            rows={3}
            defaultValue="A boutique agency representing editorial, runway, and commercial talent across Europe."
          />
        </FieldRow>
      </Section>

      <Section title="Color tokens" framed>
        <FieldRow label="Primary">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="color" defaultValue="#0B0B0D" style={{ width: 38, height: 32, border: `1px solid ${COLORS.border}`, borderRadius: 6 }} />
            <TextInput defaultValue="#0B0B0D" />
          </div>
        </FieldRow>
        <FieldRow label="Accent">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="color" defaultValue="#0F4F3E" style={{ width: 38, height: 32, border: `1px solid ${COLORS.border}`, borderRadius: 6 }} />
            <TextInput defaultValue="#0F4F3E" />
          </div>
        </FieldRow>
      </Section>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Domain
// ════════════════════════════════════════════════════════════════════

function DomainDrawer() {
  const { state, closeDrawer } = useProto();
  const onSave = useSaveAndClose("Domain settings saved");
  const isLive = meetsPlan(state.plan, "studio");

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Custom domain"
      description={isLive ? "Your storefront runs on your own brand domain." : "Your storefront runs on Tulala's subdomain."}
      width={560}
      footer={<StandardFooter onSave={onSave} />}
    >
      <Section title="Public URL">
        <FieldRow label="Tulala subdomain" hint="Always available. Used as fallback.">
          <TextInput defaultValue={TENANT.domain} prefix="https://" />
        </FieldRow>
        <FieldRow label="Custom domain" optional>
          <TextInput defaultValue={isLive ? TENANT.customDomain : ""} placeholder="acme-models.com" prefix="https://" />
        </FieldRow>
      </Section>

      {isLive && (
        <Section title="DNS verification">
          <div
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              padding: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <StatDot tone="green" />
              <span style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                Verified · SSL active
              </span>
            </div>
            <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.inkMuted, lineHeight: 1.7 }}>
              <div>CNAME · @ → tulala-edge.cdn.tulala.app</div>
              <div>TXT · _tulala-verify → tulala-7f2a91...</div>
            </div>
          </div>
        </Section>
      )}

      {!isLive && (
        <Section title="Why upgrade" description="Studio takes you off the Tulala subdomain and onto your own brand.">
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {["Your own domain (e.g. acme-models.com)", "Auto-renewed SSL", "Verified email-from address", "Removed from Tulala discovery"].map((p) => (
              <li key={p} style={{ display: "flex", gap: 10, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink }}>
                <Icon name="check" size={14} stroke={2} color={COLORS.green} />
                {p}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Identity
// ════════════════════════════════════════════════════════════════════

function IdentityDrawer() {
  const { closeDrawer } = useProto();
  const onSave = useSaveAndClose("Identity saved");
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Identity"
      description="The basics — who you are inside Tulala."
      footer={<StandardFooter onSave={onSave} />}
    >
      <Section title="Workspace" framed>
        <FieldRow label="Workspace name" hint="Shown in browser tab, emails, and the public storefront.">
          <TextInput defaultValue={TENANT.name} />
        </FieldRow>
        <FieldRow label="Workspace slug" hint="Used in URLs.">
          <TextInput defaultValue={TENANT.slug} prefix="tulala.app/" />
        </FieldRow>
        <FieldRow label="Contact email">
          <TextInput type="email" defaultValue="hello@acme-models.com" />
        </FieldRow>
        <FieldRow label="Support email" optional>
          <TextInput type="email" defaultValue="support@acme-models.com" />
        </FieldRow>
      </Section>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Workspace settings
// ════════════════════════════════════════════════════════════════════

function WorkspaceSettingsDrawer() {
  const { closeDrawer } = useProto();
  const onSave = useSaveAndClose("Settings saved");
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Workspace settings"
      description="Operational defaults — locale, currency, timezone."
      footer={<StandardFooter onSave={onSave} />}
    >
      <Section title="Locale & timezone" framed>
        <FieldRow label="Default locale">
          <SelectInput options={["English (UK)", "English (US)", "Español", "Italiano", "Français"]} defaultValue="English (UK)" />
        </FieldRow>
        <FieldRow label="Timezone">
          <SelectInput options={["Europe/Madrid", "Europe/Lisbon", "Europe/Paris", "America/New_York"]} defaultValue="Europe/Madrid" />
        </FieldRow>
        <FieldRow label="Default currency">
          <SelectInput options={["EUR €", "USD $", "GBP £"]} defaultValue="EUR €" />
        </FieldRow>
        <FieldRow label="First day of week">
          <SelectInput options={["Monday", "Sunday"]} defaultValue="Monday" />
        </FieldRow>
      </Section>
    </DrawerShell>
  );
}

function SelectInput({ options, defaultValue }: { options: string[]; defaultValue?: string }) {
  return (
    <select
      defaultValue={defaultValue}
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

function TalentProfileDrawer() {
  const { state, closeDrawer, openDrawer } = useProto();
  const id = state.drawer.payload?.id as string | undefined;
  const profile = getRoster(state.plan).find((p) => p.id === id) ?? getRoster(state.plan)[0];
  const canEdit = meetsRole(state.role, "editor");
  const onSave = useSaveAndClose("Profile saved");

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={profile.name}
      description={`${profile.height ?? "—"} · ${profile.city ?? "—"}`}
      width={580}
      toolbar={
        <GhostButton
          size="sm"
          onClick={() =>
            openDrawer("talent-share-card", { name: profile.name, slug: profile.id })
          }
        >
          Share with client
        </GhostButton>
      }
      footer={
        canEdit ? (
          <>
            <button
              onClick={closeDrawer}
              style={{
                background: "transparent",
                border: "none",
                color: COLORS.inkMuted,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                cursor: "pointer",
                marginRight: "auto",
              }}
            >
              Archive
            </button>
            <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
            <PrimaryButton onClick={onSave}>Publish</PrimaryButton>
          </>
        ) : (
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        )
      }
    >
      <div
        style={{
          display: "flex",
          gap: 14,
          marginBottom: 18,
          padding: 14,
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
        }}
      >
        <div
          style={{
            width: 88,
            height: 110,
            borderRadius: 8,
            background: COLORS.surfaceAlt,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 50,
            flexShrink: 0,
          }}
        >
          {profile.thumb}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <StateChip state={profile.state} label={TALENT_STATE_LABEL[profile.state]} />
            {profile.representation && (
              <RepresentationChip representation={profile.representation} />
            )}
          </div>
          <div
            style={{
              fontFamily: FONTS.display,
              fontSize: 22,
              fontWeight: 500,
              color: COLORS.ink,
              letterSpacing: -0.3,
              marginTop: 6,
            }}
          >
            {profile.name}
          </div>
          <div style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, marginTop: 2 }}>
            {profile.height} <Bullet /> {profile.city}
          </div>
        </div>
      </div>

      <Section title="State">
        <StateExplainer state={profile.state} />
      </Section>

      {profile.representation && (
        <Section
          title="Representation"
          description="How this talent is represented relates to who owns inquiries that come in via different surfaces."
        >
          <RepresentationCard representation={profile.representation} talentName={profile.name} />
        </Section>
      )}

      <Section title="Basics" framed>
        <FieldRow label="Stage name">
          <TextInput defaultValue={profile.name} />
        </FieldRow>
        <FieldRow label="Height">
          <TextInput defaultValue={profile.height ?? ""} />
        </FieldRow>
        <FieldRow label="City">
          <TextInput defaultValue={profile.city ?? ""} />
        </FieldRow>
      </Section>

      <Section title="Visibility" framed>
        <ToggleRow label="Show in public roster" defaultOn={profile.state === "published"} />
        <ToggleRow label="Allow direct inquiries" defaultOn={profile.state === "published"} />
        <ToggleRow label="Include in Tulala discovery" defaultOn={state.plan === "free"} />
      </Section>
    </DrawerShell>
  );
}

function StateExplainer({ state }: { state: "draft" | "invited" | "published" | "awaiting-approval" | "claimed" }) {
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
      <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
        {m.title}
      </div>
      <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, marginTop: 4, lineHeight: 1.5 }}>
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
function RepresentationCard({
  representation,
  talentName,
}: {
  representation: RepresentationStatus;
  talentName: string;
}) {
  const subtitle =
    representation.kind === "exclusive"
      ? `Represented exclusively by ${representation.agencyName}.`
      : representation.kind === "non-exclusive"
        ? `Represented non-exclusively by ${representation.agencyNames.join(", ")}.`
        : `${talentName} is freelance — no active agency representation.`;

  const ownershipBullets =
    representation.kind === "freelance"
      ? [
          { surface: "Agency page", owner: "—" },
          { surface: "Hub page", owner: `Hub operator · ${talentName} notified` },
          { surface: "Personal page", owner: `${talentName} (no agency notified)` },
        ]
      : representation.kind === "exclusive"
        ? [
            { surface: "Agency page", owner: representation.agencyName },
            { surface: "Hub page", owner: `Hub operator · ${talentName} + ${representation.agencyName} notified` },
            { surface: "Personal page", owner: `${talentName} · ${representation.agencyName} notified` },
          ]
        : [
            { surface: "Agency page", owner: "Whichever agency the page belongs to" },
            { surface: "Hub page", owner: `Hub operator · ${talentName} + all representing agencies notified` },
            { surface: "Personal page", owner: `${talentName} · representing agencies notified` },
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <RepresentationChip representation={representation} />
      </div>
      <p style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, margin: "0 0 12px", lineHeight: 1.55 }}>
        {subtitle}
      </p>
      <CapsLabel>Inquiry routing by source</CapsLabel>
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
            <span style={{ color: COLORS.inkMuted }}>{row.surface}</span>
            <span style={{ color: COLORS.ink }}>{row.owner}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({ label, defaultOn = false }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
      <Toggle on={on} onChange={setOn} label={label} />
      <span style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink }}>{label}</span>
    </div>
  );
}

function NewTalentDrawer() {
  const { closeDrawer } = useProto();
  const onSave = useSaveAndClose("Talent profile created");
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Add talent"
      description="Create a roster profile. You can publish now or invite the talent to claim later."
      footer={<StandardFooter onSave={onSave} saveLabel="Create profile" />}
    >
      <Section title="Basics" framed>
        <FieldRow label="Stage name">
          <TextInput placeholder="First Last" />
        </FieldRow>
        <FieldRow label="Height" optional>
          <TextInput placeholder="5'9&quot;" />
        </FieldRow>
        <FieldRow label="City" optional>
          <TextInput placeholder="Madrid" />
        </FieldRow>
      </Section>

      <Section title="How will this profile be managed?">
        <RadioCardGroup
          options={[
            { id: "agency", title: "Agency-managed", desc: "You write the profile and publish it. Talent doesn't need an account." },
            { id: "invited", title: "Invite talent to claim", desc: "We email them so they can claim, edit, and approve." },
            { id: "draft", title: "Save as draft", desc: "Not published. Edit later." },
          ]}
          defaultId="agency"
        />
      </Section>
    </DrawerShell>
  );
}

function RadioCardGroup({ options, defaultId }: { options: { id: string; title: string; desc: string }[]; defaultId: string }) {
  const [selected, setSelected] = useState(defaultId);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {options.map((o) => {
        const isSelected = selected === o.id;
        return (
          <button
            key={o.id}
            onClick={() => setSelected(o.id)}
            style={{
              background: "#fff",
              border: `1.5px solid ${isSelected ? COLORS.ink : COLORS.borderSoft}`,
              borderRadius: 10,
              padding: 12,
              cursor: "pointer",
              fontFamily: FONTS.body,
              textAlign: "left",
              display: "flex",
              gap: 10,
              transition: "border-color .12s",
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: `1.5px solid ${isSelected ? COLORS.ink : "rgba(11,11,13,0.18)"}`,
                background: isSelected ? COLORS.ink : "transparent",
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
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{o.title}</div>
              <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2, lineHeight: 1.5 }}>
                {o.desc}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MyProfileDrawer() {
  const { state, closeDrawer } = useProto();
  const onSave = useSaveAndClose("Your profile saved");

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Your profile"
      description={state.alsoTalent ? "You're an admin AND on the roster — both views live here." : "Your account in this workspace."}
      footer={<StandardFooter onSave={onSave} />}
    >
      <Section title="Account">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: 14,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
          }}
        >
          <Avatar initials="OT" size={48} tone="ink" />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONTS.body, fontSize: 14, fontWeight: 600, color: COLORS.ink }}>
              Oran Tene
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, marginTop: 1 }}>
              oran@acme-models.com
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <RoleChip role={state.role} />
              {state.alsoTalent && (
                <span
                  style={{
                    background: "rgba(11,11,13,0.05)",
                    color: COLORS.ink,
                    fontFamily: FONTS.body,
                    fontSize: 10.5,
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: 999,
                  }}
                >
                  On roster
                </span>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Personal" framed>
        <FieldRow label="Display name">
          <TextInput defaultValue="Oran Tene" />
        </FieldRow>
        <FieldRow label="Email">
          <TextInput type="email" defaultValue="oran@acme-models.com" />
        </FieldRow>
      </Section>

      {state.alsoTalent && (
        <Section title="Your talent profile" description="What clients see when they book you. Edits go through admin approval." framed>
          <FieldRow label="Stage name">
            <TextInput defaultValue="Oran T." />
          </FieldRow>
          <FieldRow label="Bio">
            <TextArea rows={3} defaultValue="Editorial / runway · based Madrid, traveling Q2 to Milan." />
          </FieldRow>
          <FieldRow label="Direct inquiries">
            <ToggleRow label="Allow clients to inquire about you directly" defaultOn />
          </FieldRow>
        </Section>
      )}

      <Section title="Notifications" framed>
        <ToggleRow label="Email me when an inquiry mentions a talent I manage" defaultOn />
        <ToggleRow label="Email me when a client confirms a booking" defaultOn />
        <ToggleRow label="Daily digest at 9am Madrid time" defaultOn={false} />
      </Section>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Inquiries: peek + new + new booking
// ════════════════════════════════════════════════════════════════════

function InquiryPeekDrawer() {
  const { state, closeDrawer } = useProto();
  const id = state.drawer.payload?.id as string | undefined;
  const inquiry = getInquiries(state.plan).find((i) => i.id === id) ?? getInquiries(state.plan)[0];
  const canEdit = meetsRole(state.role, "coordinator");
  const onSend = useSaveAndClose("Offer sent to client");

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={inquiry.client}
      description={inquiry.brief}
      width={580}
      footer={
        canEdit ? (
          <>
            <SecondaryButton onClick={closeDrawer}>Save draft</SecondaryButton>
            <PrimaryButton onClick={onSend}>Send offer</PrimaryButton>
          </>
        ) : (
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        )
      }
    >
      <Section title="At a glance">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <SummaryTile label="Stage" value={<StageBadgeMini stage={inquiry.stage} />} />
          <SummaryTile label="Amount" value={inquiry.amount ?? "—"} />
          <SummaryTile label="Date" value={inquiry.date ?? "TBD"} />
          <SummaryTile label="Age" value={`${inquiry.ageDays}d`} />
        </div>
      </Section>

      <Section title="Talent on this inquiry">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {inquiry.talent.map((t) => (
            <span
              key={t}
              style={{
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                padding: "5px 10px",
                borderRadius: 999,
                fontFamily: FONTS.body,
                fontSize: 12,
                color: COLORS.ink,
                fontWeight: 500,
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Brief">
        <TextArea
          rows={4}
          defaultValue={`${inquiry.brief}\n\nUsage: digital + print, 6 months, EU territory. Half-day shoot.`}
        />
      </Section>

      <Section title="Conversation">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ConversationBubble who="Client" name={inquiry.client} when="2d ago" body={`Looking for a model for our ${inquiry.brief.toLowerCase()}. Open to suggestions.`} />
          <ConversationBubble who="You" name="Sara Bianchi" when="1d ago" body={`Sending you ${inquiry.talent[0]} — fits the brief. Rate quote attached.`} mine />
          <ConversationBubble who="Client" name={inquiry.client} when="22h ago" body="Love it. Can we lock dates?" />
        </div>
      </Section>
    </DrawerShell>
  );
}

function SummaryTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 10.5, color: COLORS.inkMuted, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink, fontWeight: 600, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function StageBadgeMini({ stage }: { stage: string }) {
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

function ConversationBubble({
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
          background: mine ? COLORS.ink : "#fff",
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

function NewInquiryDrawer() {
  const { state, closeDrawer } = useProto();
  const onSave = useSaveAndClose("Inquiry created");
  const roster = getRoster(state.plan);
  // Wave 2 — let the user start from a similar past brief, and warn
  // immediately if a chosen talent is double-booked.
  const [client, setClient] = useState("");
  const [brief, setBrief] = useState("");
  const [date, setDate] = useState("");
  const [conflictTalent, setConflictTalent] = useState<string | null>(null);

  const handlePickTemplate = (t: { title: string; brief: string }) => {
    setBrief(t.brief);
  };

  const pickTalent = (name: string) => {
    // Mock conflict detection — Marta Reyes "is already booked" if the
    // date string contains "May 14" (matching mock booking data).
    if (name.toLowerCase().includes("marta") && date.toLowerCase().includes("may 14")) {
      setConflictTalent(name);
    } else {
      setConflictTalent(null);
    }
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="New inquiry"
      description="Capture a lead from a client. Send an offer when ready."
      width={560}
      footer={<StandardFooter onSave={onSave} saveLabel="Save draft" />}
    >
      <InquiryTemplatesPicker onPick={handlePickTemplate} />
      <Section title="Client">
        <FieldRow label="Client name">
          <TextInput
            placeholder="Vogue Italia"
            value={client}
            onChange={(e) => setClient(e.target.value)}
          />
        </FieldRow>
        <FieldRow label="Contact" optional>
          <TextInput placeholder="Sara Bianchi · sara@vogue.it" />
        </FieldRow>
      </Section>

      <Section title="Brief">
        <FieldRow label="Project type">
          <SelectInput options={["Editorial", "Commercial", "Lookbook", "Runway", "Showroom"]} />
        </FieldRow>
        <FieldRow label="Brief">
          <TextArea
            rows={3}
            placeholder="Spring editorial spread. Half-day shoot in Madrid. Digital + print, 6 months EU."
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
        </FieldRow>
        <FieldRow label="Date" optional>
          <TextInput
            placeholder="May 14"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </FieldRow>
        <FieldRow label="Budget" optional>
          <TextInput placeholder="€4,200" />
        </FieldRow>
      </Section>

      <Section title="Talent" description="Suggest the talent that fits.">
        {conflictTalent && (
          <div style={{ marginBottom: 10 }}>
            <DoubleBookingWarning
              talentName={conflictTalent}
              conflictTitle="Mango — Spring lookbook"
              conflictDates="May 14 · all day"
            />
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {roster.slice(0, 5).map((t) => (
            <button
              key={t.id}
              onClick={() => pickTalent(t.name)}
              style={{
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                padding: "6px 12px",
                borderRadius: 999,
                fontFamily: FONTS.body,
                fontSize: 12,
                color: COLORS.ink,
                cursor: "pointer",
              }}
            >
              + {t.name}
            </button>
          ))}
        </div>
      </Section>
    </DrawerShell>
  );
}

function NewBookingDrawer() {
  const { closeDrawer } = useProto();
  const onSave = useSaveAndClose("Booking created");
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="New booking"
      description="Skip the inquiry — log a confirmed job."
      footer={<StandardFooter onSave={onSave} saveLabel="Create booking" />}
    >
      <Section title="Client & talent" framed>
        <FieldRow label="Client">
          <TextInput placeholder="Vogue Italia" />
        </FieldRow>
        <FieldRow label="Talent">
          <TextInput placeholder="Marta Reyes" />
        </FieldRow>
      </Section>
      <Section title="When & where" framed>
        <FieldRow label="Date">
          <TextInput placeholder="May 14, 2026" />
        </FieldRow>
        <FieldRow label="Call time" optional>
          <TextInput placeholder="08:00" />
        </FieldRow>
        <FieldRow label="Location">
          <TextInput placeholder="Madrid · Studio 5" />
        </FieldRow>
      </Section>
      <Section title="Money" framed>
        <FieldRow label="Total fee">
          <TextInput placeholder="€4,200" />
        </FieldRow>
        <FieldRow label="Agency commission">
          <TextInput defaultValue="20%" />
        </FieldRow>
      </Section>
    </DrawerShell>
  );
}

function ClientProfileDrawer() {
  const { state, closeDrawer } = useProto();
  const id = state.drawer.payload?.id as string | undefined;
  const isNew = id === "new" || !id;
  const client = isNew ? null : getClients(state.plan).find((c) => c.id === id) ?? null;
  const onSave = useSaveAndClose(isNew ? "Client created" : "Client saved");
  const trust = client?.trust ?? "basic";
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={isNew ? "New client" : client?.name ?? "Client"}
      description={isNew ? "Track a relationship." : `${client?.contact ?? ""} · ${client?.bookingsYTD ?? 0} bookings YTD`}
      toolbar={!isNew ? <ClientTrustChip level={trust} /> : undefined}
      footer={<StandardFooter onSave={onSave} saveLabel={isNew ? "Create" : "Save"} />}
    >
      <Section title="Identity">
        <FieldRow label="Client name">
          <TextInput defaultValue={client?.name ?? ""} placeholder="Brand or company" />
        </FieldRow>
        <FieldRow label="Primary contact">
          <TextInput defaultValue={client?.contact ?? ""} placeholder="Name · email" />
        </FieldRow>
      </Section>
      {!isNew && (
        <Section
          title="Trust level"
          description="Driven by verification + funded-account events. Not editable by hand."
        >
          <div
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              padding: 14,
              fontFamily: FONTS.body,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ClientTrustChip level={trust} />
              <span style={{ fontSize: 12, color: COLORS.inkMuted }}>
                {CLIENT_TRUST_META[trust].hint}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: COLORS.ink, lineHeight: 1.55 }}>
              {CLIENT_TRUST_META[trust].rationale}
            </p>
            <p style={{ margin: 0, fontSize: 11.5, color: COLORS.inkDim, lineHeight: 1.5 }}>
              Tiers reflect real verification + funded-balance events on the
              client side. Talent decide which tiers can reach them in their
              contact preferences.
            </p>
          </div>
        </Section>
      )}
      {!isNew && (
        <Section title="Recent bookings">
          <div
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              padding: 12,
              fontFamily: FONTS.body,
              fontSize: 12.5,
              color: COLORS.inkMuted,
            }}
          >
            {client?.bookingsYTD ? `${client.bookingsYTD} confirmed bookings this year.` : "No recent bookings."}
          </div>
        </Section>
      )}
      <Section title="Notes">
        <TextArea rows={3} placeholder="Internal notes — preferences, do-not-book talent, special pricing." />
      </Section>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// "Needs attention", workflow, filtered work views
// ════════════════════════════════════════════════════════════════════

function TodayPulseDrawer() {
  const { state, closeDrawer, openDrawer } = useProto();
  const inquiries = getInquiries(state.plan);
  const items = [
    ...inquiries
      .filter((i) => i.stage === "awaiting-client")
      .map((i) => ({
        id: i.id,
        title: `${i.client} · waiting on confirmation`,
        sub: `${i.brief} · sent ${i.ageDays}d ago`,
        tone: "amber" as const,
        action: () => openDrawer("inquiry-peek", { id: i.id }),
      })),
    ...inquiries
      .filter((i) => i.stage === "draft" || i.stage === "hold")
      .map((i) => ({
        id: i.id,
        title: `${i.client} · ${i.stage === "draft" ? "draft never sent" : "on hold"}`,
        sub: i.brief,
        tone: "dim" as const,
        action: () => openDrawer("inquiry-peek", { id: i.id }),
      })),
  ];

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Needs attention"
      description="What needs you, ranked by what's been waiting longest."
      width={560}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.length === 0 && (
          <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted }}>
            All clear. Nothing waiting.
          </div>
        )}
        {items.map((it) => (
          <button
            key={`${it.id}-${it.title}`}
            onClick={it.action}
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              padding: 12,
              cursor: "pointer",
              fontFamily: FONTS.body,
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: 12,
              transition: "border-color .12s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(11,11,13,0.18)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.borderSoft)}
          >
            <StatDot tone={it.tone} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{it.title}</div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>{it.sub}</div>
            </div>
            <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
          </button>
        ))}
      </div>
    </DrawerShell>
  );
}

function PipelineDrawer() {
  const { state, closeDrawer, openDrawer } = useProto();
  const inquiries = getInquiries(state.plan);
  const cols: { id: string; label: string; stages: string[]; tone: "dim" | "amber" | "green" }[] = [
    { id: "drafts", label: "Drafts & holds", stages: ["draft", "hold"], tone: "dim" },
    { id: "awaiting", label: "Awaiting client", stages: ["awaiting-client"], tone: "amber" },
    { id: "confirmed", label: "Confirmed", stages: ["confirmed"], tone: "green" },
  ];
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Pipeline"
      description="Where every inquiry is right now."
      width={620}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {cols.map((col) => {
          const items = inquiries.filter((i) => col.stages.includes(i.stage));
          return (
            <section key={col.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <StatDot tone={col.tone} />
                <CapsLabel>{col.label}</CapsLabel>
                <span style={{ fontFamily: FONTS.body, fontSize: 11, color: COLORS.inkDim }}>
                  · {items.length}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.map((iq) => (
                  <button
                    key={iq.id}
                    onClick={() => openDrawer("inquiry-peek", { id: iq.id })}
                    style={{
                      background: "#fff",
                      border: `1px solid ${COLORS.borderSoft}`,
                      borderRadius: 9,
                      padding: "10px 12px",
                      cursor: "pointer",
                      fontFamily: FONTS.body,
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>{iq.client}</div>
                      <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>{iq.brief}</div>
                    </div>
                    {iq.amount && (
                      <span style={{ fontSize: 12, color: COLORS.inkMuted, fontWeight: 500 }}>
                        {iq.amount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </DrawerShell>
  );
}

function PipelineFilterDrawer({ filter }: { filter: "drafts" | "awaiting" | "confirmed" | "archived" }) {
  const { state, closeDrawer, openDrawer } = useProto();
  const meta = {
    drafts: { title: "Drafts & holds", desc: "Inquiries you started but haven't sent.", stages: ["draft", "hold"] },
    awaiting: { title: "Awaiting client", desc: "Offers sent — waiting on confirmation.", stages: ["awaiting-client"] },
    confirmed: { title: "Confirmed bookings", desc: "Booked. Calendar locked.", stages: ["confirmed"] },
    archived: { title: "Archived", desc: "Past or canceled work.", stages: ["archived"] },
  }[filter];
  const items = getInquiries(state.plan).filter((i) => meta.stages.includes(i.stage));

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={meta.title}
      description={meta.desc}
      width={560}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.length === 0 ? (
          <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted }}>
            Nothing here yet.
          </div>
        ) : items.map((iq) => (
          <button
            key={iq.id}
            onClick={() => openDrawer("inquiry-peek", { id: iq.id })}
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              padding: 12,
              cursor: "pointer",
              fontFamily: FONTS.body,
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{iq.client}</div>
            <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{iq.brief}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <StageBadgeMini stage={iq.stage} />
              {iq.amount && (
                <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>{iq.amount}</span>
              )}
              {iq.date && (
                <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>· {iq.date}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Notifications & activity feeds
// ════════════════════════════════════════════════════════════════════

function NotificationsDrawer() {
  const { closeDrawer, openDrawer } = useProto();
  const items = [
    { id: "n1", icon: "mail", title: "Vogue Italia replied to your offer", sub: "“Love it. Can we lock dates?”", when: "22m ago", drawer: "inquiry-peek", payload: { id: "iq1" } },
    { id: "n2", icon: "user", title: "Lina Park submitted profile changes", sub: "Awaiting your approval.", when: "1h ago", drawer: "talent-profile", payload: { id: "t4" } },
    { id: "n3", icon: "calendar", title: "Bvlgari booking starts Thursday", sub: "Kai Lin · €8,200", when: "3h ago", drawer: "inquiry-peek", payload: { id: "iq6" } },
    { id: "n4", icon: "team", title: "Andrés Lopez accepted invite", sub: "Now an editor on your team.", when: "1d ago", drawer: "team", payload: undefined },
  ];
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Notifications"
      description="Everything that happened recently across your workspace."
      footer={
        <>
          <GhostButton onClick={closeDrawer}>Mark all read</GhostButton>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((n) => (
          <button
            key={n.id}
            onClick={() => openDrawer(n.drawer as DrawerId, n.payload as any)}
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              padding: 12,
              cursor: "pointer",
              fontFamily: FONTS.body,
              textAlign: "left",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <IconChip size={28}>
              <Icon name={n.icon as any} size={13} stroke={1.7} />
            </IconChip>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{n.title}</div>
              <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2, lineHeight: 1.5 }}>
                {n.sub}
              </div>
              <div style={{ fontSize: 11, color: COLORS.inkDim, marginTop: 4 }}>{n.when}</div>
            </div>
          </button>
        ))}
      </div>
    </DrawerShell>
  );
}

function ActivityFeedDrawer({ kind }: { kind: "team" | "talent" }) {
  const { closeDrawer } = useProto();
  const teamItems = [
    { who: "Sara Bianchi", what: "sent an offer to Vogue Italia", when: "1h ago" },
    { who: "Daniel Ferrer", what: "added Tomás Navarro to the roster", when: "3h ago" },
    { who: "You", what: "approved Lina Park's profile changes", when: "yesterday" },
    { who: "Andrés Lopez", what: "joined the team as Editor", when: "yesterday" },
    { who: "Mira Soto", what: "reviewed the Pages section", when: "2d ago" },
  ];
  const talentItems = [
    { who: "Lina Park", what: "submitted profile changes for review", when: "1h ago" },
    { who: "Kai Lin", what: "accepted booking with Bvlgari", when: "3h ago" },
    { who: "Marta Reyes", what: "updated her travel availability", when: "yesterday" },
  ];
  const items = kind === "team" ? teamItems : talentItems;

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={kind === "team" ? "Team activity" : "Talent activity"}
      description={kind === "team" ? "What teammates and clients did recently." : "Updates from talent on your roster."}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((it, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: "10px 0",
              borderBottom: idx < items.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none",
            }}
          >
            <Avatar initials={it.who.split(" ").map(w => w[0]).slice(0, 2).join("")} size={28} />
            <div style={{ flex: 1, fontFamily: FONTS.body, fontSize: 13 }}>
              <span style={{ color: COLORS.ink, fontWeight: 600 }}>{it.who}</span>{" "}
              <span style={{ color: COLORS.inkMuted }}>{it.what}</span>
              <div style={{ fontSize: 11, color: COLORS.inkDim, marginTop: 2 }}>{it.when}</div>
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Site-related drawers (lighter content but real-feeling)
// ════════════════════════════════════════════════════════════════════

function PagesDrawer() {
  const { closeDrawer } = useProto();
  const pages = [
    { id: "p1", title: "Home", status: "published", updated: "2d ago" },
    { id: "p2", title: "Roster", status: "published", updated: "5d ago" },
    { id: "p3", title: "About us", status: "published", updated: "1mo ago" },
    { id: "p4", title: "Contact", status: "published", updated: "2mo ago" },
    { id: "p5", title: "Press kit", status: "draft", updated: "1d ago" },
  ];
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Pages"
      description="Static pages that complement your roster."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="plus" size={12} stroke={2} />
              New page
            </span>
          </PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {pages.map((p) => (
          <button
            key={p.id}
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              padding: "12px 14px",
              cursor: "pointer",
              fontFamily: FONTS.body,
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{p.title}</div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>
                /{p.title.toLowerCase().replace(/\s/g, "-")} · updated {p.updated}
              </div>
            </div>
            <StateChipMini label={p.status} tone={p.status === "published" ? "green" : "dim"} />
          </button>
        ))}
      </div>
    </DrawerShell>
  );
}

function PostsDrawer() {
  const { closeDrawer } = useProto();
  const posts = [
    { title: "Spring 2026 — what's moving", status: "published", at: "3d ago" },
    { title: "BTS · Vogue Italia editorial", status: "published", at: "1w ago" },
    { title: "Welcoming Tomás Navarro", status: "published", at: "2w ago" },
    { title: "Rate cards explained", status: "published", at: "1mo ago" },
    { title: "Press kit refresh", status: "draft", at: "2d ago" },
  ];
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Posts"
      description="Editorial features, news, behind-the-scenes."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="plus" size={12} stroke={2} />
              New post
            </span>
          </PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {posts.map((p, idx) => (
          <div
            key={idx}
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              padding: 12,
              fontFamily: FONTS.body,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{p.title}</div>
              <StateChipMini label={p.status} tone={p.status === "published" ? "green" : "dim"} />
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>{p.at}</div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

function NavigationDrawer() {
  const { closeDrawer } = useProto();
  const onSave = useSaveAndClose("Navigation saved");
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Navigation & footer"
      description="Header structure and footer columns."
      footer={<StandardFooter onSave={onSave} />}
    >
      <Section title="Header — 5 items">
        <ReorderList items={["Roster", "About", "Editorial", "Press", "Contact"]} />
      </Section>
      <Section title="Footer — 3 columns">
        <FieldRow label="Column 1 title">
          <TextInput defaultValue="Agency" />
        </FieldRow>
        <FieldRow label="Column 2 title">
          <TextInput defaultValue="Talent" />
        </FieldRow>
        <FieldRow label="Column 3 title">
          <TextInput defaultValue="Get in touch" />
        </FieldRow>
      </Section>
    </DrawerShell>
  );
}

function ReorderList({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
          <span style={{ color: COLORS.inkDim, cursor: "grab", fontSize: 14 }}>⋮⋮</span>
          <span style={{ color: COLORS.inkMuted, fontSize: 11.5, minWidth: 16 }}>{idx + 1}</span>
          <span style={{ flex: 1 }}>{it}</span>
          <Icon name="external" size={11} color={COLORS.inkDim} />
        </div>
      ))}
    </div>
  );
}

function MediaDrawer() {
  const { closeDrawer } = useProto();
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Media library"
      description="Photos and videos. Drag-drop or upload."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>Upload</PrimaryButton>
        </>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {["🌸", "🌊", "🍃", "🌷", "🌿", "🌲", "🌹", "🌼", "🌻"].map((e, i) => (
          <div
            key={i}
            style={{
              aspectRatio: "1",
              background: COLORS.surfaceAlt,
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
            }}
          >
            {e}
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

function TranslationsDrawer() {
  const { closeDrawer } = useProto();
  const onSave = useSaveAndClose("Languages saved");
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Translations"
      description="Run your storefront in multiple languages."
      footer={<StandardFooter onSave={onSave} />}
    >
      <Section title="Active languages">
        {[
          { code: "EN", name: "English", primary: true },
          { code: "ES", name: "Español", primary: false },
          { code: "IT", name: "Italiano", primary: false },
          { code: "FR", name: "Français", primary: false },
        ].map((l) => (
          <div
            key={l.code}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 8,
              fontFamily: FONTS.body,
            }}
          >
            <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.inkMuted, minWidth: 24 }}>
              {l.code}
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink, flex: 1 }}>
              {l.name}
            </span>
            {l.primary && <StateChipMini label="Primary" tone="green" />}
          </div>
        ))}
      </Section>
    </DrawerShell>
  );
}

function SeoDrawer() {
  const { closeDrawer } = useProto();
  const onSave = useSaveAndClose("SEO saved");
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="SEO & defaults"
      description="Meta tags, social previews, sitemap."
      footer={<StandardFooter onSave={onSave} />}
    >
      <Section title="Defaults">
        <FieldRow label="Site title">
          <TextInput defaultValue={`${TENANT.name} · Talent agency`} />
        </FieldRow>
        <FieldRow label="Description">
          <TextArea rows={2} defaultValue="A boutique agency representing editorial, runway, and commercial talent across Europe." />
        </FieldRow>
      </Section>
      <Section title="Open Graph image">
        <div
          style={{
            aspectRatio: "1.91",
            background: COLORS.surfaceAlt,
            borderRadius: 10,
            border: `1px solid ${COLORS.borderSoft}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONTS.display,
            fontSize: 28,
            color: COLORS.ink,
          }}
        >
          {TENANT.name}
        </div>
      </Section>
      <Section title="Sitemap">
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 8,
            padding: 12,
            fontFamily: FONTS.mono,
            fontSize: 11,
            color: COLORS.inkMuted,
            lineHeight: 1.7,
          }}
        >
          /sitemap.xml<br />
          {TENANT.domain}/sitemap.xml
        </div>
      </Section>
    </DrawerShell>
  );
}

function FieldCatalogDrawer() {
  const { closeDrawer } = useProto();
  const fields = [
    { name: "Height", type: "Text", on: "Talent", required: true },
    { name: "Eye color", type: "Select", on: "Talent", required: false },
    { name: "Niches", type: "Multi-select", on: "Talent", required: false },
    { name: "Brand tier", type: "Select", on: "Client", required: true },
    { name: "Region", type: "Select", on: "Client", required: false },
  ];
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Field catalog"
      description="Custom fields applied across talent and clients."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="plus" size={12} stroke={2} />
              Add field
            </span>
          </PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {fields.map((f, idx) => (
          <div
            key={idx}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 80px 50px",
              alignItems: "center",
              gap: 12,
              padding: 12,
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 8,
              fontFamily: FONTS.body,
              fontSize: 12.5,
            }}
          >
            <span style={{ fontWeight: 600, color: COLORS.ink }}>{f.name}</span>
            <span style={{ color: COLORS.inkMuted }}>{f.type}</span>
            <span style={{ color: COLORS.inkMuted }}>On: {f.on}</span>
            {f.required && <StateChipMini label="Required" tone="amber" />}
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

function TaxonomyDrawer() {
  const { closeDrawer } = useProto();
  const taxonomies = [
    { label: "Niches", values: ["Editorial", "Commercial", "Runway", "Showroom", "Lookbook"] },
    { label: "Categories", values: ["Female", "Male", "Non-binary"] },
    { label: "Regions", values: ["EU North", "EU South", "Iberia", "UK"] },
  ];
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Taxonomy"
      description="Tags and categories for filtering and segmentation."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      {taxonomies.map((tx) => (
        <Section key={tx.label} title={tx.label}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {tx.values.map((v) => (
              <span
                key={v}
                style={{
                  background: "#fff",
                  border: `1px solid ${COLORS.borderSoft}`,
                  padding: "5px 10px",
                  borderRadius: 999,
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  color: COLORS.ink,
                  fontWeight: 500,
                }}
              >
                {v}
              </span>
            ))}
            <button
              style={{
                background: "transparent",
                border: `1px dashed ${COLORS.border}`,
                padding: "5px 10px",
                borderRadius: 999,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                color: COLORS.inkMuted,
                cursor: "pointer",
              }}
            >
              + Add
            </button>
          </div>
        </Section>
      ))}
    </DrawerShell>
  );
}

function WidgetsDrawer() {
  const { closeDrawer } = useProto();
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Embeddable widgets"
      description="Drop your roster into any site."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <Section title="Active embeds">
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
            Roster grid
          </div>
          <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
            Used on acme-models.com/talent
          </div>
        </div>
      </Section>
      <Section title="Embed code">
        <div
          style={{
            background: "#15151A",
            color: "#9DD9C7",
            padding: 12,
            borderRadius: 8,
            fontFamily: FONTS.mono,
            fontSize: 11,
            lineHeight: 1.7,
            overflowX: "auto",
            whiteSpace: "pre",
          }}
        >
{`<script src="https://embed.tulala.app/v1/widget.js"
  data-tenant="${TENANT.slug}"
  data-view="grid"
  data-cols="3"></script>`}
        </div>
      </Section>
    </DrawerShell>
  );
}

function ApiKeysDrawer() {
  const { closeDrawer } = useProto();
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="API keys"
      description="Read your roster from your own app."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>Generate key</PrimaryButton>
        </>
      }
    >
      <Section title="Active keys">
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            padding: 12,
            fontFamily: FONTS.mono,
            fontSize: 11.5,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: COLORS.ink }}>tul_pk_••••••••••a91f</span>
            <StateChipMini label="Read only" tone="green" />
          </div>
          <div style={{ fontSize: 10.5, color: COLORS.inkMuted, marginTop: 4, fontFamily: FONTS.body }}>
            Used 184× in last 7 days
          </div>
        </div>
      </Section>
    </DrawerShell>
  );
}

function SiteHealthDrawer() {
  const { closeDrawer } = useProto();
  const checks = [
    { label: "Lighthouse score", value: "94", tone: "green" as const },
    { label: "Image optimization", value: "All optimized", tone: "green" as const },
    { label: "Broken links", value: "0", tone: "green" as const },
    { label: "SSL", value: "Valid · auto-renew", tone: "green" as const },
    { label: "Sitemap", value: "Generated 2h ago", tone: "green" as const },
  ];
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Site health"
      description="Lighthouse, broken links, image optimization."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <Section title="Latest report">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {checks.map((c) => (
            <div
              key={c.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 8,
                fontFamily: FONTS.body,
              }}
            >
              <StatDot tone={c.tone} />
              <span style={{ flex: 1, fontSize: 12.5, color: COLORS.ink, fontWeight: 500 }}>
                {c.label}
              </span>
              <span style={{ fontSize: 12, color: COLORS.inkMuted }}>{c.value}</span>
            </div>
          ))}
        </div>
      </Section>
    </DrawerShell>
  );
}

function StorefrontVisibilityDrawer() {
  const { state, closeDrawer } = useProto();
  const onSave = useSaveAndClose("Visibility saved");
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Storefront visibility"
      description="What's public on your storefront — and what shows up in Tulala discovery."
      footer={<StandardFooter onSave={onSave} />}
    >
      <Section title="Public storefront">
        <ToggleRow label="Show roster grid" defaultOn />
        <ToggleRow label="Show client logos" defaultOn={state.plan !== "free"} />
        <ToggleRow label="Show editorial posts" defaultOn={state.plan === "agency" || state.plan === "network"} />
        <ToggleRow label="Allow direct inquiries" defaultOn />
      </Section>
      <Section title="Tulala discovery" description="On Free, you appear in our public talent directory. Studio and up are private by default.">
        <ToggleRow label="Listed in Tulala directory" defaultOn={state.plan === "free"} />
        <ToggleRow label="Featured rotation eligible" defaultOn={state.plan === "free"} />
      </Section>
    </DrawerShell>
  );
}

function HubDistributionDrawer() {
  const { state, closeDrawer, openUpgrade } = useProto();
  const isUnlocked = meetsPlan(state.plan, "network");
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Hub distribution"
      description={isUnlocked ? "Push talent to discovery across all your brands." : "Available on Network."}
      footer={
        isUnlocked ? (
          <PrimaryButton onClick={closeDrawer}>Save</PrimaryButton>
        ) : (
          <PrimaryButton
            onClick={() =>
              openUpgrade({
                feature: "Hub distribution",
                why: "Push talent to discovery across all your agency brands at once.",
                requiredPlan: "network",
              })
            }
          >
            Upgrade to Network
          </PrimaryButton>
        )
      }
    >
      {isUnlocked ? (
        <Section title="Connected brands">
          <ToggleRow label="Acme Models · Madrid" defaultOn />
          <ToggleRow label="Acme Models · Paris" defaultOn />
          <ToggleRow label="Acme Editorial" defaultOn={false} />
        </Section>
      ) : (
        <Section title="What this unlocks">
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              "Run multiple agency brands as one operation",
              "Move roster across brands without losing history",
              "Hub-level analytics across all brands",
              "Cross-roster pool for shared talent",
            ].map((p) => (
              <li key={p} style={{ display: "flex", gap: 10, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink }}>
                <Icon name="check" size={14} stroke={2} color={COLORS.green} />
                {p}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </DrawerShell>
  );
}

function FilterConfigDrawer() {
  const { closeDrawer } = useProto();
  const onSave = useSaveAndClose("Filters saved");
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Filters"
      description="Narrow down what you see."
      footer={<StandardFooter onSave={onSave} saveLabel="Apply filters" />}
    >
      <Section title="Stage" framed>
        <ToggleRow label="Drafts" defaultOn />
        <ToggleRow label="Awaiting client" defaultOn />
        <ToggleRow label="Confirmed" defaultOn />
        <ToggleRow label="Archived" defaultOn={false} />
      </Section>
      <Section title="Talent" framed>
        <SelectInput options={["All talent", "Marta Reyes", "Kai Lin", "Tomás Navarro"]} />
      </Section>
      <Section title="Date range" framed>
        <SelectInput options={["Any time", "This week", "This month", "This quarter"]} />
      </Section>
    </DrawerShell>
  );
}

function DangerZoneDrawer() {
  const { closeDrawer, toast } = useProto();
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Danger zone"
      description="Irreversible actions. Be sure before you click."
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <Section title="Pause workspace" description="Take your storefront offline temporarily. Data is preserved.">
        <ConfirmTypedAction
          actionLabel="Pause workspace"
          confirmPhrase="pause"
          tone="amber"
          onConfirm={() => toast("Workspace paused")}
        />
      </Section>
      <Section title="Transfer ownership" description="Hand the workspace to another owner. You become an admin.">
        <ConfirmTypedAction
          actionLabel="Transfer ownership"
          confirmPhrase="transfer"
          tone="amber"
          onConfirm={() => toast("Transfer initiated")}
        />
      </Section>
      <Section title="Delete workspace" description="Permanent. Your roster, clients, and history are removed. We email you a final export.">
        <ConfirmTypedAction
          actionLabel="Delete workspace"
          confirmPhrase={TENANT.name}
          tone="red"
          onConfirm={() => toast("This is a prototype — nothing was deleted")}
        />
      </Section>
    </DrawerShell>
  );
}

/**
 * Two-step destructive-action confirm. Idle state shows the danger button.
 * Clicking it reveals an inline typed-name confirm: the user must type the
 * exact phrase before the action button enables. Cancel always available.
 *
 * Tone "amber" for reversible-but-significant actions (pause, transfer);
 * tone "red" for irreversible ones (delete).
 */
function ConfirmTypedAction({
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
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === confirmPhrase.toLowerCase();
  const palette =
    tone === "red"
      ? { fg: COLORS.red, bg: "rgba(176,48,58,0.06)", border: "rgba(176,48,58,0.30)", solid: COLORS.red }
      : { fg: "#3A4651", bg: "rgba(82,96,109,0.08)", border: "rgba(82,96,109,0.30)", solid: "#52606D" };

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
      <div style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, lineHeight: 1.5 }}>
        Type{" "}
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
        to confirm.
      </div>
      <TextInput
        autoFocus
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={confirmPhrase}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <SecondaryButton onClick={() => { setArmed(false); setTyped(""); }}>Cancel</SecondaryButton>
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

function SimpleStubDrawer({
  title,
  description,
  sections,
}: {
  title: string;
  description?: string;
  sections: { label: string; input: string }[];
}) {
  const { closeDrawer } = useProto();
  const onSave = useSaveAndClose("Saved");
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={title}
      description={description}
      footer={<StandardFooter onSave={onSave} />}
    >
      {sections.length === 0 ? (
        <p style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.55 }}>
          This drawer is part of the prototype skeleton — its detailed content lands in the next iteration.
        </p>
      ) : (
        sections.map((s) => (
          <FieldRow key={s.label} label={s.label}>
            <TextInput defaultValue={s.input} />
          </FieldRow>
        ))
      )}
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Upgrade modal
// ════════════════════════════════════════════════════════════════════

export function UpgradeModal() {
  const { state, closeUpgrade, setPlan, toast, openDrawer } = useProto();
  const offer = state.upgrade;
  if (!offer.open) return null;
  const requiredPlan = offer.requiredPlan ?? "studio";
  const meta = PLAN_META[requiredPlan];

  const unlocks = offer.unlocks ?? defaultUnlocks(requiredPlan);
  const usage = offer.currentUsage;
  const usagePct = usage ? Math.min(1, usage.current / Math.max(1, usage.cap)) : 0;
  const usageBlocking = usage ? usage.current >= usage.cap : false;

  const pricingNote =
    offer.pricingNote ??
    (requiredPlan === "network"
      ? "Tailored to your operation."
      : "14-day refund · Cancel any time · No card required to preview");

  return (
    <ModalShell open onClose={closeUpgrade} width={600}>
      <header
        style={{
          padding: "22px 24px 18px",
          background: COLORS.surfaceAlt,
          position: "relative",
          borderBottom: `1px solid rgba(15,79,62,0.16)`,
        }}
      >
        <button
          onClick={closeUpgrade}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 30,
            height: 30,
            borderRadius: 7,
            border: `1px solid ${COLORS.borderSoft}`,
            background: "#fff",
            color: COLORS.inkMuted,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="x" size={13} stroke={1.8} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <PlanChip plan={requiredPlan} variant="solid" />
          <CapsLabel color={COLORS.accentDeep} style={{ letterSpacing: 1.6 }}>
            {planPrice(requiredPlan)}
          </CapsLabel>
        </div>
        <h2
          style={{
            fontFamily: FONTS.display,
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: -0.5,
            color: COLORS.ink,
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {offer.feature ?? `Upgrade to ${meta.label}`}
        </h2>
        {(offer.outcome || offer.why) && (
          <p
            style={{
              fontFamily: FONTS.body,
              fontSize: 13.5,
              color: COLORS.inkMuted,
              margin: "6px 0 0",
              lineHeight: 1.55,
              maxWidth: 500,
            }}
          >
            {offer.outcome ?? offer.why}
          </p>
        )}
        {usage && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              background: "#fff",
              border: `1px solid ${usageBlocking ? "rgba(176,48,58,0.32)" : COLORS.borderSoft}`,
              borderRadius: 9,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, color: COLORS.ink }}>
                {usage.label}
              </span>
              <span
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12,
                  color: usageBlocking ? COLORS.red : COLORS.inkMuted,
                  fontWeight: usageBlocking ? 600 : 400,
                }}
              >
                {usage.current} / {usage.cap}
                {usageBlocking && " · at limit"}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "rgba(11,11,13,0.06)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${usagePct * 100}%`,
                  background: usageBlocking ? COLORS.red : COLORS.accent,
                  transition: "width .3s ease",
                }}
              />
            </div>
          </div>
        )}
      </header>

      <div style={{ padding: "18px 24px", overflowY: "auto" }}>
        <div style={{ marginBottom: 8 }}>
          <CapsLabel>What you'll unlock</CapsLabel>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {unlocks.map((u) => (
            <li
              key={u}
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
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: COLORS.accentSoft,
                  color: COLORS.accent,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="check" size={11} stroke={2.5} color={COLORS.accent} />
              </span>
              {u}
            </li>
          ))}
        </ul>

        <p
          style={{
            margin: "14px 0 0",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.inkMuted,
            lineHeight: 1.5,
          }}
        >
          {pricingNote}
        </p>
      </div>

      <footer
        style={{
          padding: "14px 24px",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
        }}
      >
        <GhostButton
          onClick={() => {
            closeUpgrade();
            openDrawer("plan-compare");
          }}
        >
          Compare plans
        </GhostButton>
        <SecondaryButton onClick={closeUpgrade}>Not now</SecondaryButton>
        {requiredPlan === "network" ? (
          <PrimaryButton
            onClick={() => {
              toast("We'll be in touch about Network");
              closeUpgrade();
            }}
          >
            Contact sales
          </PrimaryButton>
        ) : (
          <PrimaryButton
            onClick={() => {
              setPlan(requiredPlan);
              toast(`Welcome to ${meta.label} — fake upgrade applied`);
              closeUpgrade();
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Upgrade to {meta.label}
              <Icon name="arrow-right" size={12} stroke={1.8} />
            </span>
          </PrimaryButton>
        )}
      </footer>
    </ModalShell>
  );
}

function defaultUnlocks(plan: Plan): string[] {
  switch (plan) {
    case "studio":
      return ["Custom domain", "Private inquiries", "Owned client list", "Verified email-from"];
    case "agency":
      return ["Branded site design", "Custom fields", "Team & roles (up to 25)", "Translations", "Reports"];
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

function PlanCompareDrawer() {
  const { state, closeDrawer, openUpgrade, toast } = useProto();
  const open = state.drawer.drawerId === "plan-compare";
  const currentPlan = state.plan;
  // Tight grid: dimension column is fixed-narrow, plans share equally.
  // Capped table width keeps cells readable at any viewport.
  const gridTemplate = `180px repeat(${PLANS.length}, minmax(0, 1fr))`;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      width={920}
      defaultSize="half"
      title="Compare plans"
      description="Find the dimension you're outgrowing — that's your next upgrade."
      footer={
        <div
          data-tulala-plan-compare-footer
          style={{
            display: "grid",
            gridTemplateColumns: gridTemplate,
            gap: 0,
            width: "100%",
            alignItems: "center",
            maxWidth: 1040,
            margin: "0 auto",
          }}
        >
          <div style={{ fontSize: 11, color: COLORS.inkMuted }}>USD · ex tax</div>
          {PLANS.map((plan) => {
            const isCurrent = plan === currentPlan;
            const isLower = PLAN_META[plan].rank < PLAN_META[currentPlan].rank;
            return (
              <div key={plan} style={{ padding: "0 4px" }}>
                {isCurrent ? (
                  <SecondaryButton size="sm" onClick={closeDrawer}>Your plan</SecondaryButton>
                ) : isLower ? (
                  <GhostButton
                    size="sm"
                    onClick={() =>
                      toast(
                        `Downgrade to ${PLAN_META[plan].label} runs through support — we'll review your roster and active inquiries first.`,
                      )
                    }
                  >
                    Downgrade
                  </GhostButton>
                ) : (
                  <PrimaryButton
                    size="sm"
                    onClick={() => {
                      closeDrawer();
                      openUpgrade({
                        feature: `Upgrade to ${PLAN_META[plan].label}`,
                        why: PLAN_LADDER_HEADER[plan].idealFor,
                        requiredPlan: plan,
                      });
                    }}
                  >
                    Upgrade
                  </PrimaryButton>
                )}
              </div>
            );
          })}
        </div>
      }
    >
      {/* Cap the table width so cells stay readable on full-screen drawers
          (was sprawling across 1700px+ viewports). */}
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        {/* Sticky header row — drops the verbose intro and "ideal for"
            subtitle. Each plan column is just price + label. The whole
            "ideal for" / current-plan affordance moves into a hover tip
            on the plan label itself. */}
        <div
          data-tulala-plan-compare-header
          style={{
            position: "sticky",
            top: -20,
            zIndex: 2,
            margin: "-20px -22px 10px",
            padding: "20px 22px 0",
            background: COLORS.surface,
          }}
        >
          <div
            data-tulala-plan-compare-grid
            style={{
              display: "grid",
              gridTemplateColumns: gridTemplate,
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              overflow: "hidden",
              maxWidth: 1040,
              margin: "0 auto",
            }}
          >
            <div /> {/* leftmost empty cell — title goes nowhere; rows speak for themselves */}
            {PLANS.map((plan) => {
              const meta = PLAN_META[plan];
              const header = PLAN_LADDER_HEADER[plan];
              const isCurrent = plan === currentPlan;
              return (
                <div
                  key={plan}
                  style={{
                    padding: "12px 14px",
                    borderLeft: `1px solid ${COLORS.borderSoft}`,
                    background: isCurrent ? COLORS.accentSoft : "#fff",
                    position: "relative",
                  }}
                >
                  {isCurrent && (
                    <span
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 3,
                        background: COLORS.accent,
                      }}
                    />
                  )}
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: 0.4,
                      color: isCurrent ? COLORS.accentDeep : COLORS.inkMuted,
                      textTransform: "uppercase",
                    }}
                  >
                    {isCurrent ? "Current" : meta.label}
                    {/* Info icon → "ideal for" tooltip */}
                    <Popover content={header.idealFor}>
                      <span
                        aria-hidden
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 13,
                          height: 13,
                          borderRadius: "50%",
                          background: isCurrent ? "rgba(15,79,62,0.15)" : "rgba(11,11,13,0.06)",
                          color: isCurrent ? COLORS.accentDeep : COLORS.inkMuted,
                          fontSize: 9,
                          fontWeight: 700,
                          fontStyle: "italic",
                          fontFamily: "Georgia, serif",
                          cursor: "help",
                        }}
                      >
                        i
                      </span>
                    </Popover>
                  </div>
                  <div
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 20,
                      fontWeight: 600,
                      letterSpacing: -0.4,
                      color: isCurrent ? COLORS.accentDeep : COLORS.ink,
                      marginTop: 2,
                      lineHeight: 1.1,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {header.price}
                  </div>
                  {!isCurrent && (
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: COLORS.inkMuted,
                        marginTop: 2,
                      }}
                    >
                      {meta.label}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Comparison grid — dimension column is JUST the name + info icon.
            The "why" explainer (was inline 2-line subtitle) is now a hover
            tooltip on the icon. Cells are tight: 10px vertical padding. */}
        <div
          data-tulala-plan-compare-body
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            overflow: "hidden",
            fontFamily: FONTS.body,
          }}
        >
          {PLAN_LADDER.map((row, idx) => (
            <div
              key={row.dimension}
              data-tulala-plan-compare-grid
              style={{
                display: "grid",
                gridTemplateColumns: gridTemplate,
                borderTop: idx > 0 ? `1px solid ${COLORS.borderSoft}` : "none",
                alignItems: "stretch",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  background: "rgba(11,11,13,0.02)",
                  borderRight: `1px solid ${COLORS.borderSoft}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: COLORS.ink,
                    letterSpacing: -0.05,
                  }}
                >
                  {row.dimension}
                </span>
                <Popover content={row.why}>
                  <span
                    aria-hidden
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 13,
                      height: 13,
                      borderRadius: "50%",
                      background: "rgba(11,11,13,0.06)",
                      color: COLORS.inkMuted,
                      fontSize: 9,
                      fontWeight: 700,
                      fontStyle: "italic",
                      fontFamily: "Georgia, serif",
                      cursor: "help",
                    }}
                  >
                    i
                  </span>
                </Popover>
              </div>
              {PLANS.map((plan) => {
                const isCurrent = plan === currentPlan;
                return (
                  <div
                    key={plan}
                    style={{
                      padding: "10px 14px",
                      fontSize: 12.5,
                      fontWeight: isCurrent ? 500 : 400,
                      color: isCurrent ? COLORS.accentDeep : COLORS.ink,
                      borderLeft: `1px solid ${COLORS.borderSoft}`,
                      background: isCurrent ? COLORS.accentSoft : "transparent",
                      lineHeight: 1.45,
                    }}
                  >
                    {row.values[plan]}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Payments / payouts
// ════════════════════════════════════════════════════════════════════

/**
 * PaymentsSetupDrawer
 *
 * The workspace's default payout receiver — the agency-level Stripe-
 * connected account most bookings settle to. Coordinators can override
 * per-booking via PayoutReceiverPickerDrawer.
 *
 * Free plan shows a "no receiver yet" empty state and an upsell to set
 * up Stripe; paid plans show the connected bank with status + plan-fee
 * controls hint. Talent self-payout request is mentioned as Agency-tier
 * only per PLAN_FEE_META.
 */
function PaymentsSetupDrawer() {
  const { state, closeDrawer, openUpgrade } = useProto();
  const payout = getWorkspacePayout(state.plan);
  const fee = PLAN_FEE_META[state.plan];
  const onSave = useSaveAndClose("Default receiver saved");
  const isFree = state.plan === "free";
  const receiver = payout.defaultReceiver;
  const receiverMeta = PAYOUT_STATUS_META[receiver.status];

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Payments setup"
      description="Default payout receiver and platform-fee terms for this workspace."
      width={580}
      footer={
        isFree ? (
          <>
            <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
            <PrimaryButton
              onClick={() =>
                openUpgrade({
                  feature: "Connect a payout receiver",
                  why: "Free can run inquiries but cannot route payments. Studio unlocks card acceptance and direct payouts.",
                  requiredPlan: "studio",
                })
              }
            >
              Upgrade to accept payments
            </PrimaryButton>
          </>
        ) : (
          <StandardFooter onSave={onSave} saveLabel="Save" />
        )
      }
    >
      <Section
        title="Platform fee"
        description="What Tulala charges per booking that settles through the platform."
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
            <span style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 500, color: COLORS.ink }}>
              {fee.label}
            </span>
            <PlanChip plan={state.plan} variant="solid" />
          </div>
          <p style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, margin: "8px 0 0", lineHeight: 1.55 }}>
            {fee.controlsHint}
          </p>
        </div>
      </Section>

      <Section
        title="Default payout receiver"
        description="Used when no per-booking override is set. Coordinators can still pick a different receiver on individual bookings."
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
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>
              {receiver.displayName}
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
              {PAYOUT_RECEIVER_KIND_LABEL[receiver.kind]}
              {receiver.legalName ? ` · ${receiver.legalName}` : ""}
            </div>
          </div>
          <PayoutStatusChip status={receiver.status} />
        </div>
        <p style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
          {receiverMeta.hint}
        </p>
      </Section>

      {!isFree && (
        <Section title="Acceptance" description="What clients see at checkout.">
          <FieldRow label="Accept card payments">
            <StubToggle defaultOn={payout.acceptCards} />
          </FieldRow>
          <FieldRow label="Send receipts to client">
            <StubToggle defaultOn={true} />
          </FieldRow>
          <FieldRow label="Email payout confirmations">
            <StubToggle defaultOn={true} />
          </FieldRow>
        </Section>
      )}

      <Section title="30-day activity">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <MiniMetric label="Volume" value={payout.recentVolume30d} />
          <MiniMetric label="Pending" value={payout.pendingPayouts} />
        </div>
      </Section>
    </DrawerShell>
  );
}

function StubToggle({ defaultOn }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(!!defaultOn);
  return <Toggle on={on} onChange={setOn} />;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 11, color: COLORS.inkMuted, letterSpacing: 0.4, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, color: COLORS.ink, marginTop: 4 }}>
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
function PayoutReceiverPickerDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const payload = state.drawer.payload ?? {};
  const inquiryId = (payload as { inquiryId?: string }).inquiryId;
  const summary = inquiryId ? getPaymentSummary(inquiryId) : undefined;
  const [selectedKind, setSelectedKind] = useState<string | null>(
    summary?.receiver ? `${summary.receiver.kind}:${summary.receiver.displayName}` : null,
  );

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Pick payout receiver"
      description={
        summary
          ? `For ${summary.bookingId !== "—" ? summary.bookingId : inquiryId} · net ${summary.netPayout}`
          : "Select who legally receives this payout."
      }
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              toast(selectedKind ? "Receiver updated" : "No change");
              closeDrawer();
            }}
          >
            Save receiver
          </PrimaryButton>
        </>
      }
    >
      <Section
        title="Eligible candidates"
        description="Only verified, payout-connected entities can be selected. Pending or restricted accounts must finish setup first."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                  border: `1px solid ${isSelected ? COLORS.ink : COLORS.borderSoft}`,
                  borderRadius: 10,
                  cursor: eligible ? "pointer" : "not-allowed",
                  opacity: eligible ? 1 : 0.6,
                  textAlign: "left",
                  fontFamily: FONTS.body,
                  transition: "border-color .12s",
                }}
              >
                <Avatar initials={rec.initials} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>
                    {rec.displayName}
                  </div>
                  <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
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

      <Section title="Distribution">
        <p style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, margin: 0, lineHeight: 1.55 }}>
          Tulala pays the selected receiver in full. Splitting between
          agency, talent, and any third parties happens off-platform —
          handled by whoever you select.
        </p>
        {summary?.distributionNote && (
          <div
            style={{
              padding: "10px 12px",
              background: "rgba(11,11,13,0.03)",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              fontFamily: FONTS.body,
              fontSize: 12.5,
              color: COLORS.ink,
              lineHeight: 1.55,
            }}
          >
            <CapsLabel>Coordinator note</CapsLabel>
            <div style={{ marginTop: 4 }}>{summary.distributionNote}</div>
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
function PaymentDetailDrawer() {
  const { state, closeDrawer } = useProto();
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
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        </>
      }
    >
      <Section title="Status">
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <PaymentStatusChip status={row.status} />
            <span style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted }}>
              {row.date}
            </span>
          </div>
          <p style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, margin: 0, lineHeight: 1.55 }}>
            {statusMeta.description}
          </p>
        </div>
      </Section>

      <Section title="Breakdown">
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <BreakdownRow label="Client total" value={row.total} first />
          <BreakdownRow label="Platform fee" value={row.fee} muted />
          <BreakdownRow label="Net payout" value={row.netPayout} emphasis />
        </div>
        {summary?.paidVia && (
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.inkMuted,
              padding: "0 2px",
            }}
          >
            Paid via {summary.paidVia.brand} •• {summary.paidVia.last4}
          </div>
        )}
      </Section>

      <Section title="Receiver">
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>
                {summary.receiver.displayName}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                {PAYOUT_RECEIVER_KIND_LABEL[summary.receiver.kind]}
                {summary.receiver.legalName ? ` · ${summary.receiver.legalName}` : ""}
              </div>
            </div>
            <PayoutStatusChip status={summary.receiver.status} />
          </div>
        ) : (
          <div
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 12,
              padding: 12,
              fontFamily: FONTS.body,
              fontSize: 12.5,
              color: COLORS.ink,
            }}
          >
            {row.receiverName}
          </div>
        )}
        {summary?.downstreamNote && (
          <p style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, margin: 0, lineHeight: 1.5 }}>
            {summary.downstreamNote}
          </p>
        )}
      </Section>

      {summary?.history && summary.history.length > 0 && (
        <Section title="History">
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
                <span style={{ color: COLORS.inkMuted }}>{entry.ts}</span>
                <span style={{ color: COLORS.ink }}>{entry.label}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </DrawerShell>
  );
}

function BreakdownRow({
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
