/**
 * lib/payments/webhook-v2.ts
 *
 * Handler for Stripe **v2 thin events** (Global Payouts). When an OutboundPayment
 * changes state, Stripe sends a thin event ({ type, related_object: { id } }) to
 * our v2 event destination; we verify it, fetch the full OutboundPayment for its
 * status, and reconcile the `booking_payouts` ledger leg (keyed by
 * `stripe_transfer_id` = the OutboundPayment id), then re-sync the booking's
 * payout_lifecycle.
 *
 * The fan-out (disburse) records a GP leg as 'transferred' optimistically when
 * the OutboundPayment is created (processing/posted); this webhook flips it to
 * 'failed' if it later fails/returns — so held/retry + talent-paid status stay
 * accurate. Server-only.
 */

import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { syncBookingPayoutLifecycle } from "./booking-payouts-ledger";
import { getOutboundPayment, outboundPaymentLedgerStatus, type OutboundPaymentStatus } from "./global-payouts";

/** Verify a Stripe signature header (`t=…,v1=…`) over the raw body. Works for
 *  v2 thin events (same HMAC-SHA256 scheme as v1). Constant-time compare. */
export function verifyStripeSignature(
  rawBody: string,
  sigHeader: string | null,
  secret: string,
  opts?: { toleranceSec?: number; nowSec?: number },
): { ok: true } | { ok: false; error: string } {
  if (!sigHeader) return { ok: false, error: "missing signature" };
  const parts: Record<string, string> = {};
  for (const kv of sigHeader.split(",")) {
    const idx = kv.indexOf("=");
    if (idx > 0) parts[kv.slice(0, idx).trim()] = kv.slice(idx + 1).trim();
  }
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return { ok: false, error: "malformed signature header" };

  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "signature mismatch" };
  }
  const tolerance = opts?.toleranceSec ?? 300;
  const now = opts?.nowSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(Number(t)) || Math.abs(now - Number(t)) > tolerance) {
    return { ok: false, error: "timestamp outside tolerance" };
  }
  return { ok: true };
}

export type StripeThinEvent = {
  id?: string;
  type: string;
  related_object?: { id: string; type?: string; url?: string } | null;
};

export type OutboundPaymentEvent = {
  type: string;
  outboundPaymentId: string;
  status: OutboundPaymentStatus;
};

export type ApplyResult =
  | { ok: true; action: "transferred" | "failed" | "noop"; bookingId?: string; legId?: string }
  | { ok: false; error: string };

export type ApplyDeps = { sb?: SupabaseClient | null };

/**
 * Reconcile a single OutboundPayment status change into the booking_payouts
 * ledger. Idempotent; never downgrades a 'reversed' leg; re-syncs payout_lifecycle.
 */
export async function applyOutboundPaymentEvent(
  event: OutboundPaymentEvent,
  deps: ApplyDeps = {},
): Promise<ApplyResult> {
  const sb = deps.sb ?? createServiceRoleClient();
  if (!sb) return { ok: false, error: "no db client" };

  const ledger = outboundPaymentLedgerStatus(event.status); // transferred | failed | held
  if (ledger === "held") return { ok: true, action: "noop" }; // intermediate state — wait for terminal

  try {
    const { data: leg } = await sb
      .from("booking_payouts")
      .select("id, booking_id, status, attempts")
      .eq("stripe_transfer_id", event.outboundPaymentId)
      .maybeSingle();
    if (!leg) return { ok: true, action: "noop" }; // not one of our payouts (or not recorded yet)

    const bookingId = leg.booking_id as string;
    const legId = leg.id as string;
    const current = leg.status as string;

    // Idempotent / safety: already terminal, or reversed (never downgrade).
    if (current === "reversed") return { ok: true, action: "noop", bookingId, legId };
    if (ledger === "transferred" && current === "transferred") return { ok: true, action: "noop", bookingId, legId };
    if (ledger === "failed" && current === "failed") return { ok: true, action: "noop", bookingId, legId };

    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: ledger,
      attempts: ((leg.attempts as number) ?? 0) + 1,
      updated_at: nowIso,
    };
    if (ledger === "transferred") {
      patch.transferred_at = nowIso;
      patch.last_error = null;
    } else {
      patch.last_error = `outbound payment ${event.status}`;
    }

    await sb.from("booking_payouts").update(patch).eq("id", legId);
    await syncBookingPayoutLifecycle(sb, bookingId);
    return { ok: true, action: ledger === "transferred" ? "transferred" : "failed", bookingId, legId };
  } catch (err) {
    logServerError(`webhook-v2.applyOutboundPayment[${event.outboundPaymentId}]`, err);
    return { ok: false, error: err instanceof Error ? err.message : "apply failed" };
  }
}

export type ProcessDeps = {
  sb?: SupabaseClient | null;
  /** Injected status fetch (tests). Defaults to the real getOutboundPayment. */
  fetchOutboundPayment?: (id: string) => Promise<{ status: OutboundPaymentStatus } | null>;
};

export type ProcessResult = ApplyResult | { ok: true; action: "ignored" };

/**
 * Dispatch a parsed v2 thin event. Only `…outbound_payment…` events are acted
 * on; the rest are ignored. Thin events carry no status, so we fetch the full
 * OutboundPayment, then reconcile the ledger.
 */
export async function processStripeV2ThinEvent(
  evt: StripeThinEvent,
  deps: ProcessDeps = {},
): Promise<ProcessResult> {
  if (!evt.type || !evt.type.includes("outbound_payment")) {
    return { ok: true, action: "ignored" };
  }
  const id = evt.related_object?.id;
  if (!id) return { ok: false, error: "thin event missing related_object.id" };

  const fetchFn =
    deps.fetchOutboundPayment ??
    (async (oid: string) => {
      const r = await getOutboundPayment(oid);
      return r.ok ? { status: r.data.status } : null;
    });

  const op = await fetchFn(id);
  if (!op) return { ok: false, error: "could not fetch outbound payment" };

  return applyOutboundPaymentEvent({ type: evt.type, outboundPaymentId: id, status: op.status }, { sb: deps.sb });
}
