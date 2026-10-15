import "server-only";

/**
 * TUL-1066: the two checks the guest's own "undo" writers share
 * (`messagingClientRemoveItem`, `messagingClientDiscardEmptyDraft`).
 *
 * A guest may take back a line or an empty draft only while NOTHING money-ish
 * or human hangs off the conversation: no offer, no order past the draft, no
 * payment link, no record chip. Anything that cannot be read counts as
 * "unknown" and refuses: undo never guesses.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CommitmentCounts = {
  offers: number | null;
  paymentLinks: number | null;
  settledOrders: number | null;
  records: number | null;
};

/** Pure: "none" only when every count was read and is zero. */
export function commitmentVerdict(c: CommitmentCounts): "none" | "committed" | "unknown" {
  const all = [c.offers, c.paymentLinks, c.settledOrders, c.records];
  if (all.some((n) => n != null && n > 0)) return "committed";
  if (all.some((n) => n == null)) return "unknown";
  return "none";
}

async function countOf(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  const { count, error } = await query;
  return error ? null : (count ?? 0);
}

export async function inquiryCommitment(
  admin: SupabaseClient,
  tenantId: string,
  inquiryId: string,
): Promise<"none" | "committed" | "unknown"> {
  const head = { count: "exact", head: true } as const;
  const [offers, paymentLinks, settledOrders, records] = await Promise.all([
    countOf(admin.from("inquiry_offers").select("id", head).eq("tenant_id", tenantId).eq("inquiry_id", inquiryId)),
    countOf(admin.from("payment_links").select("id", head).eq("tenant_id", tenantId).eq("inquiry_id", inquiryId)),
    countOf(admin.from("orders").select("id", head).eq("tenant_id", tenantId).eq("inquiry_id", inquiryId).neq("status", "draft")),
    countOf(admin.from("conversation_records").select("record_id", head).eq("inquiry_id", inquiryId).is("unlinked_at", null)),
  ]);
  return commitmentVerdict({ offers, paymentLinks, settledOrders, records });
}

/**
 * Pure: is this inquiry row still the untouched early draft `ensureGuestChatInquiry`
 * seeds? Seed contact, draft status, and a lineup that holds nothing beyond the
 * page's own talent.
 */
export function isUntouchedSeedDraft(row: { status: unknown; contact_name: unknown; interpreted_query: unknown }): boolean {
  if (row.status !== "draft" || row.contact_name !== "Guest") return false;
  const q = (row.interpreted_query && typeof row.interpreted_query === "object" ? row.interpreted_query : {}) as {
    source?: unknown;
    talent?: { selected_ids?: unknown };
  };
  const ids = Array.isArray(q.talent?.selected_ids) ? q.talent.selected_ids : [];
  return ids.length === 0 || (ids.length === 1 && q.source === "public_talent_profile");
}

/** The line must sit on this thread's draft, be one the client proposed, and not yet confirmed by staff. */
export async function clientRemovableLine(
  admin: SupabaseClient,
  orderId: string,
  lineId: string,
): Promise<"ok" | "missing" | "not_allowed" | "unavailable"> {
  const { data, error } = await admin.from("order_lines").select("id, proposed_by, confirmed_at").eq("id", lineId).eq("order_id", orderId).maybeSingle();
  if (error) return "unavailable";
  const row = data as { proposed_by: string | null; confirmed_at: string | null } | null;
  if (!row) return "missing";
  return row.proposed_by === "client" && !row.confirmed_at ? "ok" : "not_allowed";
}
