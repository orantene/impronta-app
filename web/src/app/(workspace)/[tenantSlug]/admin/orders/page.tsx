// Workspace admin — Orders desk (0.10).
//
// Server Component, canonical route (not a prototype SPA tab), matching
// `financials`. Capability gate is `view_dashboard`, the same gate the
// `bookings` desk uses: Orders is the operational sibling of Bookings and the
// people who work one work the other. Gating it at `manage_billing`
// (owner-class, what `financials` uses) would hide the desk from exactly the
// front-of-house staff it exists for.
//
// All filtering and shaping comes from `lib/orders/orders-list.ts`, which is
// pure and tested; this file reads and renders.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { loadWorkspaceOrders } from "../../_data-bridge/orders";
import { formatOrderMoney } from "@/lib/orders/money-format";
import {
  bucketOf,
  filterOrders,
  outstandingCents,
  totalsFor,
  type OrderListBucket,
  type OrderListRow,
} from "@/lib/orders/orders-list";
import { OrdersRefundForm, type RefundFormCopy } from "./orders-refund-form";
import { type RefundEffect } from "@/lib/orders/refund-effects";
import { REFUND_DESK_KEY } from "@/lib/orders/refund-desk-copy";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type PageSearch = Promise<{ bucket?: string; q?: string }>;

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.08)",
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  green: "#2E7D5B",
  amber: "#B45309",
} as const;

const BUCKETS: readonly OrderListBucket[] = ["all", "open", "to_pay", "settled", "reversed"];

/**
 * What each refund effect DOES, one message key per effect.
 *
 * Written out rather than templated for the reason `projects/_keys.ts` gives:
 * `message-key-usage.static.test.ts` reads literals out of `src/`, and a missed
 * path renders as the dotted key itself with every gate still green.
 */
const REFUND_EFFECT_KEY: Record<RefundEffect, string> = {
  keep_entitlement: "dashboard.orders.refundEffectCopy.keepEntitlement",
  cancel_ticket: "dashboard.orders.refundEffectCopy.cancelTicket",
  adjustment_after_service: "dashboard.orders.refundEffectCopy.adjustmentAfterService",
  revoke_unused_admission: "dashboard.orders.refundEffectCopy.revokeUnusedAdmission",
  refund_hybrid_component: "dashboard.orders.refundEffectCopy.refundHybridComponent",
};

const BUCKET_KEY: Record<OrderListBucket, string> = {
  all: "bucketAll",
  open: "bucketOpen",
  to_pay: "bucketToPay",
  settled: "bucketSettled",
  reversed: "bucketReversed",
};

const STATUS_KEY: Record<string, string> = {
  draft: "statusDraft",
  quoted: "statusQuoted",
  pending_payment: "statusPendingPayment",
  paid: "statusPaid",
  fulfilled: "statusFulfilled",
  cancelled: "statusCancelled",
  refunded: "statusRefunded",
  partially_refunded: "statusPartiallyRefunded",
};


