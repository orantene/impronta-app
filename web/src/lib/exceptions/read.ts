import "server-only";

/**
 * read.ts — gather the six sources into one queue.
 *
 * SIX READS, NOT ONE VIEW. A SQL view over all six was the obvious shape and
 * is the wrong one: `admissions_mint_shortfall` is already a view over a join,
 * `booking_transactions` scopes on `source_tenant_id` rather than `tenant_id`,
 * and the severity rules are judgment that belongs in reviewable, testable
 * TypeScript rather than in a CASE expression nobody will ever read again. A
 * view would also make every future source a migration.
 *
 * A FAILED SOURCE IS NAMED, NOT SWALLOWED. Each read reports itself, and the
 * caller is told which sections could not be loaded. The alternative — catch,
 * return `[]`, render "nothing is wrong" — is the precise failure mode an
 * exceptions inbox exists to eliminate, and it would be a particularly cruel
 * place to reproduce it.
 *
 * EVERY READ IS TENANT-SCOPED IN THE APPLICATION LAYER. This runs under the
 * service role for `outbox_messages` (which has no staff policy at all), so
 * RLS is not the guard here — the `.eq` is.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { paymentRequestIdFromMetadata } from "@/lib/pos/collection-reservations";
import {
  classifyEngineEffect,
  classifyMintShortfall,
  classifyOutboxDead,
  classifyRefundIntent,
  classifyStaleCommandClaim,
  classifyUnresolvedCollection,
  sortExceptions,
  summariseExceptions,
  type ExceptionRow,
  type ExceptionSummary,
} from "./model";

type Admin = SupabaseClient;

export type ExceptionsLoad = {
  rows: ExceptionRow[];
  summary: ExceptionSummary;
  /**
   * Sources that could not be read. Non-empty means the queue on screen is
   * INCOMPLETE, and the screen has to say so — a short list that looks
   * complete is worse than an error.
   */
  unavailable: string[];
};

function orderHref(tenantSlug: string, orderId: string | null): string | null {
  if (!orderId) return null;
  // The Orders desk searches ids by prefix, which is what staff have when a
  // customer reads a number off a receipt.
  return `/${tenantSlug}/admin/orders?q=${encodeURIComponent(orderId)}`;
}

function inquiryHref(tenantSlug: string, inquiryId: string): string {
  return `/${tenantSlug}/admin/messages?inquiry=${encodeURIComponent(inquiryId)}`;
}

async function readRefundIntents(
  admin: Admin,
  tenantId: string,
  tenantSlug: string,
  now: number,
): Promise<ExceptionRow[] | null> {
  const { data, error } = await admin
    .from("ticket_refund_intents")
    .select("id, order_id, reason, created_at, claimed_at, executed_at, result, attempts")
    .eq("tenant_id", tenantId)
    // Executed-and-clean rows are not exceptions, and there will eventually be
    // far more of them than of anything else here.
    .or("executed_at.is.null,result.eq.partial_failure")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    logServerError("exceptions/read.refundIntents", error);
    return null;
  }
  const rows: ExceptionRow[] = [];
  for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
    const row = classifyRefundIntent(
      {
        id: String(raw.id),
        orderId: String(raw.order_id ?? ""),
        reason: String(raw.reason ?? ""),
        createdAt: String(raw.created_at),
        claimedAt: raw.claimed_at ? String(raw.claimed_at) : null,
        executedAt: raw.executed_at ? String(raw.executed_at) : null,
        result: raw.result ? String(raw.result) : null,
        attempts: Number(raw.attempts ?? 0),
      },
      now,
      orderHref(tenantSlug, raw.order_id ? String(raw.order_id) : null),
    );
    if (row) rows.push(row);
  }
  return rows;
}

