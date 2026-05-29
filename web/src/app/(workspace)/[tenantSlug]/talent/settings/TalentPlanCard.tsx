"use client";

/**
 * TalentPlanCard — live talent plan / free-trial block on Talent → Settings.
 *
 * Replaces the old static "Plan · coming soon" Demo card. Lazy-loads
 * `loadTalentPlanSummary` (self-scoped — a talent only sees their own plan)
 * and renders, through the SAME pure trial engine the workspace badge uses:
 *   • the effective plan (Free / Pro / Max) + honest price,
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
import {
  loadTalentPlanSummary,
  type TalentPlanSummary,
} from "@/lib/server-actions/talent-plan-summary";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.72)",
  inkDim:     "rgba(11,11,13,0.38)",
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

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
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
  const { phase } = trial;
  if (phase !== "active" && phase !== "expiring" && phase !== "expired") return null;
  const expired = phase === "expired";
  const expiring = phase === "expiring";
  const bg = expired ? C.royalSoft : expiring ? C.slateSoft : C.successSoft;
  const fg = expired ? C.royalDeep : expiring ? C.slateDeep : C.successDeep;
  const accent = expired ? C.royal : expiring ? C.slate : C.success;
  const pct = Math.max(0, Math.min(100, Math.round(trial.pct * 100)));

  const heading = expired
    ? `${trial.grantedPlanLabel} trial ended`
    : `Free trial · ${trial.grantedPlanLabel}`;

  const countdown = expired
    ? trial.daysSinceExpiry <= 0
      ? "Ended today"
      : trial.daysSinceExpiry === 1
        ? "Ended yesterday"
        : `Ended ${trial.daysSinceExpiry} days ago`
    : trial.daysLeft <= 0
      ? "Ends today"
      : trial.daysLeft === 1
        ? "1 day left"
        : `${trial.daysLeft} days left`;

  const blurb = expired
    ? `You're back on ${trial.basePlanLabel}. Your page and data are safe — bring back ${trial.grantedPlanLabel} anytime.`
    : expiring
      ? `Upgrade to keep ${trial.grantedPlanLabel} when your trial ends.`
      : `Enjoying ${trial.grantedPlanLabel}? Upgrade anytime to keep it.`;

  const ctaLabel = expired
    ? `Restore ${trial.grantedPlanLabel}`
    : `Keep ${trial.grantedPlanLabel}`;

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
  return (
    <div style={{ marginTop: 12, padding: "11px 13px", background: C.indigoSoft, border: `1px solid ${C.borderSoft}`, borderRadius: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.indigoDeep, marginBottom: 3 }}>Plan gift active</div>
      <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.45 }}>
        {override.overridePlanLabel}
        {override.basePlanKey !== override.overridePlanKey && (
          <span style={{ color: C.inkMuted }}> (base: {override.basePlanLabel})</span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
        {override.expiresAt && fmtDate(override.expiresAt)
          ? `Until ${fmtDate(override.expiresAt)}`
          : "No expiry"}
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
  return (
    <div style={{ marginTop: 12, padding: "12px 13px", background: C.royalSoft, border: `1px solid ${C.borderSoft}`, borderRadius: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.royalDeep, lineHeight: 1.3 }}>
        {offer.ctaHeadline ?? `Try ${offer.planLabel} free`}
      </div>
      {offer.ctaSubtext && (
        <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 3, lineHeight: 1.45 }}>{offer.ctaSubtext}</div>
      )}
      <BlockCta label={`Start ${offer.planLabel} trial`} tone="accent" onClick={onUpgrade} />
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
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
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
          error: err instanceof Error ? err.message : "Could not load your plan.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
          Loading your plan…
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

  return (
    <div data-testid="talent-plan-card" data-plan={data.planKey} style={cardShell}>
      {/* Header — effective plan + price */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.inkDim, marginBottom: 3 }}>
            Your personal page plan
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.2, color: C.ink, lineHeight: 1.1 }}>
              {data.planLabel}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.inkMuted }}>{data.priceLabel}</span>
          </div>
          {data.tagline && (
            <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 3, lineHeight: 1.45 }}>{data.tagline}</div>
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
          {data.planLabel}
        </span>
      </div>

      {showTrial && <TrialStateBlock trial={data.trial!} onUpgrade={onUpgrade} />}
      {showOverride && <OverrideBlock override={data.override!} />}
      {showPromo && <PromoBlock offer={data.upgradeOffer!} onUpgrade={onUpgrade} />}

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
        Compare plans
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
