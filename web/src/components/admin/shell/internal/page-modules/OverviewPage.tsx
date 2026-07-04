"use client";

/* eslint-disable ratchet/no-new-inline-style, max-lines, react/no-unescaped-entities -- Legacy admin overview prototype styling is outside the Services sync QA path; keep lint unblocked until the design-token codemod owns this surface. */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityFeedItem, Affordance, Bullet, CompactLockedCard, GhostButton, Icon, MoreWithSection, PrimaryButton, PrimaryCard, SecondaryButton, SecondaryCard, StarterCard, StatDot, StatusCard } from "../primitives";
import { ACTIVATION_TASKS, COLORS, FONTS, RADIUS, RICH_INQUIRIES, TRANSITION, formatRecentActivity, getInquiries, getRoster, getTeam, meetsRole, pluralize, useAdminShell } from "../state";
import { DemoDataBanner, WorkspaceActivationBanner } from "../wave2";
import { greeting } from "./ControlBar";
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
  } = useAdminShell();
  const goFinancials = () => {
    if (typeof window !== "undefined" && tenantSlug) {
      window.location.href = `/${tenantSlug}/admin/financials`;
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
    { key: "unassigned", n: unassignedCount, label: "needs a coordinator" },
    { key: "reply", n: yourReplyCount, label: "awaiting your reply" },
    { key: "ready", n: readyToBookCount, label: "ready to book" },
    { key: "drafts", n: draftCount, label: "to send" },
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
          return `${greeting()}, ${realFirst ?? "there"}`;
        })()}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        actions={
          <>
            {/* Read-only — every workspace role can review the activity log. */}
            <SecondaryButton onClick={() => openDrawer("team-activity")}>
              Recent activity
            </SecondaryButton>
            {canEdit && (
              <PrimaryButton onClick={() => openDrawer("new-inquiry")}>
                New inquiry
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
            Needs you now
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.ink, marginTop: 2 }}>
            {needsYouTotal === 0
              ? "You're all caught up."
              : `${needsYouTotal} ${needsYouTotal === 1 ? "thing needs" : "things need"} your team`}
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
              {awaitingClientCount} {awaitingClientCount === 1 ? "inquiry is" : "inquiries are"} waiting on the client. Their move, not yours.
            </div>
          )}
        </div>
        {needsYouTotal > 0 && (
          <PrimaryButton onClick={() => openDrawer("today-pulse")}>Review</PrimaryButton>
        )}
      </section>

      {/* Stat strip — replaces the old 4-up StatusCard grid that ate
          ~440px of vertical space showing 4 numbers. Premium pattern:
          one compact card with 4 inline metrics, each tappable, no
          card-frame chrome around individual values. */}
      <WorkspaceStatStrip
        items={[
          { label: "Needs you", value: needsYouTotal, tone: COLORS.fill, onClick: () => openDrawer("today-pulse") },
          { label: "Waiting on client", value: awaitingClientCount, tone: COLORS.indigo, onClick: () => openDrawer("awaiting-client") },
          { label: "Confirmed", value: overviewMetrics?.confirmedBookingCount ?? confirmedThisWeek.length, tone: COLORS.success, onClick: () => openDrawer("confirmed-bookings") },
          {
            label: "Views 7d",
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
          title="Waiting on client"
          description="Offers and approvals sent. The ball is in the client's court. Nudge if one goes cold."
          icon={<Icon name="mail" size={14} stroke={1.7} />}
          affordance="Open list"
          meta={<>{pluralize(awaitingClientCount, "inquiry", "inquiries", true)}</>}
          onClick={() => openDrawer("awaiting-client")}
        />
        <PrimaryCard
          title="Workflow"
          description="Every inquiry, grouped by where it's stuck. See who's waiting on whom from first request to confirmed booking."
          icon={<Icon name="arrow-right" size={14} stroke={1.7} />}
          affordance="Open workflow"
          meta={
            <>
              {pluralize(openInquiryCount, "active", "active", true)}
              <Bullet />
              {confirmedThisWeek.length} confirmed
            </>
          }
          onClick={() => openDrawer("pipeline")}
        />
      </Grid>

      <div style={{ height: 12 }} />

      {/* Secondary row */}
      <Grid cols="3">
        <SecondaryCard
          title="Drafts"
          description="Inquiries you started but haven't sent."
          meta={pluralize(draftCount, "item", "items")}
          affordance="Review"
          onClick={() => openDrawer("drafts-holds")}
        />
        <SecondaryCard
          title="Recent activity"
          description="What teammates and clients did in the last 24h."
          affordance="See feed"
          onClick={() => openDrawer("team-activity")}
        />
      </Grid>

      {/* Analytics — premium section header (sentence-case, compact) */}
      <div style={{ marginTop: 22 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "0 4px 10px",
        }}>
          <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.indigo }} />
          <h2 style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, margin: 0, letterSpacing: -0.1 }} className="text-admin-ink">Analytics</h2>
        </div>
        <Grid cols="2">
          <SecondaryCard
            title="Revenue"
            description="P&L, per-talent payouts, top clients. Live commission data."
            affordance="Open"
            onClick={goFinancials}
          />
          <SecondaryCard
            title="Conversion funnel"
            description="Inquiry → offer → booking. Drop-off by stage."
            affordance="Open"
            onClick={() => openDrawer("conversion-funnel")}
          />
        </Grid>
      </div>

      {/* Locked strip — what's available higher up */}
      {state.plan === "studio" && (
        <MoreWithSection plan="agency">
          <CompactLockedCard
            title="Agency design system"
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Branded site design",
                why: "Take full control of your storefront's typography, color and layout.",
                requiredPlan: "agency",
                unlocks: ["Custom design tokens", "Theme builder", "Section presets"],
              })
            }
          />
          <CompactLockedCard
            title="Field catalog"
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Custom talent fields",
                why: "Add fields your agency cares about (tags, niches, contracts).",
                requiredPlan: "agency",
                unlocks: ["Custom fields", "Per-roster taxonomy", "Filter config"],
              })
            }
          />
          <CompactLockedCard
            title="Hub distribution"
            requiredPlan="network"
            onClick={() =>
              openUpgrade({
                feature: "Multi-brand hub",
                why: "Run multiple agency identities under one roof and distribute roster across them.",
                requiredPlan: "network",
                unlocks: ["Sub-tenants", "Cross-roster sharing", "Hub-level analytics"],
              })
            }
          />
        </MoreWithSection>
      )}

      {state.plan === "agency" && (
        <MoreWithSection plan="network">
          <CompactLockedCard
            title="Multi-brand workspaces"
            requiredPlan="network"
            onClick={() =>
              openUpgrade({
                feature: "Multi-brand hub",
                why: "Run several agencies as one operation. Move talent across brands without losing history.",
                requiredPlan: "network",
                unlocks: ["Sub-brands", "Cross-roster pool", "Hub-level dashboards"],
              })
            }
          />
          <CompactLockedCard
            title="Hub analytics"
            requiredPlan="network"
            onClick={() =>
              openUpgrade({
                feature: "Hub analytics",
                why: "See booking velocity and roster utilization across all your brands at once.",
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
            marginBottom: 4,
          }}
        >
          <h2 style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, margin: 0, letterSpacing: -0.2 }} className="text-admin-ink">
            Recent activity
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
              Weekly digest
            </button>
            <GhostButton size="sm" onClick={() => openDrawer("team-activity")}>View all</GhostButton>
          </div>
        </div>
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "0 18px",
          }}
        >
          {realActivity.length === 0 ? (
            <div style={{ padding: "18px 2px", fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
              No activity yet. Offers, approvals, roster changes, and bookings show up here as your team works.
            </div>
          ) : (
            realActivity.slice(0, 6).map((ev, i) => (
              <div key={"id" in ev ? ev.id : i} style={{ borderTop: i > 0 ? `1px solid ${COLORS.borderSoft}` : "none" }}>
                <ActivityFeedItem
                  actor={ev.actor}
                  action={ev.action}
                  target={ev.target}
                  timestamp={ev.timestamp}
                  iconName={ev.iconName}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function NetworkSetupBanner({ tenantId, networkRequestedAt }: { tenantId: string; networkRequestedAt: string }) {
  const router = useRouter();
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

  const requestedDate = new Date(networkRequestedAt).toLocaleDateString("en-US", {
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
          Network setup in progress
        </div>
        <p style={{ margin: 0, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.55 }}>
          We'll email you within one business day to begin your Network onboarding
          (requested {requestedDate}). Need to talk sooner?{" "}
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
        aria-label="Dismiss Network setup banner"
      >
        ✕
      </button>
    </div>
  );
}

function OverviewFree() {
  const { state, setPage, openDrawer, openUpgrade, completeTask, toast, effectiveRoster, effectiveTeamMembers, effectiveMessagesInquiries, bridgeTenantIdentity, effectiveTenant } = useAdminShell();
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
        eyebrow="Setup"
        title="You're already live."
        subtitle="Five steps to your first booking. About 10 minutes total."
        actions={
          <span style={{ fontFamily: FONTS.body, fontSize: 12 }} className="text-admin-ink-muted">
            {completedCount} of {totalTasks} steps · ~10 min total
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
            First 10 minutes
          </span>
          <span className="text-admin-ink-muted text-admin-11h">
            {progressPct}% complete
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
        title="Your activation arc"
        subtitle="All five are reversible. Skip what you don't need."
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
                      toast(`"${task.label}" marked done`);
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
                      {task.label}
                    </div>
                    <div style={{ fontSize: 11.5, marginTop: 1, opacity: done ? 0.55 : 1 }} className="text-admin-ink-muted">
                      {done && autoComplete[task.id] && !state.completedTasks.has(task.id)
                        ? "Auto-detected, already done."
                        : task.hint}
                    </div>
                  </div>
                  {!done && (
                    <span style={{ fontSize: 10.5, fontFamily: FONTS.body, letterSpacing: 0.3 }} className="text-admin-ink-dim">
                      {task.est}
                    </span>
                  )}
                  <Affordance label={done ? "Done" : "Open"} />
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
          title="Your public storefront"
          description={`Live at ${tenantDomain}. Anyone with the link can see your published roster.`}
          icon={<Icon name="globe" size={14} stroke={1.7} />}
          meta={<><StatDot tone="green" /> Live</>}
          affordance="Manage visibility"
          onClick={() => openDrawer("storefront-visibility")}
        />
        <PrimaryCard
          title="Your roster"
          description={`${pluralize(liveRoster.length, "talent profile", "talent profiles")}. Add more, invite talent to claim, or publish drafts.`}
          icon={<Icon name="team" size={14} stroke={1.7} />}
          meta={`${pluralize(liveRoster.length, "profile", "profiles")} · ${livePublished} published`}
          affordance="Open roster"
          onClick={() => setPage("talent")}
        />
      </Grid>

      <MoreWithSection plan="studio" title="More with Studio">
        <CompactLockedCard
          title="Custom domain"
          requiredPlan="studio"
          onClick={() =>
            openUpgrade({
              feature: "Custom domain",
              why: "Run your storefront at your own brand's domain, not a Tulala subdomain.",
              requiredPlan: "studio",
              unlocks: ["Custom domain (e.g. acme-models.com)", "Verified email-from", "SSL automatic"],
            })
          }
        />
        <CompactLockedCard
          title="Private inquiry inbox"
          requiredPlan="studio"
          onClick={() =>
            openUpgrade({
              feature: "Private inquiries",
              why: "Take inquiries privately on your domain. Your client list stays your own.",
              requiredPlan: "studio",
              unlocks: ["Private inbox", "Owned client list", "Custom email templates"],
            })
          }
        />
        <CompactLockedCard
          title="Hide from Tulala discovery"
          requiredPlan="studio"
          onClick={() =>
            openUpgrade({
              feature: "Stealth mode",
              why: "On Free, your roster appears in our directory. Studio takes you private.",
              requiredPlan: "studio",
            })
          }
        />
      </MoreWithSection>

      <MoreWithSection plan="agency">
        <CompactLockedCard
          title="Branded design system"
          requiredPlan="agency"
          onClick={() =>
            openUpgrade({
              feature: "Branded site design",
              why: "Bring your full visual identity to the storefront (typography, color, layout).",
              requiredPlan: "agency",
              unlocks: ["Theme builder", "Section presets", "Brand tokens"],
            })
          }
        />
        <CompactLockedCard
          title="Custom talent fields"
          requiredPlan="agency"
          onClick={() =>
            openUpgrade({
              feature: "Field catalog",
              why: "Add fields your agency cares about (tags, niches, contracts).",
              requiredPlan: "agency",
            })
          }
        />
        <CompactLockedCard
          title="Team & roles"
          requiredPlan="agency"
          onClick={() =>
            openUpgrade({
              feature: "Team",
              why: "Invite teammates with viewer / editor / manager / admin roles.",
              requiredPlan: "agency",
            })
          }
        />
      </MoreWithSection>
    </>
  );
}
