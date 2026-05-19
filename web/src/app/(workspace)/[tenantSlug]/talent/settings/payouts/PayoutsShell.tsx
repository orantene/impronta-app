"use client";

import { useState, useTransition } from "react";
import { startTalentOnboarding } from "./actions";
import type { TalentConnectedAccountSnapshot } from "@/lib/payments/stripe-connect-talent";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  border:     "rgba(24,24,27,0.12)",
  surface:    "#ffffff",
  surfaceAlt: "rgba(11,11,13,0.025)",
  accent:     "#0F4F3E",
  green:      "#1A7348",
  greenSoft:  "rgba(26,115,72,0.10)",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(138,111,26,0.10)",
  coral:      "#A33A3A",
  coralSoft:  "rgba(214,89,89,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

export function PayoutsShell({
  tenantSlug,
  snapshot,
  loadError,
  justReturned,
  justRefreshed,
}: {
  tenantSlug: string;
  snapshot: TalentConnectedAccountSnapshot | null;
  loadError: string | null;
  justReturned: boolean;
  justRefreshed: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onboard = () => {
    setError(null);
    startTransition(async () => {
      const r = await startTalentOnboarding(tenantSlug);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      window.location.href = r.url;
    });
  };

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
    : status === "restricted" ? "Action needed in Stripe"
    : status === "disabled" ? "Disabled by Stripe"
    : "Not connected";

  const ctaLabel = status === "none" ? "Connect Stripe to receive payouts"
    : status === "enabled" ? "Update Stripe details"
    : "Continue Stripe onboarding";

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
        Connect a Stripe Express account to receive talent payouts on
        confirmed bookings. Stripe handles the bank details + KYC —
        we never see them.
      </p>

      {justReturned && status === "enabled" && (
        <div role="status" style={{
          marginBottom: 16, padding: "10px 12px",
          background: C.greenSoft, color: C.green,
          borderRadius: 10, fontSize: 12.5,
        }}>
          ✓ Stripe onboarding complete — you&apos;re ready for payouts.
        </div>
      )}
      {justReturned && status !== "enabled" && (
        <div role="status" style={{
          marginBottom: 16, padding: "10px 12px",
          background: C.amberSoft, color: C.amber,
          borderRadius: 10, fontSize: 12.5,
        }}>
          Stripe still has open requirements. Tap below to continue.
        </div>
      )}
      {justRefreshed && (
        <div role="status" style={{
          marginBottom: 16, padding: "10px 12px",
          background: C.surfaceAlt, color: C.inkMuted,
          borderRadius: 10, fontSize: 12.5,
        }}>
          Onboarding link expired — we&apos;ll mint a fresh one.
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
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4,
              color: tonePalette.fg, textTransform: "uppercase",
            }}>
              Status
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginTop: 2 }}>
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

        <button
          type="button"
          onClick={onboard}
          disabled={pending}
          style={{
            width: "100%", maxWidth: 320,
            padding: "11px 18px", borderRadius: 10,
            background: pending ? "rgba(15,79,62,0.6)" : C.accent,
            color: "#fff", border: "none",
            fontFamily: FONT, fontSize: 13, fontWeight: 700,
            cursor: pending ? "wait" : "pointer",
            minHeight: 44,
          }}
        >
          {pending ? "Opening Stripe…" : ctaLabel}
        </button>
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
