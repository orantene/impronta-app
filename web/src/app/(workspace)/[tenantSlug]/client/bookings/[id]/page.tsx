/**
 * Client booking detail → inquiry-thread resolver.
 *
 * The client surface keys "bookings" by their source inquiry everywhere (the
 * bookings list links rows straight to `/client/inquiries/{inquiryId}`). The one
 * place a raw booking id leaks to the client is the booked-state primary CTA in
 * the workspace state matrix, which builds `/client/bookings/{bookingId}` — a
 * route that never existed and 404'd. This maps the booking id back to its
 * inquiry and redirects to the canonical client thread.
 *
 * The booking→inquiry lookup uses the service role (the client has no direct
 * read on agency_bookings) but only reads the inquiry id; the destination
 * `/client/inquiries/{id}` enforces client ownership, so nothing is exposed.
 */

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string; id: string }>;

export default async function ClientBookingDetailRedirect({ params }: { params: PageParams }) {
  const { tenantSlug, id: bookingId } = await params;

  const session = await getCachedActorSession();
  if (!session.user) {
    redirect(`/login?next=/${tenantSlug}/client/bookings/${bookingId}`);
  }

  const listHref = `/${tenantSlug}/client/bookings`;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId);
  if (!isUuid) redirect(listHref);

  const admin = createServiceRoleClient();
  let sourceInquiryId: string | null = null;
  if (admin) {
    const { data } = await admin
      .from("agency_bookings")
      .select("source_inquiry_id")
      .eq("id", bookingId)
      .maybeSingle();
    sourceInquiryId = (data as { source_inquiry_id?: string | null } | null)?.source_inquiry_id ?? null;
  }

  redirect(sourceInquiryId ? `/${tenantSlug}/client/inquiries/${sourceInquiryId}` : listHref);
}
