"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { useT } from "@/i18n/use-t";
import { Icon, SecondaryCard } from "../primitives";
import { COLORS, FONTS, TRANSITION, useAdminShell } from "../state";
import { Grid, PageHeader } from "./pages-shared";


// ════════════════════════════════════════════════════════════════════
// OPERATIONS — Analytics + Workflow automation
// ════════════════════════════════════════════════════════════════════

// Tight section header for tool pages (Operations, Production) — colored
// dot + tight title row + description below. No huge accent bar / page
// breaks; everything is dense for fast scanning.
function PageSection({ tone, title, desc, children }: { tone: string; label?: string; title: string; desc: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 18 }}>
      <header className="mb-2.5">
        <div className="flex items-center gap-2">
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: tone, flexShrink: 0 }} />
          <h2 style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 700, margin: 0, letterSpacing: -0.1 }} className="text-admin-ink">{title}</h2>
          <span style={{ fontFamily: FONTS.body, fontSize: 12, marginLeft: 4 }} className="text-admin-ink-muted">{desc}</span>
        </div>
      </header>
      {children}
    </section>
  );
}

// Settings-style row used by Operations / Production pages. Same card
// shape as the SettingsAccordionItem header — but instead of toggling
// open, the click fires the provided onClick (opens a drawer).
function ToolRow({ tone, icon, title, desc, onClick }: { tone: string; icon: ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "12px 14px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        cursor: "pointer",
        fontFamily: FONTS.body,
        textAlign: "left",
        marginBottom: 6,
        transition: `border-color ${TRANSITION.sm}, transform ${TRANSITION.micro}, box-shadow ${TRANSITION.sm}, background ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.background = "rgba(11,11,13,0.015)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderSoft;
        e.currentTarget.style.background = "#fff";
      }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: `${tone}14`, color: tone,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3, letterSpacing: -0.05 }} className="text-admin-ink">{title}</div>
        <div style={{ fontSize: 12, marginTop: 2, lineHeight: 1.4 }} className="text-admin-ink-muted">{desc}</div>
      </div>
      {/* Right chevron — indicates "opens" rather than "expands" */}
      <span aria-hidden style={{ flexShrink: 0, color: COLORS.inkDim }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    </button>
  );
}

// Reusable inline icons — kept here so each ToolTile can use a distinct
// glyph without piping through Icon name unions.
const TI = {
  chart:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 12V8M6 12V4M10 12v-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  funnel:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 3h10l-3.5 4.5V12L5.5 11V7.5L2 3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  star:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5l1.5 3.4 3.7.4-2.8 2.5.8 3.6L7 9.7l-3.2 1.7.8-3.6L1.8 5.3l3.7-.4L7 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  team:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="10" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1.5 11.5c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5M9 11.5c0-1.5 1-2.5 2.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  list:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3.5h8M3 7h8M3 10.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  clock:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M7 4v3.5l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  bolt:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7.5 1.5L3 8h3.5l-1 4.5L11 6H7.5l1-4.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  reply:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 4L2 7l3 3M2 7h7c2 0 3 1 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  airplane: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l10-5-3 11-2-4-5-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  rotate:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11.5 4.5A5 5 0 102 8m9.5-3.5V2m0 2.5h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  mail:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="3" width="11" height="8" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M1.5 4l5.5 4 5.5-4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  flow:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.4"/><circle cx="11" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4.5 3H10c.5 0 1 .4 1 1v6.5" stroke="currentColor" strokeWidth="1.4"/></svg>,
  send:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7L12 2l-2.5 11-2-4.5L2 7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  gift:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="6" width="10" height="6.5" stroke="currentColor" strokeWidth="1.4"/><path d="M2 6h10M7 6v6.5M7 6c-1.5-2-4 0-1 1m1-1c1.5-2 4 0 1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  upload:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 9V2m0 0L4 5m3-3l3 3M2 11.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  swap:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5l-2-2 2-2M1 3h7c1.5 0 3 1 3 3M11 9l2 2-2 2M13 11H6c-1.5 0-3-1-3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  sparkle:  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v3M7 9v3M2 7h3M9 7h3M3.5 3.5l1.5 1.5M9 9l1.5 1.5M10.5 3.5L9 5M5 9l-1.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  toggle:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="4" width="11" height="6" rx="3" stroke="currentColor" strokeWidth="1.4"/><circle cx="9.5" cy="7" r="1.6" fill="currentColor"/></svg>,
  search:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.4"/><path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  callback: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11.5 9c0 2-2 3-4.5 3s-4.5-1-4.5-3M2.5 5c0-2 2-3 4.5-3s4.5 1 4.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  feed:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="2.5" cy="11" r="1.2" stroke="currentColor" strokeWidth="1.3"/><path d="M2.5 6.5a4.5 4.5 0 014.5 4.5M2.5 2a9 9 0 019 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  cal:      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="3" width="11" height="9" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M1.5 6h11M4.5 1.5v3M9.5 1.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  crew:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="4" cy="4.5" r="1.6" stroke="currentColor" strokeWidth="1.4"/><circle cx="10" cy="4.5" r="1.6" stroke="currentColor" strokeWidth="1.4"/><circle cx="7" cy="9.5" r="1.6" stroke="currentColor" strokeWidth="1.4"/></svg>,
  film:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="3" width="11" height="8" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M4.5 3v8M9.5 3v8M1.5 7h11" stroke="currentColor" strokeWidth="1.4"/></svg>,
  pin:      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 12.5C7 12.5 11 8.5 11 5.5a4 4 0 00-8 0c0 3 4 7 4 7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><circle cx="7" cy="5.5" r="1.3" stroke="currentColor" strokeWidth="1.4"/></svg>,
  brief:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="4" width="10" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M5 4V2.5h4V4M4 7h6M4 9.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  shield:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5l4.5 1.5v4c0 3-2 5-4.5 6-2.5-1-4.5-3-4.5-6V3L7 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  alert:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5l5.5 10H1.5L7 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M7 6v2.5M7 10v.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  scale:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5v11M3 5l-2 4h4l-2-4zM11 5l-2 4h4l-2-4zM2 12.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  guard:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="9.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M2 11.5c0-2 1-3 3-3s3 1 3 3M9.5 11.5c0-1.5 1-2 2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  approve:  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4.5 7L6 8.5l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

export function OperationsPage() {
  const t = useT();
  const { openDrawer, tenantSlug } = useAdminShell();
  const goFinancials = () => {
    if (typeof window !== "undefined" && tenantSlug) {
      window.location.href = `/${tenantSlug}/admin/financials`;
    }
  };

  return (
    <>
      <PageHeader
        title={t("dashboard.adminOperations.title")}
        subtitle={t("dashboard.adminOperations.subtitle")}
      />

      <div style={{ maxWidth: 760 }}>
        <PageSection tone={COLORS.indigo} title={t("dashboard.adminOperations.analyticsTitle")} desc={t("dashboard.adminOperations.analyticsDesc")}>
          <ToolRow tone={COLORS.indigo} icon={TI.chart}    title={t("dashboard.adminOperations.revenue")}           desc={t("dashboard.adminOperations.revenueDesc")} onClick={goFinancials} />
          <ToolRow tone={COLORS.indigo} icon={TI.funnel}   title={t("dashboard.adminOperations.conversionFunnel")} desc={t("dashboard.adminOperations.conversionFunnelDesc")}                onClick={() => openDrawer("conversion-funnel")} />
          <ToolRow tone={COLORS.indigo} icon={TI.star}     title={t("dashboard.adminOperations.topPerformers")}    desc={t("dashboard.adminOperations.topPerformersDesc")}                 onClick={() => openDrawer("top-performers")} />
          <ToolRow tone={COLORS.indigo} icon={TI.team}     title={t("dashboard.adminOperations.teamWorkload")}     desc={t("dashboard.adminOperations.teamWorkloadDesc")}            onClick={() => openDrawer("coordinator-workload")} />
          <ToolRow tone={COLORS.indigo} icon={TI.star}     title={t("dashboard.adminOperations.reportedReviews")}  desc={t("dashboard.adminOperations.reportedReviewsDesc")}         onClick={() => openDrawer("reviews-moderation")} />
        </PageSection>

        <PageSection tone={COLORS.accent} title={t("dashboard.adminOperations.workflowTitle")} desc={t("dashboard.adminOperations.workflowDesc")}>
          <ToolRow tone={COLORS.accent} icon={TI.list}     title={t("dashboard.adminOperations.myQueue")}          desc={t("dashboard.adminOperations.myQueueDesc")}           onClick={() => openDrawer("my-queue")} />
          <ToolRow tone={COLORS.accent} icon={TI.clock}    title={t("dashboard.adminOperations.slaTimers")}        desc={t("dashboard.adminOperations.slaTimersDesc")}           onClick={() => openDrawer("sla-timers")} />
          <ToolRow tone={COLORS.accent} icon={TI.bolt}     title={t("dashboard.adminOperations.automationRules")}  desc={t("dashboard.adminOperations.automationRulesDesc")}     onClick={() => openDrawer("rules-builder")} />
          <ToolRow tone={COLORS.accent} icon={TI.reply}    title={t("dashboard.adminOperations.savedReplies")}     desc={t("dashboard.adminOperations.savedRepliesDesc")}           onClick={() => openDrawer("saved-replies")} />
          <ToolRow tone={COLORS.accent} icon={TI.airplane} title={t("dashboard.adminOperations.vacationHandover")} desc={t("dashboard.adminOperations.vacationHandoverDesc")}               onClick={() => openDrawer("vacation-handover")} />
          <ToolRow tone={COLORS.accent} icon={TI.rotate}   title={t("dashboard.adminOperations.onCallRotation")}  desc={t("dashboard.adminOperations.onCallRotationDesc")}               onClick={() => openDrawer("on-call-rotation")} />
        </PageSection>

        <PageSection tone={COLORS.amber} title={t("dashboard.adminOperations.commsGrowthTitle")} desc={t("dashboard.adminOperations.commsGrowthDesc")}>
          <ToolRow tone={COLORS.amber}  icon={TI.mail}     title={t("dashboard.adminOperations.emailTemplates")}   desc={t("dashboard.adminOperations.emailTemplatesDesc")}                onClick={() => openDrawer("email-templates")} />
          <ToolRow tone={COLORS.amber}  icon={TI.flow}     title={t("dashboard.adminOperations.emailSequences")}   desc={t("dashboard.adminOperations.emailSequencesDesc")}                     onClick={() => openDrawer("email-sequences")} />
          <ToolRow tone={COLORS.amber}  icon={TI.send}     title={t("dashboard.adminOperations.inviteFlow")}       desc={t("dashboard.adminOperations.inviteFlowDesc")}                 onClick={() => openDrawer("invite-flow")} />
          <ToolRow tone={COLORS.amber}  icon={TI.gift}     title={t("dashboard.adminOperations.referrals")}         desc={t("dashboard.adminOperations.referralsDesc")}           onClick={() => openDrawer("referral-dashboard")} />
        </PageSection>

        <PageSection tone={COLORS.royal} title={t("dashboard.adminOperations.adminToolsTitle")} desc={t("dashboard.adminOperations.adminToolsDesc")}>
          <ToolRow tone={COLORS.royal}  icon={TI.upload}   title={t("dashboard.adminOperations.csvImport")}          desc={t("dashboard.adminOperations.csvImportDesc")}          onClick={() => openDrawer("csv-import", { type: "talent" })} />
          <ToolRow tone={COLORS.royal}  icon={TI.swap}     title={t("dashboard.adminOperations.migrationAssistant")} desc={t("dashboard.adminOperations.migrationAssistantDesc")}              onClick={() => openDrawer("migration-assistant")} />
          <ToolRow tone={COLORS.royal}  icon={TI.sparkle}  title={t("dashboard.adminOperations.aiWorkspace")}        desc={t("dashboard.adminOperations.aiWorkspaceDesc")}            onClick={() => openDrawer("ai-workspace")} />
          <ToolRow tone={COLORS.royal}  icon={TI.toggle}   title={t("dashboard.adminOperations.featureControls")}    desc={t("dashboard.adminOperations.featureControlsDesc")}    onClick={() => openDrawer("feature-controls")} />
        </PageSection>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// PRODUCTION — Casting · Crew · On-set · Rights · Safety
// ════════════════════════════════════════════════════════════════════

export function ProductionPage() {
  const t = useT();
  const { openDrawer } = useAdminShell();

  return (
    <>
      <PageHeader
        title={t("dashboard.adminOperations.productionTitle")}
        subtitle={t("dashboard.adminOperations.productionSubtitle")}
      />

      <PageSection tone={COLORS.coral} label="01" title={t("dashboard.adminOperations.castingTitle")} desc={t("dashboard.adminOperations.castingDesc")}>
        <Grid cols="4">
          <SecondaryCard title={t("dashboard.adminOperations.castingFlow")} description={t("dashboard.adminOperations.castingFlowDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("casting-flow")} />
          <SecondaryCard title={t("dashboard.adminOperations.callbackTracker")} description={t("dashboard.adminOperations.callbackTrackerDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("callback-tracker")} />
          <SecondaryCard title={t("dashboard.adminOperations.discoveryFeed")} description={t("dashboard.adminOperations.discoveryFeedDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("discovery-feed")} />
          <SecondaryCard title={t("dashboard.adminOperations.availabilitySearch")} description={t("dashboard.adminOperations.availabilitySearchDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("avail-search")} />
        </Grid>
      </PageSection>

      <PageSection tone={COLORS.accent} label="02" title={t("dashboard.adminOperations.crewShootTitle")} desc={t("dashboard.adminOperations.crewShootDesc")}>
        <Grid cols="4">
          <SecondaryCard title={t("dashboard.adminOperations.crewBooking")} description={t("dashboard.adminOperations.crewBookingDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("crew-booking")} />
          <SecondaryCard title={t("dashboard.adminOperations.productionTimeline")} description={t("dashboard.adminOperations.productionTimelineDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("production-timeline")} />
          <SecondaryCard title={t("dashboard.adminOperations.callSheet")} description={t("dashboard.adminOperations.callSheetDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("call-sheet")} />
          <SecondaryCard title={t("dashboard.adminOperations.onsetCheckin")} description={t("dashboard.adminOperations.onsetCheckinDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("onset-checkin")} />
        </Grid>
        <div className="mt-2">
          <Grid cols="3">
            <SecondaryCard title={t("dashboard.adminOperations.locations")} description={t("dashboard.adminOperations.locationsDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("locations-drawer")} />
            <SecondaryCard title={t("dashboard.adminOperations.briefBuilder")} description={t("dashboard.adminOperations.briefBuilderDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("brief-builder")} />
            <SecondaryCard title={t("dashboard.adminOperations.brandAssets")} description={t("dashboard.adminOperations.brandAssetsDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("brand-assets")} />
          </Grid>
        </div>
      </PageSection>

      <PageSection tone={COLORS.amber} label="03" title={t("dashboard.adminOperations.rightsSafetyTitle")} desc={t("dashboard.adminOperations.rightsSafetyDesc")}>
        <Grid cols="4">
          <SecondaryCard title={t("dashboard.adminOperations.usageTracker")} description={t("dashboard.adminOperations.usageTrackerDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("usage-tracker")} />
          <SecondaryCard title={t("dashboard.adminOperations.relicence")} description={t("dashboard.adminOperations.relicenceDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("relicense-flow")} />
          <SecondaryCard title={t("dashboard.adminOperations.incidentReports")} description={t("dashboard.adminOperations.incidentReportsDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("incident-report")} />
          <SecondaryCard title={t("dashboard.adminOperations.disputes")} description={t("dashboard.adminOperations.disputesDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("dispute-resolution")} />
        </Grid>
      </PageSection>

      <PageSection tone={COLORS.indigo} label="04" title={t("dashboard.adminOperations.accountLifecycleTitle")} desc={t("dashboard.adminOperations.accountLifecycleDesc")}>
        <Grid cols="3">
          <SecondaryCard title={t("dashboard.adminOperations.ownershipTransfer")} description={t("dashboard.adminOperations.ownershipTransferDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("ownership-transfer")} />
          <SecondaryCard title={t("dashboard.adminOperations.minorAccount")} description={t("dashboard.adminOperations.minorAccountDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("minor-account")} />
          <SecondaryCard title={t("dashboard.adminOperations.approvalFlow")} description={t("dashboard.adminOperations.approvalFlowDesc")} affordance={t("dashboard.adminOperations.affordanceOpen")} onClick={() => openDrawer("approval-flow")} />
        </Grid>
      </PageSection>
    </>
  );
}
