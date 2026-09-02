"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  type AdminShellIconName,
  COLORS,
  DrawerId,
  DrawerShell,
  FONTS,
  GhostButton,
  Icon,
  IconChip,
  PLAN_META,
  Plan,
  PlanChip,
  PrimaryButton,
  SecondaryButton,
  Section,
  StateChipMini,
  TRANSITION,
  UsageRow,
  getTeam,
  meetsPlan,
  nextPlan,
  planPrice,
  teamCap,
  useAdminShell
} from "./drawer-shared";
import { useDashboardText } from "../dashboard-i18n";
// Real workspace billing. `openSubscriptionPortal` is capability-gated on
// `manage_billing` server-side, so this import cannot widen access.
import { openSubscriptionPortal } from "@/app/(workspace)/[tenantSlug]/admin/account/stripe-billing-actions";
import { seatCapForPlan } from "@/lib/saas/plan-seat-caps";

// Phase 1d (remediation §4): 4 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function TenantSummaryDrawer() {
  const { state, closeDrawer, openDrawer, openUpgrade, effectiveRoster, effectiveTeamMembers, effectiveTenant } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const planMeta = PLAN_META[state.plan];
  const rosterCount = effectiveRoster.length;
  // Roster cap comes from PLAN_SEAT_CAPS, the table `agencies.talent_seat_limit`
  // is actually enforced against. This line used to hard-code 5 / 50 / 200 / 999,
  // which told a Studio workspace it had 50 profiles when signup refuses the
  // 16th, and told an Agency it had 200 when the real answer is unlimited.
  const rosterCap = seatCapForPlan(state.plan);
  const teamCount = effectiveTeamMembers.length > 0 ? effectiveTeamMembers.length : getTeam(state.plan).length;
  // Team seats from PLAN_LIMITS.max_team_seats, the ladder the invite gate
  // enforces. `null` = unlimited.
  const seats = teamCap(state.plan);

  const jumpItems: { label: string; icon: AdminShellIconName; drawer: DrawerId }[] = [
    { label: tt("Plan & billing"), icon: "credit", drawer: "plan-billing" },
    { label: tt("Recent invoices"), icon: "mail", drawer: "plan-billing" },
    { label: tt("Team & permissions"), icon: "team", drawer: "team" },
    { label: tt("Branding"), icon: "palette", drawer: "branding" },
    { label: tt("Custom domain"), icon: "globe", drawer: "domain" },
  ];

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={effectiveTenant.name.toUpperCase()}
      description={`${tt(planMeta.label)} ${tt("plan")} · ${planPrice(state.plan)}`}
      footer={
        <>
          {state.plan !== "network" && (
            <PrimaryButton
              onClick={() => {
                closeDrawer();
                openDrawer("plan-compare");
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name="arrow-right" size={12} stroke={1.8} />
                {tt("Compare plans")}
              </span>
            </PrimaryButton>
          )}
          <SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>
        </>
      }
    >
      <Section title={tt("At a glance")}>
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
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: COLORS.amber,
            }}
          />
          <div className="flex-1">
            <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 600 }} className="text-admin-ink">
              {tt(planMeta.label)} {tt("plan")}
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 12, marginTop: 1 }} className="text-admin-ink-muted">
              {planPrice(state.plan)} {state.plan !== "free" && tt("· billed monthly")}
            </div>
          </div>
        </div>
      </Section>

      <Section title={tt("Roster")}>
        <UsageRow
          label={`${rosterCount} / ${rosterCap === null ? "∞" : rosterCap} ${tt("talents")}`}
          value={rosterCap === null ? 0.4 : rosterCap === 0 ? 0 : rosterCount / rosterCap}
        />
        <UsageRow
          label={`${teamCount} / ${seats === null ? "∞" : seats} ${tt("seats")}`}
          value={seats === null ? 0.2 : seats === 0 ? 0 : teamCount / seats}
        />
        <UsageRow label={`${tt("Storage")} · 1.4 / 25 GB`} value={1.4 / 25} />
      </Section>

      <Section title={tt("Jump to")}>
        <div className="flex flex-col gap-2">
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
                transition: `border-color ${TRANSITION.micro}`,
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

      <Section title={tt("Plan ladder")}>
        <div className="flex flex-col gap-1.5">
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
                {/* WS-12.9 — icon, not color alone, signals reached vs locked */}
                <span
                  aria-hidden
                  style={{
                    width: 14,
                    height: 14,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: isReached ? COLORS.ink : COLORS.inkDim,
                  }}
                >
                  {isReached
                    ? <Icon name="check" size={11} stroke={2.5} />
                    : <Icon name="lock" size={11} stroke={1.8} />}
                </span>
                <span style={{ fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, minWidth: 70 }} className="text-admin-ink">
                  {tt(PLAN_META[p].label)}
                </span>
                <span style={{ fontFamily: FONTS.body, fontSize: 12, flex: 1 }} className="text-admin-ink-muted">
                  {tt(PLAN_META[p].theme)}
                </span>
                {isCurrent && (
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }} className="text-admin-ink-muted">
                    {tt("Current")}
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


