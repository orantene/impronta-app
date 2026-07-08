"use client";

import { useEffect, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
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
    <section className="mb-7">
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
            fontFamily: FONTS.display, fontSize: 19, fontWeight: 500, letterSpacing: -0.2, margin: 0 }} className="text-admin-ink">
          {title}
        </h2>
        {subtitle && (
          <span style={{ fontFamily: FONTS.body, fontSize: 12.5, flex: 1, minWidth: 0 }} className="text-admin-ink-muted">
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
  const t = useT();
  const unlocked = meetsPlan(currentPlan, requiredPlan);
  if (unlocked) {
    return (
      <PrimaryCard
        title={title}
        description={description}
        icon={<Icon name={icon} size={14} stroke={1.7} />}
        affordance={t("dashboard.adminBilling.affordanceOpen")}
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
  const t = useT();
  const { state, setPlan, openUpgrade } = useAdminShell();
  const items: { plan: Plan; promise: string }[] = [
    { plan: "free", promise: t("dashboard.adminBilling.planPromiseFree") },
    { plan: "studio", promise: t("dashboard.adminBilling.planPromiseStudio") },
    { plan: "agency", promise: t("dashboard.adminBilling.planPromiseAgency") },
    { plan: "network", promise: t("dashboard.adminBilling.planPromiseNetwork") },
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
                  {t("dashboard.adminBilling.current")}
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
  const t = useT();
  const { state, openDrawer, openUpgrade } = useAdminShell();
  const isOwner = state.role === "owner";
  const isAdmin = meetsRole(state.role, "admin");
  const isFree = state.plan === "free";
  const payout = getWorkspacePayout(state.plan);
  const fee = PLAN_FEE_META[state.plan];

  return (
    <>
      <PageHeader
        title={t("dashboard.adminBilling.title")}
        subtitle={t("dashboard.adminBilling.subtitle")}
        actions={
          isOwner ? (
            <PrimaryButton onClick={() => openDrawer("plan-billing")}>
              {t("dashboard.adminBilling.managePlan")}
            </PrimaryButton>
          ) : null
        }
      />

      {/* Top row — fee economics + default receiver */}
      <Grid cols="2">
        <PrimaryCard
          title={interpolate(t("dashboard.adminBilling.platformFeeTitle"), { label: fee.label })}
          description={fee.controlsHint}
          icon={<Icon name="credit" size={14} stroke={1.7} />}
          badge={<PlanChip plan={state.plan} variant="solid" />}
          affordance={isOwner ? t("dashboard.adminBilling.comparePlanFees") : t("dashboard.adminBilling.affordanceView")}
          onClick={() => openDrawer("plan-billing")}
        />

        {!isFree && isAdmin ? (
          <PrimaryCard
            title={t("dashboard.adminBilling.defaultPayoutReceiver")}
            description={`${payout.defaultReceiver.displayName}${payout.defaultReceiver.legalName ? ` · ${payout.defaultReceiver.legalName}` : ""}`}
            icon={<Icon name="team" size={14} stroke={1.7} />}
            badge={<PayoutStatusChip status={payout.defaultReceiver.status} />}
            affordance={t("dashboard.adminBilling.manageReceiver")}
            onClick={() => openDrawer("payments-setup")}
          />
        ) : isFree ? (
          <LockedCard
            title={t("dashboard.adminBilling.defaultPayoutReceiver")}
            description={t("dashboard.adminBilling.payoutReceiverLockedDesc")}
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: t("dashboard.adminBilling.paymentsFeature"),
                why: t("dashboard.adminBilling.paymentsUpgradeWhy"),
                requiredPlan: "studio",
                unlocks: [
                  t("dashboard.adminBilling.paymentsUnlock1"),
                  t("dashboard.adminBilling.paymentsUnlock2"),
                  t("dashboard.adminBilling.paymentsUnlock3"),
                  t("dashboard.adminBilling.paymentsUnlock4"),
                ],
              })
            }
          />
        ) : (
          <SecondaryCard
            title={t("dashboard.adminBilling.defaultPayoutReceiver")}
            description={`${payout.defaultReceiver.displayName} · ${PAYOUT_STATUS_META[payout.defaultReceiver.status].label}`}
            meta={<ReadOnlyChip />}
            affordance={t("dashboard.adminBilling.affordanceView")}
            onClick={() => openDrawer("payments-setup")}
          />
        )}
      </Grid>

      {/* Volume + pending */}
      {!isFree && (
        <Grid cols="3">
          <SecondaryCard
            title={t("dashboard.adminBilling.volume30d")}
            description={payout.recentVolume30d}
            affordance={t("dashboard.adminBilling.seeActivity")}
            onClick={() => { document.querySelector("[data-billing-activity]")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }); }}
          />
          <SecondaryCard
            title={t("dashboard.adminBilling.pendingPayouts")}
            description={payout.pendingPayouts}
            affordance={t("dashboard.adminBilling.seeActivity")}
            onClick={() => { document.querySelector("[data-billing-activity]")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }); }}
          />
          <SecondaryCard
            title={t("dashboard.adminBilling.cardAcceptance")}
            description={payout.acceptCards ? t("dashboard.adminBilling.cardsEnabled") : t("dashboard.adminBilling.notEnabled")}
            affordance={t("dashboard.adminBilling.affordanceConfigure")}
            onClick={() => openDrawer("payments-setup")}
          />
        </Grid>
      )}

      <div data-billing-activity><Divider label={t("dashboard.adminBilling.recentActivity")} /></div>

      {isFree ? (
        <SecondaryCard
          title={t("dashboard.adminBilling.noActivityTitle")}
          description={t("dashboard.adminBilling.noActivityDesc")}
          affordance={t("dashboard.adminBilling.seePlans")}
          onClick={() =>
            openUpgrade({
              feature: t("dashboard.adminBilling.paymentsFeature"),
              why: t("dashboard.adminBilling.noActivityUpgradeWhy"),
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
// Q5: BillingActivityRow extracted so its `useState(hovered)` is owned by
// a component instead of being called inside a `.map()` callback (which
// tripped react-hooks/rules-of-hooks at the previous L390).
function BillingActivityRow({
  row, onOpen,
}: { row: typeof WORKSPACE_PAYMENTS[number]; onOpen: () => void }) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onOpen}
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
      <div className="font-semibold">{row.ref}</div>
      <div>
        <div className="text-admin-ink">{row.client}</div>
        <div style={{ fontSize: 11.5 }} className="text-admin-ink-muted">{row.brief}</div>
      </div>
      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.total}</div>
      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }} className="text-admin-ink-muted">
        {row.netPayout}
        <div style={{ fontSize: 11 }} className="text-admin-ink-dim">{interpolate(t("dashboard.adminBilling.feeLabel"), { fee: row.fee })}</div>
      </div>
      <div className="text-admin-ink-muted">{row.receiverName}</div>
      <div>
        <PaymentStatusChip status={row.status} />
      </div>
      <div style={{ textAlign: "right", fontSize: 12 }}>
        {hovered ? (
          <span style={{ fontWeight: 600, fontSize: 11 }} className="text-admin-accent">{t("dashboard.adminBilling.details")}</span>
        ) : (
          <span className="text-admin-ink-muted">{row.date}</span>
        )}
      </div>
    </button>
  );
}

