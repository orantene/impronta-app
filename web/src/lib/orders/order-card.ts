/**
 * The order card's view model — pure, no React, no I/O.
 *
 * WHY THIS IS NOT JUST PROPS ON A COMPONENT. Every other chat card in this repo
 * takes its figures as LABEL STRINGS out of `card_payload`: `total_label`,
 * `amount_label`, `deposit_label`. That works while a card describes something
 * immutable, and it is wrong for an order, because an order changes. Staff add
 * a line, a deposit is paid, a line is refunded — and a card holding a copy of
 * the total is a card that disagrees with the order it describes, silently,
 * from the next edit onward.
 *
 * So `card_payload` for an order carries `{ order_id }` and NOTHING ELSE. The
 * card is derived from the order every render. This function is that derivation,
 * kept out of the component so the state machine can be tested without a DOM.
 *
 * D4, as ruled: the internal name is "order" everywhere, and the
 * CUSTOMER-FACING NOUN comes from the words table with a default. A tenant who
 * calls it a quote gets "quote". No noun is hardcoded here — `noun` is passed
 * in, and the fallback exists only so a missing words row renders a word rather
 * than an empty string.
 */

import { formatOrderMoney } from "@/lib/orders/money-format";

export type OrderCardState =
  | "draft"
  | "quoted"
  | "pending_payment"
  | "paid"
  | "fulfilled"
  | "cancelled"
  | "refunded"
  | "partially_refunded";

export type OrderCardTone = "info" | "amber" | "success" | "alert";

/** What the card needs from the order. A subset, so callers select narrowly. */
export type OrderForCard = {
  id: string;
  /**
   * The tenant's word for an order, resolved from the words table at load time.
   *
   * Travels WITH the order rather than through a separate wire, because the two
   * are always needed together and a noun that arrives by a different route is a
   * noun that can go missing on one surface and not another. D4: a tenant who
   * calls it a quote gets "quote", and nothing hardcodes a product noun in a
   * surface a customer reads.
   */
  noun?: string | null;
  status: string;
  currency: string;
  totalCents: number;
  /** What is still to collect, when a deposit was taken. */
  outstandingCents?: number | null;
  lineCount: number;
};

export type OrderCardView = {
  state: OrderCardState;
  tone: OrderCardTone;
  /** e.g. "Order paid" — built from the tenant's noun, never a hardcoded one. */
  title: string;
  /** e.g. "$35.00 · 2 items" */
  meta: string;
  /** Whether the CLIENT should see a pay button. */
  showPayNow: boolean;
  /** Whether STAFF should see the add-a-line affordance. */
  staffCanAddLines: boolean;
  /** Neutral, non-alarming text when the order could not be loaded. */
  unavailable: boolean;
};

const KNOWN_STATES: readonly OrderCardState[] = [
  "draft",
  "quoted",
  "pending_payment",
  "paid",
  "fulfilled",
  "cancelled",
  "refunded",
  "partially_refunded",
];

const TONE: Record<OrderCardState, OrderCardTone> = {
  draft: "info",
  quoted: "amber",
  pending_payment: "amber",
  paid: "success",
  fulfilled: "success",
  cancelled: "alert",
  refunded: "alert",
  partially_refunded: "alert",
};

/** Verb the state reads as, before the noun is applied. */
const READS_AS: Record<OrderCardState, string> = {
  draft: "started",
  quoted: "awaiting approval",
  pending_payment: "to pay",
  paid: "paid",
  fulfilled: "complete",
  cancelled: "cancelled",
  refunded: "refunded",
  partially_refunded: "partly refunded",
};

export function orderCardView(
  order: OrderForCard | null | undefined,
  opts: { viewerRole: "staff" | "client" | "talent"; noun?: string | null },
): OrderCardView {
  // The tenant's word, or a neutral default. Never a hardcoded product noun in
  // a surface a customer reads.
  const noun = (order?.noun ?? opts.noun ?? "").trim() || "Order";

  // An order we could not load renders as ITSELF, not as an error and not as
  // zero. "$0.00" would be a lie a customer might act on; a blank card is
  // merely unhelpful.
  if (!order) {
    return {
      state: "draft",
      tone: "info",
      title: noun,
      meta: "",
      showPayNow: false,
      staffCanAddLines: false,
      unavailable: true,
    };
  }

  const state: OrderCardState = (KNOWN_STATES as readonly string[]).includes(order.status)
    ? (order.status as OrderCardState)
    : "draft";

  const amountCents =
    state === "pending_payment" && typeof order.outstandingCents === "number"
      ? order.outstandingCents
      : order.totalCents;

  const parts = [formatOrderMoney(amountCents, order.currency)];
  if (order.lineCount > 0) {
    parts.push(`${order.lineCount} ${order.lineCount === 1 ? "item" : "items"}`);
  }

  return {
    state,
    tone: TONE[state],
    // Capitalised noun, lowercase state: "Order paid", "Quote awaiting approval".
    title: `${noun} ${READS_AS[state]}`,
    meta: parts.join(" · "),
    // Only the CLIENT ever pays, and only when there is something to pay. Staff
    // seeing a Pay button would let them charge a client's card from the thread.
    showPayNow: opts.viewerRole === "client" && state === "pending_payment" && amountCents > 0,
    // A paid order's lines are settled: adding to one silently changes what the
    // client already agreed to. Staff add lines while it is still a draft or a
    // quote, and a balance goes on a NEW order against the same thread.
    staffCanAddLines: opts.viewerRole === "staff" && (state === "draft" || state === "quoted"),
    unavailable: false,
  };
}

