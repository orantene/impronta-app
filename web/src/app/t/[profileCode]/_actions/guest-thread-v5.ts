import "server-only";

/**
 * L13 (Messages v5 guest dock) · the extras the dock's Chat view needs to
 * draw the v5 client cards and act on them, loaded beside the full thread
 * read in `getGuestThreadMessages`.
 *
 * The dock is guest-cookie identified; the v5 client cards act through
 * `lib/server-actions/messaging-client.ts`, which is thread-token identified.
 * `getGuestThreadMessages` has already proven the cookie OWNS the inquiry
 * (`loadOwnedInquiry`), which is exactly the proof `/c/t/[token]` carries in
 * its token, so minting the token here hands the dock the same identity the
 * link has and no more. Nothing here writes; the offers and pay code are the
 * link page's own readers (`lib/messaging/client-link.ts`).
 *
 * Split into a sibling: `guest-chat-actions.ts` is past the file-size cap.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuestConversationItems, GuestThreadV5Extras } from "@/lib/inquiry/guest-chat-contract";
import { loadClientOfferSummaries, loadOpenPaymentCode } from "@/lib/messaging/client-link";
import { resolveThreadTokenExpiry, signThreadToken } from "@/lib/messaging/thread-token";


export async function loadGuestThreadV5Extras(
  admin: SupabaseClient,
  input: { tenantId: string; inquiryId: string },
): Promise<GuestThreadV5Extras> {
  const nowMs = Date.now();
  const [expMs, offers, payCode, items] = await Promise.all([
    resolveThreadTokenExpiry(admin, input.inquiryId, nowMs),
    loadClientOfferSummaries(admin, input),
    loadOpenPaymentCode(admin, input),
    loadGuestConversationItems(admin, input),
  ]);
  const threadToken = signThreadToken(input.inquiryId, input.tenantId, nowMs, expMs);
  return {
    threadToken,
    threadTokenExpiresAt: threadToken ? new Date(expMs).toISOString() : null,
    offers,
    payCode,
    items,
  };
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

/**
 * The conversation's shared POS draft lines + record chips, client-safe.
 * Same draft the client's own picks land in (`messaging-client.ts
 * sharedDraft`): newest `orders` draft on this inquiry from Messages. The
 * select names only what the client may see (S5 `proposed_by` /
 * `confirmed_at` / `price_snapshot_cents`); discount, tax and catalog cost
 * columns are never read here.
 */
export async function loadGuestConversationItems(
  admin: SupabaseClient,
  input: { tenantId: string; inquiryId: string },
): Promise<GuestConversationItems | null> {
  const [{ data: draft }, { data: recordRows }] = await Promise.all([
    admin
      .from("orders")
      .select("id, currency")
      .eq("tenant_id", input.tenantId)
      .eq("inquiry_id", input.inquiryId)
      .eq("status", "draft")
      .eq("source_channel", "messages")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("conversation_records")
      .select("record_kind, record_id, payment_state, fulfilment_state, record_date")
      .eq("inquiry_id", input.inquiryId)
      .is("unlinked_at", null),
  ]);
  const records = ((recordRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    kind: String(r.record_kind ?? ""),
    recordId: String(r.record_id ?? ""),
    paymentState: typeof r.payment_state === "string" ? r.payment_state : null,
    fulfilmentState: typeof r.fulfilment_state === "string" ? r.fulfilment_state : null,
    recordDate: typeof r.record_date === "string" ? r.record_date : null,
  }));
  const order = draft as { id: string; currency: string | null } | null;
  if (!order) return records.length === 0 ? null : { currency: "USD", lines: [], records };
  const { data: lineRows } = await admin
    .from("order_lines")
    .select("id, label, units, unit_cents, price_snapshot_cents, kind, proposed_by, confirmed_at")
    .eq("order_id", order.id)
    .order("sort_order", { ascending: true });
  const lines = ((lineRows ?? []) as Array<Record<string, unknown>>).map((l) => {
    const author = l.proposed_by === "client" || l.proposed_by === "staff" ? l.proposed_by : "system";
    return {
      id: String(l.id),
      label: String(l.label ?? ""),
      units: num(l.units) || 1,
      unitCents: l.price_snapshot_cents != null ? num(l.price_snapshot_cents) : num(l.unit_cents),
      author: author as "client" | "staff" | "system",
      confirmed: typeof l.confirmed_at === "string",
      kind: typeof l.kind === "string" ? l.kind : null,
    };
  });
  return { currency: order.currency ?? "USD", lines, records };
}
