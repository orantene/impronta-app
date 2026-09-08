/**
 * P4-02 — Mercado Pago Point adapter against the collection interface.
 *
 * Live charges need a merchant Access Token (owner-queued). Without one the
 * adapter reports Point as not landed and refuses terminal creates — same
 * pilot contract as Stripe until credentials exist.
 *
 * Maps Point Orders API (not Payment Intent) onto CollectionAdapter.
 * Store the MP order id (ORD…) on the payment attempt. Tulala `orders`
 * stays the commercial record (L52). Never refund a Stripe payment here.
 */

import { reportTerminalAvailability } from "@/lib/payments/terminal-availability";
import type {
  CollectionAdapter,
  CreatePaymentRequestInput,
  CreatePaymentRequestResult,
  PaymentRequestSnapshot,
  PaymentRequestState,
  TerminalAvailability,
} from "@/lib/payments/collection";

const ORDERS_URL = "https://api.mercadopago.com/v1/orders";
const TERMINALS_URL = "https://api.mercadopago.com/terminals/v1/list";

export type MercadoPagoPointDeps = {
  accessToken?: string | null;
  terminalId?: string | null;
  fetchImpl?: typeof fetch;
};

function amountString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function mapPointOrderStatus(status: string): PaymentRequestState {
  switch (status) {
    case "created":
    case "at_terminal":
    case "action_required":
      return "pending";
    case "processed":
      return "succeeded";
    case "failed":
    case "expired":
      return "failed";
    case "canceled":
      return "cancelled";
    case "refunded":
      return "refunded";
    default:
      return "unknown";
  }
}

export function mercadoPagoPointAdapter(deps: MercadoPagoPointDeps = {}): CollectionAdapter {
  const token = deps.accessToken?.trim() || null;
  const fetchImpl = deps.fetchImpl ?? fetch;

  return {
    async createPaymentRequest(input: CreatePaymentRequestInput): Promise<CreatePaymentRequestResult> {
      if (input.method === "cash") {
        return {
          ok: false,
          reason: "cash_is_recorded",
          error: "Cash is recorded as a payment method, not opened at Mercado Pago.",
        };
      }
      if (input.method !== "terminal" || !token || !deps.terminalId) {
        return {
          ok: false,
          reason: "terminal_unavailable",
          error: "Card-present collection is unavailable until Point lands.",
        };
      }
      const res = await fetchImpl(ORDERS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": `mp_${input.transactionId}`,
        },
        body: JSON.stringify({
          type: "point",
          external_reference: input.transactionId.slice(0, 64),
          transactions: {
            payments: [{ amount: amountString(input.amountCents) }],
          },
          config: { point: { terminal_id: deps.terminalId } },
        }),
      });
      if (!res.ok) {
        return { ok: false, reason: "engine_error", error: "Mercado Pago did not create the Point order." };
      }
      const body = (await res.json()) as { id?: string; status?: string };
      if (!body.id) {
        return { ok: false, reason: "engine_error", error: "Mercado Pago returned no order id." };
      }
      return {
        ok: true,
        requestId: body.id,
        state: mapPointOrderStatus(body.status ?? "created"),
      };
    },
    async retrieveState(requestId) {
      if (!token) {
        return { ok: false as const, error: "Point is not configured." };
      }
      const res = await fetchImpl(`${ORDERS_URL}/${requestId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { ok: false as const, error: "Could not read the Point order." };
      const body = (await res.json()) as {
        id?: string;
        status?: string;
        transactions?: { payments?: Array<{ amount?: string }> };
      };
      const amount = body.transactions?.payments?.[0]?.amount;
      const cents = amount ? Math.round(Number(amount) * 100) : 0;
      return {
        requestId: body.id ?? requestId,
        state: mapPointOrderStatus(body.status ?? ""),
        amountCents: Number.isFinite(cents) ? cents : 0,
        currency: "MXN",
      } satisfies PaymentRequestSnapshot;
    },
    async cancel(requestId) {
      if (!token) return { ok: false as const, error: "Point is not configured." };
      const res = await fetchImpl(`${ORDERS_URL}/${requestId}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Idempotency-Key": `mp_cancel_${requestId}`,
          "x-allow-cancelable-status": "at_terminal",
        },
      });
      if (!res.ok) return { ok: false as const, error: "Could not cancel the Point order." };
      return { ok: true as const };
    },
    async refund(requestId) {
      if (!token) return { ok: false as const, error: "Refund this payment through its original Mercado Pago route." };
      const res = await fetchImpl(`${ORDERS_URL}/${requestId}/refund`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Idempotency-Key": `mp_refund_${requestId}`,
        },
      });
      if (!res.ok) return { ok: false as const, error: "Could not refund the Point order." };
      return { ok: true as const, refundId: `mp_rf_${requestId}` };
    },
    terminalAvailability(): TerminalAvailability {
      if (!token) return reportTerminalAvailability();
      return { available: true, provider: "mercado_pago_point" };
    },
  };
}

/** Used by tests; production listing waits on credentials. */
export async function listPointTerminalsPdv(deps: MercadoPagoPointDeps): Promise<string[]> {
  const token = deps.accessToken?.trim();
  if (!token) return [];
  const fetchImpl = deps.fetchImpl ?? fetch;
  const res = await fetchImpl(TERMINALS_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { terminals?: Array<{ id?: string; operating_mode?: string }> };
  return (body.terminals ?? [])
    .filter((t) => t.operating_mode === "PDV" && t.id)
    .map((t) => t.id as string);
}
