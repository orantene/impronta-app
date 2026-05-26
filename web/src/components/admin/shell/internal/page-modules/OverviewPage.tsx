"use client";

/* eslint-disable ratchet/no-new-inline-style, max-lines, react/no-unescaped-entities -- Legacy admin overview prototype styling is outside the Services sync QA path; keep lint unblocked until the design-token codemod owns this surface. */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityFeedItem, Affordance, Bullet, CompactLockedCard, GhostButton, Icon, MoreWithSection, PrimaryButton, PrimaryCard, SecondaryCard, StarterCard, StatDot, StatusCard } from "../primitives";
import { ACTIVATION_TASKS, COLORS, FONTS, MY_TALENT_PROFILE, RADIUS, RICH_INQUIRIES, TRANSITION, getInquiries, getRoster, getTeam, meetsRole, pluralize, relativeTime, useAdminShell } from "../state";

// Q5: demo activity feed builder hoisted to module scope so the Date.now()
// call isn't inside a render-time / useMemo body (react-hooks/purity flags
// it in both). Called once at mount via useMemo([]) below.
function mkDemoActivityFeed() {
  const now = Date.now();
  return [
    { actor: "Oran Tene", action: "sent an offer to", target: "Vogue Italia", timestamp: relativeTime(now - 2 * 60_000), iconName: "mail" as const },
    { actor: "Marta Reyes", action: "accepted hold for", target: "Bvlgari campaign", timestamp: relativeTime(now - 34 * 60_000), iconName: "check" as const },
    { actor: "Kai Lin", action: "updated profile", target: "measurements + comp card", timestamp: relativeTime(now - 65 * 60_000), iconName: "user" as const },
    { actor: "System", action: "auto-archived expired inquiry from", target: "H&M (6 weeks old)", timestamp: relativeTime(now - 3 * 60 * 60_000), iconName: "archive" as const },
  ];
}
import { DemoDataBanner, WorkspaceActivationBanner } from "../wave2";
import { MOCK_STOREFRONT_STATS, greeting } from "./ControlBar";
import { FreeValuePanel } from "./WorkPage";
import { Grid, PageHeader, TodaysFocusCard, WorkspaceStatStrip } from "./pages-shared";


