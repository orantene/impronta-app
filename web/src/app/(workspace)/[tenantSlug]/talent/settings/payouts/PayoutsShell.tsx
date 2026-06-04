"use client";

import { useState, useEffect, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  createTalentAccountSession,
  ensureTalentPayoutAccount,
  loadTalentPayoutSnapshot,
  refreshTalentPayoutStatus,
} from "./actions";
import { ConnectEmbeddedOnboarding } from "@/components/payments/ConnectEmbeddedOnboarding";
import { PAYOUT_COUNTRIES } from "@/lib/payments/payout-countries";
import { HeldPayoutsBanner } from "@/components/payments/HeldPayoutsBanner";
import { GlobalPayoutsBankCard } from "./GlobalPayoutsBankCard";
import type { TalentConnectedAccountSnapshot } from "@/lib/payments/stripe-connect-talent";

type HeldTotal = { currency: string; amountCents: number; count: number };

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.4)",
  borderSoft: "rgba(24,24,27,0.08)",
  border: "rgba(24,24,27,0.12)",
  surface: "#ffffff",
  surfaceAlt: "rgba(11,11,13,0.025)",
  accent: "#1f4a3a",
  green: "#1A7348",
  greenSoft: "rgba(26,115,72,0.10)",
  amber: "#8A6F1A",
  amberSoft: "rgba(138,111,26,0.10)",
  coral: "#A33A3A",
  coralSoft: "rgba(214,89,89,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

