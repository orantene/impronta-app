"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTalentAccountSession,
  ensureTalentPayoutAccount,
  refreshTalentPayoutStatus,
} from "./actions";
import { ConnectEmbeddedOnboarding } from "@/components/payments/ConnectEmbeddedOnboarding";
import { PAYOUT_COUNTRIES } from "@/lib/payments/payout-countries";
import { HeldPayoutsBanner } from "@/components/payments/HeldPayoutsBanner";
import type { TalentConnectedAccountSnapshot } from "@/lib/payments/stripe-connect-talent";

type HeldTotal = { currency: string; amountCents: number; count: number };

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  border:     "rgba(24,24,27,0.12)",
  surface:    "#ffffff",
  surfaceAlt: "rgba(11,11,13,0.025)",
  accent:     "#1f4a3a",
  green:      "#1A7348",
  greenSoft:  "rgba(26,115,72,0.10)",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(138,111,26,0.10)",
  coral:      "#A33A3A",
  coralSoft:  "rgba(214,89,89,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

export function PayoutsShell({
  snapshot: initialSnapshot,
  loadError,
  heldPayouts = null,
  justReturned,
  justRefreshed,
}: {
  snapshot: TalentConnectedAccountSnapshot | null;
  loadError: string | null;
  heldPayouts?: HeldTotal[] | null;
  justReturned: boolean;
  justRefreshed: boolean;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [needCountry, setNeedCountry] = useState(false);
  const [country, setCountry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const status = snapshot?.status ?? "none";
  const tone =
      status === "enabled" ? "success"
    : status === "restricted" || status === "disabled" ? "alert"
    : status === "pending" ? "amber"
    : "neutral";
  const tonePalette = tone === "success"
    ? { fg: C.green, bg: C.greenSoft }
    : tone === "alert"
    ? { fg: C.coral, bg: C.coralSoft }
    : tone === "amber"
    ? { fg: C.amber, bg: C.amberSoft }
    : { fg: C.inkMuted, bg: C.surfaceAlt };

  const statusLabel =
      status === "enabled" ? "Active — payouts ready"
    : status === "pending" ? "Onboarding in progress"
    : status === "restricted" ? "Action needed"
    : status === "disabled" ? "Disabled by Stripe"
    : "Not connected";

  const ctaLabel = status === "none" ? "Connect Stripe to receive payouts"
    : status === "enabled" ? "Update payout details"
    : "Continue Stripe onboarding";

  // Start: ensure the Connect account exists in the right country, then mount
  // the embedded onboarding. If we don't know the talent's country yet, ask.
  const onConnect = () => {
    setError(null);
    startTransition(async () => {
      const r = await ensureTalentPayoutAccount();
      if (r.ok) { setShowOnboarding(true); return; }
      if (r.code === "country_required") { setNeedCountry(true); return; }
      setError(r.error);
    });
  };

  const onSubmitCountry = () => {
    if (!country) { setError("Please choose where you'll receive payouts."); return; }
    setError(null);
    startTransition(async () => {
      const r = await ensureTalentPayoutAccount({ country });
      if (r.ok) { setNeedCountry(false); setShowOnboarding(true); return; }
      if (r.code === "country_required") { setError("Please choose a country."); return; }
      setError(r.error);
    });
  };

  // Re-pull status from Stripe after the embedded flow exits ("Done for now"
  // or completion) and ALWAYS collapse back to the status card — no stranded
  // exited-iframe state, no manual refresh needed.
  const handleExit = () => {
    setShowOnboarding(false);
    startTransition(async () => {
      const r = await refreshTalentPayoutStatus();
      if (r.ok) setSnapshot(r.snapshot);
      router.refresh();
    });
  };

  return (
    <div data-msg-shell style={{
      maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: FONT,
    }}>
      <h1 style={{
        margin: 0, fontSize: 22, fontWeight: 700,
        color: C.ink, letterSpacing: -0.3,
      }}>
        Payouts
      </h1>
      <p style={{
        margin: "4px 0 24px",
        fontSize: 13, lineHeight: 1.55,
        color: C.inkMuted,
      }}>
        Connect a Stripe account to receive talent payouts on confirmed
        bookings — in your own country. Set it up right here; Stripe handles
        the bank details + identity check, and we never see them. You file
        your own taxes — we just hand you the year-end summary.
      </p>

      {/* Earnings already waiting on bank connection — the headline reason to
          finish onboarding. Hidden once the account is enabled (held legs
          auto-release on the next account.updated / reconcile sweep). */}
      {status !== "enabled" && <HeldPayoutsBanner held={heldPayouts} audience="talent" />}

      {justReturned && status === "enabled" && (
        <div role="status" style={{
          marginBottom: 16, padding: "10px 12px",
          background: C.greenSoft, color: C.green,
          borderRadius: 10, fontSize: 12.5,
        }}>
          ✓ Stripe onboarding complete — you&apos;re ready for payouts.
        </div>
      )}
      {justRefreshed && (
        <div role="status" style={{
          marginBottom: 16, padding: "10px 12px",
          background: C.surfaceAlt, color: C.inkMuted,
          borderRadius: 10, fontSize: 12.5,
        }}>
          Status refreshed.
        </div>
      )}
      {loadError && (
        <div role="alert" style={{
          marginBottom: 16, padding: "10px 12px",
          background: C.coralSoft, color: C.coral,
          borderRadius: 10, fontSize: 12.5,
        }}>
          {loadError}
        </div>
      )}

      <div style={{
        padding: "16px 18px",
        background: C.surface,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        marginBottom: 16,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
        }}>
          <span aria-hidden style={{
            width: 36, height: 36, borderRadius: 10,
            background: tonePalette.bg, color: tonePalette.fg,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2.5" y="5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2.5 8h13" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4,
              color: tonePalette.fg, textTransform: "uppercase",
            }}>
              Stripe account status
            </div>
            <div data-testid="talent-payout-status" style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginTop: 2 }}>
              {statusLabel}
            </div>
          </div>
        </div>

        {snapshot && snapshot.stripeAccountId && (
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginBottom: 12, fontVariantNumeric: "tabular-nums" }}>
            Stripe account · {snapshot.stripeAccountId}
            {snapshot.syncedAt && (
              <> · last synced {new Date(snapshot.syncedAt).toLocaleString()}</>
            )}
          </div>
        )}

        {error && (
          <div role="alert" style={{
            padding: "8px 10px", marginBottom: 12,
            background: C.coralSoft, color: C.coral,
            borderRadius: 8, fontSize: 12,
          }}>
            {error}
          </div>
        )}

        {showOnboarding ? (
          <div style={{ marginTop: 4 }}>
            <ConnectEmbeddedOnboarding
              fetchClientSecret={() => createTalentAccountSession(country ? { country } : {})}
              onExit={handleExit}
            />
            <button
              type="button"
              onClick={handleExit}
              style={{
                marginTop: 12, padding: "8px 14px", borderRadius: 8,
                background: "transparent", color: C.inkMuted,
                border: `1px solid ${C.border}`,
                fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Done for now
            </button>
          </div>
        ) : needCountry ? (
          <div style={{ marginTop: 4 }}>
            <label htmlFor="payout-country" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
              Where will you receive payouts?
            </label>
            <select
              id="payout-country"
              data-testid="talent-payout-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              style={{
                width: "100%", maxWidth: 340, padding: "10px 12px",
                borderRadius: 10, border: `1px solid ${C.border}`,
                fontFamily: FONT, fontSize: 13, color: C.ink, background: "#fff",
                marginBottom: 12,
              }}
            >
              <option value="">Select your country…</option>
              {PAYOUT_COUNTRIES.map((c) => (
                <option key={c.iso2} value={c.iso2}>{c.flag} {c.label}</option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={onSubmitCountry}
                disabled={pending}
                style={{
                  padding: "11px 18px", borderRadius: 10,
                  background: pending ? "rgba(31,74,58,0.6)" : C.accent,
                  color: "#fff", border: "none",
                  fontFamily: FONT, fontSize: 13, fontWeight: 700,
                  cursor: pending ? "wait" : "pointer", minHeight: 44,
                }}
              >
                {pending ? "Setting up…" : "Continue"}
              </button>
              <button
                type="button"
                onClick={() => { setNeedCountry(false); setError(null); }}
                style={{
                  padding: "11px 14px", borderRadius: 10,
                  background: "transparent", color: C.inkMuted,
                  border: `1px solid ${C.border}`,
                  fontFamily: FONT, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            data-testid="talent-connect-cta"
            onClick={onConnect}
            disabled={pending}
            style={{
              width: "100%", maxWidth: 340,
              padding: "11px 18px", borderRadius: 10,
              background: pending ? "rgba(31,74,58,0.6)" : C.accent,
              color: "#fff", border: "none",
              fontFamily: FONT, fontSize: 13, fontWeight: 700,
              cursor: pending ? "wait" : "pointer",
              minHeight: 44,
            }}
          >
            {pending ? "Opening…" : ctaLabel}
          </button>
        )}
      </div>

      <div style={{
        padding: 14,
        background: C.surfaceAlt,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 10,
        fontSize: 12, lineHeight: 1.55,
        color: C.inkMuted,
      }}>
        <strong style={{ color: C.ink }}>How payouts work:</strong> when a
        client pays for a booking you&apos;re on, your share is transferred
        automatically to your Stripe account. Stripe pays out to your
        bank on its standard schedule (typically 2 business days).
      </div>
    </div>
  );
}
