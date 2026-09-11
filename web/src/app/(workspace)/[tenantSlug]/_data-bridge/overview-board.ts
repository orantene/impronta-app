/**
 * The Overview's numbers, from the readers the rest of the workspace already
 * trusts (Main board, WS005).
 *
 *   Collected today   booking_transactions, PAID, since the venue's midnight —
 *                     `loadTenantTakings`, grouped by the Payments page's own
 *                     method rule (cash / card at the counter / provider).
 *   Balances due      `loadTenantOwedOrders`, the whole pending_payment set,
 *                     collected side from PAID transactions (the desk's rule).
 *   Arrivals          the host stand's book when the workspace takes
 *                     reservations (`loadHostStand`), else today's appointments
 *                     from the front desk's day (`loadClassesDay`).
 *   Open orders       `loadWorkspaceOrders` (draft · quoted · pending payment)
 *                     with the kitchen's tickets (`listBoard`) for "in
 *                     preparation" and "ready".
 *   Exceptions        `loadExceptions` — the Issues queue, same rows.
 *   Needs you now     those exceptions, plus balances due today and
 *                     unconfirmed bookings today, ranked by consequence.
 *   Today             the same rows the Front desk, Reservations and Tables
 *                     screens read, three tabs.
 *   Setup readiness   six facts read off the workspace row and its catalog.
 *
 * EVERY READER FAILS ON ITS OWN. A card whose reader failed says so (`ok:
 * false`); the others still show. An Overview that read 0 collected because
 * one query errored would be the silent failure this whole surface is meant
 * to end.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadExceptions } from "@/lib/exceptions/read";
import { loadClassesDay, venueDayWindow, type ClassesDay } from "@/lib/pos/classes/day";
import { listFloor, type FloorTable } from "@/lib/visits/floor";
import { listBoard } from "@/lib/preparation/tickets";
import { bucketOf, outstandingCents } from "@/lib/orders/orders-list";
import { groupTakingsByMethod, sumOwedByCurrency } from "@/lib/payments/activity-shape";
import { computeProviderStatuses, readProviderStatusEnv } from "@/lib/payments/provider-status";
import {
  NEEDS_YOU_RANK,
  sortNeedsYou,
  type NeedsYouRow,
  type OverviewArrivals,
  type OverviewCopy,
  type OverviewExceptions,
  type OverviewMoney,
  type OverviewOrders,
  type OverviewSnapshot,
  type OverviewToday,
  type SetupItem,
  type TodayBadge,
  type TodayRow,
} from "@/lib/overview/model";
import type { BookEntry } from "@/lib/reservations";
import type { ExceptionRow } from "@/lib/exceptions/model";
import { loadHostStand, type HostStandState } from "../admin/reservations/host-stand-data";
import { loadTenantOwedOrders, loadTenantTakings } from "./payments-activity";
import { loadWorkspaceOrders } from "./orders";

const DEFAULT_ZONE = "UTC";

type AgencyRow = {
  timezone: string | null;
  takes_reservations: boolean | null;
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean | null;
};

/** HH:MM on the venue's clock. */
function clock(iso: string | Date, timeZone: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (!Number.isFinite(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return "";
  }
}

function money(currency: string, cents: number): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

async function readAgency(tenantId: string): Promise<AgencyRow | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("agencies")
    .select("timezone, takes_reservations, stripe_account_id, stripe_payouts_enabled")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("overview.agency", error);
    return null;
  }
  return (data as AgencyRow | null) ?? null;
}

