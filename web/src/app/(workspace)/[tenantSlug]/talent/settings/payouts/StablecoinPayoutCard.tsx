"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  createTalentDashboardLinkAction,
  loadTalentStablecoinEligibility,
} from "./actions";

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
const ghostBtn = (busy = false): CSSProperties => ({
  padding: "9px 14px",
  borderRadius: 9,
  background: "transparent",
  color: C.inkMuted,
  border: `1px solid ${C.border}`,
  fontFamily: FONT,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: busy ? "wait" : "pointer",
});
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
 * account is in a stablecoin-eligible market. It explains getting paid in USDC
 * to a crypto wallet, then opens the talent's Stripe Express Dashboard in a new
 * tab, where they self-serve link a Polygon, Base, or Aptos wallet and set USDC
 * as their default payout currency. USDC rides the existing v1 Transfers rail,
 * a USD transfer auto-converts, so there is no new payout plumbing to build.
 *
 * This is an additive opt-in path that sits alongside the bank/Connect cards,
 * it never replaces them. The card self-loads its eligibility on mount and
 * renders nothing until eligibility is known (and nothing at all when the
 * talent's market is not eligible), so it can be dropped into the shell freely.
 */
export function StablecoinPayoutCard() {
  // null = still checking eligibility, false = not eligible (render nothing),
  // true = eligible (render the card).
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [countryLabel, setCountryLabel] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTalentStablecoinEligibility()
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          // Eligibility couldn't be resolved, treat as not eligible and stay
          // silent rather than showing a half-broken card.
          setEligible(false);
          return;
        }
        setEligible(r.eligible);
        setCountryLabel(r.countryLabel);
      })
      .catch(() => {
        if (!cancelled) setEligible(false);
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

  // Still resolving eligibility: show a quiet, honest loading line so there is
  // never a silent wait, then either reveal the card or disappear.
  if (eligible === null) {
    return (
      <div style={{ marginTop: 12, fontSize: 12, color: C.inkDim, padding: "2px" }}>
        Checking if USDC payouts are available for you…
      </div>
    );
  }

  // Not eligible: render nothing, USDC simply isn't offered in this market.
  if (!eligible) return null;

  const card: CSSProperties = {
    padding: "18px 18px",
    background: C.surface,
    border: `1px solid ${C.borderSoft}`,
    borderRadius: 14,
    marginTop: 12,
    fontFamily: FONT,
  };

  return (
    <div data-testid="talent-stablecoin-card" style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={sectionLabel}>USDC · digital dollars</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: C.green, background: C.greenSoft, padding: "2px 7px", borderRadius: 999 }}>
          Available in {countryLabel ?? "your country"}
        </span>
      </div>

      {!expanded ? (
        <button
          type="button"
          data-testid="talent-stablecoin-learn"
          onClick={() => setExpanded(true)}
          style={{ ...ghostBtn(), marginTop: 12 }}
        >
          Learn about USDC payouts
        </button>
      ) : (
        <>
          <p style={{ margin: "10px 0 12px", fontSize: 12.5, lineHeight: 1.55, color: C.inkMuted }}>
            Get paid in <strong style={{ color: C.ink }}>USDC</strong> straight to your own crypto wallet, across borders,
            with no local-bank wait. Open your Stripe dashboard, link a Polygon, Base, or Aptos wallet, and set USDC as
            your default payout currency. Your booking share then arrives as USDC instead of to a bank.
          </p>
          <button
            type="button"
            data-testid="talent-stablecoin-cta"
            onClick={openDashboard}
            disabled={opening}
            style={primaryBtn(opening)}
          >
            {opening ? "Opening…" : "Link a crypto wallet"}
          </button>
          {error && (
            <div role="alert" style={{ fontSize: 11.5, color: C.coral, marginTop: 8 }}>
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
