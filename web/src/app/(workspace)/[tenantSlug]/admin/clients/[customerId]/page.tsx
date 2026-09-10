/**
 * W41 — the client record. Identity and history in one place.
 *
 * WHICH CLIENT. This database calls three different things a client, and the
 * page says which one it is reading rather than leaving the operator to guess:
 * it is keyed on `customers.id`, the tenant-scoped record `orders.customer_id`
 * points at, because that is the one money hangs off. The older CRM pair
 * (`client_profiles` + `agency_client_relationships`) and the company account
 * (`client_accounts`) are different records; see the header of
 * `lib/customers/client-record.ts`.
 *
 * ONE READER. Purchases, projects, bookings and balances all come from
 * `loadClientRecord`. The alternative — a query per panel — is how two panels
 * on the same page end up disagreeing about what is owed.
 *
 * COLLECT IS OFFERED, OR REFUSED IN WORDS. `collectVerdict` decides. A client
 * with open records in two currencies has no single amount to collect, and
 * quietly picking one would charge a figure nobody chose.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { loadClientRecord } from "@/lib/projects/projects-reader";
import {
  clientBalances,
  collectVerdict,
  purchaseOwedCents,
  type ClientRecord,
} from "@/lib/customers/client-record";
import {
  Card,
  Chip,
  Figure,
  Notice,
  PageHeading,
  PageShell,
  orderStatusLabel,
  shortId,
} from "../../projects/_shared";
import { STATUS_KEY } from "../../projects/_keys";
import {
  commonTimeZone,
  zonedDate,
  type ProjectStatus,
} from "@/lib/projects/project-record";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string; customerId: string }>;
type Tr = (key: string) => string;

export default async function ClientRecordPage({ params }: { params: PageParams }) {
  const { tenantSlug, customerId } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const allowed = await userHasCapability("view_dashboard", scope.tenantId);
  if (!allowed) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const base = `/${tenantSlug}/admin/clients`;

  const load = await loadClientRecord(scope.tenantId, customerId);

  if (!load.ok) {
    const message =
      load.reason === "invalid"
        ? tr("dashboard.clientRecord.invalidId")
        : load.reason === "not_found"
          ? tr("dashboard.clientRecord.notFound")
          : tr("dashboard.clientRecord.unavailable");
    return (
      <PageShell>
        <PageHeading
          title={tr("dashboard.clientRecord.title")}
          back={{ href: base, label: tr("dashboard.clientRecord.backToList") }}
        />
        <Notice tone="warn">{message}</Notice>
      </PageShell>
    );
  }

  const record = load.record;

  // WHOSE CLOCK. The workspace's own zone reads the dates that belong to it —
  // when this person was last seen, when they bought something. A project or a
  // booking is read in ITS zone, which is usually the same one; when it is not,
  // this is null and each of those rows names its own.
  const oneZone = commonTimeZone([
    record.timeZone,
    ...record.projects.map((p) => p.timeZone),
    ...record.bookings.map((b) => b.timeZone),
  ]);

  return (
    <PageShell>
      <PageHeading
        title={record.displayName ?? tr("dashboard.clientRecord.unnamed")}
        intro={tr("dashboard.clientRecord.whichClient")}
        back={{ href: base, label: tr("dashboard.clientRecord.backToList") }}
      />

      <p className="mb-4 text-xs text-muted-foreground">
        {oneZone === null
          ? tr("dashboard.clientRecord.timezoneMixed")
          : interpolate(tr("dashboard.clientRecord.timezoneNote"), { zone: oneZone })}
      </p>

      <div className="grid gap-4">
        <IdentityCard record={record} tr={tr} />
        <BalancesCard record={record} tr={tr} />
        <PurchasesCard record={record} tr={tr} tenantSlug={tenantSlug} />
        <ProjectsCard record={record} tr={tr} tenantSlug={tenantSlug} oneZone={oneZone} />
        <BookingsCard record={record} tr={tr} oneZone={oneZone} />
      </div>
    </PageShell>
  );
}

function IdentityCard({ record, tr }: { record: ClientRecord; tr: Tr }) {
  const none = tr("dashboard.clientRecord.none");
  return (
    <Card title={tr("dashboard.clientRecord.identity")}>
      <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <Figure label={tr("dashboard.clientRecord.email")} value={record.email ?? none} />
        <Figure label={tr("dashboard.clientRecord.phone")} value={record.phoneE164 ?? none} />
        <Figure label={tr("dashboard.clientRecord.visits")} value={String(record.visits)} />
        <Figure label={tr("dashboard.clientRecord.noShows")} value={String(record.noShows)} />
        <Figure
          label={tr("dashboard.clientRecord.lastSeen")}
          value={zonedDate(record.lastSeenAt, record.timeZone, none)}
        />
        <Figure label={tr("dashboard.clientRecord.locale")} value={record.locale ?? none} />
      </dl>
      <section className="mt-4">
        <h3 className="m-0 text-xs uppercase tracking-wide text-muted-foreground">
          {tr("dashboard.clientRecord.account")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {record.userId
            ? tr("dashboard.clientRecord.accountYes")
            : tr("dashboard.clientRecord.accountNone")}
        </p>
      </section>
      {record.tags.length > 0 ? (
        <section className="mt-4">
          <h3 className="m-0 text-xs uppercase tracking-wide text-muted-foreground">
            {tr("dashboard.clientRecord.tags")}
          </h3>
          <ul className="mt-1 flex list-none flex-wrap gap-2 p-0">
            {record.tags.map((tag) => (
              <li key={tag}>
                <Chip>{tag}</Chip>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {record.notes ? (
        <section className="mt-4">
          <h3 className="m-0 text-xs uppercase tracking-wide text-muted-foreground">
            {tr("dashboard.clientRecord.notes")}
          </h3>
          <p className="mt-1 whitespace-pre-line text-sm text-foreground">{record.notes}</p>
        </section>
      ) : null}
    </Card>
  );
}

/** W44's honest half: what is owed, per currency, and whether Collect applies. */
function BalancesCard({ record, tr }: { record: ClientRecord; tr: Tr }) {
  const balances = clientBalances(record).filter((b) => b.owedCents > 0);
  const verdict = collectVerdict(record);
  return (
    <Card title={tr("dashboard.clientRecord.balances")}>
      {balances.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          {tr("dashboard.clientRecord.balancesNone")}
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          {balances.map((b) => (
            <Figure
              key={b.currency}
              label={`${tr("dashboard.clientRecord.outstanding")} ${b.currency}`}
              value={formatOrderMoney(b.owedCents, b.currency)}
              note={
                b.collectedCents > 0
                  ? `${tr("dashboard.clientRecord.collected")} ${formatOrderMoney(b.collectedCents, b.currency)}`
                  : undefined
              }
            />
          ))}
        </dl>
      )}
      <p className="mt-4 text-sm text-foreground">
        {verdict.ok
          ? interpolate(tr("dashboard.clientRecord.collectSummary"), {
              count: verdict.recordCount,
              amount: formatOrderMoney(verdict.owedCents, verdict.currency),
            })
          : verdict.reason === "mixed_currency"
            ? tr("dashboard.clientRecord.collectMixedCurrency")
            : tr("dashboard.clientRecord.collectNothingOwed")}
      </p>
      {verdict.ok ? (
        // Deliberately not a Collect button. Which unpaid records one payment
        // applies to is not recorded anywhere in this database, so a button
        // here would have to invent an allocation. It says so instead.
        <p className="mt-2 text-sm text-muted-foreground">
          {tr("dashboard.clientRecord.collectNotBuilt")}
        </p>
      ) : null}
    </Card>
  );
}