async function readMoney(
  tenantId: string,
  sinceIso: string,
  day: ClassesDay | null,
): Promise<OverviewMoney> {
  const [takings, owed] = await Promise.all([
    loadTenantTakings(tenantId, { since: sinceIso }),
    loadTenantOwedOrders(tenantId),
  ]);
  const empty: OverviewMoney = {
    ok: false,
    currency: "USD",
    collectedTodayCents: 0,
    cashCents: 0,
    cardCents: 0,
    otherCents: 0,
    owedCents: 0,
    owedCount: 0,
    owedDueTodayCount: 0,
  };
  if (!takings.ok || !owed.ok) return empty;
  const byMethod = groupTakingsByMethod(takings.rows);
  const currency =
    byMethod[0]?.currency ?? sumOwedByCurrency(owed.rows)[0]?.currency ?? "USD";
  let cash = 0;
  let card = 0;
  let other = 0;
  for (const m of byMethod) {
    if (m.currency !== currency) continue;
    if (m.method === "cash") cash += m.totalCents;
    else if (m.method === "card_manual" || m.method.startsWith("stripe") || m.method.startsWith("mercado")) card += m.totalCents;
    else other += m.totalCents;
  }
  const owedTotals = sumOwedByCurrency(owed.rows).find((t) => t.currency === currency);
  const dueToday = (day?.appointments ?? []).filter(
    (a) => a.outstandingCents > 0 && a.state !== "cancelled" && a.state !== "archived",
  ).length;
  return {
    ok: true,
    currency,
    collectedTodayCents: cash + card + other,
    cashCents: cash,
    cardCents: card,
    otherCents: other,
    owedCents: owedTotals?.totalCents ?? 0,
    owedCount: owedTotals?.count ?? 0,
    owedDueTodayCount: dueToday,
  };
}

function arrivalsFromBook(entries: readonly BookEntry[]): OverviewArrivals {
  let expected = 0;
  let arrived = 0;
  let inService = 0;
  let late = 0;
  for (const e of entries) {
    if (e.isVoid || e.state === "no_show") continue;
    expected += 1;
    if (e.admittedCount > 0) arrived += 1;
    if (e.state === "seated" || e.state === "part_seated") inService += 1;
    if (e.state === "late") late += 1;
  }
  return { ok: true, expected, arrived, inService, late };
}

function arrivalsFromDay(day: ClassesDay, now: Date): OverviewArrivals {
  let expected = 0;
  let arrived = 0;
  let inService = 0;
  let late = 0;
  for (const a of day.appointments) {
    if (a.state === "cancelled" || a.state === "archived") continue;
    expected += 1;
    if (a.state === "in_progress") {
      inService += 1;
      arrived += 1;
    }
    if (a.state === "completed") arrived += 1;
    const startedAgo = now.getTime() - Date.parse(a.startsAt);
    if ((a.state === "confirmed" || a.state === "tentative") && startedAgo > 15 * 60_000) late += 1;
  }
  return { ok: true, expected, arrived, inService, late };
}

function bookBadges(e: BookEntry): TodayBadge[] {
  const out: TodayBadge[] = [];
  switch (e.state) {
    case "seated":
      out.push({ key: "inService", tone: "indigo" });
      break;
    case "part_seated":
      out.push({ key: "arrived", tone: "green" });
      break;
    case "arriving":
      out.push({ key: "waiting", tone: "slate" });
      break;
    case "late":
      out.push({ key: "late", count: e.lateMinutes, tone: "coral" });
      break;
    case "no_show":
      out.push({ key: "noShow", tone: "critical" });
      break;
    case "completed":
      out.push({ key: "completed", tone: "slate" });
      break;
    default:
      out.push({ key: "booked", tone: "slate" });
  }
  return out;
}

function bookRows(entries: readonly BookEntry[], timeZone: string, adminBase: string): TodayRow[] {
  return entries
    .filter((e) => !e.isVoid)
    .map((e): TodayRow => {
      const sub: OverviewCopy = e.spaceCode
        ? { key: "dashboard.overviewBoard.today.partyOf", params: { size: e.partySize, space: e.spaceCode } }
        : { key: "dashboard.overviewBoard.today.partyOfUnplaced", params: { size: e.partySize } };
      return {
        id: e.admissionId,
        time: clock(e.startsAt, timeZone),
        title: e.holderName ?? "",
        sub,
        badges: bookBadges(e),
        href: `${adminBase}/reservations`,
      };
    });
}

