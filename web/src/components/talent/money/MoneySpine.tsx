"use client";

import { useEffect, useMemo, useState } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { PrimaryButton, SecondaryButton } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import type { MoneyAction } from "@/lib/money/money-actions";
import type { MoneyPaymentRow, MoneyPayoutRow } from "@/lib/money/money-read-model";
import {
  buildMoneySpineView,
  buildPaymentDetail,
  buildPayoutDetail,
  filterOutstanding,
  filterPayments,
  formatMoneyMajor,
  formatMoneyShort,
  methodCounts,
  type MethodFilter,
  type MoneyTab,
  type OutstandingFilter,
  type PaymentDetailView,
  type PayoutDetailView,
} from "@/lib/money/money-spine-view";
import { consumeMoneyLanding } from "@/lib/money/today-money-tiles";

import { MoneyOutstandingPanel } from "./MoneyOutstandingPanel";
import { MoneyPaymentsPanel } from "./MoneyPaymentsPanel";
import { MoneyPayoutsPanel } from "./MoneyPayoutsPanel";
import { MoneySummaryCard } from "./money-spine-shared";
import { PaymentDetailDrawer } from "./PaymentDetailDrawer";
import { PayoutAccountStatesSheet } from "./PayoutAccountStatesSheet";
import { PayoutDetailDrawer } from "./PayoutDetailDrawer";

