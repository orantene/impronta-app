import "server-only";

import { logServerError } from "@/lib/server/safe-error";

import { syncPaymentCardsForRecord } from "./payment-card-sync";

import type { FulfilmentState, PaymentState } from "./lifecycle";

/**
 * S2 / Principle 0: Messages never writes a POS row, and the POS never
 * writes a Messages row by hand either. The one bridge is
 * `messaging_sync_record_state` (migration 20261231255000): a SECURITY
 * DEFINER RPC that reads the record's source table (orders + payment_links,
 * agency_bookings, admissions) and upserts `conversation_records` for every
 * inquiry that record is attached to, with the derived payment / fulfilment
 * state and the record's date.
 *
 * The POS writers call `syncConversationRecord` AFTER their own success. It
 * is additive and non-fatal by contract: it never throws, never changes the
 * caller's result, and logs the failure. Two concurrent syncs of one record
 * converge because the RPC upserts on (tenant_id, inquiry_id, record_kind,
 * record_id) WHERE unlinked_at IS NULL (D-MSG-12).
 */
export const SYNC_RECORD_KINDS = ["order", "appointment", "reservation", "tickets", "class_enrolment"] as const;
export type SyncRecordKind = (typeof SYNC_RECORD_KINDS)[number];

type Admin = {
  /** Optional because several POS writers type their client as `{ from; rpc? }`
   * and their tests inject a `from`-only fake; a client with no `rpc` simply
   * cannot sync and says so without logging. */
  // Method syntax on purpose: it is bivariant in its parameters, so the typed
  // Database client (whose `rpc` takes a union of function names) and the
  // untyped test fakes both satisfy it.
  rpc?(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

export type SyncResult =
  | {
      ok: true;
      linked: number;
      paymentState: PaymentState | null;
      fulfilmentState: FulfilmentState | null;
      recordDate: string | null;
    }
  | { ok: false; reason: "invalid" | "not_found" | "unavailable" };

export async function syncConversationRecord(
  admin: Admin,
  input: { tenantId: string; kind: SyncRecordKind; recordId: string },
): Promise<SyncResult> {
  if (!SYNC_RECORD_KINDS.includes(input.kind) || !input.tenantId || !input.recordId) {
    return { ok: false, reason: "invalid" };
  }
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  try {
    const { data, error } = await admin.rpc("messaging_sync_record_state", {
      p_tenant: input.tenantId,
      p_record_kind: input.kind,
      p_record_id: input.recordId,
    });
    if (error) {
      logServerError("messaging.record-sync", { kind: input.kind, recordId: input.recordId, error });
      return { ok: false, reason: "unavailable" };
    }
    const row = (data ?? null) as {
      ok?: boolean;
      reason?: string;
      linked?: number;
      payment_state?: string | null;
      fulfilment_state?: string | null;
      record_date?: string | null;
    } | null;
    if (!row || row.ok !== true) {
      const reason = row?.reason === "not_found" || row?.reason === "invalid" ? row.reason : "unavailable";
      if (reason === "unavailable") {
        logServerError("messaging.record-sync", { kind: input.kind, recordId: input.recordId, row });
      }
      return { ok: false, reason };
    }
    const paymentState = (row.payment_state ?? null) as PaymentState | null;
    // D-MSG-338: bring the thread's Payment card in line with the chip at the
    // same moment. A failure here is logged inside the helper and never fails
    // the sync: the chip is the record of truth, the card is a mirror.
    await syncPaymentCardsForRecord(admin, {
      tenantId: input.tenantId,
      recordId: input.recordId,
      paymentState,
    });
    return {
      ok: true,
      linked: typeof row.linked === "number" ? row.linked : 0,
      paymentState,
      fulfilmentState: (row.fulfilment_state ?? null) as FulfilmentState | null,
      recordDate: row.record_date ?? null,
    };
  } catch (err) {
    logServerError("messaging.record-sync", err);
    return { ok: false, reason: "unavailable" };
  }
}
