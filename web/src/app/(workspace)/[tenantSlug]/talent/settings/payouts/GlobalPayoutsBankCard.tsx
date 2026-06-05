"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { payoutCountryLabel } from "@/lib/payments/payout-countries";
import type { TalentGpMethod, TalentGpStatusKind } from "@/lib/payments/talent-global-payouts";
import {
  loadTalentGpMethods,
  removeTalentGpMethodAction,
  setTalentGpDefaultAction,
  startTalentGpHostedSetupAction,
} from "./actions";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.4)",
  borderSoft: "rgba(24,24,27,0.08)",
  border: "rgba(24,24,27,0.12)",
  surface: "#ffffff",
  surfaceAlt: "rgba(11,11,13,0.02)",
  accent: "#1f4a3a",
  green: "#1A7348",
  greenSoft: "rgba(26,115,72,0.10)",
  amber: "#8A6F1A",
  amberSoft: "rgba(138,111,26,0.12)",
  coral: "#A33A3A",
} as const;
const FONT = '"Inter", system-ui, sans-serif';

const ghostBtn = (busy = false): CSSProperties => ({
  padding: "8px 12px",
  borderRadius: 9,
  background: "transparent",
  color: C.inkMuted,
  border: `1px solid ${C.border}`,
  fontFamily: FONT,
  fontSize: 12,
  fontWeight: 600,
  cursor: busy ? "wait" : "pointer",
  whiteSpace: "nowrap",
});

/** Real status pill: maps the Stripe recipient status to a label + colors. */
function statusPill(status: TalentGpStatusKind): { label: string; color: string; bg: string } | null {
  switch (status) {
    case "ready":
      return { label: "Ready", color: C.green, bg: C.greenSoft };
    case "info_needed":
      return { label: "Information needed", color: C.amber, bg: C.amberSoft };
    case "pending":
      return { label: "Pending verification", color: C.amber, bg: C.amberSoft };
    default:
      return null;
  }
}

/**
 * Talent Global Payouts setup. The bank + identity collection happens on
 * Stripe's own co-branded HOSTED form (AccountLink), so real countries, correct
 * per-country fields, and KYC are handled by Stripe and raw details never touch
 * us. This card creates/looks up the recipient, shows the real status and the
 * saved payout accounts, and launches the hosted form to add or finish setup.
 */
export function GlobalPayoutsBankCard() {
  const [loading, setLoading] = useState(true);
  const [methods, setMethods] = useState<TalentGpMethod[]>([]);
  const [status, setStatus] = useState<TalentGpStatusKind>("not_started");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const refresh = () => {
    loadTalentGpMethods().then((r) => {
      setLoading(false);
      if (r.ok) {
        setMethods(r.methods);
        setStatus(r.status);
      }
    });
  };
  useEffect(() => {
    refresh();
  }, []);

  const startSetup = () => {
    setStartError(null);
    setStarting(true);
    startTalentGpHostedSetupAction().then((r) => {
      if (!r.ok) {
        setStarting(false);
        setStartError(r.error);
        return;
      }
      // Open Stripe's hosted form in a popup so the app stays put. When the
      // talent closes it (after finishing), refresh the status. If the popup is
      // blocked, fall back to a same-tab redirect.
      // (Kept simple: explicit left/top centering broke the popup on some setups,
      // so we let the browser place it. Centering can be revisited carefully.)
      const popup = window.open(r.url, "tulala-payout-setup", "width=480,height=760");
      if (!popup) {
        window.location.href = r.url;
        return;
      }
      setStarting(false);
      const timer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(timer);
          refresh();
        }
      }, 1000);
    });
  };

  const setDefault = (id: string) => {
    setRowError(null);
    setBusyId(id);
    setTalentGpDefaultAction(id).then((r) => {
      setBusyId(null);
      if (!r.ok) setRowError(r.error);
      else refresh();
    });
  };

  const remove = (id: string) => {
    setRowError(null);
    setBusyId(id);
    removeTalentGpMethodAction(id).then((r) => {
      setBusyId(null);
      if (!r.ok) setRowError(r.error);
      else refresh();
    });
  };

  if (loading) return null;

  const card: CSSProperties = {
    padding: "16px 18px",
    background: C.surface,
    border: `1px solid ${C.borderSoft}`,
    borderRadius: 14,
    marginBottom: 16,
    fontFamily: FONT,
  };

  const pill = statusPill(status);
  const hasMethods = methods.length > 0;

  return (
    <div data-testid="talent-gp-bank-card" style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: C.accent, textTransform: "uppercase" }}>
          Global payouts · Bank
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: C.green, background: C.greenSoft, padding: "2px 7px", borderRadius: 999 }}>
          Get paid to your local bank, anywhere
        </span>
        {pill && (
          <span data-testid="talent-gp-status" style={{ fontSize: 10.5, fontWeight: 700, color: pill.color, background: pill.bg, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.3 }}>
            {pill.label}
          </span>
        )}
      </div>

      {hasMethods && (
        <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {methods.map((m) => (
            <li
              key={m.id}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
                padding: "10px 12px", background: C.surfaceAlt, border: `1px solid ${C.borderSoft}`, borderRadius: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span>{m.bankName ?? "Bank account"} ····{m.last4 ?? "----"}</span>
                  {m.isDefault && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: C.greenSoft, padding: "1px 6px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.3 }}>
                      Default
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 1 }}>
                  {payoutCountryLabel(m.country)}{m.currency ? ` · ${m.currency.toUpperCase()}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {!m.isDefault && (
                  <button type="button" data-testid="talent-gp-set-default" onClick={() => setDefault(m.id)} disabled={busyId === m.id} style={ghostBtn(busyId === m.id)}>
                    {busyId === m.id ? "…" : "Set default"}
                  </button>
                )}
                {!m.isDefault && (
                  <button type="button" data-testid="talent-gp-remove" onClick={() => remove(m.id)} disabled={busyId === m.id} style={ghostBtn(busyId === m.id)}>
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {rowError && <div role="alert" style={{ marginBottom: 8, fontSize: 11.5, color: C.coral }}>{rowError}</div>}

      {!hasMethods && (
        <p style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.55, color: C.inkMuted }}>
          Get paid to your <strong style={{ color: C.ink }}>local bank account</strong>, in your own currency, across 90+
          countries. You finish setup on Stripe&apos;s secure form, so your bank and ID never touch us.
        </p>
      )}
      {status === "info_needed" && hasMethods && (
        <p style={{ margin: "0 0 12px", fontSize: 12, lineHeight: 1.5, color: C.amber }}>
          Stripe needs a bit more information before you can be paid. Continue setup to finish.
        </p>
      )}

      {startError && <div role="alert" style={{ marginBottom: 10, fontSize: 12, color: C.coral }}>{startError}</div>}

      <button
        type="button"
        data-testid="talent-gp-hosted-setup"
        onClick={startSetup}
        disabled={starting}
        style={{
          padding: "11px 18px", borderRadius: 10, background: starting ? "rgba(31,74,58,0.6)" : C.accent, color: "#fff",
          border: "none", fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: starting ? "wait" : "pointer", minHeight: 44,
        }}
      >
        {starting
          ? "Opening Stripe…"
          : status === "info_needed"
            ? "Continue setup"
            : hasMethods
              ? "Add or update account"
              : "Set up payouts"}
      </button>

      <p style={{ margin: "10px 0 0", fontSize: 11, lineHeight: 1.5, color: C.inkDim }}>
        Your email and country can&apos;t be changed once your payout profile is created. Your bank account must be in
        your own legal name.
      </p>
    </div>
  );
}
