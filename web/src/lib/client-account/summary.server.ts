import "server-only";

import { loadMeData } from "@/lib/me/load-me";
import { CLIENT_THREAD, INTERNAL_NOTE_KIND } from "@/lib/messaging/thread-rule";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { balanceDueCents, type LedgerPaidRow } from "./balance-pure";
import { EMPTY_ACCOUNT_SUMMARY, shapeAccountSummary, type AccountSummary } from "./pure";

/** Unread private-thread messages on THIS user's inquiries in THIS tenant only. */
async function loadUnread(userId: string, tenantId: string): Promise<number> {
  const admin = createServiceRoleClient();
  if (!admin) return 0;
  const { data: inqs, error } = await admin
    .from("inquiries")
    .select("id")
    .eq("client_user_id", userId)
    .eq("tenant_id", tenantId)
    .limit(200);
  if (error || !inqs?.length) {
    if (error) logServerError("clientAccount.unread.inquiries", error);
    return 0;
  }
  const ids = (inqs as { id: string }[]).map((r) => r.id);
  const [reads, msgs] = await Promise.all([
    admin.from("inquiry_message_reads").select("inquiry_id, thread_type, last_read_at").eq("tenant_id", tenantId).eq("user_id", userId).in("inquiry_id", ids),
    admin
      .from("inquiry_messages")
      .select("inquiry_id, thread_type, created_at")
      .eq("tenant_id", tenantId)
      .eq("thread_type", CLIENT_THREAD)
      .is("deleted_at", null)
      .neq("message_kind", INTERNAL_NOTE_KIND)
      .neq("sender_user_id", userId)
      .in("inquiry_id", ids),
  ]);
  if (msgs.error) {
    logServerError("clientAccount.unread.messages", msgs.error);
    return 0;
  }
  const readAt = new Map<string, number>();
  for (const r of (reads.data ?? []) as { inquiry_id: string; thread_type: string; last_read_at: string | null }[]) {
    if (r.last_read_at) readAt.set(`${r.inquiry_id}:${r.thread_type}`, Date.parse(r.last_read_at));
  }
  let n = 0;
  for (const m of (msgs.data ?? []) as { inquiry_id: string; thread_type: string; created_at: string }[]) {
    const last = readAt.get(`${m.inquiry_id}:${m.thread_type}`);
    if (last === undefined || Date.parse(m.created_at) > last) n += 1;
  }
  return n;
}

/**
 * Money-in ledger rows per booking (`booking_transactions`), this tenant only.
 * An error yields an empty map; callers then show NO balance rather than the
 * full total.
 */
async function loadLedgerByBooking(bookingIds: string[], tenantId: string): Promise<Map<string, LedgerPaidRow[]> | null> {
  const admin = createServiceRoleClient();
  if (!admin || bookingIds.length === 0) return new Map();
  const { data, error } = await admin
    .from("booking_transactions")
    .select("booking_id, gross_amount_cents, currency, status, refund_of_transaction_id")
    .eq("source_tenant_id", tenantId)
    .in("booking_id", bookingIds);
  if (error) {
    logServerError("clientAccount.summary.ledger", error);
    return null;
  }
  const out = new Map<string, LedgerPaidRow[]>();
  for (const r of (data ?? []) as Array<{ booking_id: string; gross_amount_cents: number | string | null; currency: string | null; status: string; refund_of_transaction_id: string | null }>) {
    const list = out.get(r.booking_id) ?? [];
    list.push({ grossCents: Number(r.gross_amount_cents) || 0, status: r.status, currency: r.currency, refundOfTransactionId: r.refund_of_transaction_id });
    out.set(r.booking_id, list);
  }
  return out;
}

/** Tenant-scoped summary card data. Builds on `loadMeData` (owner AND tenant filters). */
export async function loadClientAccountSummary(input: {
  userId: string;
  tenantId: string;
  timeZone: string;
  locale: string;
}): Promise<AccountSummary> {
  if (!input.userId || !input.tenantId) return EMPTY_ACCOUNT_SUMMARY;
  try {
    const [me, unread] = await Promise.all([
      loadMeData(input.userId, input.tenantId),
      loadUnread(input.userId, input.tenantId),
    ]);
    const items = [...me.upcoming, ...me.waitingOnYou];
    // Unpaid and part-paid bookings owe the LEDGER remainder, not the booking
    // total. If the ledger cannot give a trustworthy number the amount is
    // dropped (null) so no balance is shown for that booking.
    const partial = items.filter((r) => r.booking?.id && r.booking.paymentStatus === "partial").map((r) => r.booking!.id as string);
    const ledger = await loadLedgerByBooking(partial, input.tenantId);
    const remainder = (r: (typeof items)[number]): number | null => {
      const b = r.booking;
      if (!b || b.paymentStatus !== "partial") return b?.amountCents ?? null;
      if (!b.id || !ledger) return null;
      return balanceDueCents(b.amountCents, ledger.get(b.id) ?? [], b.currencyCode);
    };
    const rows = items.map((r) => ({
      title: r.title,
      eventDate: r.eventDate,
      status: r.status,
      amountCents: remainder(r),
      currencyCode: r.booking?.currencyCode ?? null,
      paymentStatus: r.booking?.paymentStatus ?? null,
    }));
    return shapeAccountSummary({ upcoming: rows, unread, nowMs: Date.now(), timeZone: input.timeZone, locale: input.locale });
  } catch (error) {
    logServerError("clientAccount.summary", error);
    return EMPTY_ACCOUNT_SUMMARY;
  }
}
