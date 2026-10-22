"use client";

/**
 * TalentPlanCard — live talent plan / free-trial block on Talent → Settings.
 *
 * Replaces the old static "Plan · coming soon" Demo card. Lazy-loads
 * `loadTalentPlanSummary` (self-scoped — a talent only sees their own plan)
 * and renders, through the SAME pure trial engine the workspace badge uses:
 *   • the effective plan (Free / Web Office) + honest price,
 *   • a live free-trial block with three visually distinct states —
 *       green while comfortably active, slate while expiring, royal once it
 *       has ended (the "your data is safe, bring it back" re-upgrade nudge),
 *   • a platform-granted comp / gift block (indigo) when one is active,
 *   • an engagement CTA inviting the next tier when at the plain baseline and
 *     the platform has an enabled trial offer for it.
 *
 * "One engine, two audiences": the trial countdown / expiry / nudge here are
 * the talent mirror of <WorkspacePlanBadge>. Self-serve talent checkout is not
 * live yet (Phase 1.5 waitlist), so the CTAs open the Compare-plans drawer —
 * the same real action every other talent upgrade affordance uses. Trials are
 * granted from the platform-admin dashboard and sync here automatically.
 *
 * All async states are visible (loading / error / loaded) per
 * feedback_admin_edit_ux — no silent waits.
 */

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { TalentCancelBlock } from "./TalentCancelBlock";
import { formatPeriodDate } from "@/lib/billing/period-date";
import { TalentSwitchToFree } from "@/components/billing/talent-switch-to-free";
import { talentPlanPriceLine } from "@/lib/billing/talent-plan-price";
import { PLAN_CATALOG, isKnownPlan } from "@/lib/access/plan-catalog";
import { talentPlanCancelBlock } from "@/lib/billing/talent-cancel";
import { usePresenceText } from "@/components/talent/studio/presence-i18n";
import {
  loadTalentPlanSummary,
  type TalentPlanSummary,
} from "@/lib/server-actions/talent-plan-summary";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.72)",
  inkDim:     "rgba(11,11,13,0.6)",
  borderSoft: "rgba(24,24,27,0.08)",
  border:     "rgba(24,24,27,0.16)",
  surface:    "rgba(24,24,27,0.03)",
  accent:     "#0F4F3E",
  accentDeep: "#093328",
  accentSoft: "rgba(15,79,62,0.10)",
  // phase palettes — mirror the admin-shell tokens for brand coherence
  success:     "#2E7D5B",
  successSoft: "rgba(46,125,91,0.10)",
  successDeep: "#1F5D43",
  slate:       "#52606D", // de-warmed "amber" — urgency without red-orange
  slateSoft:   "rgba(82,96,109,0.10)",
  slateDeep:   "#3A4651",
  royal:       "#5F4B8B",
  royalSoft:   "rgba(95,75,139,0.10)",
  royalDeep:   "#3D2F61",
  indigo:      "#5B6BA0",
  indigoSoft:  "rgba(91,107,160,0.10)",
  indigoDeep:  "#3F4870",
  error:       "#dc2626",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; data: TalentPlanSummary }
  | { status: "error"; error: string };

function fmtDate(iso: string | null, es: boolean): string | null {
  // TUL-1914: the UTC calendar day, the same as Stripe and every other billing date (see period-date.ts).
  return formatPeriodDate(iso, es ? "es" : "en");
}

