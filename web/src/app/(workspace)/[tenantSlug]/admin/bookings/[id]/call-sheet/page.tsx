/**
 * Booking call sheet editor — page route.
 *
 * B2 from the inquiry-booking improvement plan. The "Edit call sheet"
 * dashed button in LogisticsTab (shipped via C1 dead-chrome sweep)
 * now links here.
 *
 * RSC loader fetches the booking + call sheet payload + the roster
 * (for the talent dropdown), then renders the client editor.
 */

import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadBookingCallSheet } from "@/lib/call-sheet/actions";
import { CallSheetEditor } from "./_editor";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string; id: string }>;

export default async function BookingCallSheetPage({ params }: { params: PageParams }) {
  const { tenantSlug, id: bookingId } = await params;

  const session = await getCachedActorSession();
  if (!session.user) {
    redirect(`/login?next=/${tenantSlug}/admin/bookings/${bookingId}/call-sheet`);
  }

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // Load the call sheet + booking facts.
  const cs = await loadBookingCallSheet(bookingId);
  if (!cs) notFound();

  // Load the tenant's roster for the talent dropdown. Cap at 200 — any
  // tenant with more than that is well past the call-sheet UX scale.
  const supabase = await createSupabaseServerClient();
  type RosterRow = { id: string; display_name: string | null; first_name: string | null; last_name: string | null };
  let rosterTalents: Array<{ profileId: string; displayName: string }> = [];
  if (supabase) {
    const { data } = await supabase
      .from("talent_profiles")
      .select("id, display_name, first_name, last_name")
      .eq("created_by_agency_id", scope.tenantId)
      .is("deleted_at", null)
      .order("display_name", { ascending: true })
      .limit(200);
    rosterTalents = ((data ?? []) as RosterRow[]).map((r) => ({
      profileId: r.id,
      displayName:
        r.display_name?.trim() ||
        [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
        "Talent",
    }));
  }

  return (
    <CallSheetEditor
      bookingId={cs.bookingId}
      tenantSlug={tenantSlug}
      initialPayload={cs.payload}
      bookingTitle={cs.bookingTitle}
      startsAt={cs.startsAt}
      endsAt={cs.endsAt}
      updatedAt={cs.updatedAt}
      rosterTalents={rosterTalents}
    />
  );
}
