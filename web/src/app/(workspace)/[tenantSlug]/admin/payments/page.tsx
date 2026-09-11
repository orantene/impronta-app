// Workspace admin — Payments (P4-money), as the W25 board draws it.
//
// What actually moved: five tiles (collected today, refunds pending, unknown
// attempts, drawer variance, next payout) over six tabs — Collections,
// Refunds, Attempts, Drawers, Payouts, Reconciliation — each on the readers
// the rest of the workspace already trusts (`loadPaymentsBoard`). This is
// the destination registry's canonical `payments` route; `/admin/financials`
// is untouched and linked from the Payouts tab.
//
// Every figure traces to real rows:
//   - collected / takings -> booking_transactions, status = 'paid'
//   - owed                -> EVERY order in the 'to_pay' bucket (the desk's rule)
//   - refunds             -> booking_transactions, status = 'refunded'
//   - refunds pending,
//     unknown attempts    -> the Issues queue (`loadExceptions`, T1-06)
//   - drawers             -> pos_shifts
//   - next payout         -> agencies.stripe_account_id / stripe_payouts_enabled
// Where the design asks for more than the schema has (a terminal import, an
// export, a payout schedule, movement-by-movement drawer detail), this page
// says so instead of inventing it (D-POS-58).
//
// Capability gate matches Financials (`manage_billing`, owner-class):
// Payments is that same owner-facing money surface, not the front-of-house
// Orders desk.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { ActionButton } from "@/components/admin/shell/internal/page-modules/appointments-classes-ui";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { loadPaymentsBoard } from "../../_data-bridge/payments-board";
import { PaymentsTabLink, Tile, clockIn, minutesSince } from "./payments-ui";
import { AttemptsTab, CollectionsTab, DrawersTab, PayoutsTab, ReconciliationTab, RefundsTab, type PaymentsTab } from "./payments-tabs";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type Search = Promise<{ tab?: string }>;

const TABS: readonly PaymentsTab[] = ["collections", "refunds", "attempts", "drawers", "payouts", "reconciliation"];

function parseTab(raw: string | undefined): PaymentsTab {
  return TABS.find((id) => id === raw) ?? "collections";
}

/** Cash drawer amounts have no currency column on `pos_shifts` — USD per the platform's primary-currency rule (never inferred from a stored default). */
const DRAWER_CURRENCY = "USD";

