import "server-only";

import { loadMeData } from "@/lib/me/load-me";
import { CLIENT_THREAD, INTERNAL_NOTE_KIND } from "@/lib/messaging/thread-rule";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

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
    const rows = [...me.upcoming, ...me.waitingOnYou].map((r) => ({
      title: r.title,
      eventDate: r.eventDate,
      status: r.status,
      amountCents: r.booking?.amountCents ?? null,
      currencyCode: r.booking?.currencyCode ?? null,
      paymentStatus: r.booking?.paymentStatus ?? null,
    }));
    return shapeAccountSummary({ upcoming: rows, unread, nowMs: Date.now(), timeZone: input.timeZone, locale: input.locale });
  } catch (error) {
    logServerError("clientAccount.summary", error);
    return EMPTY_ACCOUNT_SUMMARY;
  }
}
