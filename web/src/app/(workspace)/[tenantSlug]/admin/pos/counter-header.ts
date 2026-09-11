/**
 * The counter's 64px header, one title and subtitle per destination. Pure:
 * `pos-client.tsx` hands it the screen's state and draws the answer.
 */

import { receiptsSubtitle } from "@/components/admin/pos";
import { interpolate } from "@/i18n/interpolate";

import { formatClock } from "./counter-model";
import type { PosClientProps } from "./counter-props";

export const COUNTER_DESTINATIONS = ["sell", "orders", "receipts", "shifts", "issues", "devices", "connection", "scan"] as const;
export type CounterDestination = (typeof COUNTER_DESTINATIONS)[number];
export function isDestination(value: string): value is CounterDestination {
  return (COUNTER_DESTINATIONS as readonly string[]).includes(value);
}

export function counterHeader(input: {
  destination: CounterDestination;
  props: PosClientProps;
  receiptsDay: "today" | "yesterday" | "week";
  heldCount: number;
  collectOpen: boolean;
  /** The attached customer's name, when one is; the sale's reference otherwise. */
  collectName: string | null;
  reference: string | null;
}): { title: string; subtitle: string } {
  const { props, destination } = input;
  const { copy } = props;
  switch (destination) {
    case "receipts":
      return { title: copy.receipts.title, subtitle: receiptsSubtitle(copy.receipts, props.receipts.filter((r) => input.receiptsDay === "week" || r.dayKey === input.receiptsDay), input.receiptsDay, props.currency) };
    case "shifts":
      return { title: copy.chrome.drawerTitle, subtitle: props.shift ? `${copy.chrome.drawerOpen} · ${formatClock(props.shift.openedAt, props.locale)} · ${props.cashierName}` : `${props.workspaceName} · ${copy.chrome.drawerNone}` };
    case "issues":
      return { title: copy.issues.title, subtitle: copy.issues.subtitle };
    case "devices":
      return { title: copy.devices.title, subtitle: interpolate(copy.devices.subtitle, { location: props.workspaceName }) };
    case "connection":
      return { title: copy.connection.title, subtitle: interpolate(copy.connection.subtitle, { location: props.workspaceName }) };
    case "scan":
      return { title: copy.scanScreen.title, subtitle: copy.scanScreen.ready };
    case "orders":
      return { title: copy.frame.destinationLabels.orders ?? "", subtitle: interpolate(copy.basket.heldSales, { count: input.heldCount }) };
    default:
      return {
        title: input.collectOpen && props.sale ? `${copy.page.collectTitle} · ${input.collectName ?? input.reference}` : copy.modeLabel,
        subtitle: input.reference ? interpolate(copy.chrome.saleSubtitle, { number: input.reference, cashier: props.cashierName }) : interpolate(copy.chrome.newSaleSubtitle, { cashier: props.cashierName }),
      };
  }
}