async function readMintShortfall(
  admin: Admin,
  tenantId: string,
  tenantSlug: string,
): Promise<ExceptionRow[] | null> {
  const { data, error } = await admin
    .from("admissions_mint_shortfall")
    .select("order_line_id, order_id, expected_rows, minted_rows, missing_rows, order_updated_at")
    .eq("tenant_id", tenantId)
    .order("order_updated_at", { ascending: true })
    .limit(200);
  if (error) {
    logServerError("exceptions/read.mintShortfall", error);
    return null;
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((raw) =>
    classifyMintShortfall(
      {
        orderLineId: String(raw.order_line_id),
        orderId: String(raw.order_id ?? ""),
        expectedRows: Number(raw.expected_rows ?? 0),
        mintedRows: Number(raw.minted_rows ?? 0),
        missingRows: Number(raw.missing_rows ?? 0),
        orderUpdatedAt: String(raw.order_updated_at),
      },
      orderHref(tenantSlug, raw.order_id ? String(raw.order_id) : null),
    ),
  );
}

async function readEngineEffects(
  admin: Admin,
  tenantId: string,
  tenantSlug: string,
): Promise<ExceptionRow[] | null> {
  const { data, error } = await admin
    .from("failed_engine_effects")
    .select("id, inquiry_id, listener_name, engine_action, priority, attempt_count, created_at, retried_at")
    .eq("tenant_id", tenantId)
    .eq("resolved", false)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    logServerError("exceptions/read.engineEffects", error);
    return null;
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((raw) =>
    classifyEngineEffect(
      {
        id: String(raw.id),
        inquiryId: String(raw.inquiry_id ?? ""),
        listenerName: String(raw.listener_name ?? ""),
        engineAction: String(raw.engine_action ?? ""),
        priority: String(raw.priority ?? "medium"),
        attemptCount: Number(raw.attempt_count ?? 0),
        createdAt: String(raw.created_at),
        retriedAt: raw.retried_at ? String(raw.retried_at) : null,
      },
      raw.inquiry_id ? inquiryHref(tenantSlug, String(raw.inquiry_id)) : null,
    ),
  );
}

async function readUnresolvedCollections(
  admin: Admin,
  tenantId: string,
  tenantSlug: string,
  now: number,
): Promise<ExceptionRow[] | null> {
  // `source_tenant_id`, not `tenant_id`: this table predates the tenant column
  // convention and carries the workspace that took the money under its own
  // name. Scoping on the wrong column here would read every workspace's tills.
  const { data, error } = await admin
    .from("booking_transactions")
    .select("id, order_id, gross_amount_cents, currency, requested_at, created_at, metadata")
    .eq("source_tenant_id", tenantId)
    .eq("status", "payment_requested")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    logServerError("exceptions/read.unresolvedCollections", error);
    return null;
  }

  const transactions = (data ?? []) as Array<Record<string, unknown>>;

  // WHAT THE WORKER HAS ALREADY TRIED. Without this the row can only say "no
  // result was recorded", which is exactly as true after six failed lookups as
  // before the first, and an operator reading it has no way to tell a payment
  // nobody has asked about from one the provider will not answer for. A failed
  // read here is NOT a failed section: the exception is still real and still
  // worth showing, so the attempt history degrades to absent rather than
  // taking the whole queue down with it.
  const recoveries = new Map<string, { attempts: number; lastState: string | null; lastAt: string | null }>();
  if (transactions.length > 0) {
    const { data: recoveryRows, error: rErr } = await admin
      .from("pos_collection_recoveries")
      .select("transaction_id, attempts, last_state, updated_at")
      .in("transaction_id", transactions.map((t) => String(t.id)));
    if (rErr) logServerError("exceptions/read.collectionRecoveries", rErr);
    for (const raw of (recoveryRows ?? []) as Array<Record<string, unknown>>) {
      recoveries.set(String(raw.transaction_id), {
        attempts: Number(raw.attempts ?? 0),
        lastState: raw.last_state ? String(raw.last_state) : null,
        lastAt: raw.updated_at ? String(raw.updated_at) : null,
      });
    }
  }

  const rows: ExceptionRow[] = [];
  for (const raw of transactions) {
    const recovery = recoveries.get(String(raw.id));
    const row = classifyUnresolvedCollection(
      {
        transactionId: String(raw.id),
        orderId: raw.order_id ? String(raw.order_id) : null,
        grossAmountCents: Number(raw.gross_amount_cents ?? 0),
        currency: String(raw.currency ?? "eur"),
        // `requested_at` is the moment the reader was asked. It is nullable on
        // older rows, where `created_at` is the same instant for this status.
        requestedAt: String(raw.requested_at ?? raw.created_at),
        providerRequestId: paymentRequestIdFromMetadata(raw.metadata),
        recoveryAttempts: recovery?.attempts ?? 0,
        lastRecoveryState: recovery?.lastState ?? null,
        lastRecoveryAt: recovery?.lastAt ?? null,
      },
      now,
      orderHref(tenantSlug, raw.order_id ? String(raw.order_id) : null),
    );
    if (row) rows.push(row);
  }
  return rows;
}

