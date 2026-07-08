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
  StatusPill,
  TRANSITION,
  UsageRow,
  getTeam,
  meetsPlan,
  nextPlan,
  openSupportEmail,
  planPrice,
  teamCap,
  useAdminShell
} from "./drawer-shared";
import { useDashboardText } from "../dashboard-i18n";

// Phase 1d (remediation §4): 4 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function TenantSummaryDrawer() {
  const { state, closeDrawer, openDrawer, openUpgrade, effectiveRoster, effectiveTeamMembers, effectiveTenant } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const planMeta = PLAN_META[state.plan];
  const rosterCount = effectiveRoster.length;
  const rosterCap = state.plan === "free" ? 5 : state.plan === "studio" ? 50 : state.plan === "agency" ? 200 : 999;
  const teamCount = effectiveTeamMembers.length > 0 ? effectiveTeamMembers.length : getTeam(state.plan).length;

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
        <UsageRow label={`${rosterCount} / ${rosterCap === 999 ? "∞" : rosterCap} ${tt("talents")}`} value={rosterCap === 999 ? 0.4 : rosterCount / rosterCap} />
        <UsageRow label={`${teamCount} / ${teamCap(state.plan)} ${tt("seats")}`} value={teamCap(state.plan) === 999 ? 0.2 : teamCount / teamCap(state.plan)} />
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
  const { state, closeDrawer, openUpgrade, toast } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
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

      {state.plan !== "free" && (
        <Section title={tt("Payment method")}>
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
                {tt("Visa ending {last4}").replace("{last4}", "4242")}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5 }} className="text-admin-ink-muted">
                {tt("Expires {date}").replace("{date}", "09 / 2028")}
              </div>
            </div>
            <GhostButton
              size="sm"
              onClick={() => {
                openSupportEmail(
                  "Tulala billing payment method update",
                  "Please help me update the payment method for this workspace.",
                );
                toast(tt("Opening billing support email"));
              }}
            >
              {tt("Update")}
            </GhostButton>
          </div>
        </Section>
      )}

      {state.plan !== "free" && (
        <Section title={tt("Recent invoices")}>
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
                <span className="text-admin-ink">{inv.date}</span>
                <span className="text-admin-ink-muted">{inv.amount}</span>
                <StateChipMini label={tt(inv.status)} tone="green" />
                <button
                  type="button"
                  onClick={() => {
                    openSupportEmail(
                      `Tulala invoice request ${inv.id}`,
                      `Please send the PDF for invoice ${inv.id} dated ${inv.date} (${inv.amount}).`,
                    );
                    toast(tt("Opening invoice support email"));
                  }}
                  style={{ color: COLORS.inkMuted, fontSize: 12, textDecoration: "none", justifySelf: "end", background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: FONTS.body }}
                >
                  {tt("PDF")}
                </button>
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
