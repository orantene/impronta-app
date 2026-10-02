"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  createTalentDashboardLinkAction,
  loadTalentStablecoinEligibility,
} from "./actions";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.4)",
  borderSoft: "rgba(24,24,27,0.08)",
  border: "rgba(24,24,27,0.12)",
  surface: "#ffffff",
  accent: "#1f4a3a",
  green: "#1A7348",
  greenSoft: "rgba(26,115,72,0.10)",
  coral: "#A33A3A",
} as const;
const FONT = '"Inter", system-ui, sans-serif';

const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: C.accent,
};
const primaryBtn = (busy: boolean): CSSProperties => ({
  padding: "11px 18px",
  borderRadius: 10,
  background: busy ? "rgba(31,74,58,0.6)" : C.accent,
  color: "#fff",
  border: "none",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 700,
  cursor: busy ? "wait" : "pointer",
  minHeight: 44,
});

/**
 * Stablecoin (USDC) payout card. Shown only when the talent's connected
 * account is in a stablecoin-eligible market (hidden entirely otherwise).
 * Explains USDC in plain words (benefits + 3 steps) and opens the talent's
 * Stripe Express Dashboard, where they link a wallet and set USDC as the
 * default payout currency. USDC rides the existing v1 Transfers rail, a USD
 * transfer auto-converts, so there is no new payout plumbing.
 *
 * Placement: `position="top"` renders only for recommended markets (Argentina),
 * above the bank option, with a Recommended badge. `position="default"` renders
 * for every other eligible market, below the bank option, equal weight. The
 * shell mounts both; each self-loads eligibility and renders only its own slot.
 *
 * We do not show a "sent to wallet ...xxxx" status line: nothing we load today
 * exposes the linked wallet, and we never fake it.
 */
export function StablecoinPayoutCard({ position = "default" }: { position?: "top" | "default" }) {
  const t = useT();
  const [state, setState] = useState<
    { status: "loading" } | { status: "hidden" } | { status: "ready"; recommended: boolean; countryLabel: string | null }
  >({ status: "loading" });
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTalentStablecoinEligibility()
      .then((r) => {
        if (cancelled) return;
        // Unresolvable eligibility: stay silent rather than show a half-broken card.
        if (!r.ok || !r.eligible) return setState({ status: "hidden" });
        setState({ status: "ready", recommended: r.recommended, countryLabel: r.countryLabel });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "hidden" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openDashboard = () => {
    setError(null);
    setOpening(true);
    createTalentDashboardLinkAction().then((r) => {
      setOpening(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      window.open(r.url, "_blank", "noopener,noreferrer");
    });
  };

  if (state.status === "hidden") return null;
  if (state.status === "loading") {
    return position === "default" ? (
      <div style={{ marginTop: 12, fontSize: 12, color: C.inkDim, padding: "2px" }}>{t("dashboard.talentUsdc.checking")}</div>
    ) : null;
  }
  if ((position === "top") !== state.recommended) return null;
  const { recommended, countryLabel } = state;

  const card: CSSProperties = {
    padding: "18px 18px",
    background: C.surface,
    border: recommended ? `1.5px solid ${C.green}` : `1px solid ${C.borderSoft}`,
    borderRadius: 14,
    marginTop: position === "top" ? 0 : 12,
    marginBottom: position === "top" ? 14 : 0,
    fontFamily: FONT,
  };
  const benefits = ["benefitFast", "benefitStable", "benefitNoBank", "benefitConvert"] as const;
  const steps = [1, 2, 3] as const;

  return (
    <div data-testid="talent-stablecoin-card" data-recommended={recommended ? "true" : "false"} style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={sectionLabel}>{t("dashboard.talentUsdc.label")}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: C.green, background: C.greenSoft, padding: "2px 7px", borderRadius: 999 }}>
          {recommended
            ? t("dashboard.talentUsdc.badgeRecommended")
            : interpolate(t("dashboard.talentUsdc.badgeAvailable"), { country: countryLabel ?? "" })}
        </span>
      </div>

      <h3 style={{ margin: "10px 0 4px", fontSize: 17, fontWeight: 650, letterSpacing: -0.2, color: C.ink }}>
        {t("dashboard.talentUsdc.title")}
      </h3>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.55, color: C.inkMuted }}>{t("dashboard.talentUsdc.intro")}</p>

      <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "grid", gap: 7 }}>
        {benefits.map((k) => (
          <li key={k} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: C.ink, lineHeight: 1.4 }}>
            <span aria-hidden style={{ color: C.green, fontWeight: 700 }}>✓</span>
            {t(`dashboard.talentUsdc.${k}`)}
          </li>
        ))}
      </ul>

      <div style={{ ...sectionLabel, color: C.inkDim, marginBottom: 8 }}>{t("dashboard.talentUsdc.howTitle")}</div>
      <ol style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "grid", gap: 10 }}>
        {steps.map((n) => (
          <li key={n} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            <span
              aria-hidden
              style={{ width: 22, height: 22, borderRadius: 999, background: C.greenSoft, color: C.green, fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            >
              {n}
            </span>
            <span style={{ fontSize: 13, lineHeight: 1.45 }}>
              <strong style={{ color: C.ink, fontWeight: 600 }}>{t(`dashboard.talentUsdc.step${n}Title`)}</strong>
              <span style={{ display: "block", color: C.inkMuted, fontSize: 12.5 }}>{t(`dashboard.talentUsdc.step${n}Body`)}</span>
            </span>
          </li>
        ))}
      </ol>

      <button type="button" data-testid="talent-stablecoin-cta" onClick={openDashboard} disabled={opening} style={primaryBtn(opening)}>
        {opening ? t("dashboard.talentUsdc.opening") : t("dashboard.talentUsdc.cta")}
      </button>
      {error && (
        <div role="alert" style={{ fontSize: 11.5, color: C.coral, marginTop: 8 }}>
          {error}
        </div>
      )}

      <details data-testid="talent-stablecoin-wallet-help" style={{ marginTop: 14, borderTop: `1px solid ${C.borderSoft}`, paddingTop: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: C.accent }}>
          {t("dashboard.talentUsdc.walletTitle")}
        </summary>
        <div style={{ marginTop: 8, display: "grid", gap: 8, fontSize: 12.5, lineHeight: 1.55, color: C.inkMuted }}>
          <p style={{ margin: 0 }}>{t("dashboard.talentUsdc.walletBody1")}</p>
          <p style={{ margin: 0 }}>{t("dashboard.talentUsdc.walletBody2")}</p>
          <p style={{ margin: 0 }}>{t("dashboard.talentUsdc.walletBody3")}</p>
        </div>
      </details>

      {recommended && <p style={{ margin: "12px 0 0", fontSize: 11.5, color: C.inkDim }}>{t("dashboard.talentUsdc.bankHint")}</p>}
    </div>
  );
}