const card: CSSProperties = {
  padding: "18px 18px",
  background: C.surface,
  border: `1px solid ${C.borderSoft}`,
  borderRadius: 14,
};
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
const ghostBtn: CSSProperties = {
  padding: "9px 14px",
  borderRadius: 9,
  background: "transparent",
  color: C.inkMuted,
  border: `1px solid ${C.border}`,
  fontFamily: FONT,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

export function PayoutsShell({
  snapshot: initialSnapshot,
  loadError,
  heldPayouts = null,
  justReturned,
  justRefreshed,
  embedded = false,
  selfLoad = false,
}: {
  snapshot: TalentConnectedAccountSnapshot | null;
  loadError: string | null;
  heldPayouts?: HeldTotal[] | null;
  justReturned: boolean;
  justRefreshed: boolean;
  /** Render without the page header + outer container (for use inside a drawer). */
  embedded?: boolean;
  /** Load the payout snapshot client-side on mount (when no server prop is passed). */
  selfLoad?: boolean;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [needCountry, setNeedCountry] = useState(false);
  const [country, setCountry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selfLoaded, setSelfLoaded] = useState(!selfLoad);

  const status = snapshot?.status ?? "none";
  const isEnabled = status === "enabled";

  // When embedded in a drawer there's no server prop, so pull the snapshot here.
  useEffect(() => {
    if (!selfLoad) return;
    let cancelled = false;
    loadTalentPayoutSnapshot().then((r) => {
      if (cancelled) return;
      if (r.ok) setSnapshot(r.snapshot);
      setSelfLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [selfLoad]);

  const onConnect = () => {
    setError(null);
    startTransition(async () => {
      const r = await ensureTalentPayoutAccount();
      if (r.ok) {
        setShowOnboarding(true);
        return;
      }
      if (r.code === "country_required") {
        setNeedCountry(true);
        return;
      }
      setError(r.error);
    });
  };

  const onSubmitCountry = () => {
    if (!country) {
      setError("Please choose where you'll receive payouts.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await ensureTalentPayoutAccount({ country });
      if (r.ok) {
        setNeedCountry(false);
        setShowOnboarding(true);
        return;
      }
      if (r.code === "country_required") {
        setError("Please choose a country.");
        return;
      }
      setError(r.error);
    });
  };

  const handleExit = () => {
    setShowOnboarding(false);
    startTransition(async () => {
      const r = await refreshTalentPayoutStatus();
      if (r.ok) setSnapshot(r.snapshot);
      router.refresh();
    });
  };

  const outerStyle: CSSProperties = embedded
    ? { fontFamily: FONT }
    : { maxWidth: 540, margin: "0 auto", padding: "24px 24px 48px", fontFamily: FONT };

  return (
    <div data-msg-shell style={outerStyle}>
      {!embedded && (
        <>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>Payouts</h1>
          <p style={{ margin: "6px 0 20px", fontSize: 13, lineHeight: 1.55, color: C.inkMuted }}>
            Get paid for your bookings, straight to your bank. Stripe handles the bank details and ID check, and we never see them.
          </p>
        </>
      )}

      {selfLoad && !selfLoaded ? (
        <div style={{ fontSize: 13, color: C.inkMuted, padding: "8px 2px" }}>Loading your payout status…</div>
      ) : (
        <>
          {!isEnabled && <HeldPayoutsBanner held={heldPayouts} audience="talent" />}

          {justReturned && isEnabled && (
            <div role="status" style={{ marginBottom: 14, padding: "10px 12px", background: C.greenSoft, color: C.green, borderRadius: 10, fontSize: 12.5 }}>
              ✓ All set. Your bank is connected and ready for payouts.
            </div>
          )}
          {justRefreshed && (
            <div role="status" style={{ marginBottom: 14, padding: "10px 12px", background: C.surfaceAlt, color: C.inkMuted, borderRadius: 10, fontSize: 12.5 }}>
              Status refreshed.
            </div>
          )}
          {loadError && (
            <div role="alert" style={{ marginBottom: 14, padding: "10px 12px", background: C.coralSoft, color: C.coral, borderRadius: 10, fontSize: 12.5 }}>
              {loadError}
            </div>
          )}

          {/* PRIMARY: your bank */}
          {showOnboarding ? (
            <div style={card}>
              <div style={sectionLabel}>Connect your bank</div>
              <div style={{ marginTop: 12, border: `1px solid ${C.borderSoft}`, borderRadius: 12, overflow: "hidden" }}>
                <ConnectEmbeddedOnboarding fetchClientSecret={() => createTalentAccountSession(country ? { country } : {})} onExit={handleExit} />
              </div>
              <button type="button" onClick={handleExit} style={{ ...ghostBtn, marginTop: 12 }}>
                Done for now
              </button>
            </div>
          ) : needCountry ? (
            <div style={card}>
              <label htmlFor="payout-country" style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 8 }}>
                Where will you receive payouts?
              </label>
              <select
                id="payout-country"
                data-testid="talent-payout-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontFamily: FONT, fontSize: 13, color: C.ink, background: "#fff", marginBottom: 12 }}
              >
                <option value="">Select your country…</option>
                {PAYOUT_COUNTRIES.map((c) => (
                  <option key={c.iso2} value={c.iso2}>
                    {c.flag} {c.label}
                  </option>
                ))}
              </select>
              {error && <div role="alert" style={{ fontSize: 12, color: C.coral, marginBottom: 10 }}>{error}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={onSubmitCountry} disabled={pending} style={primaryBtn(pending)}>
                  {pending ? "Setting up…" : "Continue"}
                </button>
                <button type="button" onClick={() => { setNeedCountry(false); setError(null); }} style={ghostBtn}>
                  Cancel
                </button>
              </div>
            </div>
          ) : isEnabled ? (
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span aria-hidden style={{ width: 34, height: 34, borderRadius: 9, background: C.greenSoft, color: C.green, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>
                  ✓
                </span>
                <div style={{ minWidth: 0 }}>
                  <div data-testid="talent-payout-status" style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>
                    You&apos;re set up to get paid
                  </div>
                  <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 1 }}>
                    Your share of each booking lands in your bank automatically.
                  </div>
                </div>
              </div>
              {error && <div role="alert" style={{ fontSize: 12, color: C.coral, marginTop: 12 }}>{error}</div>}
              <button type="button" data-testid="talent-connect-cta" onClick={onConnect} disabled={pending} style={{ ...ghostBtn, marginTop: 14 }}>
                {pending ? "Opening…" : "Update bank or payout details"}
              </button>
            </div>
          ) : (
            <div style={card}>
              <div style={sectionLabel}>Set up payouts</div>
              <p style={{ margin: "10px 0 14px", fontSize: 13, lineHeight: 1.55, color: C.inkMuted }}>
                Connect your bank to receive booking payouts. It takes a few minutes, and Stripe verifies your identity and bank securely.
              </p>
              {error && <div role="alert" style={{ fontSize: 12, color: C.coral, marginBottom: 10 }}>{error}</div>}
              <button type="button" data-testid="talent-connect-cta" onClick={onConnect} disabled={pending} style={primaryBtn(pending)}>
                {pending ? "Opening…" : "Set up payouts"}
              </button>
            </div>
          )}

          {/* MORE WAYS TO GET PAID — always available in the drawer (no Stripe
              popup, reaches ~50 countries incl. Argentina). Not gated on Connect. */}
          {!showOnboarding && (
            <div style={{ marginTop: 26 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: C.inkDim, marginBottom: 10 }}>
                {isEnabled ? "More ways to get paid" : "Get paid to your local bank, anywhere"}
              </div>

              <GlobalPayoutsBankCard />
            </div>
          )}

          <div style={{ marginTop: 24, fontSize: 11.5, lineHeight: 1.55, color: C.inkDim }}>
            When a client pays for a booking you&apos;re on, your share transfers to you automatically, on Stripe&apos;s standard
            schedule (typically 2 business days). You file your own taxes, and we hand you the year-end summary.
          </div>
        </>
      )}
    </div>
  );
}
