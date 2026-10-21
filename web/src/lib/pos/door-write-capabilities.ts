import type { CapabilityKey } from "@/lib/access";

/**
 * TUL-1708: the capability each Door (POS) WRITE requires, passed to the staff guard itself. The default
 * guard capability is `agency.workspace.view`, which the `viewer` role holds, so a viewer could open a
 * ticket sale, add a line, name a ticket, cancel a sale, or collect cash at the door. Reads (tonight's
 * list, reading an open sale, the tickets issued on an order) keep the default — a viewer may look at
 * the door, just not write to it.
 *
 * `booking.payment.request` is manager+. This file already gated every call at that bar before this fix
 * — its local `staff()` ran a second `userHasCapability("booking.payment.request", ...)` check after a
 * capability-less guard — so moving it into the guard for the writers below is the same bar, not a new
 * one; it also lets the three reads fall back to the (correct, lower) default instead of inheriting it.
 */
export const DOOR_WRITE_CAPABILITY = {
  openTicketSale: "booking.payment.request",
  addTicketLine: "booking.payment.request",
  nameTicket: "booking.payment.request",
  cancelTicketSale: "booking.payment.request",
  collectTicket: "booking.payment.request",
} as const satisfies Record<string, CapabilityKey>;

export type DoorWriteAction = keyof typeof DOOR_WRITE_CAPABILITY;