export function MoneySpine({
  onViewBreakdown,
  onOpenAction,
}: {
  onViewBreakdown?: () => void;
  onOpenAction: (action: MoneyAction) => void;
}) {
  const copy = useDashboardText();
  const view = useMemo(() => buildMoneySpineView(), []);
  const [tab, setTab] = useState<MoneyTab>("payments");
  const [method, setMethod] = useState<MethodFilter>("all");
  const [query, setQuery] = useState("");
  const [outFilt, setOutFilt] = useState<OutstandingFilter>("all");
  const [paymentDetail, setPaymentDetail] = useState<PaymentDetailView | null>(null);
  const [payoutDetail, setPayoutDetail] = useState<PayoutDetailView | null>(null);
  const [accountStatesOpen, setAccountStatesOpen] = useState(false);

  // Today "Due by today" (and sibling tiles) pin a landing via sessionStorage.
  useEffect(() => {
    const landing = consumeMoneyLanding();
    if (!landing) return;
    setTab(landing.tab);
    if (landing.outFilt) setOutFilt(landing.outFilt);
  }, []);

  const counts = methodCounts(view.payments);
  const payments = filterPayments(view.payments, method, query);
  const outstanding = filterOutstanding(view.outstanding, outFilt);
  const { summary } = view;

  function openPayment(p: MoneyPaymentRow) {
    setPayoutDetail(null);
    setPaymentDetail(buildPaymentDetail(p, view.refunds, view.payouts));
  }

  function openPaymentById(paymentId: string) {
    const p = view.payments.find((row) => row.id === paymentId);
    if (p) openPayment(p);
  }

  function openPayout(po: MoneyPayoutRow, failed = false) {
    setPaymentDetail(null);
    setPayoutDetail(buildPayoutDetail(po, view.payments, view.refunds, { failed }));
  }

  function openPayoutById(payoutId: string, failed = false) {
    const po = view.payouts.find((row) => row.id === payoutId);
    if (!po) return;
    setAccountStatesOpen(false);
    openPayout(po, failed);
  }

  function openAccountStates() {
    setPaymentDetail(null);
    setPayoutDetail(null);
    setAccountStatesOpen(true);
  }

  function goOutstanding(filt: OutstandingFilter = "all") {
    setOutFilt(filt);
    setTab("outstanding");
  }

  return (
    <div data-money-spine="m5" style={{ fontFamily: FONTS.body }}>
      <style>{`
        @media (max-width: 720px) {
          [data-money-spine] [data-money-desk-actions] { display: none !important; }
          [data-money-spine] [data-money-period-row] { flex-wrap: wrap; }
          [data-money-spine] [data-money-summary] { flex-direction: column !important; }
          [data-money-spine] [data-money-pay-search] { display: none !important; }
          [data-money-spine] [data-money-desk-table] { display: none !important; }
          [data-money-spine] [data-money-mob-list] { display: block !important; }
          [data-money-spine] [data-money-desk-out] { display: none !important; }
          [data-money-spine] [data-money-mob-out] { display: flex !important; }
          [data-money-spine] [data-money-desk-po] { display: none !important; }
          [data-money-spine] [data-money-mob-po] { display: flex !important; }
          [data-money-spine] [data-money-mob-actions] { display: flex !important; }
          [data-money-spine] [data-money-desk-po-cta] { display: none !important; }
          [data-money-spine] [role="tablist"] { overflow-x: auto; gap: 16px !important; max-width: 100%; scrollbar-width: none; }
          [data-money-spine] [role="tab"] { min-height: 44px; white-space: nowrap; }
          [data-money-payout-states] { width: calc(100vw - 16px) !important; max-height: calc(100dvh - 24px) !important; }
          [data-money-payout-states] > div:last-child > div { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 721px) {
          [data-money-spine] [data-money-mob-list] { display: none !important; }
          [data-money-spine] [data-money-mob-out] { display: none !important; }
          [data-money-spine] [data-money-mob-po] { display: none !important; }
          [data-money-spine] [data-money-mob-actions] { display: none !important; }
        }
      `}</style>

      <div
        data-money-period-row
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <PeriodPill label={copy.t(view.periodLabel)} />
        <span style={{ flex: 1 }} />
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13.5,
            color: COLORS.inkMuted,
          }}
        >
          {copy.t("Payout account:")}{" "}
          <b style={{ color: COLORS.ink }}>{view.payoutAccount.bank}</b> · {copy.t("verified")}{" "}
          <button
            type="button"
            onClick={openAccountStates}
            style={{
              color: COLORS.indigoDeep,
              fontWeight: 600,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              fontSize: 13.5,
              fontFamily: FONTS.body,
            }}
          >
            {copy.t("Manage")}
          </button>
        </span>
      </div>

      <div data-money-summary style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <MoneySummaryCard
          title={copy.t("Collected in September")}
          scope={copy.t("gross, 1–23 Sep")}
          amount={formatMoneyMajor(summary.collected_gross, view.currency)}
          lines={`${summary.payments_count} ${copy.t("payments")} · ${copy.t("card")} ${formatMoneyShort(summary.by_method.card)} · ${copy.t("cash")} ${formatMoneyShort(summary.by_method.cash)} · ${copy.t("transfer")} ${formatMoneyShort(summary.by_method.transfer)}`}
          foot={`${copy.t("Refunded")} ${formatMoneyShort(summary.refunded)} (${copy.t("shown separately")})`}
          onClick={() => setTab("payments")}
        />
        <MoneySummaryCard
          title={copy.t("Outstanding now")}
          scope={copy.t("any month")}
          amount={formatMoneyMajor(summary.outstanding_total, view.currency)}
          linesNode={
            <span>
              <b style={{ color: COLORS.critical }}>
                {formatMoneyShort(summary.outstanding_overdue)} {copy.t("overdue")}
              </b>
              {` · ${formatMoneyShort(summary.outstanding_today)} ${copy.t("due today")} · ${formatMoneyShort(summary.outstanding_later)} ${copy.t("Due later").toLowerCase()}`}
            </span>
          }
          onClick={() => goOutstanding("all")}
        />
        <MoneySummaryCard
          title={copy.t("Platform payouts")}
          scope={copy.t("card only")}
          amount={formatMoneyMajor(summary.platform_paid_out, view.currency)}
          lines={`${copy.t("Paid to")} ${view.payoutAccount.bank} ${copy.t("in September")}`}
          foot={
            summary.next_payout_estimated != null
              ? `${copy.t("Next: about")} ${formatMoneyShort(summary.next_payout_estimated)} ${copy.t("on Fri 25 (estimated)")}`
              : undefined
          }
          onClick={() => setTab("payouts")}
        />
      </div>

      <TabList
        active={tab}
        payments={summary.payments_count}
        outstanding={summary.outstanding_count}
        payouts={summary.payouts_count}
        onChange={setTab}
        labels={{
          payments: copy.t("Payments"),
          outstanding: copy.t("Outstanding"),
          payouts: copy.t("Payouts"),
        }}
      />

      <div data-money-mob-actions style={{ display: "none", gap: 8, margin: "12px 0" }}>
        <div style={{ flex: 1 }}>
          <SecondaryButton size="sm" onClick={() => onOpenAction({ kind: "record" })}>
            {copy.t("Record payment")}
          </SecondaryButton>
        </div>
        <div style={{ flex: 1 }}>
          <SecondaryButton size="sm" onClick={openAccountStates}>
            {copy.t("Payout account")}
          </SecondaryButton>
        </div>
      </div>

      {tab === "payments" ? (
        <MoneyPaymentsPanel
          payments={payments}
          refunds={view.refunds}
          method={method}
          counts={counts}
          query={query}
          onMethod={setMethod}
          onQuery={setQuery}
          onOpen={openPayment}
        />
      ) : null}

      {tab === "outstanding" ? (
        <MoneyOutstandingPanel
          rows={outstanding}
          filter={outFilt}
          summary={summary}
          waiting={view.waitingRequest}
          agency={view.agencyLine}
          currency={view.currency}
          onFilter={setOutFilt}
          onRequest={(row) => onOpenAction({ kind: "request", prefill: row })}
          onRecord={(row) => onOpenAction({ kind: "record", prefill: row })}
        />
      ) : null}

      {tab === "payouts" ? (
        <MoneyPayoutsPanel
          payouts={view.payouts}
          currency={view.currency}
          onOpen={(po) => openPayout(po)}
          onViewBreakdown={onViewBreakdown}
        />
      ) : null}

      {paymentDetail ? (
        <PaymentDetailDrawer
          detail={paymentDetail}
          onClose={() => setPaymentDetail(null)}
        />
      ) : null}

      {payoutDetail ? (
        <PayoutDetailDrawer
          detail={payoutDetail}
          onClose={() => setPayoutDetail(null)}
          onOpenPayment={openPaymentById}
          onUpdateAccount={() => {
            setPayoutDetail(null);
            setAccountStatesOpen(true);
          }}
        />
      ) : null}

      {accountStatesOpen ? (
        <PayoutAccountStatesSheet
          onClose={() => setAccountStatesOpen(false)}
          onViewPayout={(id) => openPayoutById(id)}
          onViewFailedPayout={(id) => openPayoutById(id, true)}
        />
      ) : null}
    </div>
  );
}

