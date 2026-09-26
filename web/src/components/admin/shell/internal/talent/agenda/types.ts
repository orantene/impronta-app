"use client";

export type AgendaBookingState =
  | "requested"
  | "hold"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show"
  | "hold_expired";

export type AgendaPaymentState =
  | "not_requested"
  | "awaiting_deposit"
  | "checking_payment"
  | "due_at_appointment"
  | "deposit_paid"
  | "paid"
  | "overdue"
  | "refund_pending"
  | "paid_by_agency";

export type AgendaRowVariant =
  | "default"
  | "request"
  | "hold"
  | "block"
  | "agency";

export type AgendaAction = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
};

export type AgendaRowItem = {
  id: string;
  timeLabel: string;
  durationLabel?: string;
  title: string;
  person?: string;
  whereLabel?: string;
  sourceLabel?: string;
  note?: string;
  bookingState?: AgendaBookingState;
  paymentState?: AgendaPaymentState;
  countdownTo?: string | number | Date | null;
  variant?: AgendaRowVariant;
  action?: AgendaAction;
  onOpen?: () => void;
};

export type AgendaAttentionItem = AgendaRowItem & {
  urgencyLabel?: string;
};

export type AgendaMoneyItem = {
  id: string;
  label: string;
  value: string;
  helper?: string;
  tone?: "default" | "success" | "attention";
  onClick?: () => void;
};

export type AgendaNowAction = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
};

/** Booking record view-model (T6.1). */
export type AgendaRecordParty = {
  name: string;
  detail?: string;
  meta?: string[];
};

export type AgendaTradeSection = {
  title: string;
  body: string;
};

export type AgendaHistoryLine = {
  at: string;
  label: string;
};

export type AgendaListItem = {
  id: string;
  title: string;
  subtitle?: string;
  who?: AgendaRecordParty;
  whenLabel: string;
  whereLabel: string;
  sourceLabel: string;
  /** ISO start for gating (no-show, etc.). */
  startsAtIso?: string;
  /** ISO end — pre-fills the reschedule sheet. */
  endsAtIso?: string;
  clientTz?: string;
  talentTz?: string;
  bookingState?: AgendaBookingState;
  paymentState?: AgendaPaymentState;
  nowTitle?: string;
  nowBody?: string;
  nowTone?: "info" | "ok" | "warn" | "risk";
  primaryAction?: AgendaNowAction;
  secondaryAction?: AgendaNowAction;
  moneyLines?: AgendaMoneyItem[];
  /** ISO 4217; defaults to MXN in UI when absent. */
  currency?: string;
  dueCents?: number;
  orderId?: string | null;
  /** cash | transfer | other — gates Mark transfer received. */
  paymentMethod?: string | null;
  tradeSection?: AgendaTradeSection;
  /** Structured trade payloads for TradeSections.tsx */
  tradeSectionPayloads?: Array<{
    type: "event" | "performance" | "intake" | "tz" | "estimate" | "project";
    data?: Record<string, string | number | null | undefined>;
  }>;
  history?: AgendaHistoryLine[];
  terms?: string;
};
