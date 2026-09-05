"use client";

import { useEffect, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useT } from "@/i18n/use-t";
import { loadAgencyAutoAck, updateAgencyAutoAck } from "@/lib/server-actions/admin-workspace-settings";
import { Icon, LockedCard, PrimaryCard } from "../primitives";
import { COLORS, FONTS, RADIUS, TRANSITION, meetsPlan } from "../state";
import type { Plan } from "../state";


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

// ════════════════════════════════════════════════════════════════════
// BILLING / PAYMENTS — REMOVED (dead fixture surface)
// ════════════════════════════════════════════════════════════════════
//
// `BillingPage`, `PlanLadderStrip`, `BillingActivityTable` and
// `BillingActivityRow` lived here but were never exported and never
// imported: nothing in the shell rendered them. What they rendered was the
// `WORKSPACE_PAYMENTS` fixture — invented bookings (Net-a-Porter, Bvlgari,
// Vogue Italia) priced in EUR, against the USD-only house rule. Deleted
// rather than repaired so no future wiring can resurrect invented money on
// a real workspace's screen.
//
// The live billing surfaces are: Settings → Plan (drawer, real plan + Stripe
// Billing Portal) and /<tenant>/admin/account (real subscription state,
// Checkout, portal). `TierSection` / `TierCard` / `AutoAckSettingsRow` /
// `LockedPill` below are still live and exported.

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
        <div style={{ fontSize: 11, color: "var(--color-admin-green)", marginTop: 4 }}>{t("dashboard.adminWorkspace.autoAckSaved")}</div>
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
  const t = useT();
  // The raw `plan` enum is English ("studio"); Settings rows sit next to a
  // PlanChip that already renders the localized tier name, so resolve the
  // same catalog entry here rather than printing the enum.
  const label = t(`dashboard.adminWorkspace.planName${plan.charAt(0).toUpperCase()}${plan.slice(1)}`);
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, border: `1px solid ${COLORS.border}`, fontFamily: FONTS.body, textTransform: "capitalize" }} className="bg-admin-surface-alt text-admin-ink-muted">
      {label}+
    </span>
  );
}
