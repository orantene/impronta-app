/**
 * W41 — the client record, as the board draws it: initials, name and the
 * `Person` pill, the contact line, `Edit` · `New ▾` · `Collect $X`; three
 * KPI cards (Due now · Next booking · Active projects); the tab strip
 * (Overview · Activity · Bookings · Purchases & balances · Projects ·
 * Details); and the right column (Contacts & participants · Preferences ·
 * Intake). W44, the collect sheet, opens from the header button.
 *
 * WHICH CLIENT. This database calls three different things a client, and the
 * page reads the one money hangs off: `customers.id`, what
 * `orders.customer_id` points at. See `lib/customers/client-record.ts`.
 *
 * ONE READER. Purchases, projects, bookings and balances all come from
 * `loadClientRecord`; a query per panel is how two panels on the same page
 * end up disagreeing about what is owed.
 *
 * COLLECT IS OFFERED, OR REFUSED IN WORDS. `collectVerdict` decides. A client
 * with open records in two currencies has no single amount to collect, and
 * quietly picking one would charge a figure nobody chose.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Mail, Phone } from "lucide-react";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { requestNowMs } from "@/lib/projects/request-clock";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { loadClientRecord } from "@/lib/projects/projects-reader";
import {
  activeProjects,
  bookingsByStart,
  clientBalances,
  collectVerdict,
  lifetimeSpend,
  nextBooking,
  purchaseOwedCents,
  purchasesByDate,
  unpaidPurchases,
  type ClientRecord,
} from "@/lib/customers/client-record";
import {
  BTN_SECONDARY,
  Card,
  Eyebrow,
  Initials,
  KeyValue,
  KpiCard,
  ListRow,
  Notice,
  PageShell,
  Pill,
  RecordShell,
  SectionTitle,
  TabStrip,
  dayLabel,
  orderStatusLabel,
  shortId,
} from "../../projects/_shared";
import { STATUS_KEY } from "../../projects/_keys";
import type { ProjectStatus } from "@/lib/projects/project-record";
import { ClientCollect } from "./collect-sheet";
import { PurchasesTable } from "./purchases-table";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string; customerId: string }>;
type PageSearch = Promise<{ tab?: string }>;
type Tr = (key: string) => string;

type Tab = "overview" | "activity" | "bookings" | "purchases" | "projects" | "details";
const TABS: readonly Tab[] = ["overview", "activity", "bookings", "purchases", "projects", "details"];
const TAB_KEY: Record<Tab, string> = {
  overview: "dashboard.clientRecord.tabOverview",
  activity: "dashboard.clientRecord.tabActivity",
  bookings: "dashboard.clientRecord.tabBookings",
  purchases: "dashboard.clientRecord.tabPurchases",
  projects: "dashboard.clientRecord.tabProjects",
  details: "dashboard.clientRecord.tabDetails",
};

const BOOKING_TONE: Record<string, "indigo" | "green" | "red" | "slate"> = {
  in_progress: "indigo",
  confirmed: "green",
  completed: "green",
  cancelled: "red",
};

export default async function ClientRecordPage({ params, searchParams }: { params: PageParams; searchParams: PageSearch }) {
  const { tenantSlug, customerId } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const allowed = await userHasCapability("view_dashboard", scope.tenantId);
  if (!allowed) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const sp = await searchParams;
  const tab: Tab = TABS.find((t) => t === sp.tab) ?? "overview";
  const base = `/${tenantSlug}/admin`;
  const nowMs = requestNowMs();

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
        <Link href={`${base}/clients`} className="text-[13px] text-admin-ink-muted underline underline-offset-4">
          {tr("dashboard.clientRecord.backToList")}
        </Link>
        <h1 className="m-0 text-[22px]! font-semibold tracking-[-0.02em] text-admin-ink">{tr("dashboard.clientRecord.title")}</h1>
        <Notice tone="warn">{message}</Notice>
      </PageShell>
    );
  }

  const record = load.record;
  const name = record.displayName ?? tr("dashboard.clientRecord.unnamed");
  const none = tr("dashboard.clientRecord.none");
  const verdict = collectVerdict(record);
  const balances = clientBalances(record);
  const next = nextBooking(record, nowMs);
  const active = activeProjects(record);
  const spend = lifetimeSpend(record);
  const tabHref = (t: Tab) => (t === "overview" ? `${base}/clients/${record.customerId}` : `${base}/clients/${record.customerId}?tab=${t}`);
  const tz = record.timeZone;

  const collect = verdict.ok ? (
    <ClientCollect
      records={unpaidPurchases(record).map((p) => ({
        orderId: p.orderId,
        title: interpolate(tr("dashboard.clientRecord.recordTitle"), {
          id: shortId(p.orderId),
          date: dayLabel(p.createdAt, tz, locale, none),
        }),
        detail: `${orderStatusLabel(p.status, tr)} · ${interpolate(tr("dashboard.clientRecord.lines"), { count: p.lineCount })} · ${formatOrderMoney(p.totalCents, p.currency)}`,
        owedCents: purchaseOwedCents(p),
        currency: p.currency,
      }))}
      counterHref={`${base}/pos?mode=counter`}
      copy={{
        open: tr("dashboard.clientRecord.collect"),
        title: interpolate(tr("dashboard.clientRecord.collectTitle"), { name }),
        subtitle: tr("dashboard.clientRecord.collectSubtitle"),
        closeLabel: tr("dashboard.projects.close.closeSheet"),
        unpaid: tr("dashboard.clientRecord.unpaidRecords"),
        allocation: tr("dashboard.clientRecord.allocation"),
        selected: tr("dashboard.clientRecord.selected"),
        selectedRecords: tr("dashboard.clientRecord.selectedRecords"),
        tip: tr("dashboard.clientRecord.tip"),
        tipValue: tr("dashboard.clientRecord.tipValue"),
        pass: tr("dashboard.clientRecord.pass"),
        passValue: tr("dashboard.clientRecord.passValue"),
        receipt: tr("dashboard.clientRecord.receipt"),
        receiptValue: record.email
          ? interpolate(tr("dashboard.clientRecord.receiptEmail"), { email: record.email })
          : record.phoneE164
            ? interpolate(tr("dashboard.clientRecord.receiptPhone"), { phone: record.phoneE164 })
            : tr("dashboard.clientRecord.receiptNone"),
        note: tr("dashboard.clientRecord.collectNote"),
        cancel: tr("dashboard.clientRecord.cancel"),
        sendLink: tr("dashboard.projects.money.sendLink"),
        sendLinkUnavailable: tr("dashboard.projects.money.linkUnavailable"),
        continueTo: tr("dashboard.clientRecord.continueToPayment"),
        oneAtATime: tr("dashboard.clientRecord.oneAtATime"),
        nothingSelected: tr("dashboard.clientRecord.nothingSelected"),
      }}
    />
  ) : (
    <button
      type="button"
      disabled
      title={verdict.reason === "mixed_currency" ? tr("dashboard.clientRecord.collectMixedCurrency") : tr("dashboard.clientRecord.collectNothingOwed")}
      className={BTN_SECONDARY}
    >
      {tr("dashboard.clientRecord.collect")}
    </button>
  );

  const main = (
    <>
      <header className="flex items-center gap-4">
        <Initials name={name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 text-[24px]! font-semibold leading-tight tracking-[-0.02em] text-admin-ink">{name}</h1>
            <Pill tone="slate">{tr("dashboard.clientRecord.person")}</Pill>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-admin-ink-muted">
            {record.phoneE164 ? (
              <span className="flex items-center gap-1.5">
                <Phone aria-hidden size={13} strokeWidth={1.75} />
                {record.phoneE164}
              </span>
            ) : null}
            {record.email ? (
              <span className="flex items-center gap-1.5">
                <Mail aria-hidden size={13} strokeWidth={1.75} />
                {record.email}
              </span>
            ) : null}
            {!record.phoneE164 && !record.email ? <span>{tr("dashboard.clientRecord.noContact")}</span> : null}
            {record.locale ? <span>{record.locale}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* No customer editor exists on this record (D-POS-41). */}
          <button type="button" disabled title={tr("dashboard.clientRecord.editUnavailable")} className={BTN_SECONDARY}>
            {tr("dashboard.clientRecord.edit")}
          </button>
          <Link href={`${base}/calendar`} className={BTN_SECONDARY}>
            {tr("dashboard.clientRecord.newBooking")}
            <ChevronDown aria-hidden size={12} strokeWidth={1.75} className="text-admin-ink-dim" />
          </Link>
          {collect}
        </div>
      </header>

      <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label={tr("dashboard.clientRecord.kpiDueNow")}
          value={verdict.ok ? formatOrderMoney(verdict.owedCents, verdict.currency) : balances.length > 0 ? formatOrderMoney(0, balances[0]!.currency) : "—"}
          note={
            verdict.ok
              ? interpolate(tr("dashboard.clientRecord.collectSummary"), { count: verdict.recordCount, amount: formatOrderMoney(verdict.owedCents, verdict.currency) })
              : verdict.reason === "mixed_currency"
                ? tr("dashboard.clientRecord.collectMixedCurrency")
                : tr("dashboard.clientRecord.collectNothingOwed")
          }
          tone={verdict.ok ? "coral" : "ink"}
          testId="due"
        />
        <KpiCard
          label={tr("dashboard.clientRecord.kpiNextBooking")}
          value={next ? dayLabel(next.startsAt, next.timeZone, locale, none, { weekday: true, time: true }) : tr("dashboard.clientRecord.kpiNone")}
          note={next ? next.title || shortId(next.bookingId) : tr("dashboard.clientRecord.kpiNoBooking")}
          tone={next ? "ink" : "muted"}
          testId="next"
        />
        <KpiCard
          label={tr("dashboard.clientRecord.kpiActiveProjects")}
          value={active.length === 0 ? tr("dashboard.clientRecord.kpiNone") : String(active.length)}
          note={
            spend.length > 0
              ? spend
                  .map((s) =>
                    interpolate(tr("dashboard.clientRecord.kpiLifetime"), {
                      amount: formatOrderMoney(s.collectedCents, s.currency),
                      since: dayLabel(s.sinceAt, tz, locale, none),
                    }),
                  )
                  .join(" · ")
              : tr("dashboard.clientRecord.purchasesNone")
          }
          tone={active.length === 0 ? "muted" : "ink"}
          testId="projects"
        />
      </dl>

      <TabStrip label={tr("dashboard.clientRecord.title")} tabs={TABS.map((t) => ({ id: t, href: tabHref(t), label: tr(TAB_KEY[t]), active: t === tab }))} />

      {tab === "overview" ? <OverviewTab record={record} locale={locale} nowMs={nowMs} tr={tr} /> : null}
      {tab === "activity" ? <ActivityList record={record} locale={locale} tr={tr} /> : null}
      {tab === "bookings" ? <BookingsList record={record} locale={locale} nowMs={nowMs} tr={tr} all /> : null}
      {tab === "purchases" ? (
        <>
          <SectionTitle>{tr("dashboard.clientRecord.balances")}</SectionTitle>
          <Card padded>
            {balances.length === 0 ? (
              <p className="m-0 text-[13px] text-admin-ink-muted">{tr("dashboard.clientRecord.balancesNone")}</p>
            ) : (
              balances.map((b) => (
                <KeyValue
                  key={b.currency}
                  label={`${tr("dashboard.clientRecord.outstanding")} ${b.currency}`}
                  value={`${formatOrderMoney(b.owedCents, b.currency)} · ${tr("dashboard.clientRecord.collected")} ${formatOrderMoney(b.collectedCents, b.currency)}`}
                />
              ))
            )}
            <p className="m-0 mt-2 text-[12.5px] text-admin-ink-muted">
              {verdict.ok
                ? interpolate(tr("dashboard.clientRecord.collectSummary"), { count: verdict.recordCount, amount: formatOrderMoney(verdict.owedCents, verdict.currency) })
                : verdict.reason === "mixed_currency"
                  ? tr("dashboard.clientRecord.collectMixedCurrency")
                  : tr("dashboard.clientRecord.collectNothingOwed")}
            </p>
          </Card>
          <SectionTitle>{tr("dashboard.clientRecord.purchases")}</SectionTitle>
          <PurchasesTable record={record} locale={locale} tenantSlug={tenantSlug} tr={tr} />
        </>
      ) : null}
      {tab === "projects" ? <ProjectsList record={record} locale={locale} tenantSlug={tenantSlug} tr={tr} /> : null}
      {tab === "details" ? <DetailsTab record={record} locale={locale} tr={tr} /> : null}
    </>
  );

  const side = (
    <>
      <Eyebrow wide>{tr("dashboard.clientRecord.sideContacts")}</Eyebrow>
      <Card>
        <div className="flex flex-col gap-2 px-3.5 py-3 text-[13px] text-admin-ink">
          <div>
            <b>{name}</b> · {tr("dashboard.clientRecord.paysSelf")}
          </div>
          <div className="text-[12px] text-admin-ink-muted">{tr("dashboard.clientRecord.participantsNone")}</div>
        </div>
      </Card>
      <Eyebrow wide>{tr("dashboard.clientRecord.sidePreferences")}</Eyebrow>
      <Card>
        <div className="px-3.5 py-3 text-[13px]">
          <KeyValue label={tr("dashboard.clientRecord.prefProfessional")} value={tr("dashboard.clientRecord.prefNotRecorded")} dim />
          <KeyValue label={tr("dashboard.clientRecord.prefTimes")} value={tr("dashboard.clientRecord.prefNotRecorded")} dim />
          <KeyValue
            label={tr("dashboard.clientRecord.prefReceipts")}
            value={record.email ? tr("dashboard.clientRecord.prefEmail") : record.phoneE164 ? tr("dashboard.clientRecord.prefPhone") : tr("dashboard.clientRecord.prefNotRecorded")}
            dim={!record.email && !record.phoneE164}
          />
          <KeyValue label={tr("dashboard.clientRecord.prefMarketing")} value={tr("dashboard.clientRecord.prefNotRecorded")} dim />
        </div>
      </Card>
      <Eyebrow wide>{tr("dashboard.clientRecord.sideIntake")}</Eyebrow>
      <Card>
        <div className="px-3.5 py-3 text-[13px]">
          {record.tags.length > 0 ? <KeyValue label={tr("dashboard.clientRecord.tags")} value={record.tags.join(" · ")} /> : null}
          {record.notes ? (
            <p className="m-0 whitespace-pre-line text-admin-ink">{record.notes}</p>
          ) : (
            <p className="m-0 text-admin-ink-muted">{tr("dashboard.clientRecord.intakeNone")}</p>
          )}
          <p className="m-0 mt-1.5 text-[11.5px] text-admin-ink-muted">{tr("dashboard.clientRecord.intakeVisible")}</p>
        </div>
      </Card>
    </>
  );

  return <RecordShell main={main} side={side} />;
}

