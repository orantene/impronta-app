"use client";

/**
 * LinkBookingSheet — C11, `POSLinkBooking`: `Link a booking` / `{customer}
 * · choose what this payment is for`, one radio row per booking with its
 * balance line, `Show paid bookings`, the `AFTER LINKING` card, and `Keep
 * separate · Link only · Link & pay`.
 *
 * NOT WIRED. The counter has no reader for a customer's open bookings and no
 * command that attaches a sale to one (`orders` carries no booking link on
 * the POS path), so the sheet draws the board's frame with an empty list, a
 * sentence saying why, and `Keep separate` as the only live action (D-POS-23).
 * The two forest actions are disabled so nothing on this sheet can look like
 * it links when it cannot.
 */

import { cn } from "@/lib/utils";
import { PosSheet } from "./PosSheet";
import { POS_EYEBROW, POS_NOTE, POS_NUM, POS_OUTLINE_ACTION, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION, POS_TOTAL_ROW } from "./pos-classes";
import { formatOrderMoney } from "@/lib/orders/money-format";

export type LinkBookingCopy = {
  readonly title: string;
  /** `{customer} · choose what this payment is for` */
  readonly subtitle: string;
  readonly noCustomer: string;
  readonly unavailable: string;
  readonly showPaid: string;
  readonly afterLinking: string;
  readonly bookingBalance: string;
  readonly thisSale: string;
  readonly charge: string;
  readonly keepSeparate: string;
  readonly linkOnly: string;
  readonly linkAndPay: string;
  readonly closeLabel: string;
};

export type LinkBookingSheetProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly customerName: string | null;
  readonly saleTotalCents: number;
  readonly currency: string;
  readonly copy: LinkBookingCopy;
};

export function LinkBookingSheet(props: LinkBookingSheetProps) {
  const { copy } = props;
  const sale = formatOrderMoney(props.saleTotalCents, props.currency);
  return (
    <PosSheet
      open={props.open}
      name="link-booking"
      title={copy.title}
      subtitle={props.customerName ? copy.subtitle.replace("{customer}", props.customerName) : copy.noCustomer}
      closeLabel={copy.closeLabel}
      onClose={props.onClose}
      footerStart={
        <button type="button" onClick={props.onClose} className={POS_SECONDARY_ACTION}>
          {copy.keepSeparate}
        </button>
      }
      footerEnd={
        <>
          <button type="button" disabled title={copy.unavailable} className={POS_OUTLINE_ACTION}>
            {copy.linkOnly}
          </button>
          <button type="button" disabled title={copy.unavailable} className={POS_PRIMARY_ACTION}>
            {copy.linkAndPay}
          </button>
        </>
      }
    >
      <p role="status" data-pos-booking-unavailable className={POS_NOTE}>
        {copy.unavailable}
      </p>
      <label className="mt-4 flex items-center gap-2.5 text-[15px] text-admin-ink-dim">
        <input type="checkbox" disabled className="h-5 w-5 rounded-md border-admin-border" />
        {copy.showPaid}
      </label>
      <dl className="m-0 mt-4 rounded-[14px] border-[1.5px] border-admin-border px-4 pb-1 pt-3">
        <p className={cn(POS_EYEBROW, "m-0 mb-1")}>{copy.afterLinking}</p>
        <div className={POS_TOTAL_ROW}>
          <dt className="text-admin-ink-muted">{copy.bookingBalance}</dt>
          <dd className={cn("m-0 font-semibold text-admin-ink", POS_NUM)}>—</dd>
        </div>
        <div className={POS_TOTAL_ROW}>
          <dt className="text-admin-ink-muted">{copy.thisSale}</dt>
          <dd className={cn("m-0 font-semibold text-admin-ink", POS_NUM)}>{sale}</dd>
        </div>
        <div className={cn(POS_TOTAL_ROW, "border-b-0")}>
          <dt className="font-bold text-admin-ink">{copy.charge}</dt>
          <dd className={cn("m-0 font-bold text-admin-ink", POS_NUM)}>{sale}</dd>
        </div>
      </dl>
    </PosSheet>
  );
}
