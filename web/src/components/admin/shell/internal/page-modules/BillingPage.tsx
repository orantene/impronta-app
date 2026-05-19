"use client";

import { useEffect, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { loadAgencyAutoAck, updateAgencyAutoAck } from "@/lib/server-actions/admin-workspace-settings";
import { Card, Divider, Icon, LockedCard, PaymentStatusChip, PayoutStatusChip, PlanChip, PrimaryButton, PrimaryCard, ReadOnlyChip, SecondaryCard, scrollBehavior } from "../primitives";
import { COLORS, FONTS, PAYOUT_STATUS_META, PLAN_FEE_META, PLAN_META, RADIUS, TRANSITION, WORKSPACE_PAYMENTS, getWorkspacePayout, meetsPlan, meetsRole, useAdminShell } from "../state";
import type { Plan } from "../state";
import { Grid, PageHeader } from "./pages-shared";


// TierSection — section header chip + grid
export function TierSection({
  tone,
  label,
  title,
  subtitle,
  rightSlot,
  children,
}: {
  tone: "ink" | "indigo" | "amber" | "green";
  label: string;
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
}) {
  const palette: Record<typeof tone, { bg: string; fg: string; dot: string }> = {
    ink: { bg: "rgba(11,11,13,0.05)", fg: COLORS.ink, dot: COLORS.ink },
    indigo: { bg: "rgba(78,90,180,0.10)", fg: "#3D478A", dot: "#5C6BD0" },
    amber: { bg: "rgba(82,96,109,0.12)", fg: COLORS.amberDeep, dot: COLORS.amber },
    green: { bg: "rgba(46,125,91,0.12)", fg: COLORS.successDeep, dot: COLORS.green },
  };
  const p = palette[tone];
  return (
    <section style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            background: p.bg,
            color: p.fg,
            fontFamily: FONTS.body,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            borderRadius: 999,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.dot }} />
          {label}
        </span>
        <h2
          style={{
            fontFamily: FONTS.display,
            fontSize: 19,
            fontWeight: 500,
            letterSpacing: -0.2,
            color: COLORS.ink,
            margin: 0,
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <span
            style={{
              fontFamily: FONTS.body,
              fontSize: 12.5,
              color: COLORS.inkMuted,
              flex: 1,
              minWidth: 0,
            }}
          >
            {subtitle}
          </span>
        )}
        {rightSlot}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {children}
      </div>
    </section>
  );
}

// TierCard — renders Primary or Locked depending on whether plan unlocks it
export function TierCard({
  title,
  description,
  icon,
  requiredPlan,
  currentPlan,
  onClick,
  onUpgrade,
  meta,
}: {
  title: string;
  description?: string;
  icon: "globe" | "settings" | "team" | "palette" | "credit" | "calendar" | "mail" | "search" | "bolt" | "user";
  requiredPlan: Plan;
  currentPlan: Plan;
  onClick: () => void;
  onUpgrade: () => void;
  meta?: ReactNode;
}) {
  const unlocked = meetsPlan(currentPlan, requiredPlan);
  if (unlocked) {
    return (
      <PrimaryCard
        title={title}
        description={description}
        icon={<Icon name={icon} size={14} stroke={1.7} />}
        affordance="Open"
        onClick={onClick}
        meta={meta}
      />
    );
  }
  return (
    <LockedCard
      title={title}
      description={description}
      requiredPlan={requiredPlan}
      onClick={onUpgrade}
    />
  );
}

