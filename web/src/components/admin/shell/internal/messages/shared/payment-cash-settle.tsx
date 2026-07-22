"use client";

/**
 * CashSettleControls — the off-platform (cash / efectivo / wire / venue-paid)
 * settlement block on the Payment tab. Extracted from machinery-6 PaymentTab
 * (800-line cap).
 *
 * Records the booking as paid WITHOUT Stripe or a payout receiver: the
 * rail-aware trigger lets a provider='manual' transaction settle receiver-free
 * and the platform fee accrues to the workspace off-platform balance. Cash
 * deals in the cash-first market are deposit-first, so when the booking has
 * deposit terms the coordinator can record the deposit alone (booking flips to
 * 'partial', the balance-due card emits) and settle the balance later. See
 * web/docs/off-platform-settlement-architecture-2026-07-14.md.
 */

import { useState } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { markInquiryPaidInCash, type InquiryPaymentState } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { COLORS } from "../../state";
import { ghostBtn, primaryBtn } from "./machinery-13";

type OffPlatformMethod = "cash" | "wire" | "venue_paid";

/** Off-platform settle reason stamped on the commission snapshot per method. */
function cashReasonFor(method: OffPlatformMethod): string {
  return method === "cash" ? "efectivo" : method === "wire" ? "wire_transfer" : "venue_paid";
}

export function CashSettleControls({
  show,
  tenantSlug,
  inquiryId,
  state,
  pending,
  run,
}: {
  /** Caller-resolved visibility: admin pov + booking exists + not yet settled. */
  show: boolean;
  tenantSlug: string;
  inquiryId: string;
  state: InquiryPaymentState;
  pending: boolean;
  run: (label: string, fn: () => Promise<{ ok: boolean; error?: string } | undefined | void>) => void;
}) {
  const t = useT();
  // 1D — which off-platform method the coordinator is recording (cash default).
  const [method, setMethod] = useState<OffPlatformMethod>("cash");
  if (!show) return null;

  const settle = (checkoutType: "deposit" | "balance" | "full") =>
    run(t("dashboard.adminTabs.payment.markPaidCash"), () =>
      markInquiryPaidInCash(tenantSlug, inquiryId, method, cashReasonFor(method), checkoutType));

  return (
    <div className="mt-2 border-t border-admin-border pt-2.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-admin-10h font-bold uppercase tracking-wide text-admin-ink-muted whitespace-nowrap">
          {t("dashboard.adminTabs.payment.cashMethodLabel")}
        </span>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as OffPlatformMethod)}
          aria-label={t("dashboard.adminTabs.payment.cashMethodLabel")}
          className="rounded border border-admin-border bg-white px-1.5 py-1 text-[11px] text-admin-ink"
        >
          <option value="cash">{t("dashboard.adminTabs.payment.cashMethodCash")}</option>
          <option value="wire">{t("dashboard.adminTabs.payment.cashMethodWire")}</option>
          <option value="venue_paid">{t("dashboard.adminTabs.payment.cashMethodVenue")}</option>
        </select>
      </div>
      {!state.depositPaid && state.depositAmountCents > 0 ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => settle("deposit")} style={primaryBtn(COLORS.success)}>
            {pending
              ? t("dashboard.adminTabs.saving")
              : interpolate(t("dashboard.adminTabs.payment.markPaidCashDeposit"), {
                  amount: (state.depositAmountCents / 100).toFixed(2),
                  currency: state.currency ?? "USD",
                })}
          </button>
          <button type="button" disabled={pending} onClick={() => settle("full")} style={ghostBtn()}>
            {t("dashboard.adminTabs.payment.markPaidCashFull")}
          </button>
        </div>
      ) : state.depositPaid ? (
        <button type="button" disabled={pending} onClick={() => settle("balance")} style={primaryBtn(COLORS.success)}>
          {pending ? t("dashboard.adminTabs.saving") : t("dashboard.adminTabs.payment.markPaidCashBalance")}
        </button>
      ) : (
        <button type="button" disabled={pending} onClick={() => settle("full")} style={ghostBtn()}>
          {pending ? t("dashboard.adminTabs.saving") : t("dashboard.adminTabs.payment.markPaidCash")}
        </button>
      )}
      <div className="text-[11px] mt-1 text-admin-ink-muted">
        {t("dashboard.adminTabs.payment.markPaidCashHint")}
      </div>
    </div>
  );
}
