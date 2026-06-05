/**
 * Booking detail → work-view resolver.
 *
 * `/admin/bookings/[id]` is referenced widely (server-action redirects after
 * create/duplicate, the work-detail "View booking" link, list-row quick actions,
 * the peek sheet, commercial callouts) but never had its own page — every hit
 * 404'd. The canonical, fully-featured admin booking detail is the inquiry work
 * view at `/admin/work/{sourceInquiryId}`, so this route maps the booking id to
 * its source inquiry and redirects there.
 *
 * Falls back to the bookings list when the id doesn't resolve (e.g. the
 * `/admin/bookings/new` link, or a booking with no linked inquiry) — strictly
 * better than a 404.
 */

import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string; id: string }>;

export default async function AdminBookingDetailRedirect({ params }: { params: PageParams }) {
  const { tenantSlug, id: bookingId } = await params;

  const session = await getCachedActorSession();
  if (!session.user) {
    redirect(`/login?next=/${tenantSlug}/admin/bookings/${bookingId}`);
  }

  const listHref = `/${tenantSlug}/admin/bookings`;

  // "new" and other non-UUID ids never map to a booking → list.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId);
  if (!isUuid) redirect(listHref);

  const supabase = await createSupabaseServerClient();
  let sourceInquiryId: string | null = null;
  if (supabase) {
    const { data } = await supabase
      .from("agency_bookings")
      .select("source_inquiry_id")
      .eq("id", bookingId)
      .maybeSingle();
    sourceInquiryId = (data as { source_inquiry_id?: string | null } | null)?.source_inquiry_id ?? null;
  }

  redirect(sourceInquiryId ? `/${tenantSlug}/admin/work/${sourceInquiryId}` : listHref);
}
