import { formatDualTimezoneWhen } from "./present";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";
import type { TalentCalendarEntry, TalentSelfProfile } from "../../data-bridge";
import type {
  AgendaAttentionItem,
  AgendaBookingState,
  AgendaListItem,
  AgendaMoneyItem,
  AgendaPaymentState,
  AgendaRowItem,
  AgendaRowVariant,
} from "./types";

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(start: Date, end: Date) {
  const diff = Math.max(0, end.getTime() - start.getTime());
  const minutes = Math.round(diff / 60_000);
  if (minutes === 0) return undefined;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours > 0 && remainder > 0) return `${hours} h ${remainder} m`;
  if (hours > 0) return `${hours} h`;
  return `${remainder} m`;
}

function bookingStateFor(entry: TalentCalendarEntry): AgendaBookingState | undefined {
  if (entry.kind === "hold") return "hold";
  if (entry.kind === "block") return undefined;
  if (entry.status === "completed") return "completed";
  if (entry.status === "cancelled") return "cancelled";
  if (entry.status === "confirmed") return "confirmed";
  return undefined;
}

/** Never invent payment from entry kind. Bridge rows have no ledger. */
function paymentStateFor(_entry: TalentCalendarEntry): AgendaPaymentState | undefined {
  return "not_requested";
}

function variantFor(entry: TalentCalendarEntry): AgendaRowVariant {
  if (entry.kind === "hold") return "hold";
  if (entry.kind === "block") return "block";
  if (entry.tenantId) return "agency";
  return "default";
}

function noteFor(entry: TalentCalendarEntry): string | undefined {
  if (entry.kind === "hold") return "Reserved while the client finishes the booking.";
  if (entry.kind === "block") return "This time stays unavailable until you remove the block.";
  if (entry.tenantId) return "Agency work stays visible here so conflicts are obvious.";
  return undefined;
}

function sourceFor(entry: TalentCalendarEntry): string {
  if (entry.kind === "block") return "Personal block";
  if (entry.tenantId) return "Agency work";
  return "Direct work";
}

