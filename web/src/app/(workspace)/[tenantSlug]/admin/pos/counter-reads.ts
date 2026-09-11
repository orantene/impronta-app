import "server-only";

/**
 * counter-reads.ts — the counter page's Package 1 reads, beside `page.tsx`
 * so that file stays under its line cap: the open sale's payment links
 * (`listPaymentLinks`, the collect screen's `Payment link` tab) and the
 * titles of the bookings its lines pay for (the basket's `Linked · …`
 * pills, `POSLinkBooking`).
 */

import { listPaymentLinks } from "@/lib/payments/links";
import type { PosSaleView } from "@/lib/pos/commands";
import type { Admin } from "@/lib/pos/sale-rows";
import { logServerError } from "@/lib/server/safe-error";

export async function loadCounterLinks(
  admin: Admin,
  tenantId: string,
  sale: PosSaleView,
): Promise<{
  paymentLinks: Array<{ code: string; url: string; amountCents: number; status: string; expiresAt: string }>;
  bookingTitles: Map<string, string>;
}> {
  const bookingTitles = new Map<string, string>();
  const bookingIds = [...new Set(sale.lines.map((l) => l.bookingId).filter((id): id is string => typeof id === "string"))];
  const [links, bookings, admissions] = await Promise.all([
    listPaymentLinks(admin, { tenantId, orderId: sale.orderId }),
    bookingIds.length > 0 ? admin.from("agency_bookings").select("id, title").eq("tenant_id", tenantId).in("id", bookingIds) : Promise.resolve({ data: [], error: null }),
    bookingIds.length > 0
      ? admin.from("admissions").select("id, sessions:session_id(title)").eq("tenant_id", tenantId).in("id", bookingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (bookings.error) logServerError("pos.page.linkedBookings", bookings.error);
  if (admissions.error) logServerError("pos.page.linkedAdmissions", admissions.error);
  for (const b of (bookings.data ?? []) as Array<{ id: string; title: string | null }>) bookingTitles.set(b.id, b.title?.trim() || b.id.slice(0, 8));
  for (const a of (admissions.data ?? []) as Array<{ id: string; sessions: { title: string | null } | { title: string | null }[] | null }>) {
    const session = Array.isArray(a.sessions) ? a.sessions[0] : a.sessions;
    bookingTitles.set(a.id, session?.title?.trim() || a.id.slice(0, 8));
  }
  return { paymentLinks: links.ok ? links.links : [], bookingTitles };
}
