// Workspace admin — Payments (P4-money).
//
// What actually moved: takings by method, what is still owed, refunds, and
// the cash drawer sessions with what was counted against what was expected.
// This is the destination registry's canonical `payments` route, made real
// — it used to redirect to `/admin/financials` (see `_registry-route-
// redirect.ts`). That redirect stub still exists and financials is
// untouched, so the old address keeps working; this route now renders its
// own content instead of forwarding.
//
// Every figure below traces to real rows:
//   - takings   -> booking_transactions, status = 'paid'
//   - owed      -> EVERY order in the 'to_pay' bucket (same rule as the Orders
//                  desk, over the whole set rather than the desk's 200-row list)
//   - refunds   -> booking_transactions, status = 'refunded'
//   - drawer    -> pos_shifts
// Where the design asks for more than the schema has (movement-by-movement
// detail, a denomination count), this page says so instead of inventing it
// — see the "Cash drawer sessions" section below and money.md §3/§4.
//
// Capability gate matches Financials (`manage_billing`, owner-class):
// Payments is that same owner-facing money surface, not the front-of-house
// Orders desk.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { formatOrderMoney } from "@/lib/orders/money-format";
import {
  loadTenantTakings,
  loadTenantOwedOrders,
  loadTenantRefunds,
  loadTenantDrawerSessions,
} from "../../_data-bridge/payments-activity";
import {
  formatVenueDateTime,
  groupTakingsByMethod,
  paymentMethodLabelKey,
  sumOwedByCurrency,
  withVariance,
} from "@/lib/payments/activity-shape";
import { tenantTimezone } from "@/lib/spaces/venues";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

/** Cash drawer amounts have no currency column on `pos_shifts` — USD per the platform's primary-currency rule (never inferred from a stored default). */
const DRAWER_CURRENCY = "USD";

const CARD = "rounded-xl border border-border bg-card";