function BillingActivityTable() {
  const t = useT();
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
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr 1.2fr 1fr 0.6fr", padding: "10px 16px", borderBottom: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 11, fontWeight: 600 }} className="bg-admin-surface-alt text-admin-ink-muted">
        <span>{t("dashboard.adminBilling.colBooking")}</span>
        <span>{t("dashboard.adminBilling.colClientBrief")}</span>
        <span className="text-right">{t("dashboard.adminBilling.colTotal")}</span>
        <span className="text-right">{t("dashboard.adminBilling.colNetPayout")}</span>
        <span>{t("dashboard.adminBilling.colReceiver")}</span>
        <span>{t("dashboard.adminBilling.colStatus")}</span>
        <span className="text-right">{t("dashboard.adminBilling.colDate")}</span>
      </div>
      {WORKSPACE_PAYMENTS.map((row) => (
        <BillingActivityRow
          key={row.id}
          row={row}
          onOpen={() => openDrawer("payment-detail", { id: row.id })}
        />
      ))}
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

// Stable, locale-independent default for the auto-acknowledgement reply.
// Persisted to the DB as a fallback, so it must NOT vary by UI locale (and
// carries no em dash per house style).
const AUTO_ACK_DEFAULT_MESSAGE = "Thanks, we'll get back to you within 4 hours.";

export function AutoAckSettingsRow() {
  const t = useT();
  const [enabled, setEnabled] = useState<boolean>(true);
  const [message, setMessage] = useState<string>(AUTO_ACK_DEFAULT_MESSAGE);
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
        auto_ack_message: nextMessage.trim() || AUTO_ACK_DEFAULT_MESSAGE,
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
    <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, padding: "14px 16px", marginBottom: 8, fontFamily: FONTS.body }} className="rounded-admin-md">
      {/* Toggle row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: enabled ? 10 : 0 }}>
        <div>
          <div className="text-admin-ink text-admin-13 font-semibold">{t("dashboard.adminWorkspace.autoAckTitle")}</div>
          <div style={{ fontSize: 12, marginTop: 2 }} className="text-admin-ink-muted">
            {t("dashboard.adminWorkspace.autoAckDesc")}
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
          placeholder={t("dashboard.adminWorkspace.autoAckPlaceholder")}
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
        <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 4 }}>{t("dashboard.adminWorkspace.autoAckSaving")}</div>
      )}
      {savedOk && !saving && (
        <div style={{ fontSize: 11, color: "#16a34a", marginTop: 4 }}>{t("dashboard.adminWorkspace.autoAckSaved")}</div>
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
  { id: "commercial-terms", label: "Booking terms", desc: "Default deposit, refund policy, and instant booking for new offers.", supportLink: "/help/settings/booking-terms" },
  { id: "domain",       label: "Domain",           desc: "Run your storefront at your own domain.",                              supportLink: "/help/settings/domain" },
  { id: "branding",     label: "Branding",         desc: "Logo, colors, email identity. What clients see.",                     supportLink: "/help/settings/branding" },
  { id: "team",         label: "Team",             desc: "Invite teammates and assign roles.",                                   supportLink: "/help/settings/team" },
  { id: "integrations", label: "Integrations",     desc: "Connect calendars, CRMs, and other tools.",                            supportLink: "/help/settings/integrations" },
  { id: "features",     label: "Feature controls", desc: "Turn platform features on or off for your workspace.",                 supportLink: "/help/settings/features" },
  { id: "danger",       label: "Danger zone",      desc: "Irreversible operations. Proceed with care.",                         supportLink: "/help/settings/danger" },
] as const;
type SettingsSection = typeof SETTINGS_SECTIONS[number]["id"];

function SettingsSectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-4">
      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: FONTS.body, marginBottom: 3 }} className="text-admin-ink">{title}</div>
      <div style={{ fontSize: 13, fontFamily: FONTS.body }} className="text-admin-ink-muted">{desc}</div>
    </div>
  );
}

export function LockedPill({ plan }: { plan: Plan }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, border: `1px solid ${COLORS.border}`, fontFamily: FONTS.body, textTransform: "capitalize" }} className="bg-admin-surface-alt text-admin-ink-muted">
      {plan}+
    </span>
  );
}