function PlanLadderStrip() {
  const { state, setPlan, openUpgrade } = useAdminShell();
  const items: { plan: Plan; promise: string }[] = [
    { plan: "free", promise: "Public storefront on Tulala discovery" },
    { plan: "studio", promise: "Custom domain + private inquiries" },
    { plan: "agency", promise: "Branded design + custom fields + team" },
    { plan: "network", promise: "Multi-brand hub + cross-roster pool" },
  ];
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: 4,
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 4,
      }}
    >
      {items.map((item) => {
        const isCurrent = state.plan === item.plan;
        const isReached = meetsPlan(state.plan, item.plan);
        return (
          <button
            key={item.plan}
            type="button"
            disabled={isReached && !isCurrent}
            aria-disabled={isReached && !isCurrent}
            onClick={() => {
              if (isReached) return;
              openUpgrade({
                feature: `${PLAN_META[item.plan].label} plan`,
                why: PLAN_META[item.plan].theme,
                requiredPlan: item.plan,
              });
            }}
            style={{
              padding: "12px 14px",
              borderRadius: 9,
              background: isCurrent ? COLORS.fill : "transparent",
              color: isCurrent ? "#fff" : COLORS.ink,
              border: "none",
              cursor: isReached ? "default" : "pointer",
              textAlign: "left",
              fontFamily: FONTS.body,
              opacity: isReached && !isCurrent ? 0.6 : 1,
              transition: `background ${TRANSITION.sm}`,
            }}
            onMouseEnter={(e) => {
              if (!isReached) e.currentTarget.style.background = "rgba(11,11,13,0.04)";
            }}
            onMouseLeave={(e) => {
              if (!isReached && !isCurrent) e.currentTarget.style.background = "transparent";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: isCurrent ? "rgba(255,255,255,0.7)" : COLORS.inkDim,
                }}
              >
                {PLAN_META[item.plan].label}
              </span>
              {isCurrent && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 600,
                    background: "rgba(255,255,255,0.18)",
                    color: "#fff",
                    padding: "1px 6px",
                    borderRadius: 4,
                                      }}
                >
                  Current
                </span>
              )}
              {!isReached && <Icon name="lock" size={10} stroke={1.7} color={COLORS.inkDim} />}
            </div>
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.4,
                color: isCurrent ? "rgba(255,255,255,0.78)" : COLORS.inkMuted,
              }}
            >
              {item.promise}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// BILLING / PAYMENTS
// ════════════════════════════════════════════════════════════════════
//
// Workspace-level billing surface. Surfaces:
//   1. Current plan + platform fee economics (from PLAN_FEE_META)
//   2. Default payout receiver (workspace-level connection state)
//   3. Recent payment activity (WORKSPACE_PAYMENTS rows)
//   4. (Free plan) upgrade nudge — payments require Studio+ to operate
//
// The data layer lives in _state.tsx. This page is presentation only.

function BillingPage() {
  const { state, openDrawer, openUpgrade } = useAdminShell();
  const isOwner = state.role === "owner";
  const isAdmin = meetsRole(state.role, "admin");
  const isFree = state.plan === "free";
  const payout = getWorkspacePayout(state.plan);
  const fee = PLAN_FEE_META[state.plan];

  return (
    <>
      <PageHeader
        title="Billing"
        subtitle="Platform fee, payout routing, and recent payment activity."
        actions={
          isOwner ? (
            <PrimaryButton onClick={() => openDrawer("plan-billing")}>
              Manage plan
            </PrimaryButton>
          ) : null
        }
      />

      {/* Top row — fee economics + default receiver */}
      <Grid cols="2">
        <PrimaryCard
          title={`Platform fee · ${fee.label}`}
          description={fee.controlsHint}
          icon={<Icon name="credit" size={14} stroke={1.7} />}
          badge={<PlanChip plan={state.plan} variant="solid" />}
          affordance={isOwner ? "Compare plan fees" : "View"}
          onClick={() => openDrawer("plan-billing")}
        />

        {!isFree && isAdmin ? (
          <PrimaryCard
            title="Default payout receiver"
            description={`${payout.defaultReceiver.displayName}${payout.defaultReceiver.legalName ? ` · ${payout.defaultReceiver.legalName}` : ""}`}
            icon={<Icon name="team" size={14} stroke={1.7} />}
            badge={<PayoutStatusChip status={payout.defaultReceiver.status} />}
            affordance="Manage receiver"
            onClick={() => openDrawer("payments-setup")}
          />
        ) : isFree ? (
          <LockedCard
            title="Default payout receiver"
            description="Free workspaces don't run payments through Tulala. Studio unlocks card acceptance + payout routing."
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: "Payments",
                why: "Accept client card payments and route net payout to one verified receiver per booking.",
                requiredPlan: "studio",
                unlocks: [
                  "Card acceptance (Visa / Mastercard / Amex)",
                  "Connected payout receiver",
                  "Lower platform fee",
                  "Per-booking receipts",
                ],
              })
            }
          />
        ) : (
          <SecondaryCard
            title="Default payout receiver"
            description={`${payout.defaultReceiver.displayName} · ${PAYOUT_STATUS_META[payout.defaultReceiver.status].label}`}
            meta={<ReadOnlyChip />}
            affordance="View"
            onClick={() => openDrawer("payments-setup")}
          />
        )}
      </Grid>

      {/* Volume + pending */}
      {!isFree && (
        <Grid cols="3">
          <SecondaryCard
            title="30-day volume"
            description={payout.recentVolume30d}
            affordance="See activity"
            onClick={() => { document.querySelector("[data-billing-activity]")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }); }}
          />
          <SecondaryCard
            title="Pending payouts"
            description={payout.pendingPayouts}
            affordance="See activity"
            onClick={() => { document.querySelector("[data-billing-activity]")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }); }}
          />
          <SecondaryCard
            title="Card acceptance"
            description={payout.acceptCards ? "Visa · Mastercard · Amex enabled" : "Not enabled"}
            affordance="Configure"
            onClick={() => openDrawer("payments-setup")}
          />
        </Grid>
      )}

      <div data-billing-activity><Divider label="Recent activity" /></div>

      {isFree ? (
        <SecondaryCard
          title="No payment activity yet"
          description="Payments turn on at Studio. Free workspaces can still take inquiries — they just settle off-platform."
          affordance="See plans"
          onClick={() =>
            openUpgrade({
              feature: "Payments",
              why: "Studio adds card acceptance + connected payout receiver.",
              requiredPlan: "studio",
            })
          }
        />
      ) : (
        <BillingActivityTable />
      )}
    </>
  );
}