export default async function PaymentsPage({ params, searchParams }: { params: PageParams; searchParams: Search }) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canManageBilling = await userHasCapability("manage_billing", scope.tenantId);
  if (!canManageBilling) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const t = (k: string) => tr(`dashboard.payments.${k}`);
  const tile = (k: string) => tr(`dashboard.payments.tile.${k}`);
  const intlLocale = locale === "es" ? "es-ES" : locale === "fr" ? "fr-FR" : "en-US";
  const tab = parseTab((await searchParams).tab);

  const board = await loadPaymentsBoard({ tenantId: scope.tenantId, tenantSlug });
  const base = `/${tenantSlug}/admin/payments`;
  const now = new Date(board.nowIso);

  const latestClosed = board.drawers.ok ? board.drawers.rows.find((r) => r.status === "closed" && r.varianceCents != null) : undefined;
  const oldestAttempt = board.exceptions.ok ? board.exceptions.unknownAttempts[0] : undefined;

  return (
    <div data-tulala-payments-board className="flex w-full flex-col gap-[16px] font-admin-body">
      <div className="flex items-start justify-between gap-[12px]">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px]! font-semibold leading-[1.15] tracking-[-0.02em] text-admin-ink">{t("pageTitle")}</h1>
          <p className="m-0 mt-[4px] text-admin-13 text-admin-ink-muted">{t("pageIntro")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-[8px]">
          <ActionButton reason={tr("dashboard.payments.notWired.import")} testId="payments-import">{t("importTerminal")}</ActionButton>
          <ActionButton reason={tr("dashboard.payments.notWired.export")} testId="payments-export">{t("export")}</ActionButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-[12px] lg:grid-cols-5">
        <Tile
          testId="tile-collected"
          label={tile("collected")}
          value={board.collectedToday.ok ? formatOrderMoney(board.collectedToday.totalCents, board.collectedToday.currency) : tile("unreadable")}
          sub={
            board.collectedToday.ok
              ? interpolate(tile("collectedSub"), {
                  cash: formatOrderMoney(board.collectedToday.cashCents, board.collectedToday.currency),
                  card: formatOrderMoney(board.collectedToday.cardCents, board.collectedToday.currency),
                })
              : tile("unreadableSub")
          }
          failed={!board.collectedToday.ok}
        />
        <Tile
          testId="tile-refunds-pending"
          label={tile("refundsPending")}
          value={board.exceptions.ok ? String(board.exceptions.refundsPending.length) : tile("unreadable")}
          sub={board.exceptions.ok ? (board.exceptions.refundsPending.length === 0 ? tile("refundsPendingNone") : tile("refundsPendingSub")) : tile("unreadableSub")}
          failed={!board.exceptions.ok}
        />
        <Tile
          testId="tile-unknown"
          label={tile("unknown")}
          value={board.exceptions.ok ? String(board.exceptions.unknownAttempts.length) : tile("unreadable")}
          sub={
            board.exceptions.ok
              ? oldestAttempt
                ? interpolate(tile("unknownSub"), { minutes: minutesSince(oldestAttempt.firstSeenAt, now) })
                : tile("unknownNone")
              : tile("unreadableSub")
          }
          failed={!board.exceptions.ok}
          tone={board.exceptions.ok && board.exceptions.unknownAttempts.length > 0 ? "critical" : undefined}
        />
        <Tile
          testId="tile-variance"
          label={tile("variance")}
          value={
            board.drawers.ok
              ? latestClosed && latestClosed.varianceCents != null
                ? `${latestClosed.varianceCents > 0 ? "+" : ""}${formatOrderMoney(latestClosed.varianceCents, DRAWER_CURRENCY)}`
                : "—"
              : tile("unreadable")
          }
          sub={
            board.drawers.ok
              ? latestClosed
                ? interpolate(tile("varianceSub"), { time: clockIn(latestClosed.closedAt, intlLocale, board.timeZone) })
                : tile("varianceNone")
              : tile("unreadableSub")
          }
          failed={!board.drawers.ok}
        />
        <Tile
          testId="tile-payout"
          label={tile("payout")}
          value={board.payout.ok ? (board.payout.enabled ? tile("payoutStripe") : tile("payoutNone")) : tile("unreadable")}
          sub={board.payout.ok ? (board.payout.enabled ? tile("payoutSubEnabled") : board.payout.destination ? tile("payoutSubPending") : tile("payoutSubNone")) : tile("unreadableSub")}
          failed={!board.payout.ok}
        />
      </div>

      <nav aria-label={t("tabsLabel")} className="inline-flex self-start gap-[2px] rounded-[9px] bg-admin-surface-alt p-[3px]">
        {TABS.map((id) => (
          <PaymentsTabLink key={id} href={id === "collections" ? base : `${base}?tab=${id}`} active={tab === id}>
            {t(`tabs.${id}`)}
          </PaymentsTabLink>
        ))}
      </nav>

      {tab === "collections" ? <CollectionsTab board={board} t={t} tenantSlug={tenantSlug} /> : null}
      {tab === "refunds" ? <RefundsTab board={board} t={t} tenantSlug={tenantSlug} locale={intlLocale} /> : null}
      {tab === "attempts" ? <AttemptsTab board={board} t={t} locale={intlLocale} now={now} /> : null}
      {tab === "drawers" ? <DrawersTab board={board} t={t} locale={intlLocale} currency={DRAWER_CURRENCY} /> : null}
      {tab === "payouts" ? <PayoutsTab board={board} t={t} tenantSlug={tenantSlug} /> : null}
      {tab === "reconciliation" ? <ReconciliationTab board={board} t={t} /> : null}

      <div className="flex items-start gap-[8px] rounded-[10px] bg-admin-indigo-soft px-[14px] py-[10px] text-[12.5px] leading-[1.45] text-admin-indigo">
        <span aria-hidden className="mt-[1px] shrink-0">
          <Icon name="alert" size={14} stroke={1.75} />
        </span>
        <span>{t("callout")}</span>
      </div>
      <span className="text-[11.5px] text-admin-ink-dim">{t("timesInVenueZone")}</span>
    </div>
  );
}
