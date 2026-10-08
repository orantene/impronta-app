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
//
// TUL-434 slice 1: the list is the live desk with an interactive order-door
// mockup (chevron, nested sections, deep link, phone sheet). New chrome is
// marked so Oran can judge the look before slices 2+ wire real data/drawers.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { loadWorkspaceOrders } from "../../_data-bridge/orders";
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import { salesChannelLabel, type SalesLocale } from "@/lib/sales/activity-shape";
import {
  filterOrders,
  orderLineItemsLabel,
  outstandingCents,
  totalsFor,
  type OrderListBucket,
  type OrderListRow,
} from "@/lib/orders/orders-list";
import { type RefundFormCopy } from "./orders-refund-form";
import { OrdersDoorMockList, type OrdersDoorMockCopy } from "./orders-door-mock-list";
import { type RefundEffect } from "@/lib/orders/refund-effects";
import { REFUND_DESK_KEY } from "@/lib/orders/refund-desk-copy";
import { DOOR_SECTIONS, type DoorSectionId } from "@/lib/orders/orders-door-mock";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type PageSearch = Promise<{ bucket?: string; q?: string; order?: string }>;

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

/**
 * Full catalog paths for every door string. Relative dotted keys like
 * `door.newBadge` would fail `message-key-usage.static.test.ts` (it treats any
 * dotted literal as a root catalog path). Same pattern as REFUND_EFFECT_KEY.
 */
const DOOR_SECTION_KEYS: Record<
  DoorSectionId,
  { title: string; preview: string; body: string }
> = {
  summary: {
    title: "dashboard.orders.door.sections.summary.title",
    preview: "dashboard.orders.door.sections.summary.preview",
    body: "dashboard.orders.door.sections.summary.body",
  },
  client: {
    title: "dashboard.orders.door.sections.client.title",
    preview: "dashboard.orders.door.sections.client.preview",
    body: "dashboard.orders.door.sections.client.body",
  },
  items: {
    title: "dashboard.orders.door.sections.items.title",
    preview: "dashboard.orders.door.sections.items.preview",
    body: "dashboard.orders.door.sections.items.body",
  },
  appointment: {
    title: "dashboard.orders.door.sections.appointment.title",
    preview: "dashboard.orders.door.sections.appointment.preview",
    body: "dashboard.orders.door.sections.appointment.body",
  },
  payments: {
    title: "dashboard.orders.door.sections.payments.title",
    preview: "dashboard.orders.door.sections.payments.preview",
    body: "dashboard.orders.door.sections.payments.body",
  },
  conversation: {
    title: "dashboard.orders.door.sections.conversation.title",
    preview: "dashboard.orders.door.sections.conversation.preview",
    body: "dashboard.orders.door.sections.conversation.body",
  },
  origin: {
    title: "dashboard.orders.door.sections.origin.title",
    preview: "dashboard.orders.door.sections.origin.preview",
    body: "dashboard.orders.door.sections.origin.body",
  },
  activity: {
    title: "dashboard.orders.door.sections.activity.title",
    preview: "dashboard.orders.door.sections.activity.preview",
    body: "dashboard.orders.door.sections.activity.body",
  },
  notes: {
    title: "dashboard.orders.door.sections.notes.title",
    preview: "dashboard.orders.door.sections.notes.preview",
    body: "dashboard.orders.door.sections.notes.body",
  },
};

