/**
 * lib/ledger/write.ts
 *
 * Write projected legs into the ledger, idempotently.
 *
 * ── Why the ledger is a PROJECTION and not a hot-path write ─────────────────
 * The obvious design is to append to the ledger at the moment money moves —
 * inside `markPaid`, inside the refund handler, inside the webhook. That
 * couples the books to the success of a request, and it means a single missed
 * call leaves a permanent hole that nothing will ever notice.
 *
 * Instead the ledger is DERIVED from the provider-truth tables
 * (`provider_balance_transactions`, `provider_payouts`, `provider_invoices`)
 * and the commission snapshots. That has three properties worth the extra
 * indirection:
 *
 *   • Re-buildable. If a projection rule turns out to be wrong, the fix is to
 *     correct the rule and re-run, not to hand-patch rows in a financial table.
 *   • Self-healing. A run that fails changes nothing; the next run picks up
 *     exactly what is missing, because "missing" is computed, not remembered.
 *   • Honest about disagreement. The ledger is built from what the PROVIDER
 *     says happened, so when it disagrees with our own records, that is a real
 *     finding rather than an artefact of one write path being skipped.
 *
 * ── Idempotency ─────────────────────────────────────────────────────────────
 * `group_id` is `md5(groupKey)::uuid` — derived from the source object, never
 * random. Projecting the same payment twice produces the same id, and the
 * writer skips a group that already has entries. A ledger that can double-count
 * on a retry is worse than no ledger: the second copy looks exactly as
 * legitimate as the first.
 *
 * Server-only.
 */

import "server-only";
import { createHash } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { legsBalance, sumByCurrency, type LedgerLeg } from "./project";

/**
 * Derive the group uuid from its key.
 *
 * md5 is used as a stable 128-bit digest to fill a uuid, NOT as a security
 * primitive — the input is our own key like `booking_payment:<txn id>`, and the
 * only property needed is that the same key always yields the same id.
 */
export function groupIdFor(groupKey: string): string {
  const hex = createHash("md5").update(groupKey).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export type WriteResult =
  | { ok: true; written: number; skipped: boolean; groupId: string }
  | { ok: false; error: string; groupId?: string };

/** Account code → id, resolved once per process. Codes are stable by contract. */
let accountCache: Map<string, string> | null = null;

export async function loadAccountMap(force = false): Promise<Map<string, string> | null> {
  if (accountCache && !force) return accountCache;
  const sb = createServiceRoleClient();
  if (!sb) return null;
  const { data, error } = await sb.from("ledger_accounts").select("id, code");
  if (error || !data) {
    logServerError("ledger.write.loadAccounts", error ?? new Error("no accounts"));
    return null;
  }
  accountCache = new Map(
    (data as Array<{ id: string; code: string }>).map((r) => [r.code, r.id]),
  );
  return accountCache;
}

/**
 * Write one balanced group.
 *
 * Refuses BEFORE touching the database when the legs do not balance. The
 * deferred constraint trigger would catch it at commit anyway, but failing here
 * gives a message naming the currency and the amount it is out by, instead of a
 * constraint violation the caller has to reverse-engineer.
 */
export async function writeLedgerGroup(legs: LedgerLeg[]): Promise<WriteResult> {
  if (legs.length === 0) return { ok: true, written: 0, skipped: true, groupId: "" };

  const groupKey = legs[0].groupKey;
  if (legs.some((l) => l.groupKey !== groupKey)) {
    return { ok: false, error: "all legs in a write must share one groupKey" };
  }
  const groupId = groupIdFor(groupKey);

  if (!legsBalance(legs)) {
    const sums = sumByCurrency(legs);
    const off = Object.entries(sums)
      .filter(([, v]) => v !== 0)
      .map(([c, v]) => `${c} is out by ${v}`)
      .join("; ");
    return { ok: false, error: `refusing to write an unbalanced group (${off})`, groupId };
  }

  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available.", groupId };

  const accounts = await loadAccountMap();
  if (!accounts) return { ok: false, error: "Chart of accounts unavailable.", groupId };

  // Already projected? The entries are append-only, so a partially-written
  // group cannot exist: the balance trigger would have rejected the commit.
  const { data: existing, error: existErr } = await sb
    .from("ledger_entries")
    .select("id")
    .eq("group_id", groupId)
    .limit(1);
  if (existErr) {
    logServerError("ledger.write.existsCheck", existErr);
    return { ok: false, error: "Could not check for an existing group.", groupId };
  }
  if (existing && existing.length > 0) {
    return { ok: true, written: 0, skipped: true, groupId };
  }

  const rows: Record<string, unknown>[] = [];
  for (const leg of legs) {
    const accountId = accounts.get(leg.accountCode);
    if (!accountId) {
      // A code that is not in the chart means the projection and the chart have
      // drifted. Writing the rest of the group would leave it unbalanced.
      return { ok: false, error: `unknown ledger account code "${leg.accountCode}"`, groupId };
    }
    rows.push({
      group_id: groupId,
      group_kind: leg.groupKind,
      account_id: accountId,
      amount_cents: leg.amountCents,
      currency: leg.currency,
      tenant_id: leg.tenantId ?? null,
      talent_profile_id: leg.talentProfileId ?? null,
      booking_id: leg.bookingId ?? null,
      booking_transaction_id: leg.bookingTransactionId ?? null,
      provider_object_id: leg.providerObjectId ?? null,
      occurred_at: leg.occurredAt,
      memo: leg.memo ?? null,
    });
  }

  const { error: insErr } = await sb.from("ledger_entries").insert(rows);
  if (insErr) {
    logServerError("ledger.write.insert", insErr);
    return { ok: false, error: insErr.message ?? "insert failed", groupId };
  }
  return { ok: true, written: rows.length, skipped: false, groupId };
}
