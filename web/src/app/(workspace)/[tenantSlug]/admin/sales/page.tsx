// Workspace admin — Sales (P4-money).
//
// What was sold: orders, bookings, tickets, and registrations in one list,
// filterable by what kind of thing it was (`kind`) and by how it was sold
// (`channel`, from `orders.source_channel` — the only kind here that carries
// one). Reads `loadWorkspaceSalesActivity`, which reads existing tables; it
// is not a second ledger and manufactures nothing.
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
import { loadWorkspaceSalesActivity, type SalesActivityRow } from "../../_data-bridge/sales-activity";
import { formatOrderMoney } from "@/lib/orders/money-format";
import {
  salesChannelChips,
  salesChannelLabel,
  salesFilterHref,
  salesKindLabel,
  salesMoneyPresentation,
  SALES_TYPE_CHIPS,
  type SalesKindFilter,
  type SalesLocale,
} from "@/lib/sales/activity-shape";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type Search = Promise<{ kind?: string; channel?: string }>;

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

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

const CHIP_BASE =
  "inline-flex h-8 items-center whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors";
const CHIP_ACTIVE = "border-foreground bg-foreground text-background";
const CHIP_IDLE = "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground";

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

  const sp = await searchParams;
  const kind = parseKind(sp.kind);
  const channel = typeof sp.channel === "string" && sp.channel.length > 0 ? sp.channel : "all";

  const load = await loadWorkspaceSalesActivity(scope.tenantId, tenantSlug, { kind, channel });

  const kindFilters: Array<{ id: SalesKindFilter; label: string }> = [
    { id: "all", label: t("filterAllKinds") },
    ...SALES_TYPE_CHIPS.map((id) => ({ id: id as SalesKindFilter, label: salesKindLabel(id, loc) })),
  ];

  // Computed server-side from the KIND-filtered rows, before the channel
  // filter narrows further — so picking a channel never collapses this strip
  // down to only the one already selected. Only orders carry a channel
  // today, so this list is empty on a workspace with none yet, and the
  // strip hides itself rather than offering filters that would always
  // empty the list.
  const availableChannels = load.ok ? load.channels : [];
  // The strip must survive a kind that has no rows on the selected channel,
  // or the chip that would clear that channel vanishes with it.
  const channelChips = salesChannelChips(availableChannels, channel);

  // ALWAYS an absolute path, never a bare query string: a chip whose address
  // is "" resolves to the current URL, query included, so both reset chips
  // used to do nothing at all. See `salesFilterHref`.
  const chipHref = (next: { kind?: SalesKindFilter; channel?: string }): string =>
    salesFilterHref({
      tenantSlug,
      kind: next.kind ?? kind,
      channel: next.channel ?? channel,
    });

  return (
    <main className="mx-auto max-w-[1180px] px-7 py-8 text-foreground">
      <h1 className="m-0 text-2xl font-semibold">{t("pageTitle")}</h1>
      <p className="mb-6 mt-1.5 text-[13px] text-muted-foreground">{t("pageIntro")}</p>

      <p className="mb-5 text-[13px]">
        <Link href={`/${tenantSlug}/admin/orders`} className="text-foreground underline underline-offset-2">
          {t("openOrders")}
        </Link>
        {" · "}
        <Link href={`/${tenantSlug}/admin/calendar`} className="text-foreground underline underline-offset-2">
          {t("openCalendar")}
        </Link>
      </p>

      <nav aria-label={t("filterKindLabel")} className="mb-3 flex flex-wrap gap-2">
        {kindFilters.map((f) => (
          <Link
            key={f.id}
            href={chipHref({ kind: f.id })}
            className={`${CHIP_BASE} ${f.id === kind ? CHIP_ACTIVE : CHIP_IDLE}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {channelChips.length > 0 ? (
        <nav aria-label={t("filterChannelLabel")} className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-muted-foreground">{t("filterChannelLabel")}:</span>
          <Link
            href={chipHref({ channel: "all" })}
            className={`${CHIP_BASE} h-7 ${channel === "all" ? CHIP_ACTIVE : CHIP_IDLE}`}
          >
            {t("filterAllChannels")}
          </Link>
          {channelChips.map((c) => (
            <Link
              key={c}
              href={chipHref({ channel: c })}
              className={`${CHIP_BASE} h-7 ${channel === c ? CHIP_ACTIVE : CHIP_IDLE}`}
            >
              {salesChannelLabel(c, loc)}
            </Link>
          ))}
        </nav>
      ) : (
        <div className="mb-6" />
      )}

      {!load.ok ? (
        <section className="rounded-xl border border-border bg-card p-7">
          <h2 className="m-0 text-[17px] font-semibold">{t("unavailableTitle")}</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">{t("unavailableBody")}</p>
        </section>
      ) : load.rows.length === 0 ? (
        <section className="rounded-xl border border-border bg-card px-7 py-10 text-center">
          <h2 className="m-0 text-[17px] font-semibold">{t("emptyTitle")}</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">{t("empty")}</p>
        </section>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[12px] text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">{t("colKind")}</th>
                <th className="px-3 py-2.5 font-medium">{t("colSource")}</th>
                <th className="px-3 py-2.5 font-medium">{t("colCustomer")}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t("colTotal")}</th>
                <th className="px-3 py-2.5 font-medium">{t("colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {load.rows.map((row: SalesActivityRow) => {
                const money = salesMoneyPresentation({
                  kind: row.kind,
                  totalCents: row.totalCents,
                  status: row.status,
                });
                return (
                  <tr key={`${row.kind}:${row.id}`} className="border-t border-border">
                    <td className="px-3 py-3">
                      <Link href={row.href} className="text-foreground hover:underline">
                        {salesKindLabel(row.kind, loc)}
                      </Link>
                      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {shortId(row.id)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {row.sourceChannel ? salesChannelLabel(row.sourceChannel, loc) : t("sourceNotTracked")}
                    </td>
                    <td className="px-3 py-3">
                      {row.customerName ?? <span className="text-muted-foreground">{t("noCustomer")}</span>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {money.treatAsFree ? (
                        t("free")
                      ) : (
                        <>
                          {formatOrderMoney(row.totalCents, row.currency)}
                          {row.owed ? (
                            <span className="ml-1.5 text-[12px] text-muted-foreground">
                              · {t("stillOwed")}
                            </span>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3">{row.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
