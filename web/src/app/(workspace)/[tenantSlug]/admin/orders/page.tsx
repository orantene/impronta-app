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
  // Every row in a filtered view shares a currency in practice; the totals strip
  // takes the first row's rather than assuming USD, and says nothing when empty.
  const totalsCurrency = rows[0]?.currency ?? "USD";

  return (
    <main style={{ padding: "32px 28px", maxWidth: 1180, margin: "0 auto", color: C.ink }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>{t("pageTitle")}</h1>
      <p style={{ color: C.inkMuted, marginTop: 6, marginBottom: 24 }}>{t("pageIntro")}</p>

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
          <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
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
              >
                <span style={{ fontSize: 14 }}>
                  <strong>{totals.count}</strong>{" "}
                  <span style={{ color: C.inkMuted }}>{t("totalsCount")}</span>
                </span>
                <span style={{ fontSize: 14 }}>
                  <span style={{ color: C.inkMuted }}>{t("totalsSettled")}: </span>
                  <strong style={{ color: C.green }}>
                    {formatOrderMoney(totals.settledCents, totalsCurrency)}
                  </strong>
                </span>
                <span style={{ fontSize: 14 }}>
                  <span style={{ color: C.inkMuted }}>{t("totalsOutstanding")}: </span>
                  <strong style={{ color: C.amber }}>
                    {formatOrderMoney(totals.outstandingCents, totalsCurrency)}
                  </strong>
                </span>
                {/* Named explicitly. A figure beside a filtered list that silently
                    describes something wider is how someone acts on the wrong number. */}
                <span style={{ fontSize: 12, color: C.inkDim, flexBasis: "100%" }}>
                  {t("totalsScopeNote")}
                </span>
              </section>

              <div style={{ overflowX: "auto" }}>
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
