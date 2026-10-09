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

/** An unfinished claim older than this is a run that died mid-write: it may be taken over. */
export const CLAIM_STALE_MS = 10 * 60 * 1000;

export type ClaimDecision = "proceed" | "skip_done" | "skip_in_progress" | "takeover";

/**
 * What to do when claiming a group. `inserted` = our INSERT won the primary key. Otherwise `existing` is the
 * claim that beat us: complete -> skip; in progress -> skip (another run is writing it); stale -> take over.
 */
export function decideClaim(input: {
  inserted: boolean;
  existing: { completed_at: string | null; claimed_at: string } | null;
  nowMs: number;
}): ClaimDecision {
  if (input.inserted) return "proceed";
  if (!input.existing) return "skip_in_progress";
  if (input.existing.completed_at) return "skip_done";
  return input.nowMs - Date.parse(input.existing.claimed_at) > CLAIM_STALE_MS ? "takeover" : "skip_in_progress";
}

type ClaimOutcome = { proceed: true; claimed: boolean } | { proceed: false; reason: "done" | "in_progress" } | { proceed: false; error: string };

/** Claim the group in `ledger_group_claims` (PRIMARY KEY on the group id). Degrades to "no claim" if the table is not there yet. */
async function claimGroup(
  sb: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  groupId: string,
  groupKey: string,
): Promise<ClaimOutcome> {
  const { error } = await sb.from("ledger_group_claims").insert({ group_id: groupId, group_key: groupKey });
  if (!error) return { proceed: true, claimed: true };
  const code = (error as { code?: string }).code;
  if (code === "42P01" || code === "PGRST205") {
    // Migration not applied yet: behave exactly as before (existence check only), loudly.
    logServerError("ledger.write.claim", new Error("ledger_group_claims is missing; double-post guard inactive"));
    return { proceed: true, claimed: false };
  }
  if (code !== "23505") {
    logServerError("ledger.write.claim", error);
    return { proceed: false, error: "Could not claim the ledger group." };
  }
  const { data: existing, error: readErr } = await sb
    .from("ledger_group_claims")
    .select("completed_at, claimed_at")
    .eq("group_id", groupId)
    .maybeSingle();
  if (readErr) return { proceed: false, error: "Could not read the ledger group claim." };
  const decision = decideClaim({ inserted: false, existing: existing as { completed_at: string | null; claimed_at: string } | null, nowMs: Date.now() });
  if (decision === "skip_done") return { proceed: false, reason: "done" };
  if (decision === "skip_in_progress") return { proceed: false, reason: "in_progress" };
  // Takeover: compare-and-swap on the stale claimed_at so two takers cannot both win.
  const { data: won } = await sb
    .from("ledger_group_claims")
    .update({ claimed_at: new Date().toISOString() })
    .eq("group_id", groupId)
    .is("completed_at", null)
    .eq("claimed_at", (existing as { claimed_at: string }).claimed_at)
    .select("group_id");
  return Array.isArray(won) && won.length > 0 ? { proceed: true, claimed: true } : { proceed: false, reason: "in_progress" };
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

  const claim = await claimGroup(sb, groupId, groupKey);
  if (!claim.proceed) {
    if ("error" in claim) return { ok: false, error: claim.error, groupId };
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
    // Release the claim so the next run can retry this group.
    if (claim.claimed) await sb.from("ledger_group_claims").delete().eq("group_id", groupId).is("completed_at", null);
    return { ok: false, error: insErr.message ?? "insert failed", groupId };
  }
  // Two runs racing past the existence check above would each insert the group (there is no unique
  // key to stop them). Entries are append-only, so the only honest move is to DETECT it loudly.
  const { count } = await sb.from("ledger_entries").select("id", { count: "exact", head: true }).eq("group_id", groupId);
  if (typeof count === "number" && count > rows.length) {
    logServerError("ledger.write.DOUBLE_POST", new Error(`group ${groupId} (${groupKey}) has ${count} entries, expected ${rows.length}. Needs a human.`));
  }
  if (claim.claimed) await sb.from("ledger_group_claims").update({ completed_at: new Date().toISOString() }).eq("group_id", groupId);
  return { ok: true, written: rows.length, skipped: false, groupId };
}