function OverviewTab({ record, locale, nowMs, tr }: { record: ClientRecord; locale: string; nowMs: number; tr: Tr }) {
  return (
    <>
      <BookingsList record={record} locale={locale} nowMs={nowMs} tr={tr} />
      <ActivityList record={record} locale={locale} tr={tr} limit={5} />
    </>
  );
}

function BookingsList({ record, locale, nowMs, tr, all }: { record: ClientRecord; locale: string; nowMs: number; tr: Tr; all?: boolean }) {
  const none = tr("dashboard.clientRecord.none");
  const ordered = bookingsByStart(record);
  const rows = all ? ordered : ordered.filter((b) => b.startsAt === null || new Date(b.startsAt).getTime() >= nowMs);
  return (
    <>
      <SectionTitle aside={<span className="text-[12px] text-admin-ink-muted">{interpolate(tr("dashboard.clientRecord.commitments"), { count: rows.length })}</span>}>
        {all ? tr("dashboard.clientRecord.bookings") : tr("dashboard.clientRecord.upcoming")}
      </SectionTitle>
      <Card>
        {rows.length === 0 ? (
          <p className="m-0 px-4 py-3 text-[13px] text-admin-ink-muted">{tr("dashboard.clientRecord.bookingsNone")}</p>
        ) : (
          rows.map((b) => (
            <ListRow key={b.bookingId} cols="grid-cols-[130px_1.4fr_1.4fr_110px]" className="border-t">
              <b>{dayLabel(b.startsAt, b.timeZone, locale, none, { weekday: true, time: true })}</b>
              <span>{b.title || shortId(b.bookingId)}</span>
              <span className="text-admin-ink-muted">{b.timeZone !== record.timeZone ? b.timeZone : ""}</span>
              <span>
                <Pill tone={BOOKING_TONE[b.status] ?? "slate"}>{tr(STATUS_KEY[bookingStatus(b.status)])}</Pill>
              </span>
            </ListRow>
          ))
        )}
      </Card>
    </>
  );
}

