// Workspace admin — Sales (P4-money), as the Sales board (WS008) draws it.
//
// One commercial view across every product: orders, bookings, tickets and
// registrations in one list, filterable by what kind of thing it was
// (`kind`) and by how it was sold (`channel`, from `orders.source_channel`,
// the only kind here that carries one). Reads `loadWorkspaceSalesActivity`,
// which reads existing tables; it is not a second ledger and manufactures
// nothing.
//
// The board's columns: TYPE · REF · CUSTOMER · WHAT · WHEN · PAYMENT ·
// FULFILMENT · AMOUNT · DUE · Open. Payment and fulfilment are ONE pill from
// the row's status (`salesStatePill`); DUE is what is still owed on the row
// (total minus collected) and a free registration is never shown as an
// unpaid invoice (`salesMoneyPresentation`, N17). Every time is on the
// workspace's own clock.
//
// The period and payment-method filters are wired (URL params `period`,
// `method`) and a second view, "By item" (`view=items`), groups paid order
// lines by offering with a CSV export. Controls the engine has no reader for
// are still drawn disabled with a reason (D-POS-58): the seller filter.
// "New sale" opens the counter when that mode is on, else says why not.
//
// Token-only styling (admin aesthetics ruling): every colour below is a
// Tailwind semantic class bound to the shell's CSS custom properties, never
// a literal.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { loadWorkspaceSalesActivity, type SalesActivityLoad, type SalesActivityRow } from "../../_data-bridge/sales-activity";
import { loadSalesByItem } from "../../_data-bridge/sales-by-item";
import {
  SALES_METHODS,
  SALES_PERIODS,
  parseSalesMethod,
  parseSalesPeriod,
  parseSalesView,
  salesPeriodRange,
} from "@/lib/sales/period";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { tenantTimezone } from "@/lib/spaces/venues";
import { enabledPosModesFromSettings } from "@/lib/pos/modes";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  SALES_KIND_TONE,
  SALES_TYPE_CHIPS,
  salesChannelChips,
  salesChannelLabel,
  salesFilterHref,
  salesKindLabel,
  salesMoneyPresentation,
  salesRef,
  salesStatePill,
  type SalesKindFilter,
  type SalesLocale,
} from "@/lib/sales/activity-shape";
import { ActionButton, StatePill } from "@/components/admin/shell/internal/page-modules/appointments-classes-ui";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { SalesItemsTable } from "./items-view";
import { SalesChipLink, SalesFilterChip, salesWhen } from "./sales-ui";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type Search = Promise<{ kind?: string; channel?: string; period?: string; method?: string; view?: string }>;

function parseKind(raw: string | undefined): SalesKindFilter {
  if (
    raw === "order" ||
    raw === "booking" ||
    raw === "reservation" ||
    raw === "registration" ||
    raw === "admission" ||
    raw === "appointment" ||
    raw === "project"
  ) {
    return raw;
  }
  return "all";
}

const KIND_PILL: Record<(typeof SALES_KIND_TONE)[keyof typeof SALES_KIND_TONE], string> = {
  brand: "bg-admin-brand-soft text-admin-brand",
  royal: "bg-admin-royal-soft text-admin-royal",
  indigo: "bg-admin-indigo-soft text-admin-indigo",
  slate: "bg-admin-amber-soft text-admin-amber",
  ink: "bg-admin-surface-alt text-admin-ink",
  coral: "bg-admin-coral-soft text-admin-coral-deep",
};

// The board's 33px header and 46px rows on a 1.2 line-height.
const TH = "px-[12px] py-[10px] text-left text-admin-11 font-semibold uppercase leading-[1.2] tracking-[0.05em] text-admin-ink-muted first:pl-[18px] last:pr-[18px]";
const TD = "px-[12px] py-[14px] align-middle text-admin-12h leading-[1.2] first:pl-[18px] last:pr-[18px]";
/** The board's list-cell pill: a tinted block filling its column, 17px tall, the label left. */
const PILL_BLOCK = "flex h-[17px] w-full min-w-0 items-center overflow-hidden whitespace-nowrap rounded-[5px] px-[8px] text-[11.5px] font-semibold leading-none";

/** Whether the counter mode is on for this workspace (the door "New sale" opens). */
async function counterIsOn(tenantId: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { data, error } = await admin.from("agencies").select("settings").eq("id", tenantId).maybeSingle();
  if (error) {
    // A settings row that could not be read is not a counter that is off; the
    // door says why it is closed either way, and the failure is logged.
    logServerError("sales.counterIsOn", error);
    return false;
  }
  const settings = (data as { settings?: unknown } | null)?.settings;
  return enabledPosModesFromSettings(settings).includes("counter");
}

