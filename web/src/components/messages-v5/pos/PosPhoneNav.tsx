"use client";

/**
 * PosPhoneNav (L10, board M06 "phone 1") — the counter's phone tab bar:
 * Sale · Orders · Messages · Clients · More, with the Messages badge.
 *
 * SEAM (D-MSG-174): the counter's EXISTING phone navigation is not a bottom
 * bar — below 900px `PosFrame`'s own rail is hidden (`max-[900px]:hidden`,
 * `PosFrame.tsx`) and `PosHeader`'s `portraitMenu` (a dropdown off the mode
 * chip, `pos-client.tsx`) lists `POS_MODE_META.counter.destinations`
 * (`sell/orders/receipts/shifts/issues/messages`) plus the device/connection/
 * display/workspace doors — six-plus items, no "Clients" destination at all.
 * Swapping that dropdown for a literal five-item tab bar reorders navigation
 * for EVERY counter screen, not just Messages, and needs a new `clients`
 * destination `lib/pos/modes.ts` does not have yet — bigger than this lane's
 * scope ("do not modify the shell", one dock component). This draws the bar
 * the mockup specifies, ready to mount in `pos-client.tsx` once that
 * destination exists; it is NOT wired into the counter's real phone chrome
 * yet. Filed for the POS owner.
 *
 * Where it IS live: `PosMessagesDock`'s phone overlay (<900px) shows the
 * "Return to sale" strip on top of the full-screen thread, which is the one
 * piece of M06 this lane owns end to end.
 */

import { Inbox, LayoutGrid, MoreHorizontal, ShoppingBag, Users } from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

import { buildPosDockCopy } from "./pos-copy";

export type PosPhoneNavId = "sale" | "orders" | "messages" | "clients" | "more";

export type PosPhoneNavProps = {
  readonly copy: ReturnType<typeof buildPosDockCopy>;
  readonly active: PosPhoneNavId;
  readonly messagesUnread?: number;
  readonly onSelect: (id: PosPhoneNavId) => void;
};

const ICONS: Readonly<Record<PosPhoneNavId, ComponentType<{ size?: number; strokeWidth?: number }>>> = {
  sale: LayoutGrid,
  orders: ShoppingBag,
  messages: Inbox,
  clients: Users,
  more: MoreHorizontal,
};

export function PosPhoneNav(props: PosPhoneNavProps) {
  const labels: Record<PosPhoneNavId, string> = {
    sale: props.copy.phone.sale,
    orders: props.copy.phone.orders,
    messages: props.copy.phone.messages,
    clients: props.copy.phone.clients,
    more: props.copy.phone.more,
  };
  const order: readonly PosPhoneNavId[] = ["sale", "orders", "messages", "clients", "more"];
  return (
    <nav className="mv5pd-phone-nav" data-pos-phone-nav aria-label={props.copy.phone.messages}>
      {order.map((id) => {
        const Icon = ICONS[id];
        const active = id === props.active;
        const count = id === "messages" ? (props.messagesUnread ?? 0) : 0;
        return (
          <button
            key={id}
            type="button"
            className={cn("mv5pd-phone-nav-item", active && "is-active")}
            data-pos-phone-nav-item={id}
            aria-current={active ? "page" : undefined}
            onClick={() => props.onSelect(id)}
          >
            <Icon size={20} strokeWidth={1.75} />
            <span>{labels[id]}</span>
            {count > 0 ? (
              <span className="mv5pd-phone-nav-count" data-pos-phone-nav-count={id}>
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
