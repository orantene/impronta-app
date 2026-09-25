/**
 * TalentAgendaItem — the only shape the four Agenda V2 screens read.
 */

export type BookingState =
  | "requested"
  | "hold"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show"
  | "hold_expired";

export type PaymentState =
  | "none"
  | "awaiting"
  | "checking"
  | "due"
  | "partial"
  | "paid"
  | "overdue"
  | "refund_pending"
  | "agency";

export type Source = "website" | "tulala" | "manual" | "agency";

export type ItemKind = "booking" | "request" | "hold" | "block" | "deadline" | "project";

export type TradeSectionKind =
  | "event"
  | "performance"
  | "intake"
  | "tz"
  | "estimate"
  | "project";

export interface TalentAgendaClient {
  id?: string;
  name: string;
  initials: string;
  phone?: string;
  email?: string;
  noShows?: number;
}

export interface TalentAgendaMoney {
  totalCents: number;
  paidCents: number;
  depositCents?: number;
  dueCents: number;
  currency: string;
}

export interface TalentAgendaItem {
  id: string;
  kind: ItemKind;
  ref: { table: string; id: string };
  client?: TalentAgendaClient;
  title: string;
  lines: { label: string; cents: number }[];
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  tz: string;
  clientTz?: string;
  where: {
    mode: "studio" | "client_home" | "away" | "online";
    label: string;
    travelMin?: number;
  };
  bufferAfterMin: number;
  booking: BookingState;
  payment: PaymentState;
  money: TalentAgendaMoney;
  source: Source;
  managedBy?: { agencyId: string; name: string };
  holdUntil?: string;
  blocksTime: boolean;
  /** Linked POS/order for payment links; absent when booking has no order shell. */
  orderId?: string;
  /** agency_bookings.payment_method when present (cash | transfer | other). */
  paymentMethod?: string | null;
  tradeSection?: { kind: TradeSectionKind; payload: Record<string, unknown> };
  history: { at: string; text: string }[];
}

export type TalentAgendaRange = { from: Date; to: Date };

export type TalentAgendaLoadResult = {
  items: TalentAgendaItem[];
  hours: import("@/lib/scheduling/hours-types").BookingHours | null;
};
