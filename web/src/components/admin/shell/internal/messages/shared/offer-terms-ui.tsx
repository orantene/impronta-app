"use client";

/**
 * Offer commercial-terms UI (deep-plan W6a).
 *
 * Two pieces, both shared across the admin/talent/client offer surfaces:
 *
 *   • OfferTermsComposer  — admin/talent draft-edit controls: refund-policy
 *     select, balance-method select, deposit % input (auto-forced to 0 for
 *     pay_in_place / 100 for full_upfront), plus a live computed deposit +
 *     balance preview off the current offer total. Persists via the supplied
 *     save action with explicit save state.
 *
 *   • OfferTermsSummary   — client/talent READ-ONLY "Booking terms" block on a
 *     sent/accepted offer: "Deposit $X (Y%) · Balance $Z via <method> · Refunds
 *     <policy>" with the method/policy descriptions, plus a one-liner that
 *     approving = agreeing to these terms.
 *
 * DISPLAY ONLY for money: the deposit is computed + shown + persisted; nothing
 * here charges it. The Stripe path is untouched this wave.
 */

import { useState, useTransition } from "react";
import { COLORS, FONTS } from "../../state";
import { fmtMoney } from "./machinery-10";
import { useT } from "@/i18n/use-t";
import {
  type BalanceCollectionMethod,
  type RefundPolicyKey,
  type OfferCommercialTerms,
  BALANCE_METHOD_LABEL_KEYS,
  BALANCE_METHOD_DESCRIPTION_KEYS,
  REFUND_POLICY_LABEL_KEYS,
  REFUND_POLICY_DESCRIPTION_KEYS,
  normalizeDepositPct,
} from "@/lib/billing/commercial-terms-types";

const BALANCE_METHODS: BalanceCollectionMethod[] = [
  "request_in_messages",
  "pay_in_place",
  "full_upfront",
];
const REFUND_POLICIES: RefundPolicyKey[] = ["tiered", "flexible", "strict", "manual"];

// ── Composer (admin/talent draft-edit) ─────────────────────────────────────

