"use client";

/**
 * LinkBookingSheet — C11, `POSLinkBooking`: `Link a booking` / `{customer}
 * · choose what this payment is for`, one radio row per booking with its
 * balance line, `Show paid bookings`, the `AFTER LINKING` card, and `Keep
 * separate · Link only · Link & pay`.
 *
 * WIRED. The rows are `posBookingCandidates` (the customer's appointments
 * and projects with what each still owes, and their tickets); the two
 * forest actions are `posLinkBooking`, and `Link & pay` goes on to the
 * collect screen. A sale with no customer says so and offers the customer
 * sheet; a sale already linked says which booking.
 */

import { cn } from "@/lib/utils";
import { interpolate } from "@/i18n/interpolate";
import { PosSheet } from "./PosSheet";
import { POS_EYEBROW, POS_NOTE, POS_NUM, POS_OUTLINE_ACTION, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION, POS_TOTAL_ROW } from "./pos-classes";
import { formatOrderMoney } from "@/lib/orders/money-format";

export type LinkBookingCandidate = {
  readonly bookingId: string;
  readonly bookingKind: "talent_booking" | "agency_booking" | "admission";
  readonly title: string;
  /** Already formatted for the operator's clock, or null. */
  readonly when: string | null;
  readonly owedCents: number;
  readonly paid: boolean;
  readonly partySize: number | null;
};

export type LinkBookingState =
  | { readonly status: "loading" }
  | { readonly status: "noCustomer" }
  | { readonly status: "unreadable" }
  | { readonly status: "ready"; readonly candidates: readonly LinkBookingCandidate[]; readonly linkedBookingId: string | null };

export type LinkBookingCopy = {
  readonly title: string;
  /** `{customer} · choose what this payment is for` */
  readonly subtitle: string;
  readonly noCustomer: string;
  readonly noCustomerAction: string;
  readonly unreadable: string;
  readonly loading: string;
  readonly none: string;
  readonly showPaid: string;
  /** `Balance {amount} due at visit · this sale's {count} items become extras on the booking` */
  readonly balanceLine: string;
  /** `Nothing to collect · {count} guests` */
  readonly ticketLine: string;
  readonly paidLine: string;
  readonly alreadyLinked: string;
  readonly afterLinking: string;
  readonly bookingBalance: string;
  readonly thisSale: string;
  readonly charge: string;
  readonly keepSeparate: string;
  readonly linkOnly: string;
  /** `Link & pay {amount}` */
  readonly linkAndPay: string;
  readonly linking: string;
  readonly closeLabel: string;
};

export type LinkBookingSheetProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly customerName: string | null;
  readonly saleTotalCents: number;
  readonly saleLineCount: number;
  readonly currency: string;
  readonly state: LinkBookingState;
  readonly selectedId: string | null;
  readonly onSelect: (bookingId: string) => void;
  readonly showPaid: boolean;
  readonly onShowPaidChange: (value: boolean) => void;
  readonly busy: boolean;
  readonly onOpenCustomer: () => void;
  readonly onLinkOnly: () => void;
  readonly onLinkAndPay: () => void;
  readonly copy: LinkBookingCopy;
};