/** Small filled CTA used inside the trial / promo blocks. */
function BlockCta({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: "ink" | "accent";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: 10,
        width: "100%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        background: tone === "ink" ? C.ink : C.accent,
        color: "#fff",
        border: "none",
        borderRadius: 9,
        padding: "9px 12px",
        fontFamily: FONT,
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
        transition: "opacity .15s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      {label}
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/**
 * Live / just-ended free-trial block. Three visually distinct states so the
 * talent *feels* the shift: green while comfortably active, slate while
 * expiring, royal-purple once it has ended (the "you lost something, bring it
 * back" nudge). Nothing is ever deleted — the page just dropped to its base
 * template.
 */
function TrialStateBlock({
  trial,
  onUpgrade,
}: {
  trial: NonNullable<TalentPlanSummary["trial"]>;
  onUpgrade: () => void;
}) {
  const { es, t } = usePresenceText();
  const { phase } = trial;
  if (phase !== "active" && phase !== "expiring" && phase !== "expired") return null;
  const expired = phase === "expired";
  const expiring = phase === "expiring";
  const bg = expired ? C.royalSoft : expiring ? C.slateSoft : C.successSoft;
  const fg = expired ? C.royalDeep : expiring ? C.slateDeep : C.successDeep;
  const accent = expired ? C.royal : expiring ? C.slate : C.success;
  const pct = Math.max(0, Math.min(100, Math.round(trial.pct * 100)));

  const granted = t(trial.grantedPlanLabel);
  const base = t(trial.basePlanLabel);
  const heading = expired
    ? es ? `Prueba de ${granted} terminada` : `${trial.grantedPlanLabel} trial ended`
    : es ? `Prueba gratis · ${granted}` : `Free trial · ${trial.grantedPlanLabel}`;

  const countdown = expired
    ? trial.daysSinceExpiry <= 0
      ? t("Ended today")
      : trial.daysSinceExpiry === 1
        ? t("Ended yesterday")
        : es ? `Terminó hace ${trial.daysSinceExpiry} días` : `Ended ${trial.daysSinceExpiry} days ago`
    : trial.daysLeft <= 0
      ? t("Ends today")
      : trial.daysLeft === 1
        ? t("1 day left")
        : es ? `${trial.daysLeft} días restantes` : `${trial.daysLeft} days left`;

  const blurb = expired
    ? es
      ? `Volviste a ${base}. Tu página y tus datos están a salvo. Recupera ${granted} cuando quieras.`
      : `You're back on ${trial.basePlanLabel}. Your page and data are safe, bring back ${trial.grantedPlanLabel} anytime.`
    : expiring
      ? es
        ? `Mejora tu plan para conservar ${granted} cuando termine tu prueba.`
        : `Upgrade to keep ${trial.grantedPlanLabel} when your trial ends.`
      : es
        ? `¿Te gusta ${granted}? Mejora tu plan cuando quieras para conservarlo.`
        : `Enjoying ${trial.grantedPlanLabel}? Upgrade anytime to keep it.`;

  const ctaLabel = expired
    ? es ? `Recuperar ${granted}` : `Restore ${trial.grantedPlanLabel}`
    : es ? `Conservar ${granted}` : `Keep ${trial.grantedPlanLabel}`;

  return (
    <div style={{ marginTop: 12, padding: "12px 13px", background: bg, border: `1px solid ${C.borderSoft}`, borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: fg }}>{heading}</div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: fg, whiteSpace: "nowrap" }}>{countdown}</div>
      </div>
      {!expired && (
        <div style={{ marginTop: 9, height: 5, borderRadius: 999, background: "rgba(11,11,13,0.08)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: accent, borderRadius: 999 }} />
        </div>
      )}
      <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: expired ? 5 : 8, lineHeight: 1.45 }}>{blurb}</div>
      <BlockCta label={ctaLabel} tone="ink" onClick={onUpgrade} />
    </div>
  );
}

/** Platform-granted comp / gift block (indigo) — an active non-trial grant. */
function OverrideBlock({ override }: { override: NonNullable<TalentPlanSummary["override"]> }) {
  const { es, t } = usePresenceText();
  return (
    <div style={{ marginTop: 12, padding: "11px 13px", background: C.indigoSoft, border: `1px solid ${C.borderSoft}`, borderRadius: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.indigoDeep, marginBottom: 3 }}>{t("Plan gift active")}</div>
      <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.45 }}>
        {t(override.overridePlanLabel)}
        {override.basePlanKey !== override.overridePlanKey && (
          <span style={{ color: C.inkMuted }}> (base: {t(override.basePlanLabel)})</span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
        {override.expiresAt && fmtDate(override.expiresAt, es)
          ? `${es ? "Hasta el" : "Until"} ${fmtDate(override.expiresAt, es)}`
          : t("No expiry")}
      </div>
      {override.reason && (
        <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 4, fontStyle: "italic", lineHeight: 1.4 }}>
          &ldquo;{override.reason}&rdquo;
        </div>
      )}
    </div>
  );
}

/** Engagement CTA — invite the talent to try the next tier free. */
function PromoBlock({
  offer,
  onUpgrade,
}: {
  offer: NonNullable<TalentPlanSummary["upgradeOffer"]>;
  onUpgrade: () => void;
}) {
  const { es, t } = usePresenceText();
  return (
    <div style={{ marginTop: 12, padding: "12px 13px", background: C.royalSoft, border: `1px solid ${C.borderSoft}`, borderRadius: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.royalDeep, lineHeight: 1.3 }}>
        {offer.ctaHeadline ?? (es ? `Prueba ${t(offer.planLabel)} gratis` : `Try ${offer.planLabel} free`)}
      </div>
      {offer.ctaSubtext && (
        <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 3, lineHeight: 1.45 }}>{offer.ctaSubtext}</div>
      )}
      <BlockCta label={es ? `Empezar prueba de ${t(offer.planLabel)}` : `Start ${offer.planLabel} trial`} tone="accent" onClick={onUpgrade} />
    </div>
  );
}