function appointmentBadges(state: ClassesDay["appointments"][number]["state"], outstanding: boolean): TodayBadge[] {
  const out: TodayBadge[] = [];
  if (state === "in_progress") out.push({ key: "inService", tone: "indigo" });
  else if (state === "completed") out.push({ key: "completed", tone: "slate" });
  else if (state === "confirmed") out.push({ key: "confirmed", tone: "green" });
  else if (state === "tentative" || state === "draft") out.push({ key: "unconfirmed", tone: "coral" });
  if (outstanding) out.push({ key: "depositPaid", tone: "coral" });
  return out;
}

function appointmentRows(day: ClassesDay, adminBase: string): TodayRow[] {
  return day.appointments
    .filter((a) => a.state !== "cancelled" && a.state !== "archived")
    .map((a): TodayRow => {
      const sub: OverviewCopy =
        a.outstandingCents > 0
          ? {
              key: "dashboard.overviewBoard.today.serviceDue",
              params: { service: a.title, amount: money(a.currency, a.outstandingCents) },
            }
          : { text: a.title };
      return {
        id: a.id,
        time: clock(a.startsAt, day.timeZone),
        title: a.customerName ?? a.title,
        sub,
        badges: appointmentBadges(a.state, a.outstandingCents > 0),
        href: `${adminBase}/sessions`,
      };
    });
}

function sessionRows(day: ClassesDay, adminBase: string): TodayRow[] {
  return day.sessions.map((s) => {
    const badges: TodayBadge[] = [];
    if (s.seats.kind === "counted") {
      if (s.seats.remaining <= 0) badges.push({ key: "full", tone: "slate" });
      else badges.push({ key: "seatsLeft", count: s.seats.remaining, tone: "green" });
    }
    if (s.waitlist.length > 0) badges.push({ key: "waitlisted", count: s.waitlist.length, tone: "slate" });
    const booked = s.roster.reduce((n, r) => n + r.partySize, 0);
    return {
      id: s.id,
      time: clock(s.startsAt, day.timeZone),
      title:
        s.seats.kind === "counted" ? `${s.title} ${booked}/${s.seats.total}` : s.title,
      sub: { text: s.offeringTitle ?? "" },
      badges,
      href: `${adminBase}/sessions?view=sessions`,
    };
  });
}

function tableRows(tables: readonly FloorTable[], timeZone: string, adminBase: string): TodayRow[] {
  return tables.map((t) => {
    const badge: TodayBadge =
      t.state === "occupied"
        ? { key: "occupied", tone: "indigo" }
        : t.state === "held"
          ? { key: "held", tone: "coral" }
          : { key: "free", tone: "green" };
    const sub: OverviewCopy =
      t.state === "occupied"
        ? {
            key: "dashboard.overviewBoard.today.tableOpen",
            params: { minutes: t.elapsedMinutes ?? 0, party: t.partySize ?? 0 },
          }
        : { key: "dashboard.overviewBoard.today.tableSeats", params: { min: t.partyMin, max: t.partyMax } };
    return {
      id: t.spaceId,
      time: t.dueAtIso ? clock(t.dueAtIso, timeZone) : "",
      title: t.code ? `${t.code} · ${t.name}` : t.name,
      sub,
      badges: [badge],
      href: `${adminBase}/tables`,
    };
  });
}

function exceptionRow(row: ExceptionRow, tenantSlug: string, adminBase: string): NeedsYouRow {
  const tone = row.severity === "critical" ? "critical" : row.severity === "high" ? "high" : "normal";
  // The queue's hrefs are built on the slug host; on a branded host the
  // admin base has no slug, so the prefix is swapped for whichever applies.
  const href = row.href ? row.href.replace(`/${tenantSlug}/admin`, adminBase) : `${adminBase}/exceptions`;
  return {
    key: row.key,
    tone,
    title: { text: row.title },
    detail: { text: row.detail },
    // Every exception lives in the Issues queue, whichever owner it has.
    destination: "issues",
    action: {
      label:
        row.nextAction.kind === "resume"
          ? { text: row.nextAction.label }
          : { key: "dashboard.overviewBoard.needsYou.checkStatus" },
      href,
    },
    rank: NEEDS_YOU_RANK[tone],
    at: row.firstSeenAt,
  };
}

