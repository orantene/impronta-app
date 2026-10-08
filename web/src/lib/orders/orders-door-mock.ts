/**
 * Pedidos order-door mock (TUL-434 slice 1) — pure helpers.
 *
 * The interactive accordion lives in the orders page client list. This file
 * owns the rules that must stay testable without a DOM: short codes, deep-link
 * matching, one-open-at-a-time toggle, primary action by status, section
 * defaults, and local-time formatting for the door header.
 */

export type DoorPrimaryAction =
  | "send_pay_link"
  | "collect_pos"
  | "send_receipt"
  | "view_refund"
  | "none";

export type DoorSectionId =
  | "summary"
  | "client"
  | "items"
  | "appointment"
  | "payments"
  | "conversation"
  | "origin"
  | "activity"
  | "notes";

export type DoorSectionDef = {
  readonly id: DoorSectionId;
  /** Resumen and Artículos open by default; the rest start closed. */
  readonly defaultOpen: boolean;
};

export const DOOR_SECTIONS: readonly DoorSectionDef[] = [
  { id: "summary", defaultOpen: true },
  { id: "client", defaultOpen: false },
  { id: "items", defaultOpen: true },
  { id: "appointment", defaultOpen: false },
  { id: "payments", defaultOpen: false },
  { id: "conversation", defaultOpen: false },
  { id: "origin", defaultOpen: false },
  { id: "activity", defaultOpen: false },
  { id: "notes", defaultOpen: false },
] as const;

/** First 8 chars of the order id, uppercased — the desk's public code. */
export function shortOrderCode(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/**
 * Resolve `?order=` to a full order id.
 *
 * Accepts the short code (C365920B) or a full uuid / uuid prefix. Match is
 * case-insensitive on the code. Ambiguous prefixes return null rather than
 * guessing the wrong row.
 */
export function matchOrderFromQuery(
  rows: readonly { id: string }[],
  orderParam: string | null | undefined,
): string | null {
  const raw = (orderParam ?? "").trim();
  if (!raw) return null;
  const needle = raw.toUpperCase();
  const hits = rows.filter((r) => {
    const id = r.id.toUpperCase();
    const code = shortOrderCode(r.id);
    return id === needle || code === needle || id.startsWith(needle);
  });
  return hits.length === 1 ? hits[0]!.id : null;
}

/** Clicking the open row closes it; clicking another opens that one alone. */
export function nextOpenOrderId(current: string | null, clicked: string): string | null {
  return current === clicked ? null : clicked;
}

/**
 * ONE primary action for the door header, by order state + channel.
 * POS pending uses "collect at counter"; other pending uses "send pay link".
 */
export function primaryActionForStatus(
  status: string,
  sourceChannel: string,
): DoorPrimaryAction {
  if (status === "pending_payment") {
    return sourceChannel === "pos" ? "collect_pos" : "send_pay_link";
  }
  if (status === "paid" || status === "fulfilled") return "send_receipt";
  if (status === "cancelled" || status === "refunded" || status === "partially_refunded") {
    return "view_refund";
  }
  return "none";
}

/**
 * Format an ISO timestamp in the workspace's local timezone.
 * Falls back to the runtime default zone when none is supplied.
 */
export function formatDoorLocalTime(
  iso: string,
  locale: string,
  timeZone?: string | null,
): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const loc = locale === "es" || locale === "fr" ? locale : "en";
  try {
    return new Intl.DateTimeFormat(loc, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(ms));
  } catch {
    return new Intl.DateTimeFormat(loc, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ms));
  }
}
