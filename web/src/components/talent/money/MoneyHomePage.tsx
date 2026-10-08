"use client";

/**
 * Talent Money home (mockup mc_money / mc_outstanding / mc_payouts) on REAL data:
 * earnings rows from the layout bridge + client balances from loadTalentClients.
 * Never the September fixture. Where a source does not exist yet the page says
 * so plainly instead of printing a zero.
 */

import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { PageHeader } from "@/components/admin/shell/internal/talent/shared/page-chrome-1";
import { loadTalentClients } from "@/lib/talent/clients-actions";
import type { TalentClientRow } from "@/lib/talent/clients-merge";
import { EMPTY_TALENT_EARNINGS, type TalentEarnings } from "@/lib/talent/earnings-types";
import {
  agendaMoneyRows,
  buildMoneyHomeView,
  methodBucket,
  moneyMonths,
  talentOwedSummary,
  type MoneyAgendaRow,
  type MoneyMethodBucket,
} from "@/lib/talent/money-home";
import { formatMonthLabel, monthKeyInZone } from "@/lib/money/money-rules";
import { refundOwnBookingPayment } from "@/lib/talent-agenda";
import { AgendaPanelFrame } from "@/components/admin/shell/internal/talent/agenda/AgendaPanelFrame";
import { MoneyRecordPaymentPanel } from "./MoneyRecordPaymentPanel";
import { AgendaPayRequest } from "@/components/admin/shell/internal/talent/agenda/AgendaPayRequest";

import { AgendaMoneyLine } from "./AgendaMoneyLine";
import { FeePayerCard } from "./FeePayerCard";
import { useResolvedTalentEarningsByCurrency } from "./use-resolved-talent-earnings-by-currency";

type Tab = "payments" | "outstanding" | "payouts";
type OutFilter = "all" | "today" | "later";
type SourceFilter = "all" | "direct" | "agency";
type PayoutLine = { state: "verified" | "pending" | "none" };

function day(iso: string | null, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}