function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearch;
}) {
  const { tenantSlug } = await params;
  const sp = await searchParams;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const allowed = await userHasCapability("view_dashboard", scope.tenantId);
  if (!allowed) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const t = (k: string) => tr(`dashboard.orders.${k}`);

  const load = await loadWorkspaceOrders(scope.tenantId);

  const bucket: OrderListBucket = BUCKETS.includes(sp.bucket as OrderListBucket)
    ? (sp.bucket as OrderListBucket)
    : "all";
  const query = typeof sp.q === "string" ? sp.q : "";

  const rows: OrderListRow[] = load.ok ? filterOrders(load.rows, { bucket, query }) : [];
  const totals = totalsFor(rows);

  // Every word the refund form shows, resolved here where the translator is.
  // The component itself holds no English: see its header for the defect that
  // rule ends.
  //
  // Written member by member rather than folded out of the key maps, because
  // `Object.fromEntries` returns an index signature and the only way to hand
  // that to a `Record<RefundEffect, string>` is an assertion — which would then
  // stop the compiler noticing a member that lost its key.
  const refundCopy: RefundFormCopy = {
    refund: t("refund"),
    effect: t("refundEffect"),
    confirm: t("refundConfirm"),
    effects: {
      keep_entitlement: tr(REFUND_EFFECT_KEY.keep_entitlement),
      cancel_ticket: tr(REFUND_EFFECT_KEY.cancel_ticket),
      adjustment_after_service: tr(REFUND_EFFECT_KEY.adjustment_after_service),
      revoke_unused_admission: tr(REFUND_EFFECT_KEY.revoke_unused_admission),
      refund_hybrid_component: tr(REFUND_EFFECT_KEY.refund_hybrid_component),
    },
    outcomes: {
      refunded: tr(REFUND_DESK_KEY.refunded),
      pick_a_line: tr(REFUND_DESK_KEY.pick_a_line),
      not_allowed: tr(REFUND_DESK_KEY.not_allowed),
      invalid: tr(REFUND_DESK_KEY.invalid),
      not_found: tr(REFUND_DESK_KEY.not_found),
      nothing_to_refund: tr(REFUND_DESK_KEY.nothing_to_refund),
      line_already_refunded: tr(REFUND_DESK_KEY.line_already_refunded),
      exceeds_captured: tr(REFUND_DESK_KEY.exceeds_captured),
      no_provider_charge: tr(REFUND_DESK_KEY.no_provider_charge),
      provider_refused: tr(REFUND_DESK_KEY.provider_refused),
      partial_failure: tr(REFUND_DESK_KEY.partial_failure),
      unavailable: tr(REFUND_DESK_KEY.unavailable),
    },
  };

  return (
    <main style={{ padding: "32px 28px", maxWidth: 1180, margin: "0 auto", color: C.ink }} className="max-[720px]:p-0!">
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }} className="max-[720px]:text-[22px]! max-[720px]:tracking-[-0.02em]">{t("pageTitle")}</h1>
      <p style={{ color: C.inkMuted, marginTop: 6, marginBottom: 24 }} className="max-[720px]:mb-[12px]! max-[720px]:mt-[2px]! max-[720px]:text-[12.5px]">{t("pageIntro")}</p>

      {/*
        A read failure is its own state, never an empty list. `loadWorkspaceOrders`
        refuses rather than returning [], so a workspace with hundreds of orders
        can never be told it has none because a query timed out.
      */}
      {!load.ok ? (
        <section
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            background: C.cardBg,
            padding: 28,
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{t("unavailableTitle")}</h2>
          <p style={{ color: C.inkMuted, margin: "8px 0 0" }}>{t("unavailableBody")}</p>
        </section>
      ) : (
        <>
          {/* MW17: on the phone the buckets are the scrolling chip strip. */}
          <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }} className="max-[720px]:mb-[12px]! max-[720px]:flex-nowrap! max-[720px]:gap-[6px]! max-[720px]:overflow-x-auto max-[720px]:[scrollbar-width:none]">
            {BUCKETS.map((b) => {
              const active = b === bucket;
              return (
                <Link
                  key={b}
                  href={`?bucket=${b}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 999,
                    fontSize: 13,
                    textDecoration: "none",
                    border: `1px solid ${active ? C.ink : C.border}`,
                    background: active ? C.ink : C.cardBg,
                    color: active ? "#fff" : C.inkMuted,
                  }}
                  className="max-[720px]:shrink-0 max-[720px]:whitespace-nowrap max-[720px]:font-semibold"
                >
                  {t(BUCKET_KEY[b])}
                </Link>
              );
            })}
          </nav>

          {rows.length === 0 ? (
            <section
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                background: C.cardBg,
                padding: 40,
                textAlign: "center",
              }}
            >
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{t("emptyTitle")}</h2>
              <p style={{ color: C.inkMuted, margin: "8px 0 0" }}>{t("emptyBody")}</p>
            </section>
          ) : (
            <>
              <section
                style={{
                  display: "flex",
                  gap: 28,
                  flexWrap: "wrap",
                  alignItems: "baseline",
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  background: C.surface,
                  padding: "14px 18px",
                  marginBottom: 18,
                }}
                className="max-[720px]:mb-[12px]! max-[720px]:gap-x-[14px]! max-[720px]:gap-y-[4px]! max-[720px]:px-[14px]! max-[720px]:py-[10px]!"
              >
                <span style={{ fontSize: 14 }}>
                  <strong>{totals.count}</strong>{" "}
                  <span style={{ color: C.inkMuted }}>{t("totalsCount")}</span>
                </span>
                {/* One pair PER CURRENCY. Previously these summed every row and
                    labelled the result with the FIRST row's currency, on the
                    assumption that a filtered view is single-currency. Nothing
                    enforced that: `orders.currency` is per row, so a tenant that
                    changed its default currency would see ARS and USD added
                    together under one symbol -- a plausible, confidently
                    labelled, undetectably wrong number. In the ordinary
                    single-currency case this renders exactly as before. */}
                {totals.byCurrency.map((c) => (
                  <span key={c.currency} style={{ display: "contents" }}>
                    <span style={{ fontSize: 14 }}>
                      <span style={{ color: C.inkMuted }}>{t("totalsSettled")}: </span>
                      <strong style={{ color: C.green }}>
                        {formatOrderMoney(c.settledCents, c.currency)}
                      </strong>
                    </span>
                    <span style={{ fontSize: 14 }}>
                      <span style={{ color: C.inkMuted }}>{t("totalsOutstanding")}: </span>
                      <strong style={{ color: C.amber }}>
                        {formatOrderMoney(c.outstandingCents, c.currency)}
                      </strong>
                    </span>
                  </span>
                ))}
                {/* Named explicitly. A figure beside a filtered list that silently
                    describes something wider is how someone acts on the wrong number. */}
                <span style={{ fontSize: 12, color: C.inkDim, flexBasis: "100%" }}>
                  {t("totalsScopeNote")}
                </span>
              </section>

              {/* MW17: the phone's list is one card of rows — the order and
                  who it is for, its lines and total, its status as a pill. The
                  refund form stays on the desktop table (D-POS-68). */}
              <ul className="m-0 hidden list-none overflow-hidden rounded-[14px] border border-admin-border bg-admin-card p-0 max-[720px]:block">
                {rows.map((row) => {
                  const owed = outstandingCents(row);
                  const statusKey = STATUS_KEY[row.status];
                  const toPay = bucketOf(row.status) === "to_pay";
                  const pill = toPay
                    ? "bg-admin-coral-soft text-admin-coral-deep"
                    : row.status === "paid"
                      ? "bg-admin-success-soft text-admin-green"
                      : "bg-admin-amber-soft text-admin-amber";
                  const body = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14.5px] font-semibold leading-[1.3] text-admin-ink">
                          #{shortId(row.id)} · {row.customerName ?? t("noCustomer")}
                        </span>
                        <span className="mt-0.5 block text-[12.5px] leading-[1.35] text-admin-ink-muted">
                          {row.lineCount} {t("lineCount")} · {row.sourceChannel} · {formatOrderMoney(row.totalCents, row.currency)}
                          {owed > 0 ? ` · ${t("colOutstanding")} ${formatOrderMoney(owed, row.currency)}` : ""}
                        </span>
                      </span>
                      <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill}`}>
                        {statusKey ? t(statusKey) : row.status}
                      </span>
                    </>
                  );
                  const cls = "flex w-full items-center gap-2.5 px-3.5 py-3 text-left no-underline";
                  return (
                    <li key={row.id} className="border-t border-admin-border-soft first:border-t-0">
                      {row.inquiryId ? (
                        <Link href={`/${tenantSlug}/admin/messages?inquiry=${row.inquiryId}`} title={t("openThread")} className={cls}>
                          {body}
                        </Link>
                      ) : (
                        <div className={cls}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div style={{ overflowX: "auto" }} className="max-[720px]:hidden">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: C.inkMuted, fontSize: 12 }}>
                      <th style={{ padding: "10px 12px", fontWeight: 500 }}>{t("colOrder")}</th>
                      <th style={{ padding: "10px 12px", fontWeight: 500 }}>{t("colCustomer")}</th>
                      <th style={{ padding: "10px 12px", fontWeight: 500 }}>{t("colChannel")}</th>
                      <th style={{ padding: "10px 12px", fontWeight: 500, textAlign: "right" }}>
                        {t("colTotal")}
                      </th>
                      <th style={{ padding: "10px 12px", fontWeight: 500, textAlign: "right" }}>
                        {t("colOutstanding")}
                      </th>
                      <th style={{ padding: "10px 12px", fontWeight: 500 }}>{t("colStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const owed = outstandingCents(row);
                      const statusKey = STATUS_KEY[row.status];
                      return (
                        <tr key={row.id} style={{ borderTop: `1px solid ${C.border}` }}>
                          <td style={{ padding: "12px", fontVariantNumeric: "tabular-nums" }}>
                            {row.inquiryId ? (
                              <Link
                                href={`/${tenantSlug}/admin/messages?inquiry=${row.inquiryId}`}
                                style={{ color: C.ink }}
                                title={t("openThread")}
                              >
                                {shortId(row.id)}
                              </Link>
                            ) : (
                              shortId(row.id)
                            )}
                            <div style={{ color: C.inkDim, fontSize: 12 }}>
                              {row.lineCount} {t("lineCount")}
                            </div>
                          </td>
                          <td style={{ padding: "12px" }}>
                            {row.customerName ?? (
                              <span style={{ color: C.inkDim }}>{t("noCustomer")}</span>
                            )}
                            {row.customerEmail ? (
                              <div style={{ color: C.inkDim, fontSize: 12 }}>{row.customerEmail}</div>
                            ) : null}
                          </td>
                          <td style={{ padding: "12px", color: C.inkMuted }}>{row.sourceChannel}</td>
                          <td
                            style={{
                              padding: "12px",
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {formatOrderMoney(row.totalCents, row.currency)}
                          </td>
                          <td
                            style={{
                              padding: "12px",
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                              color: owed > 0 ? C.amber : C.inkDim,
                            }}
                          >
                            {owed > 0 ? formatOrderMoney(owed, row.currency) : "—"}
                          </td>
                          {/*
                            An unrecognised status shows its raw value rather than
                            blank. A row a staff member cannot read is recoverable;
                            one that renders as nothing looks like a bug in the data.
                          */}
                          <td style={{ padding: "12px" }}>
                            {statusKey ? t(statusKey) : row.status}
                            {bucketOf(row.status) === "to_pay" ? (
                              <span style={{ color: C.amber }}> ●</span>
                            ) : null}
                            {row.status === "paid" || row.status === "partially_refunded" ? (
                              <div style={{ marginTop: 8 }}>
                                <OrdersRefundForm orderId={row.id} copy={refundCopy} />
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