const PROJECT_STATUSES: readonly ProjectStatus[] = ["draft", "tentative", "confirmed", "in_progress", "completed", "cancelled", "archived"];

function bookingStatus(status: string): ProjectStatus {
  return PROJECT_STATUSES.find((s) => s === status) ?? "draft";
}

function ActivityList({ record, locale, tr, limit }: { record: ClientRecord; locale: string; tr: Tr; limit?: number }) {
  const none = tr("dashboard.clientRecord.none");
  const rows = limit ? purchasesByDate(record).slice(0, limit) : purchasesByDate(record);
  return (
    <>
      <SectionTitle aside={<span className="text-[12px] text-admin-ink-muted">{tr("dashboard.clientRecord.activityWindow")}</span>}>
        {limit ? tr("dashboard.clientRecord.recentActivity") : tr("dashboard.clientRecord.tabActivity")}
      </SectionTitle>
      <Card>
        {rows.length === 0 ? (
          <p className="m-0 px-4 py-3 text-[13px] text-admin-ink-muted">{tr("dashboard.clientRecord.purchasesNone")}</p>
        ) : (
          rows.map((p) => {
            const owed = purchaseOwedCents(p);
            return (
              <ListRow key={p.orderId} cols="grid-cols-[110px_1fr_auto]" className="border-t">
                <span className="text-admin-ink-muted">{dayLabel(p.createdAt, record.timeZone, locale, none, { weekday: true })}</span>
                <span>
                  {interpolate(tr("dashboard.clientRecord.recordShort"), { id: shortId(p.orderId) })}
                  {" · "}
                  {interpolate(tr("dashboard.clientRecord.lines"), { count: p.lineCount })}
                </span>
                <span className="text-right text-admin-ink-muted">
                  {formatOrderMoney(p.totalCents, p.currency)} · {orderStatusLabel(p.status, tr)}
                  {owed > 0 ? ` · ${formatOrderMoney(owed, p.currency)} ${tr("dashboard.clientRecord.owedSuffix")}` : ""}
                </span>
              </ListRow>
            );
          })
        )}
      </Card>
    </>
  );
}

