"use client";

/**
 * Talent Money home (mockup mc_money / mc_outstanding / mc_payouts) on REAL data:
 * earnings rows from the layout bridge + client balances from loadTalentClients.
 * Never the September fixture. Where a source does not exist yet the page says
 * so plainly instead of printing a zero.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { PageHeader } from "@/components/admin/shell/internal/talent/shared/page-chrome-1";
import { loadTalentClients } from "@/lib/talent/clients-actions";
import type { TalentClientRow } from "@/lib/talent/clients-merge";
import { EMPTY_TALENT_EARNINGS, type TalentEarnings } from "@/lib/talent/earnings-types";
import {
  buildMoneyHomeView,
  methodBucket,
  moneyMonths,
  shiftMonth,
  type MoneyMethodBucket,
} from "@/lib/talent/money-home";

import { useResolvedTalentEarningsByCurrency } from "./use-resolved-talent-earnings-by-currency";

type Tab = "payments" | "outstanding" | "payouts";

function money(cents: number, currency: string): string {
  const amount = Math.round(cents) / 100;
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `$${formatted} ${currency}`;
}

function day(iso: string | null, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}

function monthLabel(key: string, locale: string): string {
  const d = new Date(`${key}-01T12:00:00`);
  return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const METHOD_LABEL: Record<MoneyMethodBucket, string> = {
  card: "Card",
  cash: "Cash",
  transfer: "Transfer",
  other: "Other",
};

const pill =
  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 font-admin-body text-[13.5px] sm:h-9";
const pillOn = `${pill} bg-admin-ink font-semibold text-white`;
const pillOff = `${pill} border border-admin-border-soft bg-white text-admin-ink`;
const btnSec =
  "inline-flex h-11 items-center justify-center rounded-full border border-admin-border-soft bg-white px-4 font-admin-body text-[13.5px] font-semibold text-admin-ink sm:h-9";

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

function MoneyHomePane(props: { earnings: TalentEarnings; clients: TalentClientRow[] | null }) {
  const copy = useDashboardText();
  const t = copy.t;
  const locale = copy.locale;
  const router = useRouter();
  const current = currentMonthKey();
  const [month, setMonth] = useState(current);
  const [tab, setTab] = useState<Tab>("payments");
  const [method, setMethod] = useState<MoneyMethodBucket | "all">("all");
  const months = useMemo(() => moneyMonths(props.earnings, current), [props.earnings, current]);
  const view = useMemo(
    () => buildMoneyHomeView({ earnings: props.earnings, clients: props.clients, month }),
    [props.earnings, props.clients, month],
  );
  const cur = view.currency;
  const oldest = months[months.length - 1] ?? current;
  const payments =
    method === "all" ? view.payments : view.payments.filter((p) => methodBucket(p.paymentMethod) === method);

  const split = (["card", "cash", "transfer", "other"] as const)
    .filter((m) => view.byMethod[m] > 0)
    .map((m) => `${t(METHOD_LABEL[m])} ${money(view.byMethod[m], cur)}`)
    .join(" · ");

  return (
    <div data-money-home className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={t("Previous month")}
          disabled={month <= oldest}
          onClick={() => setMonth(shiftMonth(month, -1))}
          className={`${btnSec} w-11 px-0 disabled:opacity-40`}
        >
          ‹
        </button>
        <span className="min-w-[150px] text-center font-admin-body text-[14px] font-semibold capitalize text-admin-ink">
          {monthLabel(month, locale)}
        </span>
        <button
          type="button"
          aria-label={t("Next month")}
          disabled={month >= current}
          onClick={() => setMonth(shiftMonth(month, 1))}
          className={`${btnSec} w-11 px-0 disabled:opacity-40`}
        >
          ›
        </button>
        <span className="flex-1" />
        <span className="font-admin-body text-[13px] text-admin-ink-muted">
          {t("Amounts in")} {cur}
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
          value={props.clients == null ? t("Loading") : money(view.owedCents, cur)}
          tone={view.owedCents > 0 ? "warn" : undefined}
          lines={
            view.owed.length > 0
              ? `${view.owed.length} ${t("clients")}${
                  view.overdueCents > 0 ? ` · ${money(view.overdueCents, cur)} ${t("overdue")}` : ""
                }`
              : t("Nobody owes you anything on file.")
          }
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
            ["outstanding", t("Outstanding"), view.owed.length],
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
          <div className="flex gap-2 overflow-x-auto">
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
              </button>
            ))}
          </div>
          {payments.length === 0 ? (
            <p className="px-1 py-4 font-admin-body text-[13.5px] text-admin-ink-muted">
              {t("No payments in this month yet.")}
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
                    {money(p.grossCents, cur)}
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
        props.clients == null ? (
          <p className="px-1 py-4 font-admin-body text-[13px] text-admin-ink-muted">{t("Loading")}</p>
        ) : view.owed.length === 0 ? (
          <p className="px-1 py-4 font-admin-body text-[13.5px] text-admin-ink-muted">
            {t("Nobody owes you anything on file.")}
          </p>
        ) : (
          <div className="overflow-hidden rounded-[12px] border border-admin-border-soft bg-white">
            {view.owed.map((o, i) => (
              <div
                key={o.id}
                className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center ${
                  i ? "border-t border-admin-border-soft" : ""
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
        )
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
  const { openDrawer, bridgeTalentSelfProfile } = useAdminShell();
  const copy = useDashboardText();
  const t = copy.t;
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
          <button type="button" className={btnSec} onClick={() => openDrawer("talent-payouts")}>
            {t("Payout settings")}
          </button>
        }
      />
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
          <MoneyHomePane key={active.totals.currency} earnings={active} clients={clients} />
        </>
      )}
    </>
  );
}
