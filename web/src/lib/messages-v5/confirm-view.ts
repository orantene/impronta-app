/**
 * L8 (D-MSG-150, board D19, M09 phone 2, D08 "Confirm order"): the pure view
 * helpers behind `ConfirmRecordSheet` / `ConfirmOrderButton`. Nothing here
 * reads a database or writes anything; the writer is S3's
 * `messagingConfirmRecord` (`lib/server-actions/messaging-confirm.ts`).
 *
 * SEAM (D-MSG-151): the sheet's source picker needs to know which accepted
 * offer or draft order is a live candidate. It is built from two things the
 * shell already carries without a new round trip - `RecordChip[]` (S2) and
 * `OfferRow[]` (S3's own `loadInquiryOffers`, already exposed as the server
 * action `messagingLoadOffers`) - rather than re-deriving offer/order status
 * from scratch here.
 *
 * SEAM (D-MSG-152): the deposit gate this file computes is a CLIENT-SIDE
 * PREVIEW only, read from `RecordChip.paymentState` (S2). It is not the
 * authoritative rule: `confirmRecord` reads the offer's own
 * `deposit_pct` / `deposit_amount_cents` (or the draft's offering
 * `reserve_mode`) server-side and is the only thing that can refuse
 * `deposit_required`. A chip with no payment signal at all renders `due:
 * false` (never a false block); if the server disagrees, its
 * `deposit_required` refusal still opens the override field reactively.
 * `CONFIRM_OVERRIDE_MIN_CHARS` mirrors the constant of the same name
 * exported by `lib/messaging/confirm.ts` (a `"server-only"` module this file
 * must not import); keep the two in sync by hand if either changes.
 *
 * SEAM (D-MSG-153): the "Checked just now" list. `buildConfirmPlan` (S3,
 * `lib/messaging/confirm-plan.ts`) is pure and importable here, but
 * `runConfirmChecks` needs the calendar-busy and capacity-remaining readers,
 * which are server-only (`defaultReaders` in `lib/messaging/confirm.ts`,
 * not exported, and rightly so - they take a service-role Supabase client).
 * Rather than re-implement those readers in a client file, this sheet shows
 * WHAT WILL BE CHECKED (people / resources & seats, from the source kind),
 * each row copy is "will be checked on confirm" - never a fake ✓ this file
 * cannot back up. The real check is `messagingConfirmRecord`'s: a click that
 * finds a conflict returns `{ ok: false, reason: "unavailable", conflicts }`
 * and the sheet renders every `ConfirmConflict.why` sentence the engine
 * already built ("<line> is no longer free on <date>"), unchanged.
 */

import type { OfferRow } from "@/lib/messaging/sheets";
import type { RecordChip } from "@/lib/messaging/types";

export type ConfirmSourceKind = "offer" | "draft";

export type ConfirmSourceOption = {
  readonly source: ConfirmSourceKind;
  /** The offer id (source "offer") or the order id (source "draft"). */
  readonly id: string;
  readonly label: string;
  readonly version: number | null;
  readonly totalCents: number | null;
  readonly paymentState: string | null;
};

const ORDER_ALREADY_CONFIRMED_FULFILMENT = new Set(["preparing", "ready", "fulfilled", "seated", "checked_in"]);

/**
 * D-MSG-150: the source picker's rows.
 *   - every ACCEPTED offer (`OfferRow.status === "accepted"`), newest first
 *     (the caller's `offers` order, unchanged)
 *   - every `order` chip that does not already read as confirmed/paid/done
 *     (an order already past draft is not "confirm this draft" anymore -
 *     `confirmRecord` would answer `already` for it)
 * A cancelled offer, a declined one, or an order chip already `paid` never
 * appears: showing it as confirmable would be a dead choice.
 */
export function confirmSourceOptions(chips: readonly RecordChip[], offers: readonly OfferRow[]): ConfirmSourceOption[] {
  const options: ConfirmSourceOption[] = [];
  for (const offer of offers) {
    if (offer.status !== "accepted") continue;
    const chip = chips.find((c) => c.kind === "offer" && c.recordId === offer.id) ?? null;
    options.push({
      source: "offer",
      id: offer.id,
      label: `v${offer.version}`,
      version: offer.version,
      totalCents: Math.round(offer.totalClientPrice * 100),
      paymentState: chip?.paymentState ?? null,
    });
  }
  for (const chip of chips) {
    if (chip.kind !== "order") continue;
    if (chip.paymentState === "paid") continue;
    if (chip.fulfilmentState && ORDER_ALREADY_CONFIRMED_FULFILMENT.has(chip.fulfilmentState)) continue;
    options.push({ source: "draft", id: chip.recordId, label: chip.label, version: null, totalCents: null, paymentState: chip.paymentState });
  }
  return options;
}

export type DepositGate = {
  /** A deposit reads as owed on this option, from the chip's payment signal alone. */
  readonly due: boolean;
  /** The chip already reads `paid` or `deposit_paid`. */
  readonly paid: boolean;
  /** `due && !paid`: the primary button is blocked until an override reason is typed. */
  readonly needsOverride: boolean;
};

/**
 * D-MSG-152: a preview only, see the file header. `option` is the row from
 * `confirmSourceOptions` the person picked; `null` (nothing picked yet)
 * reads as no gate.
 */
export function depositGate(option: ConfirmSourceOption | null): DepositGate {
  if (!option) return { due: false, paid: false, needsOverride: false };
  const paid = option.paymentState === "paid" || option.paymentState === "deposit_paid";
  const due = option.paymentState != null;
  return { due, paid, needsOverride: due && !paid };
}

/** Mirrors `lib/messaging/confirm.ts`'s `CONFIRM_OVERRIDE_MIN_CHARS` (D-MSG-152). */
export const CONFIRM_OVERRIDE_MIN_CHARS = 8;

export function overrideReasonValid(reason: string): boolean {
  return reason.trim().length >= CONFIRM_OVERRIDE_MIN_CHARS;
}

export type CreatedItemKey =
  | "project"
  | "assignments"
  | "calendar_blocks"
  | "balance_reminder"
  | "client_confirmation"
  | "order"
  | "kitchen_ticket"
  | "receipt";

/**
 * D-MSG-150: "What gets created" (board D19). An offer with no talent line
 * (a venue-only or menu-only offer) still creates a project, a balance
 * reminder and a client confirmation, just no calendar/assignment rows -
 * `hasPeople` decides that from the plan's lines, never guessed.
 */
export function createdListFor(source: ConfirmSourceKind, hasPeople: boolean): readonly CreatedItemKey[] {
  if (source === "draft") return ["order", "kitchen_ticket", "receipt"];
  return hasPeople
    ? ["project", "assignments", "calendar_blocks", "balance_reminder", "client_confirmation"]
    : ["project", "balance_reminder", "client_confirmation"];
}

export type CheckedCategory = "people" | "resources";

/** D-MSG-153: what a confirm of this source rechecks, by kind only (see file header). */
export function checkedCategoriesFor(source: ConfirmSourceKind): readonly CheckedCategory[] {
  return source === "draft" ? ["resources"] : ["people", "resources"];
}