export function TalentPlanCard({
  onCompare,
  onUpgrade,
}: {
  /** Open the Compare-plans drawer. */
  onCompare: () => void;
  /** Primary upgrade / restore action (Compare drawer until checkout is live). */
  onUpgrade: () => void;
}) {
  const copy = useDashboardText();
  const { t: tx } = usePresenceText();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const startedRef = useRef(false);

  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (startedRef.current && reloadTick === 0) return;
    startedRef.current = true;
    let cancelled = false;
    loadTalentPlanSummary()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setLoad({ status: "loaded", data: res.summary });
        else setLoad({ status: "error", error: res.error });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoad({
          status: "error",
          error: err instanceof Error ? err.message : copy.isSpanish ? "No se pudo cargar tu plan." : "Could not load your plan.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const cardShell: CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    marginBottom: 16,
    borderRadius: 12,
    background: "#fff",
    border: `1px solid ${C.borderSoft}`,
    fontFamily: FONT,
  };

  if (load.status === "loading") {
    return (
      <div data-testid="talent-plan-card" style={cardShell}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.inkMuted, fontSize: 12.5 }}>
          <span
            aria-hidden
            style={{
              width: 13,
              height: 13,
              borderRadius: "50%",
              border: `2px solid ${C.border}`,
              borderTopColor: C.ink,
              animation: "talent-plan-spin .7s linear infinite",
              display: "inline-block",
            }}
          />
          <style>{`@keyframes talent-plan-spin { to { transform: rotate(360deg); } }`}</style>
          {tx("Loading your plan…")}
        </div>
      </div>
    );
  }

  if (load.status === "error") {
    return (
      <div data-testid="talent-plan-card" style={cardShell}>
        <div
          role="alert"
          style={{
            fontSize: 12.5,
            color: C.error,
            background: "rgba(220,38,38,0.06)",
            border: "1px solid rgba(220,38,38,0.18)",
            borderRadius: 9,
            padding: "9px 11px",
            lineHeight: 1.45,
          }}
        >
          {load.error}
        </div>
      </div>
    );
  }

  const data = load.data;
  const showTrial =
    data.trial &&
    (data.trial.phase === "active" ||
      data.trial.phase === "expiring" ||
      data.trial.phase === "expired");
  // Comp / gift: an active override that is not a live/expired trial block.
  const showOverride = data.override && (!data.trial || data.trial.phase === "comp");
  // Engagement CTA only at the plain baseline (no live trial/comp) with an
  // enabled offer for the next tier.
  const showPromo =
    !!data.upgradeOffer && data.upgradeOffer.isTrialEnabled && !data.trial;

  const def = isKnownPlan(data.planKey) ? PLAN_CATALOG[data.planKey] : null;
  const priceLine =
    def && def.monthlyPriceCents !== null && def.monthlyPriceCents > 0
      ? talentPlanPriceLine({
          monthlyCents: def.monthlyPriceCents,
          annualCents: data.billingInterval === "year" ? (data.billedAmountCents ?? def.annualPriceCents) : null,
          interval: data.billingInterval,
          locale: copy.isSpanish ? "es" : "en",
        })
      : { primary: copy.t(data.priceLabel), secondary: null };

  return (
    <div data-testid="talent-plan-card" data-plan={data.planKey} style={cardShell}>
      {/* Header — effective plan + price */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.inkDim, marginBottom: 3 }}>
            {copy.t("Your personal page plan")}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.2, color: C.ink, lineHeight: 1.1 }}>
              {copy.t(data.planLabel)}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.inkMuted }}>{priceLine.primary}</span>
            {priceLine.secondary ? (
              <span data-testid="talent-plan-price-secondary" style={{ fontSize: 11.5, color: C.inkMuted }}>{priceLine.secondary}</span>
            ) : null}
          </div>
          {data.tagline && (
            <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 3, lineHeight: 1.45 }}>{copy.t(data.tagline)}</div>
          )}
        </div>
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            padding: "3px 9px",
            borderRadius: 999,
            background: C.accentSoft,
            color: C.accentDeep,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {copy.t(data.planLabel)}
        </span>
      </div>

      {showTrial && <TrialStateBlock trial={data.trial!} onUpgrade={onUpgrade} />}
      {showOverride && <OverrideBlock override={data.override!} />}
      {showPromo && <PromoBlock offer={data.upgradeOffer!} onUpgrade={onUpgrade} />}

      {/* TUL-832: cancel / resume for a live paid subscription */}
      {data.subscription && talentPlanCancelBlock(data.planKey, data.subscription) !== "none" && (
        <TalentCancelBlock
          es={copy.isSpanish}
          cancelAtPeriodEnd={data.subscription.cancelAtPeriodEnd}
          currentPeriodEnd={data.subscription.currentPeriodEnd}
          onCompare={onCompare}
          onChanged={() => setReloadTick((n) => n + 1)}
        />
      )}

      {/* TUL-831: lower plan. Takes effect at the end of the paid period, nothing charged or refunded today. */}
      {data.subscription && talentPlanCancelBlock(data.planKey, data.subscription) === "cancel" && (
        <TalentSwitchToFree onChanged={() => setReloadTick((n) => n + 1)} />
      )}

      {/* Footer — always offer Compare plans */}
      <button
        type="button"
        onClick={onCompare}
        style={{
          marginTop: 14,
          width: "100%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          background: C.surface,
          color: C.ink,
          border: `1px solid ${C.border}`,
          borderRadius: 9,
          padding: "8px 12px",
          fontFamily: FONT,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          transition: "background .15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(24,24,27,0.06)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = C.surface)}
      >
        {tx("Compare plans")}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