/** Header actions for PageHeader — Record / Request. */
export function MoneySpineHeaderActions({
  onRecord,
  onRequest,
}: {
  onRecord: () => void;
  onRequest: () => void;
}) {
  const copy = useDashboardText();
  return (
    <div data-money-desk-actions style={{ display: "flex", gap: 8 }}>
      <SecondaryButton size="sm" onClick={onRecord}>
        {copy.t("Record payment")}
      </SecondaryButton>
      <PrimaryButton size="sm" onClick={onRequest}>
        {copy.t("Request payment")}
      </PrimaryButton>
    </div>
  );
}

function PeriodPill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 36,
        padding: "0 12px",
        borderRadius: 9,
        border: `1px solid ${COLORS.border}`,
        background: "#fff",
        fontSize: 14,
        fontWeight: 600,
        color: COLORS.ink,
      }}
    >
      {label}
      <span style={{ fontSize: 11, color: COLORS.inkMuted }}>▾</span>
    </span>
  );
}

function TabList({
  active,
  payments,
  outstanding,
  payouts,
  onChange,
  labels,
}: {
  active: MoneyTab;
  payments: number;
  outstanding: number;
  payouts: number;
  onChange: (t: MoneyTab) => void;
  labels: { payments: string; outstanding: string; payouts: string };
}) {
  const tabs: { id: MoneyTab; label: string; n: number }[] = [
    { id: "payments", label: labels.payments, n: payments },
    { id: "outstanding", label: labels.outstanding, n: outstanding },
    { id: "payouts", label: labels.payouts, n: payouts },
  ];
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 24,
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        marginBottom: 4,
      }}
    >
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 42,
              fontSize: 14.5,
              fontWeight: on ? 700 : 500,
              color: on ? COLORS.ink : COLORS.inkMuted,
              border: "none",
              borderBottom: `2.5px solid ${on ? COLORS.ink : "transparent"}`,
              marginBottom: -1,
              background: "transparent",
              cursor: "pointer",
              fontFamily: FONTS.body,
              padding: "0 2px",
            }}
          >
            {t.label}
            <span style={{ fontSize: 12.5, color: COLORS.inkDim, fontWeight: 600 }}>{t.n}</span>
          </button>
        );
      })}
    </div>
  );
}
