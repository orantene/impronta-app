import { formatCountdown, freeGaps, needsAttention } from "@/lib/talent-agenda/derive";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";
import type { MoneyLanding, TodayMoneyTile } from "@/lib/money/today-money-tiles";
import type { TalentCalendarEntry } from "../../data-bridge";
import type { AgendaMoneyItem, AgendaPaymentState, AgendaRowItem } from "./types";

/** Hold tiles show wall-clock expiry (tc_cal), not a relative countdown. */
export function holdUntilWallClock(holdUntil: string): string {
  const d = new Date(holdUntil);
  if (Number.isNaN(d.getTime())) return `until ${formatCountdown(holdUntil, new Date())}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `until ${hh}:${mm}`;
}

function timeLabel(iso: string, allDay: boolean): string {
  if (allDay) return "All day";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function durationLabel(item: TalentAgendaItem): string | undefined {
  if (item.allDay) return undefined;
  const minutes = Math.max(0, Math.round((Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60_000));
  if (minutes <= 0) return undefined;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0 && rest > 0) return `${hours} h ${rest} m`;
  if (hours > 0) return `${hours} h`;
  return `${minutes} m`;
}

function paymentChip(payment: TalentAgendaItem["payment"]): AgendaPaymentState {
  switch (payment) {
    case "awaiting":
      return "awaiting_deposit";
    case "checking":
      return "checking_payment";
    case "due":
      return "due_at_appointment";
    case "partial":
      return "deposit_paid";
    case "paid":
      return "paid";
    case "overdue":
      return "overdue";
    case "refund_pending":
      return "refund_pending";
    case "agency":
      return "paid_by_agency";
    default:
      return "not_requested";
  }
}

export function rowFromAgendaItem(
  item: TalentAgendaItem,
  now: Date,
  onOpen?: () => void,
): AgendaRowItem {
  const request = item.kind === "request" || item.booking === "requested";
  const variant = request
    ? "request"
    : item.kind === "hold" || item.booking === "hold"
      ? "hold"
      : item.kind === "block"
        ? "block"
        : item.managedBy
          ? "agency"
          : "default";
  return {
    id: item.id,
    timeLabel: item.allDay ? "All day" : `${timeLabel(item.startsAt, false)} – ${timeLabel(item.endsAt, false)}`,
    durationLabel: durationLabel(item),
    title: item.title,
    person: item.client?.name,
    whereLabel: item.where.label,
    sourceLabel: item.managedBy?.name ?? item.source,
    note: request
      ? "Not blocking your time until you accept."
      : item.holdUntil
        ? holdUntilWallClock(item.holdUntil)
        : undefined,
    bookingState: item.booking,
    paymentState: paymentChip(item.payment),
    variant,
    onOpen,
  };
}

/** Calendar bridge rows have no payment ledger. Leave payment unset as not requested. */
export function agendaItemFromCalendarEntry(entry: TalentCalendarEntry): TalentAgendaItem {
  const booking =
    entry.kind === "hold"
      ? "hold"
      : entry.status === "completed"
        ? "completed"
        : entry.status === "cancelled"
          ? "cancelled"
          : entry.status === "confirmed"
            ? "confirmed"
            : "requested";
  return {
    id: entry.id,
    kind: entry.kind === "booking" ? "booking" : entry.kind,
    ref: { table: entry.kind, id: entry.id },
    client: entry.subLabel ? { name: entry.subLabel, initials: entry.subLabel.slice(0, 2).toUpperCase() } : undefined,
    title: entry.title,
    lines: [],
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
    allDay: entry.allDay,
    tz: "UTC",
    where: { mode: "studio", label: entry.subLabel ?? "" },
    bufferAfterMin: 0,
    booking,
    payment: "none",
    money: { totalCents: 0, paidCents: 0, dueCents: 0, currency: "" },
    source: entry.tenantId ? "agency" : "manual",
    managedBy: entry.tenantId ? { agencyId: entry.tenantId, name: "Agency" } : undefined,
    holdUntil: entry.kind === "hold" ? entry.endsAt : undefined,
    blocksTime: true,
    history: [],
  };
}

/** Bridge adapter while Calendar/Attention still consume TalentCalendarEntry. */
export function calendarEntryFromAgendaItem(item: TalentAgendaItem): TalentCalendarEntry {
  const kind =
    item.kind === "hold" ? "hold" : item.kind === "block" ? "block" : "booking";
  const status =
    item.booking === "completed"
      ? "completed"
      : item.booking === "cancelled"
        ? "cancelled"
        : item.booking === "confirmed" || item.booking === "no_show"
          ? "confirmed"
          : null;
  return {
    id: item.id,
    kind,
    title: item.title,
    subLabel: item.client?.name ?? null,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    allDay: item.allDay,
    status,
    holdStrength: item.kind === "hold" ? "firm" : null,
    inquiryId: null,
    tenantId: item.managedBy?.agencyId ?? null,
  };
}

/** T2.5 Dual timezone label: "13:00 Mérida · 21:00 Madrid". */
export function formatDualTimezoneWhen(
  startsAt: string,
  endsAt: string,
  tz: string,
  clientTz?: string,
  allDay?: boolean,
): string {
  if (allDay) return "All day";
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime())) return "—";
  const localFmt = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz || undefined,
  });
  const localCity = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
  const localRange = `${localFmt.format(start)} – ${localFmt.format(end)} ${localCity}`;
  if (!clientTz || clientTz === tz) return localRange;
  const clientFmt = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: clientTz,
  });
  const clientCity = clientTz.split("/").pop()?.replace(/_/g, " ") ?? clientTz;
  return `${localFmt.format(start)} ${localCity} · ${clientFmt.format(start)} ${clientCity}`;
}

function localYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function itemLocalYmd(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return localYmd(date);
}

export function todayFromAgenda(items: readonly TalentAgendaItem[], now: Date) {
  const attention = needsAttention(items, now);
  const dayKey = localYmd(now);
  const day = items
    .filter((item) => itemLocalYmd(item.startsAt) === dayKey)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  // Next up: first item that has not ended yet (includes in-progress).
  const next = day.find((item) => Date.parse(item.endsAt) >= now.getTime()) ?? null;
  // Rest of today: only later items — never re-list next or past slots.
  const rest = next
    ? day.filter((item) => Date.parse(item.startsAt) > Date.parse(next.startsAt))
    : [];
  return { attention, next, rest };
}

export function weekDays(now: Date): Date[] {
  const start = new Date(now);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

export function itemsOnDay(items: readonly TalentAgendaItem[], day: Date): TalentAgendaItem[] {
  const key = localYmd(day);
  return items
    .filter((item) => itemLocalYmd(item.startsAt) === key)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export function gapsOnDay(
  items: readonly TalentAgendaItem[],
  day: Date,
  hours: { windows: { startMin: number; endMin: number }[] } | null,
  now: Date,
) {
  return freeGaps(day, items, hours, now);
}

export function moneyFromEarnings(input: {
  collectedLabel: string;
  /** Prefer agenda still-to-collect (today + overdue). Falls back to owedCents. */
  stillToCollectCents?: number | null;
  owedCents?: number | null;
  currency: string;
  cardPayouts: boolean;
  /** Optional translator for EN/ES labels. */
  t?: (key: string) => string;
}): AgendaMoneyItem[] {
  const t = input.t ?? ((key: string) => key);
  const money = (cents: number) => `${(cents / 100).toFixed(2)} ${input.currency}`.trim();
  const collect =
    input.stillToCollectCents != null
      ? input.stillToCollectCents
      : input.owedCents;
  return [
    { id: "collected", label: t("Collected this month"), value: input.collectedLabel },
    {
      id: "collect",
      label: t("Still to collect"),
      value: collect == null ? t("not shared") : money(collect),
      tone: "attention",
    },
    {
      id: "payout",
      label: t("Next payout"),
      value: input.cardPayouts ? t("See payouts") : t("No payout"),
      helper: input.cardPayouts ? undefined : t("Cash stays with you. There is no card payout."),
      tone: "success",
    },
  ];
}

/**
 * Today Money tiles (M3) — Collected / Due by today / Next payout · estimated
 * from the Money read model. Click handlers open Money with the matching tab
 * (Due by today → Outstanding filter `"today"` / `mc_out_today`).
 */
export function moneyFromLedger(input: {
  tiles: readonly TodayMoneyTile[];
  isSpanish?: boolean;
  onOpen: (landing: MoneyLanding) => void;
}): AgendaMoneyItem[] {
  return input.tiles.map((tile) => ({
    id: tile.id,
    label: input.isSpanish ? tile.labelEs : tile.labelEn,
    value: tile.amountLabel,
    helper: input.isSpanish ? tile.linesEs : tile.linesEn,
    tone: tile.tone,
    onClick: () => input.onOpen(tile.landing),
  }));
}

/** One optional rebook hint from a prior completed visit for the same client. */
export function rebookHint(
  items: readonly TalentAgendaItem[],
  next: TalentAgendaItem | null,
): { clientName: string; lastService: string } | null {
  if (!next?.client?.name) return null;
  const name = next.client.name;
  const prior = items.find(
    (item) =>
      item.id !== next.id &&
      item.client?.name === name &&
      (item.booking === "completed" || item.booking === "cancelled"),
  );
  if (!prior) return null;
  return { clientName: name, lastService: prior.title };
}
