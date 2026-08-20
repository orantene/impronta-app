"use client";

/* eslint-disable ratchet/no-new-inline-style, max-lines, react/no-unescaped-entities -- Legacy admin overview prototype styling is outside the Services sync QA path; keep lint unblocked until the design-token codemod owns this surface. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";
import { ActivityFeedItem, Affordance, Bullet, CompactLockedCard, GhostButton, Icon, MoreWithSection, PrimaryButton, PrimaryCard, SecondaryCard, StarterCard, StatDot, StatusCard } from "../primitives";
import { ACTIVATION_TASKS, COLORS, FONTS, RADIUS, RICH_INQUIRIES, TRANSITION, formatRecentActivity, getInquiries, getRoster, getTeam, meetsRole, useAdminShell } from "../state";

// Time-aware greeting key for the overview header. Mirrors the hour buckets
// of the shared English greeting helper, but maps them to a localized catalog
// key so the header greets staff in their chosen language.
function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 12) return "dashboard.adminOverview.greetingMorning";
  if (h < 17) return "dashboard.adminOverview.greetingAfternoon";
  return "dashboard.adminOverview.greetingEvening";
}

// Localized labels for the free-plan activation checklist. The shared
// ACTIVATION_TASKS fixture keeps its English `label`/`hint`/`est` for
// non-localized consumers; these maps resolve the same rows to catalog
// keys, keyed by the stable task id (additive enum-map pattern).
const ACTIVATION_LABEL_KEY: Record<string, string> = {
  "add-talent": "dashboard.adminOverview.taskAddTalentLabel",
  publish: "dashboard.adminOverview.taskPublishLabel",
  "share-url": "dashboard.adminOverview.taskShareUrlLabel",
  "try-inquiry": "dashboard.adminOverview.taskTryInquiryLabel",
  "invite-team": "dashboard.adminOverview.taskInviteTeamLabel",
};
const ACTIVATION_HINT_KEY: Record<string, string> = {
  "add-talent": "dashboard.adminOverview.taskAddTalentHint",
  publish: "dashboard.adminOverview.taskPublishHint",
  "share-url": "dashboard.adminOverview.taskShareUrlHint",
  "try-inquiry": "dashboard.adminOverview.taskTryInquiryHint",
  "invite-team": "dashboard.adminOverview.taskInviteTeamHint",
};
const ACTIVATION_EST_KEY: Record<string, string> = {
  "add-talent": "dashboard.adminOverview.est2min",
  publish: "dashboard.adminOverview.est30sec",
  "share-url": "dashboard.adminOverview.est15sec",
  "try-inquiry": "dashboard.adminOverview.est3min",
  "invite-team": "dashboard.adminOverview.est1min",
};
import { DemoDataBanner, WorkspaceActivationBanner } from "../wave2";
import { FreeValuePanel } from "./WorkPage";
import { Grid, PageHeader, WorkspaceStatStrip } from "./pages-shared";


export function OverviewPage() {
  const {
    state,
    openDrawer,
    openUpgrade,
    completeTask,
    toast,
    overviewMetrics,
    effectiveMessagesInquiries,
    effectiveRoster,
    bridgeSessionIdentity,
    bridgeTenantIdentity,
    bridgeRecentActivity,
    effectiveTenant,
    tenantSlug,
    adminBasePath,
  } = useAdminShell();
  const t = useT();
  const goFinancials = () => {
    if (typeof window !== "undefined" && tenantSlug) {
      window.location.href = `${adminBasePath}/financials`;
    }
  };
  const isFree = state.plan === "free";
  const canEdit = meetsRole(state.role, "editor");
  const tenantDomain = bridgeTenantIdentity?.slug
    ? `${bridgeTenantIdentity.slug}.tulala.digital`
    : effectiveTenant.domain;

  // Real workspace activity from inquiry_events (via the bridge). Empty array
  // = no events yet → honest empty state. No mock fallback.
  const realActivity = useMemo(
    () => (bridgeRecentActivity ?? []).map((it) => formatRecentActivity(it)),
    [bridgeRecentActivity],
  );

  if (isFree) {
    return <OverviewFree />;
  }

  // Phase 1 / Phase 2 — Master plan: NO mock fallback in workspace mode.
  // When the bridge provides a real inquiry list (even an empty one), use it
  // and render the real empty state. The earlier `length > 0 ? real : MOCK`
  // pattern lied to operators when their tenant had zero inquiries.
  // Standalone dev mode still gets RICH_INQUIRIES because the upstream
  // effectiveMessagesInquiries already falls back to it when the
  // bridge wasn't populated by a workspace layout.
  const richInqs = effectiveMessagesInquiries;
  // Open inquiry count: prefer the pre-aggregated bridge metric over re-deriving.
  const openInquiryCount = overviewMetrics?.openInquiries ?? richInqs.filter((i) =>
    i.stage === "submitted" || i.stage === "coordination" || i.stage === "offer_pending" || i.stage === "approved"
  ).length;
  const draftCount = overviewMetrics?.draftInquiryCount ?? richInqs.filter((i) => i.stage === "draft").length;
  const awaiting = richInqs.filter((i) => i.nextActionBy === "client");
  const confirmedThisWeek = richInqs.filter(
    (i) => i.stage === "booked" || i.stage === "approved",
  );

  // ── "Needs you now" — the single action surface, from REAL server counts ──
  // No mock fallback: overviewMetrics is null only in standalone dev (no
  // workspace layout), in which case the buckets read 0 honestly. Four
  // mutually-exclusive cohorts the agency owes action on; "waiting on client"
  // is deliberately NOT here — that's the client's move, surfaced separately.
  const unassignedCount = overviewMetrics?.unassignedOpenCount ?? 0;
  const yourReplyCount = overviewMetrics?.agencyActionCount ?? 0;
  const readyToBookCount = overviewMetrics?.readyToBookCount ?? 0;
  const needsYouTotal = unassignedCount + yourReplyCount + readyToBookCount + draftCount;
  const awaitingClientCount = overviewMetrics?.awaitingClientCount ?? awaiting.length;
  const needsYouBuckets = [
    { key: "unassigned", n: unassignedCount, label: t("dashboard.adminOverview.bucketNeedsCoordinator") },
    { key: "reply", n: yourReplyCount, label: t("dashboard.adminOverview.bucketAwaitingReply") },
    { key: "ready", n: readyToBookCount, label: t("dashboard.adminOverview.bucketReadyToBook") },
    { key: "drafts", n: draftCount, label: t("dashboard.adminOverview.bucketToSend") },
  ].filter((b) => b.n > 0);

  return (
    <>
      <PageHeader
        title={(() => {
          // Greeting uses the real signed-in user from bridge identity; with
          // no identity (standalone dev) it falls back to a neutral "there".
          const realFirst = (() => {
            if (!bridgeSessionIdentity) return null;
            const dn = bridgeSessionIdentity.displayName?.trim();
            if (dn) return dn.split(/\s+/u)[0];
            const email = bridgeSessionIdentity.email;
            if (email) return email.split("@")[0]?.split(/[.\-_]/u)[0] ?? null;
            return null;
          })();
          return interpolate(t(greetingKey()), { name: realFirst ?? t("dashboard.adminOverview.greetingFallbackName") });
        })()}
        subtitle={new Date().toLocaleDateString(t("dashboard.adminOverview.dateLocale"), { weekday: "long", month: "long", day: "numeric" })}
        actions={
          <>
            {/* De-dup audit: the "Recent activity" header button was the
                FIRST of three controls on this page opening the same
                team-activity drawer (card + section "View all" were the
                others) while the feed itself renders inline below. The
                section's "View all" is the one entry point now. */}
            {canEdit && (
              <PrimaryButton onClick={() => openDrawer("new-inquiry")}>
                {t("dashboard.adminOverview.newInquiry")}
              </PrimaryButton>
            )}
          </>
        }
      />

      {/* Real activation state — keeps the banner honest when the tenant
       *  has actually completed steps (Impronta etc.) instead of showing
       *  "Set your workspace domain" forever after they've shipped. */}
      {(() => {
        const talentCount = effectiveRoster.length;
        const hasInquiry =
          (overviewMetrics?.openInquiries ?? 0) > 0
          || (overviewMetrics?.draftInquiryCount ?? 0) > 0
          || richInqs.length > 0;
        // Paid plans imply onboarding past the evaluator phase.
        const isPaid = state.plan !== "free";
        // "Custom domain set" — coarse but matches the user-visible state:
        // any non-free tenant with a bridged identity has gone through the
        // domain setup. (Fine-grained agency_domains check belongs to a
        // future refactor; this is correct for the launch tenant Impronta
        // and every other paid workspace.)
        const hasCustomDomain = isPaid && Boolean(bridgeTenantIdentity);
        return (
          <>
            {/* WS-9.1 — Workspace activation v2: progress + smart prompts */}
            <WorkspaceActivationBanner
              state={{
                // "Profile complete" = workspace identity resolved via bridge.
                // A brand-new workspace without a slug yet shows this as incomplete.
                hasCompleteProfile: bridgeTenantIdentity != null,
                hasAnyTalent:       talentCount > 0,
                hasSentInquiry:     hasInquiry,
                hasPayoutMethod:    false, // still a real onboarding step (Phase C)
                hasCustomDomain:    hasCustomDomain,
                talentCount,
              }}
            />
            {/* WS-9.4 — Demo data toggle for evaluators (auto-hides for paid+populated tenants) */}
            <DemoDataBanner
              isEstablishedTenant={isPaid && talentCount >= 1}
            />
          </>
        );
      })()}

      {/* Needs you now — the ONE action surface. Real server counts; the four
          cohorts the agency owes action on. "Waiting on client" is shown as a
          separate, honest sub-line (their move, not yours). Clicking opens the
          pulse drawer, which lists the specific inquiries with deep-links. */}
      <section
        style={{
          background: needsYouTotal > 0
            ? `linear-gradient(135deg, ${COLORS.indigoSoft} 0%, #fff 60%)`
            : `linear-gradient(135deg, ${COLORS.accentSoft} 0%, #fff 60%)`,
          border: `1px solid ${needsYouTotal > 0 ? COLORS.indigo : COLORS.accent}`,
          borderRadius: 14,
          padding: "16px 20px",
          marginBottom: 16,
          fontFamily: FONTS.body,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 38, height: 38, borderRadius: 12, background: "#fff",
            border: `1px solid ${needsYouTotal > 0 ? COLORS.indigo : COLORS.accent}`,
            color: needsYouTotal > 0 ? COLORS.indigo : COLORS.accent,
            display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <Icon name="bolt" size={18} stroke={1.7} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: needsYouTotal > 0 ? COLORS.indigoDeep : COLORS.accent }}>
            {t("dashboard.adminOverview.needsYouNow")}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.ink, marginTop: 2 }}>
            {needsYouTotal === 0
              ? t("dashboard.adminOverview.allCaughtUp")
              : interpolate(
                  t(needsYouTotal === 1 ? "dashboard.adminOverview.needsYourTeamOne" : "dashboard.adminOverview.needsYourTeamOther"),
                  { count: needsYouTotal },
                )}
          </div>
          {needsYouBuckets.length > 0 && (
            <div style={{ marginTop: 7, display: "flex", flexWrap: "wrap", gap: 7 }}>
              {needsYouBuckets.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => openDrawer("today-pulse")}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "3px 9px 3px 4px", borderRadius: 999, cursor: "pointer",
                    background: "#fff", border: `1px solid ${COLORS.indigo}40`, fontFamily: FONTS.body,
                  }}
                >
                  <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", background: COLORS.indigo, color: "#fff", fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{b.n}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.indigoDeep }}>{b.label}</span>
                </button>
              ))}
            </div>
          )}
          {awaitingClientCount > 0 && (
            <div style={{ marginTop: 7, fontSize: 12, color: COLORS.inkMuted }}>
              {interpolate(
                t(awaitingClientCount === 1 ? "dashboard.adminOverview.awaitingClientLineOne" : "dashboard.adminOverview.awaitingClientLineOther"),
                { count: awaitingClientCount },
              )}
            </div>
          )}
        </div>
        {needsYouTotal > 0 && (
          <PrimaryButton onClick={() => openDrawer("today-pulse")}>{t("dashboard.adminOverview.review")}</PrimaryButton>
        )}
      </section>

      {/* Stat strip — replaces the old 4-up StatusCard grid that ate
          ~440px of vertical space showing 4 numbers. Premium pattern:
          one compact card with 4 inline metrics, each tappable, no
          card-frame chrome around individual values. */}
      <WorkspaceStatStrip
        items={[
          { label: t("dashboard.adminOverview.statNeedsYou"), value: needsYouTotal, tone: COLORS.fill, onClick: () => openDrawer("today-pulse") },
          { label: t("dashboard.adminOverview.statWaitingOnClient"), value: awaitingClientCount, tone: COLORS.indigo, onClick: () => openDrawer("awaiting-client") },
          { label: t("dashboard.adminOverview.statConfirmed"), value: overviewMetrics?.confirmedBookingCount ?? confirmedThisWeek.length, tone: COLORS.success, onClick: () => openDrawer("confirmed-bookings") },
          {
            label: t("dashboard.adminOverview.statViews7d"),
            value: overviewMetrics?.storefrontViews7d ?? 0,
            tone: COLORS.inkMuted,
            onClick: () => openDrawer("storefront-visibility"),
          },
        ]}
      />

      <div style={{ height: 16 }} />

      {/* Primary row */}
      <Grid cols="2">
        <PrimaryCard
          title={t("dashboard.adminOverview.waitingCardTitle")}
          description={t("dashboard.adminOverview.waitingCardDesc")}
          icon={<Icon name="mail" size={14} stroke={1.7} />}
          affordance={t("dashboard.adminOverview.openList")}
          meta={<>{interpolate(t(awaitingClientCount === 1 ? "dashboard.adminOverview.inquiryCountOne" : "dashboard.adminOverview.inquiryCountOther"), { count: awaitingClientCount })}</>}
          onClick={() => openDrawer("awaiting-client")}
        />
        <PrimaryCard
          title={t("dashboard.adminOverview.workflowCardTitle")}
          description={t("dashboard.adminOverview.workflowCardDesc")}
          icon={<Icon name="arrow-right" size={14} stroke={1.7} />}
          affordance={t("dashboard.adminOverview.openWorkflow")}
          meta={
            <>
              {interpolate(t("dashboard.adminOverview.activeCount"), { count: openInquiryCount })}
              <Bullet />
              {interpolate(t("dashboard.adminOverview.confirmedCount"), { count: confirmedThisWeek.length })}
            </>
          }
          onClick={() => openDrawer("pipeline")}
        />
      </Grid>

      <div style={{ height: 12 }} />

      {/* Secondary row */}
      <Grid cols="3">
        <SecondaryCard
          title={t("dashboard.adminOverview.draftsCardTitle")}
          description={t("dashboard.adminOverview.draftsCardDesc")}
          meta={interpolate(t(draftCount === 1 ? "dashboard.adminOverview.itemCountOne" : "dashboard.adminOverview.itemCountOther"), { count: draftCount })}
          affordance={t("dashboard.adminOverview.review")}
          onClick={() => openDrawer("drafts-holds")}
        />
      </Grid>

      {/* Analytics — premium section header (sentence-case, compact) */}
      <div style={{ marginTop: 22 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "0 4px 10px",
        }}>
          <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.indigo }} />
          <h2 style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, margin: 0, letterSpacing: -0.1 }} className="text-admin-ink">{t("dashboard.adminOverview.analytics")}</h2>
        </div>
        <Grid cols="2">
          <SecondaryCard
            title={t("dashboard.adminOverview.revenueCardTitle")}
            description={t("dashboard.adminOverview.revenueCardDesc")}
            affordance={t("dashboard.adminOverview.open")}
            onClick={goFinancials}
          />
          <SecondaryCard
            title={t("dashboard.adminOverview.funnelCardTitle")}
            description={t("dashboard.adminOverview.funnelCardDesc")}
            affordance={t("dashboard.adminOverview.open")}
            onClick={() => openDrawer("conversion-funnel")}
          />
        </Grid>
      </div>

      {/* Locked strip — what's available higher up */}
      {state.plan === "studio" && (
        <MoreWithSection plan="agency" title={t("dashboard.adminOverview.moreWithAgency")}>
          <CompactLockedCard
            title={t("dashboard.adminOverview.lockAgencyDesignSystem")}
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: t("dashboard.adminOverview.upBrandedDesignFeature"),
                why: t("dashboard.adminOverview.upBrandedDesignWhy"),
                requiredPlan: "agency",
                unlocks: [t("dashboard.adminOverview.upBrandedDesignUnlock1"), t("dashboard.adminOverview.upBrandedDesignUnlock2"), t("dashboard.adminOverview.upBrandedDesignUnlock3")],
              })
            }
          />
          <CompactLockedCard
            title={t("dashboard.adminOverview.lockFieldCatalog")}
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: t("dashboard.adminOverview.upCustomFieldsFeature"),
                why: t("dashboard.adminOverview.upCustomFieldsWhy"),
                requiredPlan: "agency",
                unlocks: [t("dashboard.adminOverview.upCustomFieldsUnlock1"), t("dashboard.adminOverview.upCustomFieldsUnlock2"), t("dashboard.adminOverview.upCustomFieldsUnlock3")],
              })
            }
          />
          <CompactLockedCard
            title={t("dashboard.adminOverview.lockHubDistribution")}
            requiredPlan="network"
            onClick={() =>
              openUpgrade({
                feature: t("dashboard.adminOverview.upMultiBrandFeature"),
                why: t("dashboard.adminOverview.upMultiBrandWhyDistribute"),
                requiredPlan: "network",
                unlocks: [t("dashboard.adminOverview.upMultiBrandUnlockSubtenants"), t("dashboard.adminOverview.upMultiBrandUnlockCrossRoster"), t("dashboard.adminOverview.upMultiBrandUnlockHubAnalytics")],
              })
            }
          />
        </MoreWithSection>
      )}

      {state.plan === "agency" && (
        <MoreWithSection plan="network" title={t("dashboard.adminOverview.moreWithNetwork")}>
          <CompactLockedCard
            title={t("dashboard.adminOverview.lockMultiBrandWorkspaces")}
            requiredPlan="network"
            onClick={() =>
              openUpgrade({
                feature: t("dashboard.adminOverview.upMultiBrandFeature"),
                why: t("dashboard.adminOverview.upMultiBrandWhyOperation"),
                requiredPlan: "network",
                unlocks: [t("dashboard.adminOverview.upMultiBrandUnlockSubbrands"), t("dashboard.adminOverview.upMultiBrandUnlockPool"), t("dashboard.adminOverview.upMultiBrandUnlockDashboards")],
              })
            }
          />
          <CompactLockedCard
            title={t("dashboard.adminOverview.lockHubAnalytics")}
            requiredPlan="network"
            onClick={() =>
              openUpgrade({
                feature: t("dashboard.adminOverview.upHubAnalyticsFeature"),
                why: t("dashboard.adminOverview.upHubAnalyticsWhy"),
                requiredPlan: "network",
              })
            }
          />
        </MoreWithSection>
      )}

      {/* Tenant activity feed (#32) — recent workspace events */}
      <div className="mt-7">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <h2 style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, margin: 0, letterSpacing: -0.2 }} className="text-admin-ink">
            {t("dashboard.adminOverview.recentActivity")}
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => openDrawer("ai-weekly-digest")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 9px",
                background: COLORS.royalSoft,
                border: `1px solid rgba(95,75,139,0.2)`,
                borderRadius: RADIUS.sm,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                fontWeight: 600,
                color: COLORS.royal,
                cursor: "pointer",
              }}
            >
              <Icon name="sparkle" size={11} color={COLORS.royal} stroke={1.8} />
              {t("dashboard.adminOverview.weeklyDigest")}
            </button>
            <GhostButton size="sm" onClick={() => openDrawer("team-activity")}>{t("dashboard.adminOverview.viewAll")}</GhostButton>
          </div>
        </div>
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "4px 16px",
            overflow: "hidden",
          }}
        >
          {realActivity.length === 0 ? (
            <div style={{ padding: "18px 2px", fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
              {t("dashboard.adminOverview.noActivityYet")}
            </div>
          ) : (
            // A feed is a list — say so, so screen readers announce it as one
            // ("list, 6 items") instead of six unrelated blocks. The <li>
            // wrappers stay here rather than moving into ActivityFeedItem:
            // that primitive has five other call sites whose markup we would
            // otherwise have to change in lockstep.
            <ul
              style={{ listStyle: "none", margin: 0, padding: 0 }}
              aria-label={t("dashboard.adminOverview.recentActivity")}
            >
              {realActivity.slice(0, 6).map((ev, i) => (
                <li key={"id" in ev ? ev.id : i} style={{ borderTop: i > 0 ? `1px solid ${COLORS.borderSoft}` : "none" }}>
                  {/* Every event is about an inquiry — the row opens its work
                      detail page. adminBasePath, never `/${tenantSlug}/admin`:
                      on a branded host the slug form 308s (see context.tsx). */}
                  <Link
                    href={`${adminBasePath}/work/${ev.inquiryId}`}
                    className="block -mx-2 rounded-lg px-2 transition-colors hover:bg-admin-surface-alt"
                  >
                    <ActivityFeedItem
                      actor={ev.actor}
                      action={ev.action}
                      target={ev.target}
                      timestamp={ev.timestamp}
                      iso={ev.iso}
                      iconName={ev.iconName}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function NetworkSetupBanner({ tenantId, networkRequestedAt }: { tenantId: string; networkRequestedAt: string }) {
  const router = useRouter();
  const t = useT();
  const storageKey = `tulala-network-banner-dismissed-${tenantId}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return typeof window !== "undefined" && !!window.localStorage.getItem(storageKey); }
    catch { return false; }
  });

  if (dismissed) return null;

  function dismiss() {
    try { window.localStorage.setItem(storageKey, "1"); } catch {}
    setDismissed(true);
    // Remove ?upgrade=network from URL without reload
    const url = new URL(window.location.href);
    url.searchParams.delete("upgrade");
    router.replace(url.pathname + (url.search || ""), { scroll: false });
  }

  const requestedDate = new Date(networkRequestedAt).toLocaleDateString(t("dashboard.adminOverview.dateLocale"), {
    month: "short", day: "numeric",
  });

  return (
    <div
      style={{
        background: "rgba(15,79,62,0.06)",
        border: "1px solid rgba(15,79,62,0.18)",
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 16,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ fontSize: 18, lineHeight: 1, marginTop: 1 }}>◆</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.accentDeep, marginBottom: 4 }}>
          {t("dashboard.adminOverview.networkSetupTitle")}
        </div>
        <p style={{ margin: 0, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.55 }}>
          {interpolate(t("dashboard.adminOverview.networkSetupBody"), { date: requestedDate })}{" "}
          <a
            href="mailto:hello@impronta.group"
            style={{ color: COLORS.accentDeep, textDecoration: "underline" }}
          >
            hello@impronta.group
          </a>
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: COLORS.inkMuted, fontSize: 16, lineHeight: 1, flexShrink: 0 }}
        aria-label={t("dashboard.adminOverview.dismissNetworkBanner")}
      >
        ✕
      </button>
    </div>
  );
}

function OverviewFree() {
  const { state, setPage, openDrawer, openUpgrade, completeTask, toast, effectiveRoster, effectiveTeamMembers, effectiveMessagesInquiries, bridgeTenantIdentity, effectiveTenant } = useAdminShell();
  const t = useT();
  const tenantDomain = bridgeTenantIdentity?.slug
    ? `${bridgeTenantIdentity.slug}.tulala.digital`
    : effectiveTenant.domain;

  // Live signals that prove a step is "really done" — overrides the
  // user-confirmed Set. Order: real state first, manual confirmation
  // second. This way a returning user with 3 talents already on roster
  // sees "Add your first talent" pre-checked, even if they never clicked
  // the row in this prototype session.
  //
  // `effectiveRoster` is `bridgeRoster ?? getRoster(plan)` — Phase 1
  // real-data bridge (set by `?dataSource=live` server pre-fetch). When
  // the bridge is null (default mock mode) it transparently falls back
  // to the per-plan mock arrays; when present it overrides them.
  const liveRoster = effectiveRoster;
  const livePublished = liveRoster.filter((t) => t.state === "published").length;
  const liveInquiries = effectiveMessagesInquiries/* trust the bridge — context handles empty-vs-mock */;
  const liveTeam = effectiveTeamMembers.length > 0 ? effectiveTeamMembers : getTeam(state.plan);
  const autoComplete: Record<string, boolean> = {
    "add-talent": liveRoster.length > 0,
    publish: livePublished > 0,
    "share-url": false, // genuinely manual — no upstream signal
    "try-inquiry": liveInquiries.length > 0,
    "invite-team": liveTeam.length > 1,
  };
  const isDone = (taskId: string) =>
    state.completedTasks.has(taskId) || !!autoComplete[taskId];
  const completedCount = ACTIVATION_TASKS.filter((t) => isDone(t.id)).length;
  const totalTasks = ACTIVATION_TASKS.length;
  const progressPct = Math.round((completedCount / totalTasks) * 100);

  return (
    <>
      <PageHeader
        eyebrow={t("dashboard.adminOverview.setupEyebrow")}
        title={t("dashboard.adminOverview.alreadyLiveTitle")}
        subtitle={t("dashboard.adminOverview.alreadyLiveSubtitle")}
        actions={
          <span style={{ fontFamily: FONTS.body, fontSize: 12 }} className="text-admin-ink-muted">
            {interpolate(t("dashboard.adminOverview.stepsProgress"), { completed: completedCount, total: totalTasks })}
          </span>
        }
      />

      {bridgeTenantIdentity?.networkRequestedAt && bridgeTenantIdentity.tenantId && (
        <NetworkSetupBanner
          tenantId={bridgeTenantIdentity.tenantId}
          networkRequestedAt={bridgeTenantIdentity.networkRequestedAt}
        />
      )}

      {/* Progress strip — gives the user a sense of momentum */}
      <div
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          padding: "12px 16px",
          marginBottom: 16,
          fontFamily: FONTS.body,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }} className="text-admin-ink">
            {t("dashboard.adminOverview.first10Minutes")}
          </span>
          <span className="text-admin-ink-muted text-admin-11h">
            {interpolate(t("dashboard.adminOverview.percentComplete"), { pct: progressPct })}
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
          <div style={{ '--progress-w': `${progressPct}%` }} className="w-[var(--progress-w)] h-full [transition:width_.25s_ease]"
          />
        </div>
      </div>

      <StarterCard
        title={t("dashboard.adminOverview.activationArcTitle")}
        subtitle={t("dashboard.adminOverview.activationArcSubtitle")}
      >
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }} className="bg-admin-fill">
          {ACTIVATION_TASKS.map((task, idx) => {
            const done = isDone(task.id);
            return (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (task.drawer) {
                      // Demo-inquiry step — open the prototype's rich inquiry workspace
                      if (task.id === "try-inquiry") {
                        openDrawer("inquiry-workspace", { inquiryId: "RI-201", pov: "admin" });
                        completeTask(task.id);
                      } else {
                        openDrawer(task.drawer, { fromTask: task.id });
                      }
                    } else {
                      completeTask(task.id);
                      toast(interpolate(t("dashboard.adminOverview.taskMarkedDone"), { label: t(ACTIVATION_LABEL_KEY[task.id] ?? "") || task.label }));
                    }
                  }}
                  style={{
                    background: "#fff",
                    border: `1px solid ${done ? "rgba(46,125,91,0.30)" : COLORS.borderSoft}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    cursor: "pointer",
                    fontFamily: FONTS.body,
                    textAlign: "left",
                    transition: `border-color ${TRANSITION.micro}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(11,11,13,0.20)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = done
                      ? "rgba(46,125,91,0.30)"
                      : COLORS.borderSoft;
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: `1.5px solid ${done ? COLORS.green : "rgba(11,11,13,0.18)"}`,
                      background: done ? COLORS.green : "transparent",
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {done && <Icon name="check" size={13} stroke={2.5} color="#fff" />}
                    {!done && (
                      <span className="text-admin-ink-muted text-admin-11 font-semibold">
                        {idx + 1}
                      </span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13.5, fontWeight: 500, textDecoration: done ? "line-through" : "none", opacity: done ? 0.55 : 1 }} className="text-admin-ink">
                      {t(ACTIVATION_LABEL_KEY[task.id] ?? "") || task.label}
                    </div>
                    <div style={{ fontSize: 11.5, marginTop: 1, opacity: done ? 0.55 : 1 }} className="text-admin-ink-muted">
                      {done && autoComplete[task.id] && !state.completedTasks.has(task.id)
                        ? t("dashboard.adminOverview.autoDetectedDone")
                        : (t(ACTIVATION_HINT_KEY[task.id] ?? "") || task.hint)}
                    </div>
                  </div>
                  {!done && (
                    <span style={{ fontSize: 10.5, fontFamily: FONTS.body, letterSpacing: 0.3 }} className="text-admin-ink-dim">
                      {t(ACTIVATION_EST_KEY[task.id] ?? "") || task.est}
                    </span>
                  )}
                  <Affordance label={done ? t("dashboard.adminOverview.done") : t("dashboard.adminOverview.open")} />
                </button>
              </li>
            );
          })}
        </ol>
      </StarterCard>

      <div style={{ height: 24 }} />

      {/* What you can do TODAY — the value-not-walls panel */}
      <FreeValuePanel />

      <div style={{ height: 24 }} />

      <Grid cols="2">
        <PrimaryCard
          title={t("dashboard.adminOverview.storefrontCardTitle")}
          description={interpolate(t("dashboard.adminOverview.storefrontCardDesc"), { domain: tenantDomain })}
          icon={<Icon name="globe" size={14} stroke={1.7} />}
          meta={<><StatDot tone="green" /> {t("dashboard.adminOverview.live")}</>}
          affordance={t("dashboard.adminOverview.manageVisibility")}
          onClick={() => openDrawer("storefront-visibility")}
        />
        <PrimaryCard
          title={t("dashboard.adminOverview.rosterCardTitle")}
          description={interpolate(t(liveRoster.length === 1 ? "dashboard.adminOverview.rosterCardDescOne" : "dashboard.adminOverview.rosterCardDescOther"), { count: liveRoster.length })}
          icon={<Icon name="team" size={14} stroke={1.7} />}
          meta={interpolate(t(liveRoster.length === 1 ? "dashboard.adminOverview.rosterCardMetaOne" : "dashboard.adminOverview.rosterCardMetaOther"), { count: liveRoster.length, published: livePublished })}
          affordance={t("dashboard.adminOverview.openRoster")}
          onClick={() => setPage("talent")}
        />
      </Grid>

      <MoreWithSection plan="studio" title={t("dashboard.adminOverview.moreWithStudio")}>
        <CompactLockedCard
          title={t("dashboard.adminOverview.lockCustomDomain")}
          requiredPlan="studio"
          onClick={() =>
            openUpgrade({
              feature: t("dashboard.adminOverview.upCustomDomainFeature"),
              why: t("dashboard.adminOverview.upCustomDomainWhy"),
              requiredPlan: "studio",
              unlocks: [t("dashboard.adminOverview.upCustomDomainUnlock1"), t("dashboard.adminOverview.upCustomDomainUnlock2"), t("dashboard.adminOverview.upCustomDomainUnlock3")],
            })
          }
        />
        <CompactLockedCard
          title={t("dashboard.adminOverview.lockPrivateInbox")}
          requiredPlan="studio"
          onClick={() =>
            openUpgrade({
              feature: t("dashboard.adminOverview.upPrivateInquiriesFeature"),
              why: t("dashboard.adminOverview.upPrivateInquiriesWhy"),
              requiredPlan: "studio",
              unlocks: [t("dashboard.adminOverview.upPrivateInquiriesUnlock1"), t("dashboard.adminOverview.upPrivateInquiriesUnlock2"), t("dashboard.adminOverview.upPrivateInquiriesUnlock3")],
            })
          }
        />
        <CompactLockedCard
          title={t("dashboard.adminOverview.lockHideDiscovery")}
          requiredPlan="studio"
          onClick={() =>
            openUpgrade({
              feature: t("dashboard.adminOverview.upStealthFeature"),
              why: t("dashboard.adminOverview.upStealthWhy"),
              requiredPlan: "studio",
            })
          }
        />
      </MoreWithSection>

      <MoreWithSection plan="agency" title={t("dashboard.adminOverview.moreWithAgency")}>
        <CompactLockedCard
          title={t("dashboard.adminOverview.lockBrandedDesignSystem")}
          requiredPlan="agency"
          onClick={() =>
            openUpgrade({
              feature: t("dashboard.adminOverview.upBrandedSiteDesignFeature"),
              why: t("dashboard.adminOverview.upBrandedSiteDesignWhy"),
              requiredPlan: "agency",
              unlocks: [t("dashboard.adminOverview.upBrandedSiteDesignUnlock1"), t("dashboard.adminOverview.upBrandedSiteDesignUnlock2"), t("dashboard.adminOverview.upBrandedSiteDesignUnlock3")],
            })
          }
        />
        <CompactLockedCard
          title={t("dashboard.adminOverview.lockCustomTalentFields")}
          requiredPlan="agency"
          onClick={() =>
            openUpgrade({
              feature: t("dashboard.adminOverview.upFieldCatalogFeature"),
              why: t("dashboard.adminOverview.upCustomFieldsWhy"),
              requiredPlan: "agency",
            })
          }
        />
        <CompactLockedCard
          title={t("dashboard.adminOverview.lockTeamRoles")}
          requiredPlan="agency"
          onClick={() =>
            openUpgrade({
              feature: t("dashboard.adminOverview.upTeamFeature"),
              why: t("dashboard.adminOverview.upTeamWhy"),
              requiredPlan: "agency",
            })
          }
        />
      </MoreWithSection>
    </>
  );
}