async function readDeadOutbox(admin: Admin, tenantId: string): Promise<ExceptionRow[] | null> {
  const { data, error } = await admin
    .from("outbox_messages")
    .select("id, topic, attempt_count, created_at, last_error")
    .eq("tenant_id", tenantId)
    .eq("status", "dead")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    logServerError("exceptions/read.deadOutbox", error);
    return null;
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((raw) =>
    classifyOutboxDead({
      id: String(raw.id),
      topic: String(raw.topic ?? ""),
      attemptCount: Number(raw.attempt_count ?? 0),
      createdAt: String(raw.created_at),
      lastError: raw.last_error ? String(raw.last_error) : null,
    }),
  );
}

/**
 * Idempotency claims whose owner stopped answering.
 *
 * A NULL lease is treated as expired, and that is not an oversight. Rows
 * written by the pre-lease runner carry no liveness signal at all, so an
 * in-flight one is either abandoned or belongs to a deploy that is already
 * gone. Excluding them would hide exactly the crashes this source exists to
 * surface, and `.lte` alone excludes NULL silently.
 */
async function readStaleCommandClaims(
  admin: Admin,
  tenantId: string,
  now: number,
): Promise<ExceptionRow[] | null> {
  const cutoff = new Date(now).toISOString();
  const { data, error } = await admin
    .from("command_idempotency")
    .select("id, command, attempt_count, created_at, lease_expires_at")
    .eq("tenant_id", tenantId)
    .eq("status", "in_flight")
    .or(`lease_expires_at.is.null,lease_expires_at.lte.${cutoff}`)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    logServerError("exceptions/read.staleCommandClaims", error);
    return null;
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((raw) =>
    classifyStaleCommandClaim(
      {
        id: String(raw.id),
        command: String(raw.command ?? "a command"),
        attempts: Number(raw.attempt_count ?? 0),
        createdAt: String(raw.created_at),
        leaseExpiresAt: raw.lease_expires_at ? String(raw.lease_expires_at) : null,
      },
      // No href: a claim names a command, not a row on a screen. Sending an
      // operator to a page that cannot show them the effect would be worse
      // than sending them nowhere.
      null,
    ),
  );
}

/**
 * Read every source concurrently and merge.
 *
 * `Promise.all` and not a sequence: six independent reads that each take a
 * round trip turn a page load into half a second of nothing for no reason, and
 * none of them depends on another's answer.
 */
export async function loadExceptions(
  admin: Admin,
  input: { tenantId: string; tenantSlug: string; now?: number },
): Promise<ExceptionsLoad> {
  const now = input.now ?? Date.now();
  const [refunds, shortfall, effects, collections, dead, claims] = await Promise.all([
    readRefundIntents(admin, input.tenantId, input.tenantSlug, now),
    readMintShortfall(admin, input.tenantId, input.tenantSlug),
    readEngineEffects(admin, input.tenantId, input.tenantSlug),
    readUnresolvedCollections(admin, input.tenantId, input.tenantSlug, now),
    readDeadOutbox(admin, input.tenantId),
    readStaleCommandClaims(admin, input.tenantId, now),
  ]);

  const named: Array<[string, ExceptionRow[] | null]> = [
    ["Refunds", refunds],
    ["Tickets", shortfall],
    ["Inquiries", effects],
    ["Card payments", collections],
    ["Background jobs", dead],
    ["Commands", claims],
  ];

  const rows: ExceptionRow[] = [];
  const unavailable: string[] = [];
  for (const [label, result] of named) {
    if (result === null) unavailable.push(label);
    else rows.push(...result);
  }

  const sorted = sortExceptions(rows);
  return { rows: sorted, summary: summariseExceptions(sorted), unavailable };
}
