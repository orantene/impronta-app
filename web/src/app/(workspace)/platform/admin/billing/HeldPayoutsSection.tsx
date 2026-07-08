"use client";

/**
 * Platform Admin — held-payouts reconciliation table.
 *
 * Lists every payout leg still held (or failed) — earnings from paid bookings
 * that couldn't transfer because the recipient hadn't finished Stripe
 * onboarding. Each payee gets a manual "Retry" that calls releaseHeldPayouts
 * (the same path the account.updated webhook + reconcile cron use). Normally
 * these self-resolve when the payee onboards; this is the ops backstop.
 */

import { useState, useTransition } from "react";
import { retryHeldPayoutsForPayee } from "./held-payouts-actions";
import type { HeldLedgerRow } from "@/lib/payments/booking-payouts-ledger";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

const HQ = {
  card: "#16161A",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  amber: "#E2B341",
  red: "#F36772",
} as const;
const F = '"Inter", system-ui, sans-serif';

function fmt(cents: number, currency: string): string {
  const code = (currency || "mxn").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

function ageDays(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 86400000));
}

export function HeldPayoutsSection({ rows }: { rows: HeldLedgerRow[] }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const totalCents = rows.reduce((n, r) => n + r.amountCents, 0);
  const heldCount = rows.filter((r) => r.status === "held").length;
  const failedCount = rows.filter((r) => r.status === "failed").length;

  const onRetry = (row: HeldLedgerRow) => {
    const key = row.id;
    setBusyKey(key);
    setMsg(null);
    startTransition(async () => {
      const target = row.party === "talent" ? { talentProfileId: row.talentProfileId } : { tenantId: row.tenantId };
      const r = await retryHeldPayoutsForPayee(target);
      setBusyKey(null);
      setMsg(
        r.ok
          ? interpolate(t("dashboard.platform.billing.heldPayouts.retryResult"), {
              released: r.released,
              stillHeld: r.stillHeld,
              failed: r.failed,
            })
          : interpolate(t("dashboard.platform.billing.heldPayouts.retryFailed"), {
              error: r.error,
            }),
      );
    });
  };

  return (
    <section
      data-testid="held-payouts-section"
      style={{ background: HQ.card, border: `1px solid ${HQ.border}`, borderRadius: 14, padding: 20, marginTop: 20, fontFamily: F }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: HQ.ink }}>
          {t("dashboard.platform.billing.heldPayouts.title")}
        </h2>
        <span style={{ fontSize: 12, color: HQ.inkMuted }}>
          {rows.length === 0
            ? t("dashboard.platform.billing.heldPayouts.allClear")
            : interpolate(t("dashboard.platform.billing.heldPayouts.summary"), {
                held: heldCount,
                failed: failedCount,
              })}
        </span>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: HQ.inkMuted, lineHeight: 1.5 }}>
        {t("dashboard.platform.billing.heldPayouts.description")}
      </p>

      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: HQ.inkDim, padding: "8px 0" }}>
          {t("dashboard.platform.billing.heldPayouts.empty")} 🎉
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: HQ.ink, marginBottom: 10 }}>
            {interpolate(t("dashboard.platform.billing.heldPayouts.totalHeld"), {
              amount: fmt(totalCents, rows[0]?.currency ?? "mxn"),
              count: rows.length,
            })}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: HQ.inkDim }}>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>{t("dashboard.platform.billing.heldPayouts.colPayee")}</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>{t("dashboard.platform.billing.heldPayouts.colAmount")}</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>{t("dashboard.platform.billing.heldPayouts.colStatus")}</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>{t("dashboard.platform.billing.heldPayouts.colAge")}</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>{t("dashboard.platform.billing.heldPayouts.colTries")}</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} style={{ borderTop: `1px solid ${HQ.borderSoft}`, color: HQ.ink }}>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 11.5 }}>
                      {row.party === "talent"
                        ? interpolate(t("dashboard.platform.billing.heldPayouts.talentPayee"), { id: (row.talentProfileId ?? "").slice(0, 8) })
                        : interpolate(t("dashboard.platform.billing.heldPayouts.workspacePayee"), { id: (row.tenantId ?? "").slice(0, 8) })}
                    </td>
                    <td style={{ padding: "8px", fontVariantNumeric: "tabular-nums" }}>{fmt(row.amountCents, row.currency)}</td>
                    <td style={{ padding: "8px", color: row.status === "failed" ? HQ.red : HQ.amber }}>{row.status}</td>
                    <td style={{ padding: "8px", color: HQ.inkMuted }}>{interpolate(t("dashboard.platform.billing.heldPayouts.ageDays"), { days: ageDays(row.createdAt) })}</td>
                    <td style={{ padding: "8px", color: HQ.inkMuted }}>{row.attempts}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => onRetry(row)}
                        disabled={pending && busyKey === row.id}
                        style={{
                          padding: "5px 12px", borderRadius: 7, border: `1px solid ${HQ.border}`,
                          background: "transparent", color: HQ.ink, fontFamily: F, fontSize: 12, fontWeight: 600,
                          cursor: pending && busyKey === row.id ? "wait" : "pointer",
                        }}
                      >
                        {pending && busyKey === row.id ? "…" : t("dashboard.platform.billing.heldPayouts.retry")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {msg && <div style={{ marginTop: 12, fontSize: 12.5, color: HQ.green }}>{msg}</div>}
        </>
      )}
    </section>
  );
}
