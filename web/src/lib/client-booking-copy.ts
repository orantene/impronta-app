/**
 * Client-facing copy for booking status, payment, and dates.
 * Keeps internal DB enums out of user-visible strings where it helps clarity.
 */

const BOOKING_STATUS_CLIENT: Record<string, string> = {
  draft: "Planning",
  tentative: "Pencilled in",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived",
};

const PAYMENT_STATUS_CLIENT: Record<string, string> = {
  unpaid: "Payment pending",
  partial: "Partially paid",
  paid: "Paid in full",
  cancelled: "No charge",
};

const PAYMENT_METHOD_CLIENT: Record<string, string> = {
  cash: "Cash",
  transfer: "Bank transfer",
  other: "Other",
};

export function clientBookingStatusLabel(status: string): string {
  return BOOKING_STATUS_CLIENT[status] ?? status.replace(/_/g, " ");
}

export function clientPaymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_CLIENT[status] ?? status.replace(/_/g, " ");
}

export function clientPaymentMethodLabel(method: string | null | undefined): string | null {
  if (!method || !method.trim()) return null;
  return PAYMENT_METHOD_CLIENT[method] ?? method;
}

/** Short preview for list cards (plain text, no HTML). */
export function truncateClientSummary(text: string | null | undefined, maxLen = 140): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen).trim()}…`;
}

export function formatClientBookingWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatClientEventDateOnly(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr.length >= 10 ? `${dateStr.slice(0, 10)}T12:00:00` : dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Prefer schedule; fall back to event-only date for list context. */
export function clientBookingScheduleSummary(
  startsAt: string | null,
  endsAt: string | null,
  eventDate: string | null,
): string | null {
  if (startsAt) {
    const a = formatClientBookingWhen(startsAt);
    if (endsAt) return `${a} → ${formatClientBookingWhen(endsAt)}`;
    return `Starts ${a}`;
  }
  if (eventDate) {
    const ed = formatClientEventDateOnly(eventDate);
    return ed ? `Event ${ed}` : null;
  }
  return null;
}