function doorMockCopy(
  t: (k: string) => string,
  tr: (k: string) => string,
): OrdersDoorMockCopy {
  const sections = {} as OrdersDoorMockCopy["sections"];
  for (const s of DOOR_SECTIONS) {
    const keys = DOOR_SECTION_KEYS[s.id];
    sections[s.id] = {
      title: tr(keys.title),
      preview: tr(keys.preview),
      body: tr(keys.body),
    };
  }
  return {
    newBadge: tr("dashboard.orders.door.newBadge"),
    mockBanner: tr("dashboard.orders.door.mockBanner"),
    mockPreview: tr("dashboard.orders.door.mockPreview"),
    colOrder: t("colOrder"),
    colCustomer: t("colCustomer"),
    colChannel: t("colChannel"),
    colTotal: t("colTotal"),
    colOutstanding: t("colOutstanding"),
    colStatus: t("colStatus"),
    lineCount: t("lineCount"),
    noCustomer: t("noCustomer"),
    openThread: t("openThread"),
    copyCode: tr("dashboard.orders.door.copyCode"),
    codeCopied: tr("dashboard.orders.door.codeCopied"),
    back: tr("dashboard.orders.door.back"),
    moreMenu: tr("dashboard.orders.door.moreMenu"),
    primary: {
      send_pay_link: tr("dashboard.orders.door.primary.sendPayLink"),
      collect_pos: tr("dashboard.orders.door.primary.collectPos"),
      send_receipt: tr("dashboard.orders.door.primary.sendReceipt"),
      view_refund: tr("dashboard.orders.door.primary.viewRefund"),
    },
    sections,
    status: {
      draft: t("statusDraft"),
      quoted: t("statusQuoted"),
      pending_payment: t("statusPendingPayment"),
      paid: t("statusPaid"),
      fulfilled: t("statusFulfilled"),
      cancelled: t("statusCancelled"),
      refunded: t("statusRefunded"),
      partially_refunded: t("statusPartiallyRefunded"),
    },
  };
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
  // The channel in words (Counter, Instant book, Guest QR), as Sales prints it; an unknown value stays verbatim.
  const channelLocale: SalesLocale = locale === "es" || locale === "fr" ? locale : "en";
  const channel = (raw: string) => salesChannelLabel(raw, channelLocale);
  const money = (cents: number, currency: string) => formatDashboardMoneyCents(cents, currency, locale);
  const lines = (count: number) => orderLineItemsLabel(count, t("lineCountOne"), t("lineCountOther"));

  const load = await loadWorkspaceOrders(scope.tenantId);

  const bucket: OrderListBucket = BUCKETS.includes(sp.bucket as OrderListBucket)
    ? (sp.bucket as OrderListBucket)
    : "all";
  const query = typeof sp.q === "string" ? sp.q : "";
  const orderParam = typeof sp.order === "string" ? sp.order : "";

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
    amount: t("refundAmount"),
    amountHint: t("refundAmountHint"),
    componentShare: t("refundComponentShare"),
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
      over_limit: tr(REFUND_DESK_KEY.over_limit),
      unavailable: tr(REFUND_DESK_KEY.unavailable),
    },
  };

  const doorCopy = doorMockCopy(t, tr);
  const listProps = {
    rows,
    locale,
    copy: doorCopy,
    refundCopy,
    orderParam,
    bucket,
    query,
  } as const;

  return (
    <main style={{ padding: "32px 28px", maxWidth: 1180, margin: "0 auto", color: C.ink }} className="max-[720px]:p-0!">
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }} className="max-[720px]:text-[22px]! max-[720px]:tracking-[-0.02em]">{t("pageTitle")}</h1>
      {/* MW17 draws the location under the title, not this sentence; the page has no location to name (D-POS-71), so the phone shows the title alone. */}
      <p style={{ color: C.inkMuted, marginTop: 6, marginBottom: 24 }} className="max-[720px]:hidden">{t("pageIntro")}</p>

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
              const orderQs = orderParam ? `&order=${encodeURIComponent(orderParam)}` : "";
              return (
                <Link
                  key={b}
                  href={`?bucket=${b}${query ? `&q=${encodeURIComponent(query)}` : ""}${orderQs}`}
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
                      <strong
                        style={{
                          color: C.green,
                          fontVariantNumeric: "tabular-nums",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {money(c.settledCents, c.currency)}
                      </strong>
                    </span>
                    <span style={{ fontSize: 14 }}>
                      <span style={{ color: C.inkMuted }}>{t("totalsOutstanding")}: </span>
                      <strong
                        style={{
                          color: C.amber,
                          fontVariantNumeric: "tabular-nums",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {money(c.outstandingCents, c.currency)}
                      </strong>
                    </span>
                  </span>
                ))}
                {/* Named explicitly. A figure beside a filtered list that silently
                    describes something wider is how someone acts on the wrong number. */}
                <span style={{ fontSize: 12, color: C.inkDim, flexBasis: "100%" }} className="max-[720px]:hidden">
                  {t("totalsScopeNote")}
                </span>
              </section>

              <div className="max-[720px]:hidden">
                <OrdersDoorMockList {...listProps} variant="desktop" />
              </div>
              <div className="hidden max-[720px]:block">
                <OrdersDoorMockList {...listProps} variant="mobile" />
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
