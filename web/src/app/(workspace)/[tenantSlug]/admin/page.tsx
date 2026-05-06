// Phase 3 — workspace Overview page.
// Server Component — no "use client".
//
// Matches the prototype's topbar-layout Overview design:
//   - WorkspaceActivationBanner (dismissable onboarding checklist)
//   - TodaysFocusCard (urgency signal from real inquiry data)
//   - Personalized greeting (client component, browser local time)
//   - Stat strip: rostered / open inquiries / team / pending
//   - 2-col primary card grid (What needs you + Pipeline)
//   - 3-col secondary card grid (Drafts, Awaiting, Activity + Operations/Production)
//   - Quick-action tiles: Talent, Work, Clients, Settings

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadWorkspaceOverviewMetrics, loadRecentActivity, loadWorkspaceAgencySummary } from "../_data-bridge";
import { OverviewGreeting } from "./overview-greeting";
import { TodaysFocusCard } from "./todays-focus-card";
import { WorkspaceActivationBanner } from "./activation-banner";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.06)",
  green:      "#2E7D5B",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(138,111,26,0.08)",
  blue:       "#2B5F8A",
  blueSoft:   "rgba(43,95,138,0.07)",
  coral:      "#B04A22",
  indigo:     "#3B5E9E",
  indigoSoft: "rgba(59,94,158,0.07)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function userDisplayName(
  email: string | null | undefined,
  meta: Record<string, unknown> | undefined,
): string {
  if (meta?.full_name && typeof meta.full_name === "string") return meta.full_name;
  if (meta?.name && typeof meta.name === "string") return meta.name;
  if (email) return email.split("@")[0].replace(/[._-]/g, " ");
  return "you";
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Stat item ────────────────────────────────────────────────────────────────

function StatItem({
  dot,
  label,
  value,
  href,
  tenantSlug,
}: {
  dot: string;
  label: string;
  value: number;
  href: string;
  tenantSlug: string;
}) {
  return (
    <Link
      href={`/${tenantSlug}/admin/${href}`}
      style={{ display: "flex", flexDirection: "column", gap: 6, textDecoration: "none", minWidth: 80 }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: FONT,
          fontSize: 11,
          fontWeight: 500,
          color: C.inkDim,
          letterSpacing: 0.1,
        }}
      >
        <span
          aria-hidden
          style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }}
        />
        {label}
      </span>
      <span style={{ fontFamily: FONT, fontSize: 32, fontWeight: 600, color: C.ink, letterSpacing: -1, lineHeight: 1 }}>
        {value}
      </span>
    </Link>
  );
}

// ─── Quick-action tile ────────────────────────────────────────────────────────

function QuickTile({
  label,
  description,
  href,
}: {
  label: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "16px 18px",
        textDecoration: "none",
        transition: "border-color 120ms",
      }}
    >
      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
        {label} →
      </span>
      <span style={{ fontFamily: FONT, fontSize: 12, color: C.inkMuted, lineHeight: 1.4 }}>
        {description}
      </span>
    </Link>
  );
}

// ─── Primary card (2-up grid, prominent) ─────────────────────────────────────

function PrimaryCard({
  title,
  description,
  meta,
  affordance,
  href,
  tone,
  toneSoft,
}: {
  title: string;
  description: string;
  meta?: string;
  affordance: string;
  href: string;
  tone?: string;
  toneSoft?: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        padding: "20px 20px 16px",
        textDecoration: "none",
        transition: "border-color 120ms, box-shadow 120ms",
      }}
    >
      <div
        style={{
          fontFamily: FONT,
          fontSize: 14,
          fontWeight: 700,
          color: C.ink,
          letterSpacing: -0.2,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 12.5,
          color: C.inkMuted,
          lineHeight: 1.5,
          flex: 1,
        }}
      >
        {description}
      </div>
      {meta && (
        <div style={{ fontFamily: FONT, fontSize: 11, color: tone ?? C.inkDim, fontWeight: 500 }}>
          {meta}
        </div>
      )}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: FONT,
          fontSize: 12,
          fontWeight: 600,
          color: tone ?? C.accent,
          letterSpacing: -0.05,
        }}
      >
        {affordance} →
      </div>
    </Link>
  );
}