export function SiteSetupDrawer() {
  const { closeDrawer, openDrawer, toast } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const [done, setDone] = useState<Set<string>>(new Set(["homepage"]));
  const steps = [
    { id: "homepage", label: tt("Homepage hero"), desc: tt("Headline, sub, CTA. Sets the tone."), drawer: "homepage" },
    { id: "pages", label: tt("Pages"), desc: tt("About, Press, FAQ, Contact."), drawer: "pages" },
    { id: "posts", label: tt("Posts"), desc: tt("Editorial features, news, BTS."), drawer: "posts" },
    { id: "navigation", label: tt("Navigation & footer"), desc: tt("Header structure, footer columns."), drawer: "navigation" },
    { id: "seo", label: tt("SEO & defaults"), desc: tt("Meta, sitemap, redirects."), drawer: "seo" },
  ];
  const completedCount = done.size;

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("Get your site live")}
      description={tt("{done} of {total} steps complete. Most agencies finish in under 30 minutes.")
        .replace("{done}", String(completedCount))
        .replace("{total}", String(steps.length))}
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              toast(tt("Setup progress saved"));
              closeDrawer();
            }}
          >
            {tt("Save progress")}
          </PrimaryButton>
        </>
      }
    >
      <div style={{ border: `1px solid rgba(15,79,62,0.18)`, borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }} className="bg-admin-surface-alt">
        <div className="flex-1">
          <div style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 500 }} className="text-admin-ink">
            {tt("{pct}% complete").replace("{pct}", String(Math.round((completedCount / steps.length) * 100)))}
          </div>
          <div style={{ height: 6, background: "rgba(15,79,62,0.18)", borderRadius: 999, marginTop: 6, overflow: "hidden" }}>
            <div style={{ '--progress-w': `${(completedCount / steps.length) * 100}%` }} className="w-[var(--progress-w)] h-full rounded-full [transition:width_.3s]"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
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
                borderRadius: 12, }} className="bg-admin-accent-deep">
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
                aria-label={isDone ? tt("Mark incomplete") : tt("Mark complete")}
              >
                {isDone ? (
                  <Icon name="check" size={14} stroke={2.5} color="#fff" />
                ) : (
                  <span className="text-admin-ink-muted text-admin-11 font-semibold">
                    {idx + 1}
                  </span>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 600, textDecoration: isDone ? "line-through" : "none", opacity: isDone ? 0.6 : 1 }} className="text-admin-ink">
                  {step.label}
                </div>
                <div style={{ fontFamily: FONTS.body, fontSize: 12, marginTop: 2 }} className="text-admin-ink-muted">
                  {step.desc}
                </div>
              </div>
              <SecondaryButton size="sm" onClick={() => openDrawer(step.drawer as DrawerId)}>
                {isDone ? tt("Edit") : tt("Open")}
              </SecondaryButton>
            </div>
          );
        })}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Plan & billing
// ════════════════════════════════════════════════════════════════════