export function LinkBookingSheet(props: LinkBookingSheetProps) {
  const { copy, state } = props;
  const sale = formatOrderMoney(props.saleTotalCents, props.currency);
  const candidates = state.status === "ready" ? state.candidates.filter((c) => props.showPaid || !c.paid) : [];
  const chosen = state.status === "ready" ? (state.candidates.find((c) => c.bookingId === props.selectedId) ?? null) : null;
  const linked = state.status === "ready" ? state.linkedBookingId : null;
  const chargeCents = props.saleTotalCents + (chosen?.owedCents ?? 0);
  const canLink = chosen !== null && linked === null && !props.busy;

  return (
    <PosSheet
      open={props.open}
      name="link-booking"
      title={copy.title}
      subtitle={props.customerName ? interpolate(copy.subtitle, { customer: props.customerName }) : copy.noCustomer}
      closeLabel={copy.closeLabel}
      onClose={props.onClose}
      footerStart={
        <button type="button" onClick={props.onClose} className={POS_SECONDARY_ACTION}>
          {copy.keepSeparate}
        </button>
      }
      footerEnd={
        <>
          <button type="button" data-pos-link-only disabled={!canLink} onClick={props.onLinkOnly} className={POS_OUTLINE_ACTION}>
            {copy.linkOnly}
          </button>
          <button type="button" data-pos-link-and-pay disabled={!canLink} onClick={props.onLinkAndPay} className={POS_PRIMARY_ACTION}>
            {props.busy ? copy.linking : interpolate(copy.linkAndPay, { amount: formatOrderMoney(chargeCents, props.currency) })}
          </button>
        </>
      }
    >
      {state.status === "loading" ? (
        <p role="status" className={POS_NOTE}>
          {copy.loading}
        </p>
      ) : state.status === "unreadable" ? (
        <p role="alert" className={POS_NOTE}>
          {copy.unreadable}
        </p>
      ) : state.status === "noCustomer" ? (
        <div className="flex flex-col gap-3">
          <p role="status" data-pos-booking-no-customer className={POS_NOTE}>
            {copy.noCustomer}
          </p>
          <button type="button" onClick={props.onOpenCustomer} className={cn(POS_OUTLINE_ACTION, "self-start")}>
            {copy.noCustomerAction}
          </button>
        </div>
      ) : (
        <>
          {linked && (
            <p role="status" data-pos-booking-linked className={POS_NOTE}>
              {interpolate(copy.alreadyLinked, { booking: state.candidates.find((c) => c.bookingId === linked)?.title ?? "" })}
            </p>
          )}
          {candidates.length === 0 ? (
            <p role="status" data-pos-booking-none className={cn(POS_NOTE, linked && "mt-3")}>
              {copy.none}
            </p>
          ) : (
            <ul role="radiogroup" aria-label={copy.title} className={cn("m-0 flex list-none flex-col gap-3 p-0", linked && "mt-3")}>
              {candidates.map((c) => {
                const active = c.bookingId === props.selectedId;
                const line =
                  c.bookingKind === "admission"
                    ? interpolate(copy.ticketLine, { count: c.partySize ?? 1 })
                    : c.paid
                      ? copy.paidLine
                      : interpolate(copy.balanceLine, { amount: formatOrderMoney(c.owedCents, props.currency), count: props.saleLineCount });
                return (
                  <li key={c.bookingId}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      data-pos-booking-candidate={c.bookingId}
                      disabled={linked !== null || props.busy}
                      onClick={() => props.onSelect(c.bookingId)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-[14px] border-[1.5px] px-4 py-3.5 text-left transition-colors disabled:cursor-not-allowed",
                        active ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:bg-admin-surface-alt",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                          active ? "border-admin-brand bg-admin-brand" : "border-admin-border-strong bg-admin-card",
                        )}
                      >
                        {active && <span className="h-2 w-2 rounded-full bg-admin-card" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-semibold text-admin-ink">
                          {c.title}
                          {c.when ? ` · ${c.when}` : ""}
                        </span>
                        <span className="block text-[14px] text-admin-ink-muted">{line}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <label className="mt-4 flex items-center gap-2.5 text-[15px] text-admin-ink">
            <input type="checkbox" checked={props.showPaid} onChange={(e) => props.onShowPaidChange(e.target.checked)} className="h-5 w-5 rounded-md border-admin-border accent-admin-brand" />
            {copy.showPaid}
          </label>
        </>
      )}
      <dl className="m-0 mt-4 rounded-[14px] border-[1.5px] border-admin-border px-4 pb-1 pt-3">
        <p className={cn(POS_EYEBROW, "m-0 mb-1")}>{copy.afterLinking}</p>
        <div className={POS_TOTAL_ROW}>
          <dt className="text-admin-ink-muted">{copy.bookingBalance}</dt>
          <dd className={cn("m-0 font-semibold text-admin-ink", POS_NUM)}>{chosen ? formatOrderMoney(chosen.owedCents, props.currency) : "—"}</dd>
        </div>
        <div className={POS_TOTAL_ROW}>
          <dt className="text-admin-ink-muted">{copy.thisSale}</dt>
          <dd className={cn("m-0 font-semibold text-admin-ink", POS_NUM)}>{sale}</dd>
        </div>
        <div className={cn(POS_TOTAL_ROW, "border-b-0")}>
          <dt className="font-bold text-admin-ink">{copy.charge}</dt>
          <dd data-pos-booking-charge className={cn("m-0 font-bold text-admin-ink", POS_NUM)}>
            {formatOrderMoney(chargeCents, props.currency)}
          </dd>
        </div>
      </dl>
    </PosSheet>
  );
}