function currentMonthKey(): string {
  return monthKeyInZone(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
}

const METHOD_LABEL: Record<MoneyMethodBucket, string> = {
  card: "Card",
  cash: "Cash",
  transfer: "Transfer",
  other: "Other",
};

const pill =
  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 font-admin-body text-[13.5px] sm:h-9";
const pillOn = `${pill} border border-[var(--tc-action)] bg-[var(--tc-soft)] font-semibold text-[var(--tc-ink)]`;
const pillOff = `${pill} border border-[var(--tc-border)] bg-white text-[var(--tc-ink)]`;
const btnBase =
  "inline-flex h-11 items-center justify-center rounded-full border px-4 font-admin-body text-[13.5px] font-semibold sm:h-9";
const btnSec = `${btnBase} border-[var(--tc-border)] bg-white text-[var(--tc-ink)]`;
const btnPri = `${btnBase} border-[var(--tc-action)] bg-[var(--tc-action)] text-white hover:bg-[var(--tc-action-hover)] disabled:opacity-40`;

function SummaryCard(props: {
  title: string;
  scope: string;
  value: string;
  lines: string;
  tone?: "warn";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="min-w-0 flex-1 rounded-[12px] border border-admin-border-soft bg-white px-4 py-3.5 text-left"
    >
      <div className="flex items-baseline gap-2">
        <span className="font-admin-body text-[13.5px] font-semibold text-admin-ink">{props.title}</span>
        <span className="flex-1" />
        <span className="text-[12px] text-admin-ink-muted">{props.scope}</span>
      </div>
      <div
        className={`mt-1.5 whitespace-nowrap font-admin-display text-[24px] font-bold ${
          props.tone === "warn" ? "text-admin-amber-deep" : "text-admin-ink"
        }`}
      >
        {props.value}
      </div>
      <div className="mt-1 font-admin-body text-[13px] leading-snug text-admin-ink-muted">{props.lines}</div>
    </button>
  );
}

function MoneyHomePane(props: {
  earnings: TalentEarnings;
  clients: TalentClientRow[] | null;
  agenda: { owed: MoneyAgendaRow[]; waiting: MoneyAgendaRow[]; refundPending: MoneyAgendaRow[] };
  payout: PayoutLine;
  onManagePayouts: () => void;
  onRequest: (row: MoneyAgendaRow) => void;
  onRefund: (row: MoneyAgendaRow) => void;
  refundBusyId: string | null;
  refundStatus: string | null;
}) {
  const copy = useDashboardText();
  const t = copy.t;
  const locale = copy.locale;
  const money = (c: number, cur: string) => formatDashboardMoneyCents(c, cur, locale);
  const router = useRouter();
  const current = currentMonthKey();
  const [month, setMonth] = useState(current);
  const [tab, setTab] = useState<Tab>("payments");
  const [method, setMethod] = useState<MoneyMethodBucket | "all">("all");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [outFilter, setOutFilter] = useState<OutFilter>("all");
  const months = useMemo(() => moneyMonths(props.earnings, current), [props.earnings, current]);
  const view = useMemo(
    () => buildMoneyHomeView({ earnings: props.earnings, clients: props.clients, month }),
    [props.earnings, props.clients, month],
  );
  const cur = view.currency;
  const q = search.trim().toLowerCase();
  const sourced = view.payments.filter(
    (p) =>
      (source === "all" ||
        (source === "agency" ? p.source === "agency_routed" : p.source !== "agency_routed")) &&
      (!q || p.client.toLowerCase().includes(q) || p.agencyName.toLowerCase().includes(q)),
  );
  const methodCount = (m: MoneyMethodBucket) => sourced.filter((p) => methodBucket(p.paymentMethod) === m).length;
  const payments = method === "all" ? sourced : sourced.filter((p) => methodBucket(p.paymentMethod) === method);

  // Owed = the client ledger, or the agenda's balances when those are larger (booked work
  // the ledger has not caught up with). Requests waiting are shown apart: not owed yet.
  const owedSummary = talentOwedSummary({ clients: props.clients, agendaOwed: props.agenda.owed, currency: cur });
  const owedCents = owedSummary.cents;
  const waiting = props.agenda.waiting;
  const refundPending = props.agenda.refundPending;
  const waitingPriced = waiting.reduce((sum, r) => sum + (r.amountCents ?? 0), 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const clientDueToday = (o: (typeof view.owed)[number]) =>
    o.overdue || (o.nextStartsAt != null && Date.parse(o.nextStartsAt) <= endOfToday.getTime());
  const owedList = view.owed.filter((o) =>
    outFilter === "all" ? true : outFilter === "today" ? clientDueToday(o) : !clientDueToday(o),
  );
  const clientHrefs = new Set(view.owed.map((o) => o.bookingHref).filter(Boolean));
  const agendaOwedList = props.agenda.owed
    .filter((r) => !clientHrefs.has(r.bookingHref))
    .filter((r) => (outFilter === "all" ? true : outFilter === "today" ? r.dueByToday : !r.dueByToday));
  const waitingList = waiting.filter((r) =>
    outFilter === "all" ? true : outFilter === "today" ? r.dueByToday : !r.dueByToday,
  );
  const refundList = refundPending.filter((r) =>
    outFilter === "all" ? true : outFilter === "today" ? r.dueByToday : !r.dueByToday,
  );
  const outstandingCount = owedSummary.count;

  const split = (["card", "cash", "transfer", "other"] as const)
    .filter((m) => view.byMethod[m] > 0)
    .map((m) => `${t(METHOD_LABEL[m])} ${money(view.byMethod[m], cur)}`)
    .join(" · ");

  return (
    <div data-money-home className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t("Month")}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-11 rounded-[10px] border border-admin-border-soft bg-white px-3 font-admin-body text-[14px] font-semibold text-admin-ink sm:h-9"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {formatMonthLabel(m, locale)}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        {/* Status text and its action are two separate controls with a gap,
            not one run-on line (QA DS-50). Presentation only. */}
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 font-admin-body text-[13px] text-admin-ink-muted">
          <span>
            {t("Payout account")}:{" "}
            <span className="font-semibold text-admin-ink">
              {props.payout.state === "verified"
                ? t("Stripe · verified")
                : props.payout.state === "pending"
                  ? t("Stripe · setup not finished")
                  : t("Not set up")}
            </span>
          </span>
          <button
            type="button"
            onClick={props.onManagePayouts}
            className={
              props.payout.state === "none"
                ? "inline-flex min-h-[32px] items-center rounded-full border border-admin-accent px-3 font-semibold text-admin-accent"
                : "min-h-[32px] font-semibold text-admin-accent"
            }
          >
            {props.payout.state === "none" ? t("Set up") : t("Manage")}
          </button>
        </span>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-4">
        <SummaryCard
          title={t("Collected")}
          scope={t("this month")}
          value={money(view.collectedCents, cur)}
          lines={
            view.collectedCount > 0
              ? `${view.collectedCount} ${t("payments")}${split ? ` · ${split}` : ""}`
              : t("No payments recorded this month.")
          }
          onClick={() => setTab("payments")}
        />
        <SummaryCard
          title={t("Owed to you")}
          scope={t("any month")}
          value={
            props.clients == null
              ? t("Loading")
              : [money(owedCents, cur), ...owedSummary.others.map((o) => money(o.cents, o.currency))].join(" + ")
          }
          tone={owedCents > 0 ? "warn" : undefined}
          lines={props.clients == null ? "" : [
            outstandingCount > 0
              ? `${outstandingCount} ${t(outstandingCount === 1 ? "balance" : "balances")}${
                  view.overdueCents > 0 ? ` · ${money(view.overdueCents, cur)} ${t("overdue")}` : ""
                }`
              : waiting.length === 0
                ? t("Nobody owes you anything on file.")
                : "",
            waiting.length > 0
              ? `${waiting.length} ${t(waiting.length === 1 ? "payment request waiting" : "payment requests waiting")}${
                  waitingPriced > 0 ? ` · ${money(waitingPriced, cur)}` : ""
                }`
              : "",
            refundPending.length > 0
              ? `${refundPending.length} ${t(refundPending.length === 1 ? "refund pending" : "refunds pending")}`
              : "",
          ]
            .filter(Boolean)
            .join(" · ")}
          onClick={() => setTab("outstanding")}
        />
        <SummaryCard
          title={t("Next payout")}
          scope={t("card only")}
          value={view.nextPayoutCents == null ? t("None scheduled") : money(view.nextPayoutCents, cur)}
          lines={
            view.nextPayoutCents == null
              ? `${t("Paid out this month")}: ${money(view.paidOutCents, cur)}`
              : `${view.nextPayoutDate ? day(view.nextPayoutDate, locale) : t("Date not set yet")} · ${t(
                  "Paid out this month",
                )}: ${money(view.paidOutCents, cur)}`
          }
          onClick={() => setTab("payouts")}
        />
      </div>

      <div role="tablist" className="flex gap-6 border-b border-admin-border-soft">
        {(
          [
            ["payments", t("Payments"), view.payments.length],
            ["outstanding", t("Outstanding"), outstandingCount + waiting.length + refundPending.length],
            ["payouts", t("Payouts"), view.payouts.length],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px inline-flex h-11 items-center gap-1.5 border-b-[2.5px] font-admin-body text-[14.5px] ${
              tab === id
                ? "border-admin-ink font-bold text-admin-ink"
                : "border-transparent text-admin-ink-muted"
            }`}
          >
            {label}
            <span className="text-[12.5px] font-semibold text-admin-ink-muted">{n}</span>
          </button>
        ))}
      </div>

      {tab === "payments" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search client or service")}
              aria-label={t("Search client or service")}
              className="h-11 w-full rounded-[10px] border border-admin-border-soft bg-white px-3 font-admin-body text-[14px] text-admin-ink sm:h-9 sm:w-[280px]"
            />
            <div className="flex flex-wrap gap-2">
              {(["all", "card", "cash", "transfer"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={method === m}
                  onClick={() => setMethod(m)}
                  className={method === m ? pillOn : pillOff}
                >
                  {m === "all" ? t("All methods") : t(METHOD_LABEL[m])}
                  <span className="text-[12px] opacity-70">{m === "all" ? sourced.length : methodCount(m)}</span>
                </button>
              ))}
            </div>
            <select
              aria-label={t("Source")}
              value={source}
              onChange={(e) => setSource(e.target.value as SourceFilter)}
              className={`${pillOff} pr-2`}
            >
              <option value="all">{`${t("Source")}: ${t("all")}`}</option>
              <option value="direct">{`${t("Source")}: ${t("your own clients")}`}</option>
              <option value="agency">{`${t("Source")}: ${t("agencies")}`}</option>
            </select>
          </div>
          {payments.length === 0 ? (
            <p className="px-1 py-4 font-admin-body text-[13.5px] text-admin-ink-muted">
              {q || source !== "all" || method !== "all" ? t("No payments match.") : t("No payments in this month yet.")}
            </p>
          ) : (
            <div className="overflow-hidden rounded-[12px] border border-admin-border-soft bg-white">
              {payments.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => router.push(`/talent/bookings/${p.bookingId}`)}
                  className={`flex min-h-[44px] w-full items-center gap-3 px-4 py-3 text-left ${
                    i ? "border-t border-admin-border-soft" : ""
                  }`}
                >
                  <span className="w-[92px] shrink-0 font-admin-body text-[13.5px] text-admin-ink">
                    {day(p.workDate, locale)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-admin-body text-[14.5px] font-bold text-admin-ink">
                      {p.client || t("Client")}
                    </span>
                    <span className="block text-[13px] text-admin-ink-muted">
                      {p.paymentMethod ? t(METHOD_LABEL[methodBucket(p.paymentMethod)]) : t("Method not recorded")}
                      {p.status === "pending" ? ` · ${t("Part paid")}` : ""}
                    </span>
                  </span>
                  <span className="whitespace-nowrap font-admin-body text-[15px] font-bold text-admin-ink">
                    {money(p.collectedCents != null && p.collectedCents > 0 ? p.collectedCents : p.grossCents, cur)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className="font-admin-body text-[12.5px] text-admin-ink-muted">
            {t("Cash and transfers never pass through Tulala, so they show as collected and never as a payout.")}
          </p>
        </div>
      ) : null}

      {tab === "outstanding" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", t("All")],
                ["today", t("Due by today")],
                ["later", t("Later")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={outFilter === id}
                onClick={() => setOutFilter(id)}
                className={outFilter === id ? pillOn : pillOff}
              >
                {label}
              </button>
            ))}
          </div>
        {props.clients == null ? (
          <p className="px-1 py-4 font-admin-body text-[13px] text-admin-ink-muted">{t("Loading")}</p>
        ) : owedList.length === 0 && agendaOwedList.length === 0 ? (
          <p className="px-1 py-4 font-admin-body text-[13.5px] text-admin-ink-muted">
            {waiting.length > 0 ? t("Nothing is owed yet. Requests waiting are below.") : t("Nobody owes you anything on file.")}
          </p>
        ) : (
          <div className="overflow-hidden rounded-[12px] border border-admin-border-soft bg-white">
            {agendaOwedList.map((r, i) => (
              <AgendaMoneyLine key={r.id} row={r} first={i === 0} onRequest={props.onRequest} />
            ))}
            {owedList.map((o, i) => (
              <div
                key={o.id}
                className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center ${
                  i || agendaOwedList.length ? "border-t border-admin-border-soft" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-admin-body text-[15px] font-bold text-admin-ink">{o.name}</div>
                  <div
                    className={`text-[13px] ${o.overdue ? "font-semibold text-admin-critical" : "text-admin-ink-muted"}`}
                  >
                    {o.overdue
                      ? t("Overdue")
                      : o.nextStartsAt
                        ? `${t("Due at the appointment")} · ${day(o.nextStartsAt, locale)}`
                        : t("Due at the appointment")}
                  </div>
                </div>
                <span
                  className={`whitespace-nowrap font-admin-body text-[15px] font-bold ${
                    o.overdue ? "text-admin-critical" : "text-admin-ink"
                  }`}
                >
                  {money(o.amountCents, cur)}
                </span>
                <div className="flex gap-2">
                  {o.bookingHref ? (
                    <button type="button" className={`${btnSec} flex-1`} onClick={() => router.push(o.bookingHref!)}>
                      {t("Open booking")}
                    </button>
                  ) : null}
                  {o.conversationHref ? (
                    <button
                      type="button"
                      className={`${btnSec} flex-1`}
                      onClick={() => router.push(o.conversationHref!)}
                    >
                      {t("Message")}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
          <h3 className="mt-2 font-admin-body text-[15px] font-bold text-admin-ink">
            {t("Payment requests waiting")} <span className="text-[12.5px] text-admin-ink-muted">{waitingList.length}</span>
          </h3>
          <p className="-mt-2 font-admin-body text-[12.5px] text-admin-ink-muted">
            {t("Deposits and payments you asked for on holds and bookings. Not owed until the time is booked.")}
          </p>
          {waitingList.length === 0 ? (
            <p className="px-1 py-2 font-admin-body text-[13.5px] text-admin-ink-muted">{t("No requests waiting.")}</p>
          ) : (
            <div className="overflow-hidden rounded-[12px] border border-admin-border-soft bg-white">
              {waitingList.map((r, i) => (
                <AgendaMoneyLine key={r.id} row={r} first={i === 0} onRequest={props.onRequest} />
              ))}
            </div>
          )}
          {refundList.length > 0 ? (
            <>
              <h3 className="mt-2 font-admin-body text-[15px] font-bold text-admin-ink">
                {t("Refund pending")}{" "}
                <span className="text-[12.5px] text-admin-ink-muted">{refundList.length}</span>
              </h3>
              <p className="-mt-2 font-admin-body text-[12.5px] text-admin-ink-muted">
                {t("Money arrived after a cancellation. Refund it here.")}
              </p>
              {props.refundStatus ? (
                <p className="-mt-1 px-1 font-admin-body text-[13px] text-admin-ink">{props.refundStatus}</p>
              ) : null}
              <div className="overflow-hidden rounded-[12px] border border-admin-border-soft bg-white">
                {refundList.map((r, i) => (
                  <AgendaMoneyLine
                    key={r.id}
                    row={r}
                    first={i === 0}
                    onRequest={props.onRequest}
                    onRefund={props.onRefund}
                    refundBusy={props.refundBusyId === r.id}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {tab === "payouts" ? (
        <div className="flex flex-col gap-3">
          <p className="font-admin-body text-[13.5px] leading-normal text-admin-ink-muted">
            {t("Only card payments made through Tulala become payouts. Cash and transfers you record went straight to you.")}
          </p>
          {view.payouts.length === 0 ? (
            <p className="px-1 py-2 font-admin-body text-[13.5px] text-admin-ink-muted">
              {t("No payouts in this month.")}
            </p>
          ) : (
            <div className="overflow-hidden rounded-[12px] border border-admin-border-soft bg-white">
              {view.payouts.map((po, i) => (
                <div
                  key={po.key}
                  className={`flex min-h-[44px] items-center gap-3 px-4 py-3 ${
                    i ? "border-t border-admin-border-soft" : ""
                  }`}
                >
                  <span className="w-[110px] shrink-0 font-admin-body text-[14px] font-bold text-admin-ink">
                    {po.date ? day(po.date, locale) : t("Date not set yet")}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] text-admin-ink-muted">
                    {po.state === "paid" ? t("Paid") : t("Scheduled")} · {po.count} {t("payments")}
                  </span>
                  <span className="whitespace-nowrap font-admin-body text-[15px] font-bold text-admin-ink">
                    {money(po.netCents, cur)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function MoneyHomePage() {
  const { openDrawer, bridgeTalentSelfProfile, bridgeTalentAgendaItems, bridgeTalentPayoutSnapshot } = useAdminShell();
  const router = useRouter();
  const copy = useDashboardText();
  const money = (c: number, cur: string) => formatDashboardMoneyCents(c, cur, copy.locale);
  const t = copy.t;
  const [sheet, setSheet] = useState<"record" | "request" | null>(null);
  const [linkFor, setLinkFor] = useState<MoneyAgendaRow | null>(null);
  // Record payment opens the amount + method sheet right here, over Money.
  const [finishFor, setFinishFor] = useState<MoneyAgendaRow | null>(null);
  const [refundBusyId, setRefundBusyId] = useState<string | null>(null);
  const [refundStatus, setRefundStatus] = useState<string | null>(null);
  const [, startRefund] = useTransition();
  const agenda = useMemo(
    () => agendaMoneyRows(bridgeTalentAgendaItems ?? [], new Date()),
    [bridgeTalentAgendaItems],
  );
  const payout: PayoutLine = {
    state:
      bridgeTalentPayoutSnapshot?.ok !== true || !bridgeTalentPayoutSnapshot.data.stripeAccountId
        ? "none"
        : bridgeTalentPayoutSnapshot.data.payoutsEnabled
          ? "verified"
          : "pending",
  };
  // A link needs an order on the booking; without one the booking record makes it.
  const request = (row: MoneyAgendaRow) => {
    setSheet(null);
    if (row.orderId) setLinkFor(row);
    else router.push(row.bookingHref);
  };
  const refund = (row: MoneyAgendaRow) => {
    setRefundStatus(null);
    setRefundBusyId(row.id);
    startRefund(async () => {
      const res = await refundOwnBookingPayment({ bookingId: row.id });
      setRefundBusyId(null);
      if (!res.ok) {
        setRefundStatus(`${t("Refund failed")}: ${res.reason}`);
        return;
      }
      if (res.already || res.refundedCents <= 0) {
        setRefundStatus(t("Nothing left to refund on this booking."));
      } else {
        setRefundStatus(
          `${t("Refund sent")} ${(res.refundedCents / 100).toFixed(2)} ${res.currency}. ${t("Money updates when Stripe confirms it.")}`,
        );
      }
      router.refresh();
    });
  };
  const pickRows = [...agenda.owed, ...agenda.waiting];
  const { byCurrency, defaultCurrency, loadError } = useResolvedTalentEarningsByCurrency();
  const talentId = bridgeTalentSelfProfile?.id ?? null;
  const [clients, setClients] = useState<TalentClientRow[] | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);

  useEffect(() => {
    if (!talentId) return;
    let cancelled = false;
    void loadTalentClients(talentId).then((res) => {
      if (!cancelled) setClients(res.ok ? res.items : []);
    });
    return () => {
      cancelled = true;
    };
  }, [talentId]);

  const fallbackCurrency = (defaultCurrency || "MXN").toUpperCase();
  const bundles: TalentEarnings[] = byCurrency.length
    ? byCurrency
    : [{ ...EMPTY_TALENT_EARNINGS, totals: { ...EMPTY_TALENT_EARNINGS.totals, currency: fallbackCurrency } }];
  const active =
    bundles.find((b) => b.totals.currency.toUpperCase() === currency) ?? bundles[0]!;

  return (
    <>
      <PageHeader
        title={t("Money")}
        subtitle={t("What clients paid you, what they still owe, and what reached your bank.")}
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSec} onClick={() => setSheet("record")}>
              {t("Record payment")}
            </button>
            <button
              type="button"
              className={btnPri}
              onClick={() => setSheet("request")}
            >
              {t("Request payment")}
            </button>
          </div>
        }
      />
      <FeePayerCard currency={fallbackCurrency} showTip={false} />
      {loadError ? (
        <p className="rounded-[12px] border border-admin-border-soft bg-admin-critical-soft px-4 py-3 font-admin-body text-[13.5px] text-admin-critical">
          {t("Could not load Money.")} {t("Refresh the page and try again.")}
        </p>
      ) : (
        <>
          {bundles.length > 1 ? (
            <div className="mb-3 flex gap-2">
              {bundles.map((b) => (
                <button
                  key={b.totals.currency}
                  type="button"
                  role="tab"
                  aria-selected={b === active}
                  onClick={() => setCurrency(b.totals.currency.toUpperCase())}
                  className={b === active ? pillOn : pillOff}
                >
                  {b.totals.currency.toUpperCase()}
                </button>
              ))}
            </div>
          ) : null}
          <MoneyHomePane
            key={active.totals.currency}
            earnings={active}
            clients={clients}
            agenda={agenda}
            payout={payout}
            onManagePayouts={() => openDrawer("talent-payouts")}
            onRequest={request}
            onRefund={refund}
            refundBusyId={refundBusyId}
            refundStatus={refundStatus}
          />
        </>
      )}

      {sheet ? (
        <AgendaPanelFrame
          title={sheet === "record" ? t("Record payment") : t("Request payment")}
          onClose={() => setSheet(null)}
          dataAttr="data-money-pick-panel"
          footer={
            <button type="button" className={`${btnSec} w-full`} onClick={() => setSheet(null)}>
              {t("Cancel")}
            </button>
          }
        >
          <p className="font-admin-body text-[13px] text-admin-ink-muted">
            {sheet === "record"
              ? t("Pick the booking, then enter what you received and how.")
              : t("Pick the booking to send a payment link for.")}
          </p>
          {pickRows.length === 0 ? (
            <p className="mt-4 font-admin-body text-[13.5px] text-admin-ink-muted">
              {t("No bookings are waiting for a payment.")}
            </p>
          ) : (
            <ul className="mt-3 overflow-hidden rounded-[12px] border border-admin-border-soft">
              {pickRows.map((r, i) => (
                <li key={r.id} className={i ? "border-t border-admin-border-soft" : ""}>
                  <button
                    type="button"
                    onClick={() => {
                      if (sheet === "record") {
                        setSheet(null);
                        setFinishFor(r);
                      } else request(r);
                    }}
                    className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-black/[0.03]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-admin-body text-[14px] font-semibold text-admin-ink">
                        {r.name}
                      </span>
                      <span className="block text-[12.5px] text-admin-ink-muted">
                        {[r.kind === "deposit" ? t("Deposit requested") : t("Balance due"), day(r.startsAt, copy.locale)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="whitespace-nowrap font-admin-body text-[14px] font-bold text-admin-ink">
                      {r.amountCents != null ? money(r.amountCents, r.currency) : t("Amount not set")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </AgendaPanelFrame>
      ) : null}

      {finishFor ? (
        <MoneyRecordPaymentPanel
          row={finishFor}
          onClose={() => setFinishFor(null)}
          onDone={() => {
            setFinishFor(null);
            router.refresh();
          }}
        />
      ) : null}

      {linkFor?.orderId ? (
        <AgendaPayRequest
          orderId={linkFor.orderId}
          defaultCents={linkFor.amountCents}
          clientName={linkFor.name}
          onClose={() => setLinkFor(null)}
        />
      ) : null}
    </>
  );
}