export function PlanBillingDrawer() {
  const { state, closeDrawer, openUpgrade, toast, tenantSlug, adminBasePath } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const router = useRouter();
  const planMeta = PLAN_META[state.plan];
  const [portalPending, setPortalPending] = useState(false);

  // Invoices + payment method used to be INVENTED here: a three-row list of
  // "Paid" invoices synthesized from the current month backwards, and a card
  // reading "Visa ending 4242" — Stripe's test number — shown to real
  // workspaces. Both are gone. Real invoices, the real payment method, and
  // cancellation all live in the Stripe Billing Portal, opened below through
  // `openSubscriptionPortal` (capability-gated on `manage_billing`).
  const openPortal = () => {
    if (!tenantSlug) return;
    setPortalPending(true);
    void openSubscriptionPortal(tenantSlug)
      .then((res) => {
        if (res.ok) {
          // Full navigation, not router.push — the portal is on Stripe's origin.
          window.location.href = res.redirectUrl;
          return;
        }
        setPortalPending(false);
        toast(res.error);
      })
      .catch(() => {
        setPortalPending(false);
        toast(tt("Could not open the billing portal."));
      });
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={tt("Plan & billing")}
      description={tt("Manage your subscription and see past invoices.")}
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>
          {state.plan !== "network" && (
            <PrimaryButton
              onClick={() =>
                openUpgrade({
                  feature: `${tt(PLAN_META[nextPlan(state.plan)!].label)} ${tt("plan")}`,
                  why: tt(PLAN_META[nextPlan(state.plan)!].theme),
                  requiredPlan: nextPlan(state.plan)!,
                })
              }
            >
              {tt("Upgrade plan")}
            </PrimaryButton>
          )}
        </>
      }
    >
      <Section title={tt("Current plan")}>
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div className="flex items-center gap-2.5">
              <PlanChip plan={state.plan} variant="solid" />
              <span style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500 }} className="text-admin-ink">
                {tt(planMeta.label)}
              </span>
            </div>
            <span style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600 }} className="text-admin-ink">
              {planPrice(state.plan)}
            </span>
          </div>
          <p style={{ fontFamily: FONTS.body, fontSize: 12.5, margin: 0, lineHeight: 1.5 }} className="text-admin-ink-muted">
            {tt(planMeta.theme)}. {state.plan === "free" ? tt("Upgrade any time.") : tt("Cancel any time.")}
          </p>
        </div>
      </Section>

      {/* Payment method + invoices — Stripe is the only source of truth for
          both, so this section opens the Billing Portal instead of restating
          (or, as before, inventing) what Stripe already holds. */}
      {state.plan !== "free" && (
        <Section title={tt("Payment method and invoices")}>
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
            <div className="flex-1">
              <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500 }} className="text-admin-ink">
                {tt("Managed in Stripe")}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5 }} className="text-admin-ink-muted">
                {tt("Card on file, invoice history, and cancellation.")}
              </div>
            </div>
            <GhostButton size="sm" onClick={openPortal} disabled={portalPending || !tenantSlug}>
              {portalPending ? tt("Opening…") : tt("Open")}
            </GhostButton>
          </div>
        </Section>
      )}

      <Section title={tt("Account and billing")}>
        <button
          type="button"
          onClick={() => {
            closeDrawer();
            router.push(`${adminBasePath}/account`);
          }}
          style={{
            width: "100%",
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            textAlign: "left",
            fontFamily: FONTS.body,
          }}
        >
          <div className="flex-1">
            <div style={{ fontSize: 13, fontWeight: 500 }} className="text-admin-ink">
              {tt("Subscription details")}
            </div>
            <div style={{ fontSize: 11.5 }} className="text-admin-ink-muted">
              {tt("Live plan status, renewal date, and roster usage.")}
            </div>
          </div>
          <StateChipMini label={tt("Open")} tone="dim" />
        </button>
      </Section>
    </DrawerShell>
  );
}

/**
 * Compact tone+label pill (no dot). Thin alias over StatusPill — kept for
 * call-site naming clarity.
 */