function buildNeedsYou(input: {
  exceptions: readonly ExceptionRow[];
  day: ClassesDay | null;
  book: readonly BookEntry[];
  tenantSlug: string;
  adminBase: string;
}): NeedsYouRow[] {
  const rows: NeedsYouRow[] = input.exceptions.map((e) =>
    exceptionRow(e, input.tenantSlug, input.adminBase),
  );
  for (const a of input.day?.appointments ?? []) {
    if (a.state === "cancelled" || a.state === "archived" || a.state === "completed") continue;
    const who = a.customerName ?? a.title;
    if (a.outstandingCents > 0 && a.collectable) {
      rows.push({
        key: `balance:${a.id}`,
        tone: "high",
        title: { key: "dashboard.overviewBoard.needsYou.balanceDueTitle", params: { who, service: a.title } },
        detail: {
          key: "dashboard.overviewBoard.needsYou.balanceDueDetail",
          params: { amount: money(a.currency, a.outstandingCents) },
        },
        destination: "sales",
        action: {
          label: { key: "dashboard.overviewBoard.needsYou.collectBalance" },
          href: a.orderId ? `${input.adminBase}/orders?q=${encodeURIComponent(a.orderId)}` : `${input.adminBase}/sessions`,
        },
        rank: NEEDS_YOU_RANK.balanceDueToday,
        at: a.startsAt,
      });
    }
    if (a.state === "tentative" || a.state === "draft") {
      rows.push({
        key: `unconfirmed:${a.id}`,
        tone: "high",
        title: { key: "dashboard.overviewBoard.needsYou.unconfirmedTitle", params: { who, service: a.title } },
        detail: {
          key: "dashboard.overviewBoard.needsYou.unconfirmedDetail",
          params: { time: clock(a.startsAt, input.day?.timeZone ?? DEFAULT_ZONE) },
        },
        destination: "appts",
        action: { label: { key: "dashboard.overviewBoard.needsYou.resolve" }, href: `${input.adminBase}/sessions` },
        rank: NEEDS_YOU_RANK.unconfirmedToday,
        at: a.startsAt,
      });
    }
  }
  for (const e of input.book) {
    if (e.state !== "late") continue;
    rows.push({
      key: `late:${e.admissionId}`,
      tone: "normal",
      title: {
        key: "dashboard.overviewBoard.needsYou.lateTitle",
        params: { who: e.holderName ?? "", size: e.partySize },
      },
      detail: { key: "dashboard.overviewBoard.needsYou.lateDetail", params: { minutes: e.lateMinutes } },
      destination: "reservations",
      action: { label: { key: "dashboard.overviewBoard.needsYou.openBook" }, href: `${input.adminBase}/reservations` },
      rank: NEEDS_YOU_RANK.lateArrival,
      at: e.startsAt.toISOString(),
    });
  }
  return sortNeedsYou(rows);
}

async function readSetup(tenantId: string, agency: AgencyRow | null): Promise<SetupItem[]> {
  const admin = createServiceRoleClient();
  const providers = computeProviderStatuses(readProviderStatusEnv());
  const online = providers.some((p) => p.id !== "cash" && p.configured);
  let catalogItem = false;
  let bookableHours = false;
  let websitePublished = false;
  if (admin) {
    const [items, hours, pages] = await Promise.all([
      admin
        .from("talent_offerings")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("owner_kind", "workspace"),
      admin
        .from("talent_booking_hours")
        .select("talent_profile_id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      admin
        .from("cms_pages")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "published"),
    ]);
    if (items.error) logServerError("overview.setup.catalog", items.error);
    if (hours.error) logServerError("overview.setup.hours", hours.error);
    if (pages.error) logServerError("overview.setup.pages", pages.error);
    catalogItem = (items.count ?? 0) > 0;
    bookableHours = (hours.count ?? 0) > 0;
    websitePublished = (pages.count ?? 0) > 0;
  }
  return [
    { key: "timeZone", done: Boolean(agency?.timezone) },
    { key: "catalogItem", done: catalogItem },
    { key: "bookableHours", done: bookableHours },
    { key: "onlinePayments", done: online },
    {
      key: "payoutDestination",
      done: Boolean(agency?.stripe_account_id) && agency?.stripe_payouts_enabled === true,
    },
    { key: "websitePublished", done: websitePublished },
  ];
}