export function formatAgendaDate(now: Date = new Date()) {
  return now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function buildAgendaRow(
  entry: TalentCalendarEntry,
  actionLabel?: string,
  onAction?: () => void,
  onOpen?: () => void,
): AgendaRowItem {
  const start = new Date(entry.startsAt);
  const end = new Date(entry.endsAt);
  return {
    id: entry.id,
    timeLabel: entry.allDay
      ? "All day"
      : `${formatTime(start)} - ${formatTime(end)}`,
    durationLabel: entry.allDay ? undefined : formatDuration(start, end),
    title: entry.title,
    person: entry.subLabel ?? undefined,
    whereLabel: entry.allDay ? "Flexible timing" : "Today",
    sourceLabel: sourceFor(entry),
    note: noteFor(entry),
    bookingState: bookingStateFor(entry),
    paymentState: paymentStateFor(entry),
    variant: variantFor(entry),
    action: actionLabel ? { label: actionLabel, onClick: onAction } : undefined,
    onOpen,
  };
}

export function buildTodaySections(
  entries: TalentCalendarEntry[],
  opts?: {
    onOpenAttention?: () => void;
    onOpenCalendar?: () => void;
    onOpenEntry?: (entry: TalentCalendarEntry) => void;
  },
) {
  const now = new Date();
  const futureEntries = [...entries]
    .filter((entry) => new Date(entry.endsAt).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const todayEntries = futureEntries.filter((entry) =>
    sameLocalDay(new Date(entry.startsAt), now),
  );

  const attentionItems: AgendaAttentionItem[] = futureEntries
    .filter((entry) => entry.kind === "hold")
    .slice(0, 3)
    .map((entry) => ({
      ...buildAgendaRow(entry, "Review", opts?.onOpenAttention, () => opts?.onOpenEntry?.(entry)),
      urgencyLabel: "Today",
    }));

  const [nextEntry, ...restEntries] = todayEntries;

  return {
    attentionItems,
    nextUp: nextEntry
      ? buildAgendaRow(
          nextEntry,
          "Open calendar",
          opts?.onOpenCalendar,
          () => opts?.onOpenEntry?.(nextEntry),
        )
      : null,
    restOfToday: restEntries.map((entry) =>
      buildAgendaRow(
        entry,
        "Open calendar",
        opts?.onOpenCalendar,
        () => opts?.onOpenEntry?.(entry),
      ),
    ),
  };
}

/**
 * Builds an AgendaListItem from the Agenda V2 read model (preferred).
 * Includes T2.5 dual timezone when clientTz is set.
 */
export function buildAgendaListItemFromAgendaItem(item: TalentAgendaItem): AgendaListItem {
  const whenLabel = formatDualTimezoneWhen(
    item.startsAt,
    item.endsAt,
    item.tz,
    item.clientTz,
    item.allDay,
  );
  let nowTitle: string | undefined;
  let nowBody: string | undefined;
  let nowTone: AgendaListItem["nowTone"] = "info";
  if (item.booking === "hold") {
    nowTitle = "Calendar hold";
    nowBody = "This slot is reserved while the client completes the booking.";
    nowTone = "warn";
  } else if (item.booking === "confirmed") {
    nowTitle = "Confirmed";
    nowBody = "This booking is confirmed. Mark complete after the work is done.";
    nowTone = "ok";
  } else if (item.booking === "cancelled") {
    nowTitle = "Cancelled";
    nowBody = "This booking was cancelled.";
    nowTone = "risk";
  } else if (item.booking === "requested") {
    nowTitle = "Request";
    nowBody = "Not blocking your time until you accept.";
    nowTone = "warn";
  }
  return {
    id: item.id,
    title: item.title,
    subtitle: item.client?.name,
    who: item.client
      ? {
          name: item.client.name,
          detail: item.managedBy ? "Agency client" : "Client",
          meta: item.managedBy ? ["Agency-managed"] : ["Direct booking"],
        }
      : undefined,
    whenLabel,
    whereLabel: item.where.label || (item.allDay ? "Flexible timing" : "As agreed"),
    sourceLabel: item.managedBy?.name ?? item.source,
    bookingState: item.booking,
    paymentState:
      item.payment === "awaiting"
        ? "awaiting_deposit"
        : item.payment === "checking"
          ? "checking_payment"
          : item.payment === "due"
            ? "due_at_appointment"
            : item.payment === "partial"
              ? "deposit_paid"
              : item.payment === "paid"
                ? "paid"
                : item.payment === "overdue"
                  ? "overdue"
                  : item.payment === "refund_pending"
                    ? "refund_pending"
                    : item.payment === "agency"
                      ? "paid_by_agency"
                      : "not_requested",
    nowTitle,
    nowBody,
    nowTone,
    moneyLines: item.money.totalCents
      ? [
          {
            id: "total",
            label: "Agreed",
            value: `${(item.money.totalCents / 100).toFixed(2)} ${item.money.currency}`.trim(),
          },
        ]
      : [],
    dueCents: item.money.dueCents,
    orderId: item.orderId ?? null,
    startsAtIso: item.startsAt,
    clientTz: item.clientTz,
    talentTz: item.tz,
    tradeSectionPayloads: (() => {
      const out: NonNullable<AgendaListItem["tradeSectionPayloads"]> = [];
      if (item.clientTz && item.clientTz !== item.tz) {
        out.push({
          type: "tz",
          data: {
            localTime: whenLabel.split(" · ")[0] ?? whenLabel,
            clientTime: whenLabel.includes(" · ") ? whenLabel.split(" · ").slice(1).join(" · ") : undefined,
          },
        });
      }
      if (item.tradeSection) {
        const kind = item.tradeSection.kind;
        if (
          kind === "event" ||
          kind === "performance" ||
          kind === "intake" ||
          kind === "tz" ||
          kind === "estimate" ||
          kind === "project"
        ) {
          const data: Record<string, string | number | null | undefined> = {};
          for (const [k, v] of Object.entries(item.tradeSection.payload)) {
            if (typeof v === "string" || typeof v === "number" || v == null) data[k] = v;
            else data[k] = String(v);
          }
          out.push({ type: kind, data });
        }
      }
      return out.length > 0 ? out : undefined;
    })(),
    terms: undefined,
  };
}

/**
 * Builds an AgendaListItem (booking record view-model) from a TalentCalendarEntry.
 * Used by TalentRouter to render the booking-record page when it finds the entry.
 */
export function buildAgendaListItem(entry: TalentCalendarEntry): AgendaListItem {
  const start = new Date(entry.startsAt);
  const end = new Date(entry.endsAt);
  const whenLabel = entry.allDay
    ? "All day"
    : `${formatTime(start)} – ${formatTime(end)}`;
  const bState = bookingStateFor(entry);
  const pState = paymentStateFor(entry);

  let nowTitle: string | undefined;
  let nowBody: string | undefined;
  let nowTone: AgendaListItem["nowTone"] = "info";

  if (entry.kind === "hold") {
    nowTitle = "Calendar hold";
    nowBody = "This slot is reserved while the client completes the booking. It expires if not converted.";
    nowTone = "warn";
  } else if (entry.status === "confirmed") {
    nowTitle = "Confirmed";
    nowBody = "This booking is confirmed. Mark complete after the work is done.";
    nowTone = "ok";
  } else if (entry.status === "cancelled") {
    nowTitle = "Cancelled";
    nowBody = "This booking was cancelled.";
    nowTone = "risk";
  }

  return {
    id: entry.id,
    title: entry.title,
    subtitle: entry.subLabel ?? undefined,
    who: entry.subLabel
      ? {
          name: entry.subLabel,
          detail: entry.kind === "hold" ? "Client on hold" : "Client",
          meta: entry.tenantId ? ["Agency-managed"] : ["Direct booking"],
        }
      : undefined,
    whenLabel,
    whereLabel: entry.allDay ? "Flexible timing" : "As agreed",
    sourceLabel: sourceFor(entry),
    bookingState: bState,
    paymentState: pState,
    nowTitle,
    nowBody,
    nowTone,
    tradeSection: entry.kind === "booking"
      ? {
          title: "Trade details",
          body: "Trade-specific fields land here as the booking intake surfaces expand.",
        }
      : undefined,
    history: [
      {
        at: entry.startsAt,
        label: entry.kind === "hold"
          ? "Hold placed on the calendar."
          : entry.kind === "block"
            ? "Availability block added."
            : `Booking marked ${entry.status ?? "confirmed"}.`,
      },
    ],
  };
}

export function buildAgendaMoneyItems(
  _profile: TalentSelfProfile | null | undefined,
): AgendaMoneyItem[] {
  // Live Today path prefers moneyFromEarnings + todayTotals; this helper is only
  // a safe empty shell when no earnings bridge is present.
  return [
    {
      id: "collected",
      label: "Collected this month",
      value: "—",
      helper: "Appears when payout data is available.",
    },
    {
      id: "owed",
      label: "Still to collect",
      value: "—",
      helper: "Computed from today’s due and overdue on the agenda.",
      tone: "attention",
    },
    {
      id: "payout",
      label: "Next payout",
      value: "—",
      helper: "Appears when card payouts are set up.",
      tone: "success",
    },
  ];
}