function ProjectsList({ record, locale, tenantSlug, tr }: { record: ClientRecord; locale: string; tenantSlug: string; tr: Tr }) {
  const none = tr("dashboard.clientRecord.none");
  return (
    <>
      <SectionTitle>{tr("dashboard.clientRecord.projects")}</SectionTitle>
      <Card>
        {record.projects.length === 0 ? (
          <p className="m-0 px-4 py-3 text-[13px] text-admin-ink-muted">{tr("dashboard.clientRecord.projectsNone")}</p>
        ) : (
          record.projects.map((p) => (
            <ListRow key={p.projectId} cols="grid-cols-[1.6fr_1fr_110px]" className="border-t">
              <Link href={`/${tenantSlug}/admin/projects/${p.projectId}`} className="font-semibold text-admin-ink no-underline hover:underline">
                {p.title || shortId(p.projectId)}
              </Link>
              <span className="text-admin-ink-muted">
                {dayLabel(p.startsAt, p.timeZone, locale, none, { weekday: true })}
                {p.timeZone !== record.timeZone ? ` · ${p.timeZone}` : ""}
              </span>
              <span>
                <Pill tone={BOOKING_TONE[p.status] ?? "slate"}>{tr(STATUS_KEY[bookingStatus(p.status)])}</Pill>
              </span>
            </ListRow>
          ))
        )}
      </Card>
    </>
  );
}