function PurchasesCard({
  record,
  tr,
  tenantSlug,
}: {
  record: ClientRecord;
  tr: Tr;
  tenantSlug: string;
}) {
  return (
    <Card title={tr("dashboard.clientRecord.purchases")}>
      {record.purchases.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          {tr("dashboard.clientRecord.purchasesNone")}
        </p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full caption-bottom border-collapse text-sm">
            <caption className="sr-only">{tr("dashboard.clientRecord.purchasesCaption")}</caption>
            <thead className="[&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
              <tr>
                <th scope="col">{tr("dashboard.clientRecord.colRecord")}</th>
                <th scope="col">{tr("dashboard.clientRecord.colStatus")}</th>
                <th scope="col">{tr("dashboard.clientRecord.colWhen")}</th>
                <th scope="col">{tr("dashboard.clientRecord.colTotal")}</th>
                <th scope="col">{tr("dashboard.clientRecord.colOutstanding")}</th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-b [&_td]:border-border/60 [&_td]:py-2 [&_td]:pr-4 [&_tr:last-child_td]:border-0">
              {record.purchases.map((p) => (
                <tr key={p.orderId}>
                  <th scope="row" className="py-2 pr-4 text-left font-normal">
                    <Link
                      href={`/${tenantSlug}/admin/orders?q=${shortId(p.orderId)}`}
                      className="underline underline-offset-4"
                    >
                      {shortId(p.orderId)}
                    </Link>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {interpolate(tr("dashboard.clientRecord.lines"), { count: p.lineCount })}
                    </span>
                  </th>
                  <td className="text-muted-foreground">{orderStatusLabel(p.status, tr)}</td>
                  <td className="text-muted-foreground">
                    {zonedDate(p.createdAt, record.timeZone, tr("dashboard.clientRecord.none"))}
                  </td>
                  <td className="text-foreground">{formatOrderMoney(p.totalCents, p.currency)}</td>
                  {/* The OWED figure, so this column adds up to the Balances
                      card above. A cancelled or refunded order reads zero and
                      its status says why. */}
                  <td className="text-foreground">
                    {formatOrderMoney(purchaseOwedCents(p), p.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ProjectsCard({
  record,
  tr,
  tenantSlug,
  oneZone,
}: {
  record: ClientRecord;
  tr: Tr;
  tenantSlug: string;
  oneZone: string | null;
}) {
  return (
    <Card title={tr("dashboard.clientRecord.projects")}>
      {record.projects.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          {tr("dashboard.clientRecord.projectsNone")}
        </p>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {record.projects.map((p) => (
            <li key={p.projectId} className="flex flex-wrap items-baseline justify-between gap-2">
              <Link
                href={`/${tenantSlug}/admin/projects/${p.projectId}`}
                className="text-sm font-medium text-foreground underline underline-offset-4"
              >
                {p.title || shortId(p.projectId)}
              </Link>
              <span className="text-xs text-muted-foreground">
                {tr(STATUS_KEY[p.status as ProjectStatus])}{" "}
                {zonedDate(p.startsAt, p.timeZone, tr("dashboard.clientRecord.none"))}
                {oneZone === null ? ` ${p.timeZone}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BookingsCard({
  record,
  tr,
  oneZone,
}: {
  record: ClientRecord;
  tr: Tr;
  oneZone: string | null;
}) {
  return (
    <Card title={tr("dashboard.clientRecord.bookings")}>
      {record.bookings.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          {tr("dashboard.clientRecord.bookingsNone")}
        </p>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {record.bookings.map((b) => (
            <li key={b.bookingId} className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm text-foreground">{b.title || shortId(b.bookingId)}</span>
              <span className="text-xs text-muted-foreground">
                {tr(STATUS_KEY[b.status as ProjectStatus])}{" "}
                {zonedDate(b.startsAt, b.timeZone, tr("dashboard.clientRecord.none"))}
                {oneZone === null ? ` ${b.timeZone}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