export default async function PaymentsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canManageBilling = await userHasCapability("manage_billing", scope.tenantId);
  if (!canManageBilling) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const t = (k: string) => tr(`dashboard.payments.${k}`);
  const intlLocale = locale === "es" ? "es-ES" : locale === "fr" ? "fr-FR" : "en-US";

  const [takingsLoad, owedLoad, refundsLoad, drawerLoad, timeZone] = await Promise.all([
    loadTenantTakings(scope.tenantId),
    loadTenantOwedOrders(scope.tenantId),
    loadTenantRefunds(scope.tenantId),
    loadTenantDrawerSessions(scope.tenantId),
    // Every moment on this page is rendered on the WORKSPACE's clock, not on
    // the render server's and not on the reader's browser. `tenantTimezone`
    // is the platform's own ladder (the venue in play, then the workspace,
    // then UTC) and the zone is printed beside each time.
    tenantTimezone(scope.tenantId),
  ]);

  const at = (iso: string | null) =>
    formatVenueDateTime(iso, { locale: intlLocale, timeZone }) ?? t("timeNotRecorded");

  const takingsGroups = takingsLoad.ok ? groupTakingsByMethod(takingsLoad.rows) : [];

  const owedByCurrency = owedLoad.ok ? sumOwedByCurrency(owedLoad.rows) : [];

  const drawerViews = drawerLoad.ok ? drawerLoad.rows.map(withVariance) : [];

  return (
    <main className="mx-auto max-w-[1180px] px-7 py-8 text-foreground">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-2xl font-semibold">{t("pageTitle")}</h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">{t("pageIntro")}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Link
            href={`/${tenantSlug}/admin/financials`}
            className="text-[12.5px] text-foreground underline underline-offset-2"
          >
            {t("financialsLink")}
          </Link>
          {/* The zone is on every timestamp as well; this says once, in
              words, whose clock the page is on. */}
          <span className="text-[11.5px] text-muted-foreground">{t("timesInVenueZone")}</span>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        {/* ── Takings by method ── */}
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="m-0 text-base font-semibold">{t("takingsTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("takingsSub")}</p>
          </div>
          {!takingsLoad.ok ? (
            <div className={`${CARD} p-6`}>
              <p className="m-0 text-sm font-medium">{t("unavailableTitle")}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("unavailableBody")}</p>
            </div>
          ) : takingsGroups.length === 0 ? (
            <div className={`${CARD} p-6 text-[13px] text-muted-foreground`}>{t("takingsEmpty")}</div>
          ) : (
            <div className={`${CARD} overflow-hidden`}>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-accent/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3.5 py-2.5 font-medium">{t("colMethod")}</th>
                    <th className="px-3.5 py-2.5 text-right font-medium">{t("colCount")}</th>
                    <th className="px-3.5 py-2.5 text-right font-medium">{t("colAmount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {takingsGroups.map((g) => {
                    const labelKey = paymentMethodLabelKey(g.method);
                    return (
                      <tr key={`${g.currency}:${g.method}`} className="border-t border-border">
                        <td className="px-3.5 py-2.5">{labelKey ? t(labelKey) : g.method}</td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums text-muted-foreground">{g.count}</td>
                        <td className="px-3.5 py-2.5 text-right font-medium tabular-nums">
                          {formatOrderMoney(g.totalCents, g.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Still owed ── */}
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="m-0 text-base font-semibold">{t("owedTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("owedSub")}</p>
          </div>
          {!owedLoad.ok ? (
            <div className={`${CARD} p-6`}>
              <p className="m-0 text-sm font-medium">{t("unavailableTitle")}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("unavailableBody")}</p>
            </div>
          ) : owedByCurrency.length === 0 ? (
            <div className={`${CARD} p-6 text-[13px] text-muted-foreground`}>{t("owedEmpty")}</div>
          ) : (
            <div className={`${CARD} flex flex-wrap items-center gap-6 p-5`}>
              {owedByCurrency.map((c) => (
                <span key={c.currency} className="text-sm">
                  <strong className="tabular-nums">{formatOrderMoney(c.totalCents, c.currency)}</strong>
                </span>
              ))}
              <Link
                href={`/${tenantSlug}/admin/orders?bucket=to_pay`}
                className="ml-auto text-[12.5px] text-foreground underline underline-offset-2"
              >
                {t("owedNote")}
              </Link>
            </div>
          )}
        </section>

        {/* ── Refunds ── */}
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="m-0 text-base font-semibold">{t("refundsTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("refundsSub")}</p>
          </div>
          {!refundsLoad.ok ? (
            <div className={`${CARD} p-6`}>
              <p className="m-0 text-sm font-medium">{t("unavailableTitle")}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("unavailableBody")}</p>
            </div>
          ) : refundsLoad.rows.length === 0 ? (
            <div className={`${CARD} p-6 text-[13px] text-muted-foreground`}>{t("refundsEmpty")}</div>
          ) : (
            <div className={`${CARD} overflow-hidden`}>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-accent/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3.5 py-2.5 font-medium">{t("colDate")}</th>
                    <th className="px-3.5 py-2.5 font-medium">{t("colOriginalPayment")}</th>
                    <th className="px-3.5 py-2.5 text-right font-medium">{t("colRefunded")}</th>
                  </tr>
                </thead>
                <tbody>
                  {refundsLoad.rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3.5 py-2.5 text-muted-foreground">{at(r.refundedAt)}</td>
                      <td className="px-3.5 py-2.5 font-mono text-[12px] text-muted-foreground">
                        {r.orderId ? (
                          <Link
                            href={`/${tenantSlug}/admin/orders?q=${encodeURIComponent(r.orderId)}`}
                            className="hover:underline"
                          >
                            {r.orderId.slice(0, 8).toUpperCase()}
                          </Link>
                        ) : (
                          r.refundOfTransactionId?.slice(0, 8).toUpperCase() ?? "—"
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-medium tabular-nums">
                        {formatOrderMoney(r.grossAmountCents, r.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Cash drawer sessions ── */}
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="m-0 text-base font-semibold">{t("drawerTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("drawerSub")}</p>
          </div>
          {!drawerLoad.ok ? (
            <div className={`${CARD} p-6`}>
              <p className="m-0 text-sm font-medium">{t("unavailableTitle")}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("unavailableBody")}</p>
            </div>
          ) : drawerViews.length === 0 ? (
            <div className={`${CARD} p-6 text-[13px] text-muted-foreground`}>{t("drawerEmpty")}</div>
          ) : (
            <div className="flex flex-col gap-3">
              {drawerViews.map((s) => (
                <div key={s.id} className={`${CARD} p-5`}>
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <span
                      className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium ${
                        s.status === "open"
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-transparent text-muted-foreground"
                      }`}
                    >
                      {s.status === "open" ? t("drawerOpenLabel") : t("drawerClosedLabel")}
                    </span>
                    <span className="text-[12.5px] text-muted-foreground">
                      {t("drawerOpenedAt")} {at(s.openedAt)}
                    </span>
                    {s.closedAt ? (
                      <span className="text-[12.5px] text-muted-foreground">
                        · {t("drawerClosedAt")} {at(s.closedAt)}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-6 text-sm">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {t("drawerOpening")}
                      </div>
                      <div className="tabular-nums">{formatOrderMoney(s.openingCashCents, DRAWER_CURRENCY)}</div>
                    </div>
                    {s.expectedCashCents != null ? (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {t("drawerExpected")}
                        </div>
                        <div className="tabular-nums">{formatOrderMoney(s.expectedCashCents, DRAWER_CURRENCY)}</div>
                      </div>
                    ) : null}
                    {s.closingCashCents != null ? (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {t("drawerCounted")}
                        </div>
                        <div className="tabular-nums">{formatOrderMoney(s.closingCashCents, DRAWER_CURRENCY)}</div>
                      </div>
                    ) : null}
                    {s.varianceCents != null ? (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {t("drawerVariance")}
                        </div>
                        <div className="tabular-nums font-medium">
                          {s.varianceCents > 0 ? "+" : ""}
                          {formatOrderMoney(s.varianceCents, DRAWER_CURRENCY)}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {s.status === "open" ? (
                    <p className="mt-3 text-[12px] text-muted-foreground">{t("drawerStillOpenNote")}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {/* money.md §3/§4: `pos_shifts` has no child table for individual
              movements, reasons, or denominations — confirmed by grep across
              every migration. Stated here rather than built against a table
              that does not exist. */}
          <p className="text-[12px] text-muted-foreground">{t("movementsGapNote")}</p>
        </section>
      </div>
    </main>
  );
}