// ─── Secondary card (3-col grid) ─────────────────────────────────────────────

function SecondaryCard({
  title,
  description,
  meta,
  affordance,
  href,
}: {
  title: string;
  description: string;
  meta?: string;
  affordance: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        padding: "16px 16px 14px",
        textDecoration: "none",
        transition: "border-color 120ms",
      }}
    >
      <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
        {title}
      </div>
      <div style={{ fontFamily: FONT, fontSize: 12, color: C.inkMuted, lineHeight: 1.4, flex: 1 }}>
        {description}
      </div>
      {meta && (
        <div style={{ fontFamily: FONT, fontSize: 11, color: C.inkMuted, fontWeight: 500 }}>
          {meta}
        </div>
      )}
      <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 600, color: C.accent, marginTop: 2 }}>
        {affordance} →
      </div>
    </Link>
  );
}

// ─── Plan snapshot card ───────────────────────────────────────────────────────

function PlanSnapshotCard({
  planTier,
  talentUsed,
  talentLimit,
  openInquiries,
  storefrontHost,
  tenantSlug,
}: {
  planTier: string;
  talentUsed: number;
  talentLimit: number | null;
  openInquiries: number;
  storefrontHost: string | null;
  tenantSlug: string;
}) {
  const planLabel = { free: "Free", studio: "Studio", agency: "Agency", network: "Network" }[planTier] ?? "Free";
  const isFreePlan = planTier === "free";

  // Per-plan inquiry cap (soft — just for display)
  const inquiryCap = isFreePlan ? 5 : null;

  const features: { label: string; detail: string; usage?: string }[] = [
    {
      label: "Public roster",
      detail: "Searchable across the Tulala network.",
      usage: talentLimit != null
        ? `${talentUsed} / ${talentLimit} talent`
        : talentUsed > 0 ? `${talentUsed} talent` : undefined,
    },
    {
      label: "Inbound inquiries",
      detail: "Clients message you through your storefront.",
      usage: inquiryCap != null ? `${openInquiries} / ${inquiryCap} this month` : undefined,
    },
    {
      label: "Storefront page",
      detail: storefrontHost ? `Lives at ${storefrontHost}.` : "Your public agency page.",
    },
    {
      label: "Talent + client messaging",
      detail: "Two-thread conversations on every inquiry.",
    },
    {
      label: "Listed in the public directory",
      detail: "Brands looking for talent can find you.",
    },
  ];

  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        padding: "18px 20px 16px",
        fontFamily: FONT,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.9,
              textTransform: "uppercase",
              color: isFreePlan ? C.coral : C.accent,
              fontFamily: FONT,
            }}
          >
            Today on {planLabel}
          </span>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: C.ink,
              fontFamily: FONT,
            }}
          >
            What works right now
          </span>
        </div>
        <Link
          href={`/${tenantSlug}/admin/settings?tab=plan`}
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: C.inkMuted,
            textDecoration: "none",
            fontFamily: FONT,
          }}
        >
          Compare plans →
        </Link>
      </div>

      {/* Feature list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {features.map((f, i) => (
          <div
            key={f.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "9px 0",
              borderBottom: i < features.length - 1 ? `1px solid ${C.borderSoft}` : "none",
            }}
          >
            {/* Check dot */}
            <span
              aria-hidden
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: C.accentSoft,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontSize: 9,
                color: C.accent,
                fontWeight: 700,
              }}
            >
              ✓
            </span>
            {/* Label + detail */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: C.ink,
                  fontFamily: FONT,
                }}
              >
                {f.label}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: C.inkMuted,
                  fontFamily: FONT,
                  marginLeft: 6,
                }}
              >
                {f.detail}
              </span>
            </div>
            {/* Usage pill */}
            {f.usage && (
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.inkMuted,
                  fontFamily: FONT,
                  whiteSpace: "nowrap",
                }}
              >
                {f.usage}
              </span>
            )}
          </div>
        ))}

        {/* Upgrade nudge rows — locked features on free / studio */}
        {(planTier === "free" || planTier === "studio") && (() => {
          const upgradePlan = planTier === "free" ? "Studio" : "Agency";
          const lockedItems = planTier === "free"
            ? ["Priority messaging", "Custom Tulala subdomain", "Team analytics & reporting"]
            : ["Custom domain", "Priority support", "Advanced analytics"];
          return (
            <>
              {lockedItems.map((item, i) => (
                <div
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "9px 0",
                    borderTop: `1px solid ${C.borderSoft}`,
                    opacity: 0.55,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "rgba(11,11,13,0.05)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontSize: 8,
                      color: C.inkDim,
                    }}
                  >
                    🔒
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: C.inkMuted, fontFamily: FONT }}>
                    {item}
                  </span>
                  {i === 0 && (
                    <Link
                      href={`/${tenantSlug}/admin/settings?tab=plan`}
                      style={{
                        marginLeft: "auto",
                        flexShrink: 0,
                        fontSize: 11,
                        fontWeight: 700,
                        color: C.inkMuted,
                        textDecoration: "none",
                        fontFamily: FONT,
                        whiteSpace: "nowrap",
                      }}
                    >
                      More with {upgradePlan} →
                    </Link>
                  )}
                </div>
              ))}
            </>
          );
        })()}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        {isFreePlan ? (
          <span
            style={{
              fontSize: 11.5,
              color: C.inkMuted,
              fontFamily: FONT,
              flex: 1,
              minWidth: 0,
              lineHeight: 1.4,
            }}
          >
            Caps are soft. We&apos;ll nudge before you run out — never block mid-conversation.
          </span>
        ) : (
          <span style={{ flex: 1 }} />
        )}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <Link
            href={`/${tenantSlug}/admin/roster`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 30,
              padding: "0 12px",
              borderRadius: 7,
              background: "transparent",
              border: `1px solid ${C.borderSoft}`,
              color: C.ink,
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Open roster
          </Link>
          <Link
            href={`/${tenantSlug}/admin/work`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 30,
              padding: "0 12px",
              borderRadius: 7,
              background: C.accent,
              color: "#fff",
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            See pipeline
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceAdminOverviewPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const [scope, session] = await Promise.all([
    getTenantScopeBySlug(tenantSlug),
    getCachedActorSession(),
  ]);

  if (!scope) notFound();

  const [metrics, activityItems, agencySummary] = await Promise.all([
    loadWorkspaceOverviewMetrics(scope.tenantId),
    loadRecentActivity(scope.tenantId),
    loadWorkspaceAgencySummary(scope.tenantId),
  ]);

  const userName = titleCase(
    userDisplayName(
      session.user?.email,
      session.user?.user_metadata as Record<string, unknown> | undefined,
    ),
  );

  const m = metrics ?? {
    rosterTotal: 0,
    rosterPublished: 0,
    openInquiries: 0,
    teamMembers: 0,
    pendingApprovals: 0,
    awaitingClientCount: 0,
    draftInquiryCount: 0,
    oldestCoordinatorWaitDays: null,
    nextBookingLabel: null,
    nextBookingDate: null,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

      {/* ── Activation banner (dismissable, client) ── */}
      <WorkspaceActivationBanner
        tenantSlug={tenantSlug}
        hasRoster={m.rosterTotal > 0}
        hasInquiry={m.openInquiries > 0}
      />

      {/* ── Today's focus card (client, only shows when there's urgency) ── */}
      <TodaysFocusCard
        awaitingClientCount={m.awaitingClientCount}
        draftCount={m.draftInquiryCount}
        oldestWaitDays={m.oldestCoordinatorWaitDays}
        nextBookingLabel={m.nextBookingLabel}
        tenantSlug={tenantSlug}
      />

      {/* ── Plan snapshot — "Today on Free / What works right now" ── */}
      {agencySummary && (
        <PlanSnapshotCard
          planTier={agencySummary.plan}
          talentUsed={agencySummary.talentCount}
          talentLimit={agencySummary.talentLimit}
          openInquiries={m.openInquiries}
          storefrontHost={`${agencySummary.slug}.tulala.digital`}
          tenantSlug={tenantSlug}
        />
      )}

      {/* ── Greeting row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <OverviewGreeting userName={userName} />

        <Link
          href={`/${tenantSlug}/admin/work`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 36,
            padding: "0 16px",
            borderRadius: 8,
            background: C.accent,
            color: "#fff",
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            letterSpacing: -0.1,
            flexShrink: 0,
          }}
        >
          + New inquiry
        </Link>
      </div>

      {/* ── Stat strip ── */}
      <div
        style={{
          display: "flex",
          gap: 40,
          flexWrap: "wrap",
          paddingBottom: 24,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <StatItem dot={C.green}  label="Rostered"       value={m.rosterTotal}      href="roster"   tenantSlug={tenantSlug} />
        <StatItem dot={C.amber}  label="Open inquiries" value={m.openInquiries}     href="work"     tenantSlug={tenantSlug} />
        <StatItem dot={C.blue}   label="Team"           value={m.teamMembers}       href="settings" tenantSlug={tenantSlug} />
        {m.pendingApprovals > 0 && (
          <StatItem dot={C.coral} label="Pending approvals" value={m.pendingApprovals} href="roster?filter=awaiting-approval" tenantSlug={tenantSlug} />
        )}
        {m.awaitingClientCount > 0 && (
          <StatItem dot="#D4A017" label="Awaiting client" value={m.awaitingClientCount} href="work" tenantSlug={tenantSlug} />
        )}
      </div>

      {/* ── Primary 2-col card row ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        <PrimaryCard
          title="What needs you today"
          description={
            m.awaitingClientCount + m.draftInquiryCount > 0
              ? `${m.awaitingClientCount} ${m.awaitingClientCount === 1 ? "inquiry" : "inquiries"} awaiting client decision and ${m.draftInquiryCount} ${m.draftInquiryCount === 1 ? "draft hasn't" : "drafts haven't"} been sent.`
              : "You're all caught up — no urgent actions right now."
          }
          meta={
            m.awaitingClientCount + m.draftInquiryCount > 0
              ? `${m.awaitingClientCount + m.draftInquiryCount} item${m.awaitingClientCount + m.draftInquiryCount === 1 ? "" : "s"} need attention`
              : undefined
          }
          affordance="Open pipeline"
          href={`/${tenantSlug}/admin/work`}
          tone={m.awaitingClientCount + m.draftInquiryCount > 0 ? "#8A6F1A" : C.accent}
        />
        <PrimaryCard
          title="Your storefront"
          description={
            agencySummary
              ? `Live at ${agencySummary.slug}.tulala.digital. Anyone with the link can see your published roster.`
              : "Your public agency page is live."
          }
          meta={`${m.rosterPublished} published · ${m.rosterTotal} total`}
          affordance="Manage site"
          href={`/${tenantSlug}/admin/site`}
          tone={C.green}
        />
      </div>

      {/* ── Secondary 3-col card row ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 10,
        }}
      >
        <SecondaryCard
          title="Drafts & holds"
          description="Inquiries you started but haven't sent."
          meta={`${m.draftInquiryCount} item${m.draftInquiryCount === 1 ? "" : "s"}`}
          affordance="Review"
          href={`/${tenantSlug}/admin/work`}
        />
        <SecondaryCard
          title="Sent — waiting"
          description="Offers sent. Waiting on the client to confirm."
          meta={`${m.awaitingClientCount} item${m.awaitingClientCount === 1 ? "" : "s"}`}
          affordance="Review"
          href={`/${tenantSlug}/admin/work`}
        />
        <SecondaryCard
          title="Talent roster"
          description="Manage your talent, drafts, and approvals."
          meta={`${m.rosterTotal} rostered · ${m.rosterPublished} published`}
          affordance="Open roster"
          href={`/${tenantSlug}/admin/roster`}
        />
        <SecondaryCard
          title="Clients"
          description="Client accounts and booking history."
          affordance="Open clients"
          href={`/${tenantSlug}/admin/clients`}
        />
        {m.pendingApprovals > 0 && (
          <SecondaryCard
            title="Approval queue"
            description="Talent waiting for agency approval before going live."
            meta={`${m.pendingApprovals} pending`}
            affordance="Review approvals"
            href={`/${tenantSlug}/admin/roster?filter=awaiting-approval`}
          />
        )}
      </div>

      {/* ── Analytics stub section ── */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontFamily: FONT,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: C.inkDim,
            }}
          >
            Analytics
          </span>
          <span style={{ flex: 1, height: 1, background: C.border }} />
          <Link
            href={`/${tenantSlug}/admin/operations`}
            style={{
              fontFamily: FONT,
              fontSize: 11.5,
              fontWeight: 500,
              color: C.inkMuted,
              textDecoration: "none",
            }}
          >
            All operations →
          </Link>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          {[
            { title: "Revenue", desc: "Monthly revenue, top clients, trend." },
            { title: "Conversion funnel", desc: "Inquiry → offer → booking drop-off." },
            { title: "Top performers", desc: "Most-booked talent and best clients." },
            { title: "Team workload", desc: "Per-coordinator queue depth and SLA risk." },
          ].map(({ title, desc }) => (
            <Link
              key={title}
              href={`/${tenantSlug}/admin/operations`}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                background: C.cardBg,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
                padding: "14px 16px 12px",
                textDecoration: "none",
                transition: "border-color 120ms",
                opacity: 0.72,
              }}
            >
              <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
                {title}
              </div>
              <div style={{ fontFamily: FONT, fontSize: 11.5, color: C.inkMuted, lineHeight: 1.4 }}>
                {desc}
              </div>
              <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: C.inkMuted, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    display: "inline-flex",
                    padding: "1px 7px",
                    borderRadius: 999,
                    background: "rgba(11,11,13,0.05)",
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    color: C.inkDim,
                    textTransform: "uppercase",
                  }}
                >
                  Coming soon
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Recent activity feed ── */}
      <div style={{ marginTop: 8 }}>
        {/* Section header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <h2
            style={{
              fontFamily: FONT,
              fontSize: 18,
              fontWeight: 500,
              color: C.ink,
              margin: 0,
              letterSpacing: -0.2,
            }}
          >
            Recent activity
          </h2>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link
              href={`/${tenantSlug}/admin/work`}
              style={{
                fontFamily: FONT,
                fontSize: 12,
                fontWeight: 500,
                color: C.inkMuted,
                textDecoration: "none",
              }}
            >
              View pipeline →
            </Link>
            <Link
              href={`/${tenantSlug}/admin/messages`}
              style={{
                fontFamily: FONT,
                fontSize: 12,
                fontWeight: 600,
                color: C.accent,
                textDecoration: "none",
              }}
            >
              All messages →
            </Link>
          </div>
        </div>

        {/* Feed card */}
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 12,
            padding: "0 18px",
          }}
        >
          {activityItems.length === 0 ? (
            <div
              style={{
                padding: "24px 0",
                fontFamily: FONT,
                fontSize: 13,
                color: C.inkMuted,
                textAlign: "center",
              }}
            >
              No activity yet — events appear here as your team works through inquiries.
            </div>
          ) : (
            activityItems.map((ev, i) => (
              <ActivityFeedRow key={ev.id} ev={ev} divider={i > 0} />
            ))
          )}
        </div>
      </div>

      {/* ── Quick-action tiles ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        <QuickTile
          label="Roster"
          description="Add talent, review profiles, and manage approvals."
          href={`/${tenantSlug}/admin/roster`}
        />
        <QuickTile
          label="Work"
          description="All active inquiries, offers, and confirmed bookings."
          href={`/${tenantSlug}/admin/work`}
        />
        <QuickTile
          label="Clients"
          description="Client accounts, trust tiers, and booking history."
          href={`/${tenantSlug}/admin/clients`}
        />
        <QuickTile
          label="Messages"
          description="All inquiry threads across your workspace."
          href={`/${tenantSlug}/admin/messages`}
        />
        <QuickTile
          label="Settings"
          description="Plan, team members, taxonomy, and workspace config."
          href={`/${tenantSlug}/admin/settings`}
        />
      </div>

    </div>
  );
}

// ─── Activity row ────────────────────────────────────────────────────────────

type ActivityItem = {
  id: string;
  event_type: string;
  actor_name: string | null;
  actor_role: string;
  inquiry_contact: string;
  inquiry_company: string | null;
  created_at: string;
};

function activityLabel(ev: ActivityItem): { actor: string; action: string; target: string } {
  const actor = ev.actor_name ?? (ev.actor_role === "system" ? "System" : "Team");
  const target = ev.inquiry_company
    ? `${ev.inquiry_company} — ${ev.inquiry_contact}`
    : ev.inquiry_contact;

  // Strip the "legacy." prefix added by backfill migration to unrecognized old events
  const raw = ev.event_type.replace(/^legacy\./, "");

  const map: Record<string, string> = {
    "offer.sent":                     "sent an offer to",
    "offer.accepted":                 "accepted offer for",
    "offer.created":                  "drafted an offer for",
    "offer.draft_updated":            "updated offer draft for",
    "offer_sent":                     "sent an offer to",
    "approval.approved":              "approved inquiry from",
    "approval.rejected":              "declined inquiry from",
    "approval.submitted":             "submitted approval for",
    "booking.created":                "confirmed booking for",
    "booking.converted_from_inquiry": "converted inquiry to booking for",
    "inquiry.cancelled":              "cancelled inquiry from",
    "inquiry.message_sent":           "sent a message about",
    "inquiry.submitted_v2":           "submitted inquiry from",
    "inquiry.submitted":              "submitted inquiry from",
    "participant.status_changed":     "updated status for",
  };

  return {
    actor,
    action: map[raw] ?? raw.replace(/[._]+/g, " ") + " on",
    target,
  };
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 2)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function activityIcon(eventType: string): string {
  const raw = eventType.replace(/^legacy\./, "");
  if (raw.includes("booking")) return "✅";
  if (raw.includes("approval.approved") || raw.includes("accepted")) return "👍";
  if (raw.includes("approval.rejected") || raw.includes("cancelled")) return "✖";
  if (raw.includes("offer")) return "📨";
  if (raw.includes("message")) return "💬";
  if (raw.includes("submitted")) return "📤";
  return "📋";
}

function ActivityFeedRow({ ev, divider }: { ev: ActivityItem; divider: boolean }) {
  const { actor, action, target } = activityLabel(ev);
  const icon = activityIcon(ev.event_type);
  const ts   = relativeTime(ev.created_at);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 0",
        borderTop: divider ? `1px solid ${C.borderSoft}` : "none",
        fontFamily: FONT,
      }}
    >
      {/* Icon bubble */}
      <div
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "rgba(11,11,13,0.04)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 13,
          color: C.inkMuted,
        }}
      >
        {icon}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.4 }}>
          <strong style={{ fontWeight: 600 }}>{actor}</strong>
          {" "}{action}{" "}
          <strong style={{ fontWeight: 500 }}>{target}</strong>
        </div>
        <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 2 }}>{ts}</div>
      </div>
    </div>
  );
}