export function OverviewPage() {
  const {
    state,
    openDrawer,
    openUpgrade,
    completeTask,
    toast,
    setPage,
    overviewMetrics,
    effectiveMessagesInquiries,
    effectiveRoster,
    bridgeSessionIdentity,
    bridgeTenantIdentity,
    effectiveTenant,
  } = useAdminShell();
  const isFree = state.plan === "free";
  const canEdit = meetsRole(state.role, "editor");
  const tenantDomain = bridgeTenantIdentity?.slug
    ? `${bridgeTenantIdentity.slug}.tulala.app`
    : effectiveTenant.domain;

  // Q5: timestamps pinned to mount time (see module-level mkDemoActivityFeed).
  const demoActivityFeed = useMemo(() => mkDemoActivityFeed(), []);

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

  return (
    <>
      <PageHeader
        title={(() => {
          // Phase 1 — greeting uses real signed-in user when bridge identity
          // is present; standalone demo falls back to MY_TALENT_PROFILE.
          const realFirst = (() => {
            if (!bridgeSessionIdentity) return null;
            const dn = bridgeSessionIdentity.displayName?.trim();
            if (dn) return dn.split(/\s+/u)[0];
            const email = bridgeSessionIdentity.email;
            if (email) return email.split("@")[0]?.split(/[.\-_]/u)[0] ?? null;
            return null;
          })();
          return `${greeting()}, ${realFirst ?? MY_TALENT_PROFILE.name.split(" ")[0]}`;
        })()}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        actions={
          canEdit && (
            <PrimaryButton onClick={() => openDrawer("new-inquiry")}>
              New inquiry
            </PrimaryButton>
          )
        }
      />

      {/* WS-9.1 — Workspace activation v2: progress + smart prompts */}
      <WorkspaceActivationBanner />
      {/* WS-9.4 — Demo data toggle for evaluators */}
      <DemoDataBanner />

      {/* Audit #49 — Today's focus card. ONE prominent banner at the
          top with the highest-urgency line of the day. Single source
          of urgency above the metric strip. */}
      <TodaysFocusCard
        pendingClients={awaiting.length}
        draftCount={draftCount}
        nextBookingLabel={confirmedThisWeek[0]?.clientName ? `${confirmedThisWeek[0].clientName} starts soon` : null}
        oldestWaitDays={awaiting.length > 0 ? Math.max(...awaiting.map((i) => i.ageDays)) : 0}
        onOpen={() => openDrawer("today-pulse")}
      />

      {/* Stat strip — replaces the old 4-up StatusCard grid that ate
          ~440px of vertical space showing 4 numbers. Premium pattern:
          one compact card with 4 inline metrics, each tappable, no
          card-frame chrome around individual values. */}
      <WorkspaceStatStrip
        items={[
          { label: "Needs you", value: awaiting.length + draftCount, tone: COLORS.coral, onClick: () => openDrawer("today-pulse") },
          { label: "Active", value: richInqs.filter((i) => i.stage !== "rejected" && i.stage !== "expired").length, tone: COLORS.indigo, onClick: () => openDrawer("pipeline") },
          { label: "Confirmed", value: confirmedThisWeek.length, tone: COLORS.success, onClick: () => openDrawer("confirmed-bookings") },
          {
            label: "Views 7d",
            value: overviewMetrics?.storefrontViews7d ?? MOCK_STOREFRONT_STATS.views7d,
            tone: COLORS.inkMuted,
            onClick: () => openDrawer("storefront-visibility"),
            demo: overviewMetrics?.storefrontViews7d == null,
          },
        ]}
      />

      <div style={{ height: 16 }} />

      {/* Primary row */}
      <Grid cols="2">
        <PrimaryCard
          title="What needs you today"
          description={`${pluralize(awaiting.length, "inquiry", "inquiries")} ${awaiting.length === 1 ? "is" : "are"} waiting for a client decision and ${pluralize(draftCount, "draft", "drafts")} ${draftCount === 1 ? "hasn't" : "haven't"} been sent.`}
          icon={<Icon name="bolt" size={14} stroke={1.7} />}
          affordance="Open focus list"
          meta={<>{pluralize(awaiting.length + draftCount, "item", "items", true)}</>}
          onClick={() => openDrawer("today-pulse")}
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
          title="Sent — waiting"
          description="Offers sent. Waiting on the client to confirm."
          meta={pluralize(awaiting.length, "item", "items")}
          affordance="Review"
          onClick={() => openDrawer("awaiting-client")}
        />
        <SecondaryCard
          title="Recent activity"
          description="What teammates and clients did in the last 24h."
          affordance="See feed"
          onClick={() => openDrawer("team-activity")}
        />
        <SecondaryCard
          title="Approval queue"
          description="Briefs, offers, and documents waiting for sign-off."
          affordance="Review"
          onClick={() => openDrawer("approval-flow")}
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
        <Grid cols="4">
          <SecondaryCard
            title="Revenue"
            description="MRR, ARR, monthly trend and category breakdown."
            affordance="Open"
            onClick={() => openDrawer("workspace-revenue")}
          />
          <SecondaryCard
            title="Conversion funnel"
            description="Inquiry → offer → booking. Drop-off by stage."
            affordance="Open"
            onClick={() => openDrawer("conversion-funnel")}
          />
          <SecondaryCard
            title="Top performers"
            description="Talent and client rankings by YTD revenue."
            affordance="Open"
            onClick={() => openDrawer("top-performers")}
          />
          <SecondaryCard
            title="Team workload"
            description="Active load, messages, and reply time per coordinator."
            affordance="Open"
            onClick={() => openDrawer("coordinator-workload")}
          />
        </Grid>
      </div>

      {/* WS-20 — Operations entry points */}
      <div className="mt-5">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <h2 style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, margin: 0, letterSpacing: -0.2 }} className="text-admin-ink">
            Operations
          </h2>
        </div>
        <Grid cols="3">
          <SecondaryCard
            title="My queue"
            description="Your assigned inquiries sorted by SLA urgency."
            affordance="Open"
            onClick={() => openDrawer("my-queue")}
          />
          <SecondaryCard
            title="SLA timers"
            description="Response deadlines across all active inquiries."
            affordance="Open"
            onClick={() => openDrawer("sla-timers")}
          />
          <SecondaryCard
            title="Automation rules"
            description="Trigger-action rules that run automatically."
            affordance="Open"
            onClick={() => openDrawer("rules-builder")}
          />
          <SecondaryCard
            title="Saved replies"
            description="Reusable message templates with variable substitution."
            affordance="Open"
            onClick={() => openDrawer("saved-replies")}
          />
          <SecondaryCard
            title="Vacation handover"
            description="Reassign your workload while you're away."
            affordance="Open"
            onClick={() => openDrawer("vacation-handover")}
          />
          <SecondaryCard
            title="On-call rotation"
            description="Weekly schedule and escalation ladder."
            affordance="Open"
            onClick={() => openDrawer("on-call-rotation")}
          />
        </Grid>
      </div>

      {/* Pointers to the new Operations + Production pages */}
      <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <button
          type="button"
          onClick={() => setPage("operations")}
          style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "16px 18px", textAlign: "left", cursor: "pointer",
            background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
            fontFamily: FONTS.body, transition: TRANSITION.sm,
          }}
        >
          <div style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} className="rounded-admin-md bg-admin-indigo-soft">
            <Icon name="bolt" size={18} color={COLORS.indigo} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-admin-ink text-sm font-bold">Operations</div>
            <div style={{ fontSize: 12, marginTop: 2 }} className="text-admin-ink-muted">Analytics, queues, automations, comms.</div>
          </div>
          <Icon name="arrow-right" size={14} color={COLORS.inkMuted} />
        </button>
        <button
          type="button"
          onClick={() => setPage("production")}
          style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "16px 18px", textAlign: "left", cursor: "pointer",
            background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
            fontFamily: FONTS.body, transition: TRANSITION.sm,
          }}
        >
          <div style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} className="rounded-admin-md bg-admin-accent-soft">
            <Icon name="team" size={18} color={COLORS.accent} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-admin-ink text-sm font-bold">Production</div>
            <div style={{ fontSize: 12, marginTop: 2 }} className="text-admin-ink-muted">Casting, crew, on-set, rights & safety.</div>
          </div>
          <Icon name="arrow-right" size={14} color={COLORS.inkMuted} />
        </button>
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
                why: "Add fields your agency cares about — tags, niches, contracts.",
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
          {demoActivityFeed.map((ev, i, arr) => (
            <div key={i} style={{ borderTop: i > 0 ? `1px solid ${COLORS.borderSoft}` : "none" }}>
              <ActivityFeedItem {...ev} />
            </div>
          ))}
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
    ? `${bridgeTenantIdentity.slug}.tulala.app`
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
  const liveInquiries = effectiveMessagesInquiries.length > 0 ? effectiveMessagesInquiries : getInquiries(state.plan);
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
        subtitle="All five are reversible — skip what you don't need."
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
                        ? "Auto-detected — already done."
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
              why: "Run your storefront at your own brand's domain — not a Tulala subdomain.",
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
              why: "Bring your full visual identity to the storefront — typography, color, layout.",
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
              why: "Add fields your agency cares about — tags, niches, contracts.",
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