export async function loadOverviewSnapshot(input: {
  tenantId: string;
  tenantSlug: string;
  adminBase: string;
  now?: Date;
}): Promise<OverviewSnapshot | null> {
  const now = input.now ?? new Date();
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const agency = await readAgency(input.tenantId);
  const timeZone = agency?.timezone?.trim() || DEFAULT_ZONE;
  const window = venueDayWindow(now, timeZone, 0) ?? venueDayWindow(now, DEFAULT_ZONE, 0);
  if (!window) return null;
  const takesReservations = agency?.takes_reservations === true;

  const [dayRead, stand, floor, ordersRead, board, exceptions] = await Promise.all([
    loadClassesDay(admin, { tenantId: input.tenantId, timeZone, now, dayOffset: 0 }),
    takesReservations
      ? loadHostStand(input.tenantId, window.ymd, now)
      : Promise.resolve<HostStandState>({ kind: "no_venue" }),
    listFloor(admin, input.tenantId),
    loadWorkspaceOrders(input.tenantId, { limit: 500 }),
    listBoard(admin, input.tenantId),
    loadExceptions(admin, { tenantId: input.tenantId, tenantSlug: input.tenantSlug, now: now.getTime() }),
  ]);

  const day = dayRead.ok ? dayRead.day : null;
  const book = stand.kind === "ok" ? stand.data.entries : [];
  const money = await readMoney(input.tenantId, window.from.toISOString(), day);

  const arrivals: OverviewArrivals =
    stand.kind === "ok"
      ? arrivalsFromBook(book)
      : day
        ? arrivalsFromDay(day, now)
        : { ok: false, expected: 0, arrived: 0, inService: 0, late: 0 };

  const orders: OverviewOrders = ordersRead.ok
    ? {
        ok: true,
        open: ordersRead.rows.filter((r) => {
          const bucket = bucketOf(r.status);
          return bucket === "open" || (bucket === "to_pay" && outstandingCents(r) > 0);
        }).length,
        inPreparation: board.ok
          ? board.tickets.filter((t) => t.status === "queued" || t.status === "acknowledged").length
          : 0,
        ready: board.ok ? board.tickets.filter((t) => t.status === "ready").length : 0,
      }
    : { ok: false, open: 0, inPreparation: 0, ready: 0 };

  const exceptionsCard: OverviewExceptions = {
    ok: exceptions.unavailable.length === 0,
    total: exceptions.summary.total,
    uncertainPayments: exceptions.rows.filter((r) => r.source === "unresolved_collection").length,
    unavailable: exceptions.unavailable,
  };

  const tabs: OverviewToday["tabs"] = [
    ...(stand.kind === "ok" || day ? (["arrivals"] as const) : []),
    ...(day ? (["classes"] as const) : []),
    ...(floor.ok && floor.tables.length > 0 ? (["tables"] as const) : []),
  ];
  const today: OverviewToday = {
    arrivals:
      stand.kind === "ok"
        ? bookRows(book, stand.data.timeZone, input.adminBase)
        : day
          ? appointmentRows(day, input.adminBase)
          : [],
    classes: day ? sessionRows(day, input.adminBase) : [],
    tables: floor.ok ? tableRows(floor.tables, timeZone, input.adminBase) : [],
    tabs,
  };

  return {
    timeZone,
    ymd: window.ymd,
    nowIso: now.toISOString(),
    money,
    arrivals,
    orders,
    exceptions: exceptionsCard,
    needsYou: buildNeedsYou({
      exceptions: exceptions.rows,
      day,
      book,
      tenantSlug: input.tenantSlug,
      adminBase: input.adminBase,
    }),
    today,
    setup: await readSetup(input.tenantId, agency),
  };
}