function DetailsTab({ record, locale, tr }: { record: ClientRecord; locale: string; tr: Tr }) {
  const none = tr("dashboard.clientRecord.none");
  return (
    <>
      <SectionTitle>{tr("dashboard.clientRecord.identity")}</SectionTitle>
      <Card padded>
        <KeyValue label={tr("dashboard.clientRecord.email")} value={record.email ?? none} dim={!record.email} />
        <KeyValue label={tr("dashboard.clientRecord.phone")} value={record.phoneE164 ?? none} dim={!record.phoneE164} />
        <KeyValue label={tr("dashboard.clientRecord.locale")} value={record.locale ?? none} dim={!record.locale} />
        <KeyValue label={tr("dashboard.clientRecord.visits")} value={String(record.visits)} />
        <KeyValue label={tr("dashboard.clientRecord.noShows")} value={String(record.noShows)} />
        <KeyValue label={tr("dashboard.clientRecord.lastSeen")} value={dayLabel(record.lastSeenAt, record.timeZone, locale, none, { weekday: true })} dim={!record.lastSeenAt} />
        <KeyValue label={tr("dashboard.clientRecord.account")} value={record.userId ? tr("dashboard.clientRecord.accountYes") : tr("dashboard.clientRecord.accountNone")} />
        <p className="m-0 mt-2 text-[12px] text-admin-ink-muted">{tr("dashboard.clientRecord.whichClient")}</p>
        <p className="m-0 mt-1 text-[12px] text-admin-ink-muted">{interpolate(tr("dashboard.clientRecord.timezoneNote"), { zone: record.timeZone })}</p>
      </Card>
    </>
  );
}
