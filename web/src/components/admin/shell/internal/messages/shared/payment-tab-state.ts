/**
 * TUL-536 — the thread Pago tab's resolved state, pure so it is testable.
 *
 * The tab used to show "Cargando..." for as long as the payment read was
 * outstanding, with no ceiling: a server-action call that never settled (it
 * queues behind any other in-flight action and can be dropped across a
 * router refresh, which is exactly what a client payment triggers) left the
 * tab loading forever. `withLoadTimeout` caps the read; `paymentTabView`
 * maps whatever came back to one honest state.
 */
import { depositMoney } from "./deposit-money";

export const PAYMENT_LOAD_TIMEOUT_MS = 15000;

export function withLoadTimeout<T>(p: Promise<T>, ms: number = PAYMENT_LOAD_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("payment_load_timeout")), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e: unknown) => { clearTimeout(timer); reject(e); },
    );
  });
}

export type PaymentTabTxn = {
  status: string;
  provider: string;
  grossAmountCents: number;
  currency: string;
  paidAt: string | null;
  refundedAt: string | null;
  failureReason: string | null;
};

export type PaymentTabInput = {
  loading: boolean;
  failed: boolean;
  state: { bookingId: string | null; transaction: PaymentTabTxn | null } | null;
};

export type PaymentTabKind = "loading" | "error" | "none" | "pending" | "paid" | "failed" | "refunded";

export type PaymentTabView = { kind: PaymentTabKind; label: string; rows: { label: string; value: string }[] };

const COPY = {
  es: {
    loading: "Cargando...", error: "No se pudo cargar el pago", none: "Sin pago todavía",
    pending: "Pago pendiente", paid: "Pagado", failed: "Pago fallido", refunded: "Reembolsado",
    amount: "Monto", date: "Fecha", method: "Método", reason: "Motivo",
    card: "Tarjeta", cash: "Efectivo o fuera de la plataforma", terminal: "Terminal",
  },
  en: {
    loading: "Loading...", error: "Could not load the payment", none: "No payment yet",
    pending: "Payment pending", paid: "Paid", failed: "Payment failed", refunded: "Refunded",
    amount: "Amount", date: "Date", method: "Method", reason: "Reason",
    card: "Card", cash: "Cash or off-platform", terminal: "Terminal",
  },
} as const;

const PAID = new Set(["paid", "payout_pending", "payout_sent"]);

function methodLabel(provider: string, c: (typeof COPY)["es" | "en"]): string {
  if (provider === "stripe") return c.card;
  if (provider === "stripe_terminal" || provider === "mercado_pago_point") return c.terminal;
  return c.cash;
}

function dateLabel(iso: string, locale: "es" | "en"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale === "es" ? "es-MX" : "en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function paymentTabView(input: PaymentTabInput, localeIn: string): PaymentTabView {
  const locale: "es" | "en" = localeIn.startsWith("es") ? "es" : "en";
  const c = COPY[locale];
  if (input.loading) return { kind: "loading", label: c.loading, rows: [] };
  if (input.failed) return { kind: "error", label: c.error, rows: [] };
  const txn = input.state?.transaction ?? null;
  if (!txn || txn.status === "cancelled") return { kind: "none", label: c.none, rows: [] };
  const amount = { label: c.amount, value: depositMoney(txn.grossAmountCents, txn.currency) };
  const method = { label: c.method, value: methodLabel(txn.provider, c) };
  if (txn.status === "refunded") {
    const rows = [amount];
    if (txn.refundedAt) rows.push({ label: c.date, value: dateLabel(txn.refundedAt, locale) });
    rows.push(method);
    return { kind: "refunded", label: c.refunded, rows };
  }
  if (txn.status === "failed") {
    const rows = [amount];
    if (txn.failureReason) rows.push({ label: c.reason, value: txn.failureReason });
    return { kind: "failed", label: c.failed, rows };
  }
  if (PAID.has(txn.status)) {
    const rows = [amount];
    if (txn.paidAt) rows.push({ label: c.date, value: dateLabel(txn.paidAt, locale) });
    rows.push(method);
    return { kind: "paid", label: c.paid, rows };
  }
  return { kind: "pending", label: c.pending, rows: [amount] };
}
