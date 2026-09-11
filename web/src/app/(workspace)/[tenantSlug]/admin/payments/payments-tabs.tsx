/**
 * payments-tabs.tsx — the six tabs of the Payments board (W25), each over
 * its own reader (see `payments-board.ts`). Server components; token classes
 * only. A tab whose reader failed says "could not load" with a retry (W59),
 * never the first-use empty state.
 */

import Link from "next/link";

import { formatOrderMoney } from "@/lib/orders/money-format";
import { paymentMethodLabelKey } from "@/lib/payments/activity-shape";
import { StatePill } from "@/components/admin/shell/internal/page-modules/appointments-classes-ui";
import type { PaymentsBoard } from "../../_data-bridge/payments-board";
import { EmptyCard, FailedCard, GRID_HEAD, GRID_ROW, Section, clockIn, dateIn } from "./payments-ui";

export type PaymentsTab = "collections" | "refunds" | "attempts" | "drawers" | "payouts" | "reconciliation";

type T = (k: string) => string;

function shortRef(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function retryHref(tenantSlug: string, tab: PaymentsTab): string {
  return tab === "collections" ? `/${tenantSlug}/admin/payments` : `/${tenantSlug}/admin/payments?tab=${tab}`;
}

// ── Collections ────────────────────────────────────────────────────────────

export function CollectionsTab({ board, t, tenantSlug }: { board: PaymentsBoard; t: T; tenantSlug: string }) {
  return (
    <div className="flex flex-col gap-[16px]">
      <Section title={t("takingsTitle")} sub={t("takingsSub")} testId="payments-takings">
        {!board.takings.ok ? (
          <FailedCard title={t("unavailableTitle")} body={t("unavailableBody")} retryHref={retryHref(tenantSlug, "collections")} retryLabel={t("retry")} />
        ) : board.takings.groups.length === 0 ? (
          <EmptyCard testId="payments-takings-empty">{t("takingsEmpty")}</EmptyCard>
        ) : (
          <div className="rounded-[14px] border border-admin-border bg-admin-card">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-admin-11 font-semibold uppercase tracking-[0.05em] text-admin-ink-muted">
                  <th className="px-[16px] py-[8px] font-semibold">{t("colMethod")}</th>
                  <th className="px-[16px] py-[8px] text-right font-semibold">{t("colCount")}</th>
                  <th className="px-[16px] py-[8px] text-right font-semibold">{t("colAmount")}</th>
                </tr>
              </thead>
              <tbody>
                {board.takings.groups.map((g) => {
                  const labelKey = paymentMethodLabelKey(g.method);
                  return (
                    <tr key={`${g.currency}:${g.method}`} data-method={g.method} className="border-t border-admin-border-soft text-admin-12h">
                      <td className="px-[16px] py-[10px] font-semibold text-admin-ink">{labelKey ? t(labelKey) : g.method}</td>
                      <td className="px-[16px] py-[10px] text-right tabular-nums text-admin-ink-muted">{g.count}</td>
                      <td className="px-[16px] py-[10px] text-right font-semibold tabular-nums text-admin-ink">{formatOrderMoney(g.totalCents, g.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={t("owedTitle")} sub={t("owedSub")} testId="payments-owed">
        {!board.owed.ok ? (
          <FailedCard title={t("unavailableTitle")} body={t("unavailableBody")} retryHref={retryHref(tenantSlug, "collections")} retryLabel={t("retry")} />
        ) : board.owed.totals.length === 0 ? (
          <EmptyCard testId="payments-owed-empty">{t("owedEmpty")}</EmptyCard>
        ) : (
          <div className="flex flex-wrap items-center gap-[24px] rounded-[14px] border border-admin-border bg-admin-card px-[20px] py-[16px]">
            {board.owed.totals.map((c) => (
              <span key={c.currency} className="text-[18px] font-semibold tabular-nums text-admin-ink" data-owed-currency={c.currency}>
                {formatOrderMoney(c.totalCents, c.currency)}
                <span className="ml-[8px] text-[12px] font-normal text-admin-ink-muted">{c.count} {t("owedOrders")}</span>
              </span>
            ))}
            <Link href={`/${tenantSlug}/admin/orders?bucket=to_pay`} className="ml-auto text-[12.5px] font-semibold text-admin-brand hover:underline">
              {t("owedNote")} →
            </Link>
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Refunds ────────────────────────────────────────────────────────────────

export function RefundsTab({ board, t, tenantSlug, locale }: { board: PaymentsBoard; t: T; tenantSlug: string; locale: string }) {
  const cols = "grid-cols-[150px_110px_1.4fr_110px_130px_150px]";
  const pending = board.exceptions.ok ? board.exceptions.refundsPending : [];
  return (
    <Section title={t("refundsTitle")} sub={t("refundsSub")} testId="payments-refunds">
      {!board.refunds.ok ? (
        <FailedCard title={t("unavailableTitle")} body={t("unavailableBody")} retryHref={retryHref(tenantSlug, "refunds")} retryLabel={t("retry")} />
      ) : (
        <>
          {pending.length > 0 ? (
            <div className="rounded-[14px] border border-admin-border bg-admin-card" data-testid="payments-refunds-pending">
              <div className={`${GRID_HEAD} ${cols}`}>
                <span>{t("colTime")}</span>
                <span>{t("colRef")}</span>
                <span>{t("colRecord")}</span>
                <span className="text-right">{t("colAmount")}</span>
                <span>{t("colDetail")}</span>
                <span>{t("colState")}</span>
              </div>
              {pending.map((r) => (
                <div key={r.key} className={`${GRID_ROW} ${cols}`} data-refund-pending>
                  <span className="font-mono text-admin-ink-muted">{dateIn(r.firstSeenAt, locale, board.timeZone)}</span>
                  <span className="font-mono text-admin-ink">{shortRef(r.sourceId)}</span>
                  <span className="font-semibold text-admin-ink">{r.title}</span>
                  <span className="text-right tabular-nums text-admin-ink">—</span>
                  <span className="text-admin-ink-muted">{r.detail}</span>
                  <span>
                    <StatePill tone="coral" state="pending">{t("refundPending")}</StatePill>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {board.refunds.rows.length === 0 ? (
            <EmptyCard testId="payments-refunds-empty">{t("refundsEmpty")}</EmptyCard>
          ) : (
            <div className="rounded-[14px] border border-admin-border bg-admin-card" data-testid="payments-refunds-completed">
              <div className={`${GRID_HEAD} ${cols}`}>
                <span>{t("colTime")}</span>
                <span>{t("colRef")}</span>
                <span>{t("colRecord")}</span>
                <span className="text-right">{t("colAmount")}</span>
                <span>{t("colMethod")}</span>
                <span>{t("colState")}</span>
              </div>
              {board.refunds.rows.map((r) => (
                <div key={r.id} className={`${GRID_ROW} ${cols}`} data-refund-row>
                  <span className="font-mono text-admin-ink-muted">{dateIn(r.refundedAt, locale, board.timeZone) || t("timeNotRecorded")}</span>
                  <span className="font-mono text-admin-ink">{shortRef(r.id)}</span>
                  <span className="font-semibold text-admin-ink">
                    {r.orderId ? (
                      <Link href={`/${tenantSlug}/admin/orders?q=${encodeURIComponent(r.orderId)}`} className="hover:underline">
                        {t("orderWord")} {shortRef(r.orderId)}
                      </Link>
                    ) : r.refundOfTransactionId ? (
                      `${t("paymentWord")} ${shortRef(r.refundOfTransactionId)}`
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="text-right font-semibold tabular-nums text-admin-ink">−{formatOrderMoney(r.grossAmountCents, r.currency)}</span>
                  <span className="text-admin-ink-muted">{r.provider === "manual" ? t("refundManual") : r.provider}</span>
                  <span>
                    <StatePill tone="green" state="completed">{t("refundCompleted")}</StatePill>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ── Attempts (T1-06: unresolved collections) ───────────────────────────────

export function AttemptsTab({ board, t, locale, now }: { board: PaymentsBoard; t: T; locale: string; now: Date }) {
  const cols = "grid-cols-[90px_110px_1.4fr_1.2fr_170px_110px]";
  return (
    <Section title={t("attemptsTitle")} sub={t("attemptsSub")} testId="payments-attempts">
      {!board.exceptions.ok ? (
        <FailedCard title={t("unavailableTitle")} body={t("unavailableBody")} retryHref="?tab=attempts" retryLabel={t("retry")} />
      ) : board.exceptions.unknownAttempts.length === 0 ? (
        <EmptyCard testId="payments-attempts-empty">{t("attemptsEmpty")}</EmptyCard>
      ) : (
        <div className="rounded-[14px] border border-admin-border bg-admin-card">
          <div className={`${GRID_HEAD} ${cols}`}>
            <span>{t("colTime")}</span>
            <span>{t("colRef")}</span>
            <span>{t("colRecord")}</span>
            <span>{t("colDetail")}</span>
            <span>{t("colState")}</span>
            <span />
          </div>
          {board.exceptions.unknownAttempts.map((r) => {
            const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(r.firstSeenAt)) / 60_000));
            return (
              <div key={r.key} className={`${GRID_ROW} ${cols}`} data-attempt-row>
                <span className="font-mono text-admin-ink-muted">{clockIn(r.firstSeenAt, locale, board.timeZone)}</span>
                <span className="font-mono text-admin-ink">{shortRef(r.sourceId)}</span>
                <span className="font-semibold text-admin-ink">{r.title}</span>
                <span className="text-admin-ink-muted">{r.detail}</span>
                <span>
                  <StatePill tone="critical" state="unknown">
                    {t("attemptUnknown")} · {minutes} min · {r.attempts} {t("attemptTries")}
                  </StatePill>
                </span>
                <span className="text-right">
                  {r.href ? (
                    <Link href={r.href} className="text-[12px] font-semibold text-admin-brand hover:underline">
                      {r.nextAction.kind === "resume" ? r.nextAction.label : t("openIssue")} →
                    </Link>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {board.exceptions.ok && board.exceptions.unavailable.length > 0 ? (
        <p role="alert" className="m-0 text-[12px] text-admin-red">{t("attemptsIncomplete")}</p>
      ) : null}
    </Section>
  );
}

// ── Drawers ────────────────────────────────────────────────────────────────

export function DrawersTab({ board, t, locale, currency }: { board: PaymentsBoard; t: T; locale: string; currency: string }) {
  const cols = "grid-cols-[150px_150px_100px_100px_100px_100px_110px]";
  return (
    <Section title={t("drawerTitle")} sub={t("drawerSub")} testId="payments-drawers">
      {!board.drawers.ok ? (
        <FailedCard title={t("unavailableTitle")} body={t("unavailableBody")} retryHref="?tab=drawers" retryLabel={t("retry")} />
      ) : board.drawers.rows.length === 0 ? (
        <EmptyCard testId="payments-drawers-empty">{t("drawerEmpty")}</EmptyCard>
      ) : (
        <div className="rounded-[14px] border border-admin-border bg-admin-card">
          <div className={`${GRID_HEAD} ${cols}`}>
            <span>{t("drawerOpenedAt")}</span>
            <span>{t("drawerClosedAt")}</span>
            <span className="text-right">{t("drawerOpening")}</span>
            <span className="text-right">{t("drawerExpected")}</span>
            <span className="text-right">{t("drawerCounted")}</span>
            <span className="text-right">{t("drawerVariance")}</span>
            <span>{t("colState")}</span>
          </div>
          {board.drawers.rows.map((s) => (
            <div key={s.id} className={`${GRID_ROW} ${cols}`} data-drawer-row data-drawer-status={s.status}>
              <span className="font-mono text-admin-ink-muted">{dateIn(s.openedAt, locale, board.timeZone) || t("timeNotRecorded")}</span>
              <span className="font-mono text-admin-ink-muted">{s.closedAt ? dateIn(s.closedAt, locale, board.timeZone) : "—"}</span>
              <span className="text-right tabular-nums text-admin-ink" data-drawer-opening>{formatOrderMoney(s.openingCashCents, currency)}</span>
              <span className="text-right tabular-nums text-admin-ink" data-drawer-expected>{s.expectedCashCents != null ? formatOrderMoney(s.expectedCashCents, currency) : "—"}</span>
              <span className="text-right tabular-nums text-admin-ink" data-drawer-counted>{s.closingCashCents != null ? formatOrderMoney(s.closingCashCents, currency) : "—"}</span>
              <span className={`text-right font-semibold tabular-nums ${s.varianceCents != null && s.varianceCents !== 0 ? "text-admin-coral-deep" : "text-admin-ink"}`} data-drawer-variance>
                {s.varianceCents != null ? `${s.varianceCents > 0 ? "+" : ""}${formatOrderMoney(s.varianceCents, currency)}` : "—"}
              </span>
              <span>
                {s.status === "open" ? (
                  <StatePill tone="indigo" state="open">{t("drawerOpenLabel")}</StatePill>
                ) : (
                  <StatePill tone="slate" state="closed">{t("drawerClosedLabel")}</StatePill>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* money.md §3/§4: `pos_shifts` has no child table for individual
          movements, reasons, or denominations. Stated rather than built
          against a table that does not exist. */}
      <p className="m-0 text-[12px] text-admin-ink-muted">{t("movementsGapNote")}</p>
    </Section>
  );
}

// ── Payouts ────────────────────────────────────────────────────────────────

export function PayoutsTab({ board, t, tenantSlug }: { board: PaymentsBoard; t: T; tenantSlug: string }) {
  return (
    <Section title={t("payoutsTitle")} sub={t("payoutsSub")} testId="payments-payouts">
      {!board.payout.ok ? (
        <FailedCard title={t("unavailableTitle")} body={t("unavailableBody")} retryHref="?tab=payouts" retryLabel={t("retry")} />
      ) : (
        <div className="rounded-[14px] border border-admin-border bg-admin-card px-[20px] py-[16px]">
          <div className="flex items-center gap-[10px]">
            <span className="text-admin-13 font-semibold text-admin-ink">{t("payoutDestination")}</span>
            {board.payout.enabled ? (
              <StatePill tone="green" state="enabled">{t("payoutEnabled")}</StatePill>
            ) : board.payout.destination ? (
              <StatePill tone="coral" state="pending">{t("payoutPending")}</StatePill>
            ) : (
              <StatePill tone="slate" state="none">{t("payoutNone")}</StatePill>
            )}
          </div>
          <p className="mt-[6px] text-admin-13 text-admin-ink-muted">{t("payoutScheduleNote")}</p>
          <div className="mt-[12px] flex flex-wrap gap-[8px]">
            <Link href={`/${tenantSlug}/admin/payouts`} className="inline-flex h-[30px] items-center rounded-[9px] border border-admin-border bg-admin-card px-[12px] text-[12px] font-semibold text-admin-ink hover:border-admin-border-strong">
              {t("payoutSettingsLink")}
            </Link>
            <Link href={`/${tenantSlug}/admin/financials`} className="inline-flex h-[30px] items-center rounded-[9px] border border-admin-border bg-admin-card px-[12px] text-[12px] font-semibold text-admin-ink hover:border-admin-border-strong">
              {t("financialsLink")}
            </Link>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Reconciliation ─────────────────────────────────────────────────────────

export function ReconciliationTab({ board, t }: { board: PaymentsBoard; t: T }) {
  const unknown = board.exceptions.ok ? board.exceptions.unknownAttempts.length : 0;
  return (
    <Section title={t("reconciliationTitle")} sub={t("reconciliationSub")} testId="payments-reconciliation">
      <div className="rounded-[14px] border border-admin-border bg-admin-card px-[20px] py-[16px]">
        <p className="m-0 text-admin-13 text-admin-ink">{t("reconciliationNoImport")}</p>
        <p className="mt-[6px] text-admin-13 text-admin-ink-muted">
          {board.exceptions.ok ? (unknown === 0 ? t("reconciliationClean") : `${unknown} ${t("reconciliationUnknownRows")}`) : t("unavailableBody")}
        </p>
      </div>
    </Section>
  );
}