export default async function SalesPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: Search;
}) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const allowed = await userHasCapability("view_dashboard", scope.tenantId);
  if (!allowed) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const t = (k: string) => tr(`dashboard.sales.${k}`);
  const loc: SalesLocale = locale === "es" ? "es" : locale === "fr" ? "fr" : "en";
  const intlLocale = locale === "es" ? "es-ES" : locale === "fr" ? "fr-FR" : "en-US";

  const sp = await searchParams;
  const kind = parseKind(sp.kind);
  const channel = typeof sp.channel === "string" && sp.channel.length > 0 ? sp.channel : "all";

  const period = parseSalesPeriod(sp.period);
  const method = parseSalesMethod(sp.method);
  const view = parseSalesView(sp.view);

  const [timeZone, counterOn] = await Promise.all([tenantTimezone(scope.tenantId), counterIsOn(scope.tenantId)]);
  const range = salesPeriodRange(period, new Date(), timeZone);
  const itemsLoad = view === "items" ? await loadSalesByItem(scope.tenantId, { range, method }) : null;
  const load: SalesActivityLoad =
    view === "items"
      ? { ok: true, rows: [], channels: [] }
      : await loadWorkspaceSalesActivity(scope.tenantId, tenantSlug, { kind, channel, range, method });

  // The board's first chip reads "All"; its accessible name stays "All kinds"
  // (the MONEY journey opens it by that name, and the short word is inside it).
  const kindFilters: Array<{ id: SalesKindFilter; label: string; ariaLabel?: string }> = [
    { id: "all", label: t("filterAll"), ariaLabel: t("filterAllKinds") },
    ...SALES_TYPE_CHIPS.map((id) => ({ id: id as SalesKindFilter, label: salesKindLabel(id, loc) })),
  ];

  // Computed server-side from the KIND-filtered rows, before the channel
  // filter narrows further — so picking a channel never collapses this strip
  // down to only the one already selected. Only orders carry a channel
  // today, so this list is empty on a workspace with none yet, and the
  // strip hides itself rather than offering filters that would always
  // empty the list.
  const availableChannels = load.ok ? load.channels : [];
  const channelChips = salesChannelChips(availableChannels, channel);

  // ALWAYS an absolute path, never a bare query string. See `salesFilterHref`.
  const chipHref = (next: { kind?: SalesKindFilter; channel?: string; period?: string; method?: string; view?: string }): string =>
    salesFilterHref({
      tenantSlug,
      kind: next.kind ?? kind,
      channel: next.channel ?? channel,
      period: next.period ?? period,
      method: next.method ?? method,
      view: next.view ?? view,
    });
  const filtered = kind !== "all" || channel !== "all" || period !== "all" || method !== "any";
  const exportQs = new URLSearchParams();
  if (period !== "all") exportQs.set("period", period);
  if (method !== "any") exportQs.set("method", method);
  const exportHref = `/${tenantSlug}/admin/sales/export${exportQs.toString() ? `?${exportQs.toString()}` : ""}`;

  const notWired = (key: string) => t(`notWired.${key}`);
  const rowCount = load.ok ? load.rows.length : 0;

  return (
    <div data-tulala-sales-board className="flex w-full flex-col gap-[20px] font-admin-body">
      <div className="flex items-start justify-between gap-[12px]">
        <div className="min-w-0">
          <h1 className="m-0 text-[26px]! font-semibold leading-[1.15] tracking-[-0.02em] text-admin-ink">{t("pageTitle")}</h1>
          <p className="m-0 mt-[4px] text-admin-13 text-admin-ink-muted">{t("pageIntro")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-[8px]">
          <a
            href={exportHref}
            data-testid="sales-export"
            className="inline-flex h-[34px] cursor-pointer items-center justify-center whitespace-nowrap rounded-[9px] border border-admin-border bg-admin-card px-[14px] text-admin-13 font-semibold text-admin-ink hover:border-admin-border-strong"
          >
            {t("export")}
          </a>
          {counterOn ? (
            <Link
              href={`/${tenantSlug}/admin/pos?mode=counter`}
              data-testid="sales-new-sale"
              className="inline-flex h-[34px] cursor-pointer items-center justify-center gap-[6px] whitespace-nowrap rounded-[9px] border border-admin-brand bg-admin-brand px-[14px] text-admin-13 font-semibold text-white hover:bg-admin-brand-deep"
            >
              <Icon name="plus" size={14} stroke={2} />
              {t("newSale")}
            </Link>
          ) : (
            <ActionButton tone="primary" reason={notWired("newSale")} testId="sales-new-sale">
              <Icon name="plus" size={14} stroke={2} />
              {t("newSale")}
            </ActionButton>
          )}
        </div>
      </div>

      <nav aria-label={t("viewLabel")} className="flex flex-wrap items-center gap-[8px]">
        <SalesChipLink href={chipHref({ view: "activity" })} active={view === "activity"}>
          {t("viewActivity")}
        </SalesChipLink>
        <SalesChipLink href={chipHref({ view: "items" })} active={view === "items"}>
          {t("viewItems")}
        </SalesChipLink>
      </nav>

      <div className="flex flex-wrap items-center gap-[8px]">
        {view === "activity" ? (
          <nav aria-label={t("filterKindLabel")} className="flex flex-wrap items-center gap-[8px]">
            {kindFilters.map((f) => (
              <SalesChipLink key={f.id} href={chipHref({ kind: f.id })} active={f.id === kind} ariaLabel={f.ariaLabel}>
                {f.label}
              </SalesChipLink>
            ))}
          </nav>
        ) : null}
        <span className="flex-1" />
        <SalesFilterChip label={`${t("sellerChip")}: ${scope.membership.display_name}`} reason={notWired("seller")} />
      </div>

      <div className="-mt-[10px] flex flex-wrap items-center gap-[6px]">
        <nav aria-label={t("periodLabel")} data-testid="sales-period" className="flex flex-wrap items-center gap-[6px]">
          <span className="mr-[2px] text-[12px] text-admin-ink-muted">{t("periodLabel")}:</span>
          {SALES_PERIODS.map((p) => (
            <SalesChipLink key={p} href={chipHref({ period: p })} active={p === period} small>
              {t(`period.${p}`)}
            </SalesChipLink>
          ))}
        </nav>
        <nav aria-label={t("methodLabel")} data-testid="sales-method" className="flex flex-wrap items-center gap-[6px] pl-[10px]">
          <span className="mr-[2px] text-[12px] text-admin-ink-muted">{t("methodLabel")}:</span>
          {SALES_METHODS.map((m) => (
            <SalesChipLink key={m} href={chipHref({ method: m })} active={m === method} small>
              {t(`method.${m}`)}
            </SalesChipLink>
          ))}
        </nav>
      </div>

      {view === "activity" && channelChips.length > 0 ? (
        <nav aria-label={t("filterChannelLabel")} className="-mt-[10px] flex flex-wrap items-center gap-[6px]">
          <span className="mr-[2px] text-[12px] text-admin-ink-muted">{t("filterChannelLabel")}:</span>
          <SalesChipLink href={chipHref({ channel: "all" })} active={channel === "all"} small>
            {t("filterAllChannels")}
          </SalesChipLink>
          {channelChips.map((c) => (
            <SalesChipLink key={c} href={chipHref({ channel: c })} active={channel === c} small>
              {salesChannelLabel(c, loc)}
            </SalesChipLink>
          ))}
        </nav>
      ) : null}

      {view === "items" ? (
        !itemsLoad || !itemsLoad.ok ? (
          <section role="alert" data-testid="sales-load-failed" className="rounded-[14px] border border-admin-border bg-admin-card p-[24px]">
            <h2 className="m-0 text-admin-15! font-semibold text-admin-ink">{t("unavailableTitle")}</h2>
            <p className="mt-[6px] text-admin-13 text-admin-ink-muted">{t("unavailableBody")}</p>
            <Link href={chipHref({})} className="mt-[12px] inline-flex h-[30px] items-center rounded-[9px] border border-admin-border bg-admin-card px-[12px] text-[12px] font-semibold text-admin-ink hover:border-admin-border-strong">
              {t("retry")}
            </Link>
          </section>
        ) : itemsLoad.rows.length === 0 ? (
          <section data-testid="sales-items-empty" className="rounded-[14px] border border-admin-border bg-admin-card p-[16px]">
            <div className="max-w-[420px] rounded-[10px] bg-admin-surface-alt px-[12px] py-[12px]">
              <h2 className="m-0 text-admin-13! font-semibold leading-[1.2] text-admin-ink">{t("itemsEmptyTitle")}</h2>
              <p className="m-0 mt-[4px] text-admin-13 leading-[1.3] text-admin-ink-muted">{t("itemsEmptyBody")}</p>
            </div>
          </section>
        ) : (
          <SalesItemsTable rows={itemsLoad.rows} t={t} />
        )
      ) : !load.ok ? (
        <section role="alert" data-testid="sales-load-failed" className="rounded-[14px] border border-admin-border bg-admin-card p-[24px]">
          <h2 className="m-0 text-admin-15! font-semibold text-admin-ink">{t("unavailableTitle")}</h2>
          <p className="mt-[6px] text-admin-13 text-admin-ink-muted">{t("unavailableBody")}</p>
          <Link href={chipHref({})} className="mt-[12px] inline-flex h-[30px] items-center rounded-[9px] border border-admin-border bg-admin-card px-[12px] text-[12px] font-semibold text-admin-ink hover:border-admin-border-strong">
            {t("retry")}
          </Link>
        </section>
      ) : rowCount === 0 ? (
        <section data-testid="sales-empty" className="rounded-[14px] border border-admin-border bg-admin-card p-[16px]">
          {/* W59: "no results" and "empty workspace" are the board's compact box, never each other. */}
          <div className="max-w-[420px] rounded-[10px] bg-admin-surface-alt px-[12px] py-[12px]">
            <h2 className="m-0 text-admin-13! font-semibold leading-[1.2] text-admin-ink">{!filtered ? t("emptyTitle") : t("noResultsTitle")}</h2>
            <p className="m-0 mt-[4px] text-admin-13 leading-[1.3] text-admin-ink-muted">{!filtered ? t("empty") : t("noResultsBody")}</p>
            {filtered ? (
              <Link href={salesFilterHref({ tenantSlug, kind: "all", channel: "all" })} className="mt-[10px] inline-flex h-[30px] items-center rounded-[9px] border border-admin-border bg-admin-card px-[12px] text-[12px] font-semibold text-admin-ink hover:border-admin-border-strong">
                {t("clearFilters")}
              </Link>
            ) : null}
          </div>
        </section>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-admin-border bg-admin-card">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>{t("colType")}</th>
                <th className={TH}>{t("colRef")}</th>
                <th className={TH}>{t("colCustomer")}</th>
                <th className={TH}>{t("colWhat")}</th>
                <th className={TH}>{t("colWhen")}</th>
                <th className={TH}>{t("colPayment")}</th>
                <th className={`${TH} text-right`}>{t("colAmount")}</th>
                <th className={`${TH} text-right`}>{t("colDue")}</th>
                <th className={TH}>
                  <span className="sr-only">{t("open")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {load.rows.map((row: SalesActivityRow) => {
                const money = salesMoneyPresentation({ kind: row.kind, totalCents: row.totalCents, status: row.status });
                const pill = salesStatePill({ status: row.status, owed: row.owed, treatAsFree: money.treatAsFree });
                const dueCents = Math.max(0, row.totalCents - row.collectedCents);
                const what = (() => {
                  if (row.kind === "order") {
                    const items = row.lineCount === null ? t("whatOrder") : `${row.lineCount} ${row.lineCount === 1 ? t("whatItemOne") : t("whatItemOther")}`;
                    return (
                      <>
                        {items}
                        {row.sourceChannel ? (
                          <>
                            {" · "}
                            <span data-sales-channel={row.sourceChannel}>{salesChannelLabel(row.sourceChannel, loc)}</span>
                          </>
                        ) : null}
                      </>
                    );
                  }
                  if (row.kind === "reservation") return row.title === "tab" ? t("whatTab") : t("whatTable");
                  if (row.kind === "registration") return t("whatRegistration");
                  return row.title ?? salesKindLabel(row.kind, loc);
                })();
                return (
                  <tr key={`${row.kind}:${row.id}`} data-sales-row data-sales-kind={row.kind} className="border-t border-admin-border-soft">
                    <td className={`${TD} w-[130px]`}>
                      <span className={`${PILL_BLOCK} ${KIND_PILL[SALES_KIND_TONE[row.kind]]}`}>{salesKindLabel(row.kind, loc)}</span>
                    </td>
                    <td className={`${TD} font-mono text-admin-ink-muted`}>{salesRef(row.id)}</td>
                    <td className={`${TD} font-semibold text-admin-ink`}>
                      {row.customerName ?? <span className="font-normal text-admin-ink-muted">{t("noCustomer")}</span>}
                    </td>
                    <td className={`${TD} text-admin-ink-muted`}>{what}</td>
                    <td className={`${TD} whitespace-nowrap font-mono text-[11.5px] text-admin-ink`}>{salesWhen(row.createdAt, intlLocale, timeZone)}</td>
                    <td className={`${TD} w-[190px]`}>
                      <StatePill block tone={pill.tone} state={row.status}>
                        {pill.key ? t(`state.${pill.key}`) : row.status}
                      </StatePill>
                    </td>
                    <td className={`${TD} text-right font-semibold tabular-nums text-admin-ink`} data-sales-amount>
                      {money.treatAsFree ? formatOrderMoney(0, row.currency) : formatOrderMoney(row.totalCents, row.currency)}
                    </td>
                    <td className={`${TD} text-right tabular-nums ${row.owed && dueCents > 0 ? "text-admin-coral-deep" : "text-admin-ink-dim"}`} data-sales-due={row.owed && dueCents > 0 ? "owed" : "none"}>
                      {row.owed && dueCents > 0 ? formatOrderMoney(dueCents, row.currency) : "—"}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      <Link href={row.href} className="text-[12px] font-semibold text-admin-brand hover:underline">
                        {t("open")} →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="m-0 text-admin-13 text-admin-ink-muted">{view === "items" ? t("itemsFootnote") : t("footnote")}</p>
    </div>
  );
}