/**
 * Recent workspace payment activity — one row per booking. Mirrors
 * WORKSPACE_PAYMENTS but renders an interactive list with a chip per
 * row and a click-to-open-drawer affordance.
 */
function BillingActivityTable() {
  const { openDrawer } = useAdminShell();
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr 1.2fr 1fr 0.6fr",
          padding: "10px 16px",
          background: COLORS.surfaceAlt,
          borderBottom: `1px solid ${COLORS.borderSoft}`,
          fontFamily: FONTS.body,
          fontSize: 11,
                    color: COLORS.inkMuted,
          fontWeight: 600,
        }}
      >
        <span>Booking</span>
        <span>Client · brief</span>
        <span style={{ textAlign: "right" }}>Total</span>
        <span style={{ textAlign: "right" }}>Net payout</span>
        <span>Receiver</span>
        <span>Status</span>
        <span style={{ textAlign: "right" }}>Date</span>
      </div>
      {WORKSPACE_PAYMENTS.map((row) => {
        const [hovered, setHovered] = useState(false);
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => openDrawer("payment-detail", { id: row.id })}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr 1.2fr 1fr 0.6fr",
              alignItems: "center",
              gap: 0,
              padding: "12px 16px",
              background: hovered ? "rgba(11,11,13,0.025)" : "transparent",
              border: "none",
              borderTop: `1px solid ${COLORS.borderSoft}`,
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 13,
              color: COLORS.ink,
              transition: `background ${TRANSITION.micro}`,
            }}
          >
            <div style={{ fontWeight: 600 }}>{row.ref}</div>
            <div>
              <div style={{ color: COLORS.ink }}>{row.client}</div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted }}>{row.brief}</div>
            </div>
            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.total}</div>
            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: COLORS.inkMuted }}>
              {row.netPayout}
              <div style={{ fontSize: 11, color: COLORS.inkDim }}>fee {row.fee}</div>
            </div>
            <div style={{ color: COLORS.inkMuted }}>{row.receiverName}</div>
            <div>
              <PaymentStatusChip status={row.status} />
            </div>
            <div style={{ textAlign: "right", fontSize: 12 }}>
              {hovered ? (
                <span style={{ color: COLORS.accent, fontWeight: 600, fontSize: 11 }}>Details →</span>
              ) : (
                <span style={{ color: COLORS.inkMuted }}>{row.date}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// WORKSPACE (settings)
// ════════════════════════════════════════════════════════════════════

// WS-3.5  Settings page redesign — anchor-link sub-nav
// ─────────────────────────────────────────────────────────────────────────────

// ── Step 13: Auto-acknowledgement settings form ───────────────────────────────
// Inline in the Email & communications accordion — toggle + textarea.
// Loads current values on mount; saves on toggle-change or textarea blur.

export function AutoAckSettingsRow() {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [message, setMessage] = useState<string>("Thanks — we'll get back to you within 4 hours.");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState<boolean>(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadAgencyAutoAck().then((res: Awaited<ReturnType<typeof loadAgencyAutoAck>>) => {
      if (cancelled) return;
      if (res.ok) {
        setEnabled(res.data.autoAckEnabled);
        setMessage(res.data.autoAckMessage);
      }
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function save(nextEnabled: boolean, nextMessage: string) {
    setSaving(true);
    setError(null);
    setSavedOk(false);
    startTransition(async () => {
      const res = await updateAgencyAutoAck({
        auto_ack_enabled: nextEnabled,
        auto_ack_message: nextMessage.trim() || "Thanks — we'll get back to you within 4 hours.",
      });
      setSaving(false);
      if (res.ok) {
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 2000);
      } else {
        setError(res.error);
      }
    });
  }

  if (loading) return null;

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: RADIUS.md,
        padding: "14px 16px",
        marginBottom: 8,
        fontFamily: FONTS.body,
      }}
    >
      {/* Toggle row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: enabled ? 10 : 0 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Auto-acknowledgement</div>
          <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
            Instant reply to clients when a new inquiry is submitted.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => {
            const next = !enabled;
            setEnabled(next);
            save(next, message);
          }}
          style={{
            flexShrink: 0,
            width: 36,
            height: 20,
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            background: enabled ? COLORS.fill : COLORS.border,
            position: "relative",
            transition: `background ${TRANSITION.sm}`,
          }}
        >
          <span style={{
            display: "block",
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#fff",
            position: "absolute",
            top: 3,
            left: enabled ? 19 : 3,
            transition: `left ${TRANSITION.sm}`,
            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          }} />
        </button>
      </div>

      {/* Message textarea (only when enabled) */}
      {enabled && (
        <textarea
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onBlur={() => save(enabled, message)}
          disabled={saving}
          maxLength={500}
          placeholder="Thanks — we'll get back to you within 4 hours."
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontSize: 13,
            color: COLORS.ink,
            fontFamily: FONTS.body,
            border: `1px solid ${error ? "#FCA5A5" : COLORS.border}`,
            borderRadius: RADIUS.sm,
            padding: "8px 10px",
            resize: "vertical",
            background: saving ? COLORS.surface : "#fff",
            outline: "none",
          }}
        />
      )}

      {/* Status line */}
      {saving && (
        <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 4 }}>Saving…</div>
      )}
      {savedOk && !saving && (
        <div style={{ fontSize: 11, color: "#16a34a", marginTop: 4 }}>Saved</div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}

// Accordion sections — `supportLink` deep-links to the support docs/help
// surface for that category, so backend can route help-requests by section.
// ════════════════════════════════════════════════════════════════════
export const SETTINGS_SECTIONS = [
  { id: "account",      label: "Account",          desc: "Workspace name, slug, contact email.",                                supportLink: "/help/settings/account" },
  { id: "plan",         label: "Plan & billing",   desc: "Your current plan, usage, and invoices.",                              supportLink: "/help/settings/billing" },
  { id: "workspace",    label: "Workspace",        desc: "Timezone, locale, currency, custom fields, and taxonomy.",             supportLink: "/help/settings/workspace" },
  { id: "domain",       label: "Domain",           desc: "Run your storefront at your own domain.",                              supportLink: "/help/settings/domain" },
  { id: "branding",     label: "Branding",         desc: "Logo, colors, email identity — what clients see.",                     supportLink: "/help/settings/branding" },
  { id: "team",         label: "Team",             desc: "Invite teammates and assign roles.",                                   supportLink: "/help/settings/team" },
  { id: "integrations", label: "Integrations",     desc: "Connect calendars, CRMs, and other tools.",                            supportLink: "/help/settings/integrations" },
  { id: "features",     label: "Feature controls", desc: "Turn platform features on or off for your workspace.",                 supportLink: "/help/settings/features" },
  { id: "danger",       label: "Danger zone",      desc: "Irreversible operations — proceed with care.",                         supportLink: "/help/settings/danger" },
] as const;
type SettingsSection = typeof SETTINGS_SECTIONS[number]["id"];

function SettingsSectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.ink, fontFamily: FONTS.body, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 13, color: COLORS.inkMuted, fontFamily: FONTS.body }}>{desc}</div>
    </div>
  );
}

export function LockedPill({ plan }: { plan: Plan }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
      background: COLORS.surfaceAlt, color: COLORS.inkMuted,
      border: `1px solid ${COLORS.border}`, fontFamily: FONTS.body,
      textTransform: "capitalize",
    }}>
      {plan}+
    </span>
  );
}