export function OfferTermsComposer({
  totalUnits,
  currencyCode,
  initial,
  onSave,
}: {
  /** The offer total in major currency units (e.g. dollars), to derive amounts. */
  totalUnits: number;
  currencyCode: string;
  /** Pre-fill (persisted terms or resolver defaults). */
  initial: {
    depositPct: number;
    balanceMethod: BalanceCollectionMethod;
    refundPolicy: RefundPolicyKey;
  };
  /**
   * Persist the terms. Resolves with the server-derived deposit amount (cents)
   * on success so the composer can reconcile its preview. depositAmountCents is
   * DERIVED server-side — this callback does not send it.
   */
  onSave: (terms: {
    depositPct: number;
    balanceMethod: BalanceCollectionMethod;
    refundPolicy: RefundPolicyKey;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const t = useT();
  const [balanceMethod, setBalanceMethod] = useState<BalanceCollectionMethod>(initial.balanceMethod);
  const [refundPolicy, setRefundPolicy] = useState<RefundPolicyKey>(initial.refundPolicy);
  const [depositPct, setDepositPct] = useState<number>(
    normalizeDepositPct(initial.balanceMethod, initial.depositPct),
  );
  const [pending, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<
    { kind: "idle" } | { kind: "saved" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const depositLocked = balanceMethod !== "request_in_messages";
  const effectivePct = normalizeDepositPct(balanceMethod, depositPct);
  const depositUnits = (totalUnits * effectivePct) / 100;
  const balanceUnits = Math.max(0, totalUnits - depositUnits);

  const persist = (next: {
    depositPct: number;
    balanceMethod: BalanceCollectionMethod;
    refundPolicy: RefundPolicyKey;
  }) => {
    startTransition(async () => {
      const r = await onSave({
        depositPct: normalizeDepositPct(next.balanceMethod, next.depositPct),
        balanceMethod: next.balanceMethod,
        refundPolicy: next.refundPolicy,
      });
      if (r.ok) setSaveState({ kind: "saved" });
      else setSaveState({ kind: "error", message: r.error ?? "Save failed" });
    });
  };

  const onBalanceMethodChange = (m: BalanceCollectionMethod) => {
    const pct = normalizeDepositPct(m, depositPct);
    setBalanceMethod(m);
    setDepositPct(pct);
    setSaveState({ kind: "idle" });
    persist({ depositPct: pct, balanceMethod: m, refundPolicy });
  };
  const onRefundPolicyChange = (p: RefundPolicyKey) => {
    setRefundPolicy(p);
    setSaveState({ kind: "idle" });
    persist({ depositPct, balanceMethod, refundPolicy: p });
  };

  return (
    <div
      style={{
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: FONTS.body,
        fontSize: 12,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700 }} className="text-admin-ink">Booking terms</span>
        <span className="text-admin-ink-muted text-admin-11">
          Negotiated as part of this offer — both parties see them before approving.
        </span>
        <span style={{ flex: 1 }} />
        {pending ? (
          <span className="text-admin-ink-muted text-admin-11">Saving…</span>
        ) : saveState.kind === "saved" ? (
          <span style={{ color: COLORS.successDeep, fontSize: 11, fontWeight: 700 }}>Saved ✓</span>
        ) : saveState.kind === "error" ? (
          <span style={{ color: COLORS.coralDeep, fontSize: 11, fontWeight: 700 }} title={saveState.message}>
            Save failed
          </span>
        ) : null}
      </div>

      {/* Refund policy */}
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="text-admin-ink-muted text-admin-11" style={{ fontWeight: 600 }}>Refund policy</span>
        <select
          value={refundPolicy}
          disabled={pending}
          onChange={(e) => onRefundPolicyChange(e.target.value as RefundPolicyKey)}
          style={selectStyle}
        >
          {REFUND_POLICIES.map((p) => (
            <option key={p} value={p}>{t(REFUND_POLICY_LABEL_KEYS[p])}</option>
          ))}
        </select>
        <span className="text-admin-ink-dim text-admin-11" style={{ lineHeight: 1.4 }}>
          {t(REFUND_POLICY_DESCRIPTION_KEYS[refundPolicy])}
        </span>
      </label>

      {/* Balance collection method */}
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="text-admin-ink-muted text-admin-11" style={{ fontWeight: 600 }}>Balance collection</span>
        <select
          value={balanceMethod}
          disabled={pending}
          onChange={(e) => onBalanceMethodChange(e.target.value as BalanceCollectionMethod)}
          style={selectStyle}
        >
          {BALANCE_METHODS.map((m) => (
            <option key={m} value={m}>{t(BALANCE_METHOD_LABEL_KEYS[m])}</option>
          ))}
        </select>
        <span className="text-admin-ink-dim text-admin-11" style={{ lineHeight: 1.4 }}>
          {t(BALANCE_METHOD_DESCRIPTION_KEYS[balanceMethod])}
        </span>
      </label>

      {/* Deposit % */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="text-admin-ink-muted text-admin-11" style={{ fontWeight: 600 }}>Deposit</span>
          <input
            type="number"
            min={0}
            max={100}
            step={5}
            value={effectivePct}
            disabled={pending || depositLocked}
            onChange={(e) => {
              const v = normalizeDepositPct(balanceMethod, parseFloat(e.target.value));
              setDepositPct(v);
              setSaveState({ kind: "idle" });
            }}
            onBlur={() => persist({ depositPct, balanceMethod, refundPolicy })}
            title={
              depositLocked
                ? balanceMethod === "pay_in_place"
                  ? "Pay-in-person collects nothing online — deposit is 0%."
                  : "Full-amount-now charges the whole total — deposit is 100%."
                : undefined
            }
            style={{
              width: 64,
              padding: "5px 6px",
              fontSize: 11,
              fontFamily: FONTS.body,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 4,
              textAlign: "right",
              opacity: depositLocked ? 0.55 : 1,
              cursor: depositLocked ? "not-allowed" : "text",
            }}
          />
          <span className="text-admin-ink-muted text-admin-11">%</span>
        </label>
        {depositLocked && (
          <span className="text-admin-ink-dim text-admin-11">
            (fixed by the balance method)
          </span>
        )}
      </div>

      {/* Computed preview from the current offer total */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          padding: "8px 10px",
          borderRadius: 8,
          background: "rgba(11,11,13,0.02)",
        }}
      >
        <PreviewStat label="Deposit due now" value={effectivePct === 0 ? "—" : fmtMoney(depositUnits, currencyCode)} sub={`${effectivePct}% of total`} />
        <PreviewStat
          label="Balance later"
          value={balanceUnits <= 0 ? "—" : fmtMoney(balanceUnits, currencyCode)}
          sub={t(BALANCE_METHOD_LABEL_KEYS[balanceMethod])}
        />
      </div>
    </div>
  );
}

function PreviewStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 120 }}>
      <span className="text-admin-ink-muted text-admin-11" style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink">
        {value}
      </span>
      <span className="text-admin-ink-dim text-admin-11">{sub}</span>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 12,
  fontFamily: FONTS.body,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 6,
  background: "#fff",
  color: COLORS.ink,
};

// ── Read-only summary (client + talent) ─────────────────────────────────────

export function OfferTermsSummary({
  terms,
  totalUnits,
  currencyCode,
  /** When true, append the "approving = agreeing" line near the approve button. */
  showApprovalLine = false,
}: {
  terms: OfferCommercialTerms;
  totalUnits: number;
  currencyCode: string;
  showApprovalLine?: boolean;
}) {
  const t = useT();
  const pct = normalizeDepositPct(terms.balanceMethod, terms.depositPct);
  const depositUnits =
    terms.depositAmountCents != null && terms.depositAmountCents > 0
      ? terms.depositAmountCents / 100
      : (totalUnits * pct) / 100;
  const balanceUnits = Math.max(0, totalUnits - depositUnits);

  return (
    <div
      style={{
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontFamily: FONTS.body,
        background: "rgba(11,11,13,0.015)",
      }}
    >
      <div
        style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}
        className="text-admin-ink-muted"
      >
        Booking terms
      </div>

      <TermLine
        label="Deposit"
        value={pct === 0 ? "None up front" : `${fmtMoney(depositUnits, currencyCode)} (${pct}%)`}
      />
      <TermLine
        label="Balance"
        value={
          balanceUnits <= 0
            ? "Paid in full up front"
            : `${fmtMoney(balanceUnits, currencyCode)} via ${t(BALANCE_METHOD_LABEL_KEYS[terms.balanceMethod])}`
        }
        sub={t(BALANCE_METHOD_DESCRIPTION_KEYS[terms.balanceMethod])}
      />
      <TermLine
        label="Refunds"
        value={t(REFUND_POLICY_LABEL_KEYS[terms.refundPolicy])}
        sub={t(REFUND_POLICY_DESCRIPTION_KEYS[terms.refundPolicy])}
      />

      {showApprovalLine && (
        <div
          className="text-admin-ink-muted text-admin-11"
          style={{ lineHeight: 1.5, marginTop: 2 }}
        >
          Approving this offer confirms you agree to these booking terms.
        </div>
      )}
    </div>
  );
}

function TermLine({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span className="text-admin-ink-muted" style={{ fontSize: 12 }}>{label}</span>
        <span
          style={{ fontSize: 12.5, fontWeight: 600, textAlign: "right" }}
          className="text-admin-ink"
        >
          {value}
        </span>
      </div>
      {sub && (
        <span className="text-admin-ink-dim text-admin-11" style={{ lineHeight: 1.4 }}>
          {sub}
        </span>
      )}
    </div>
  );
}
