import "server-only";

import { headers } from "next/headers";

import { HOST_TALENT_PROFILE_HEADER } from "@/lib/saas/host-context";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { decideVisitReview, type VisitReviewFacts, type VisitReviewState } from "./visit-review";

/**
 * Facts for one visit's review, every read scoped by the booking id AND this site's tenant;
 * the review and request reads are also `client_user_id = userId`. Null on any read error
 * (the page then shows no review block; the action refuses).
 */
export async function loadVisitReviewFacts(userId: string, tenantId: string, bookingId: string): Promise<VisitReviewFacts | null> {
  const admin = createServiceRoleClient();
  if (!admin || !userId || !tenantId || !bookingId) return null;
  const { data: bk, error } = await admin
    .from("agency_bookings")
    .select("id, tenant_id, client_user_id, source_inquiry_id, status, payment_status, event_date, ends_at")
    .eq("id", bookingId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("clientAccount.visitReview.booking", error);
    return null;
  }
  const b = bk as {
    id: string; tenant_id: string | null; client_user_id: string | null; source_inquiry_id: string | null;
    status: string | null; payment_status: string | null; event_date: string | null; ends_at: string | null;
  } | null;
  if (!b) return null;
  const [inq, talents, reviews, requests] = await Promise.all([
    b.source_inquiry_id
      ? admin.from("inquiries").select("client_user_id").eq("id", b.source_inquiry_id).eq("tenant_id", tenantId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin.from("booking_talent").select("talent_profile_id").eq("booking_id", b.id),
    admin.from("talent_reviews").select("talent_profile_id").eq("booking_id", b.id).eq("client_user_id", userId),
    admin
      .from("review_requests")
      .select("invite_token")
      .eq("booking_id", b.id)
      .eq("client_user_id", userId)
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "sent"])
      .gt("expires_at", new Date().toISOString())
      .limit(1),
  ]);
  for (const [k, r] of [["inquiry", inq], ["talent", talents], ["reviews", reviews], ["requests", requests]] as const) {
    if (r.error) {
      logServerError(`clientAccount.visitReview.${k}`, r.error);
      return null;
    }
  }
  const ids = (rows: unknown, key: string) =>
    ((rows ?? []) as Array<Record<string, string | null>>).map((x) => x[key]).filter((x): x is string => typeof x === "string" && x !== "");
  return {
    bookingId: b.id,
    bookingTenantId: b.tenant_id,
    bookingClientUserId: b.client_user_id,
    inquiryClientUserId: (inq.data as { client_user_id?: string | null } | null)?.client_user_id ?? null,
    status: b.status ?? "",
    paymentStatus: b.payment_status ?? "",
    endsAt: b.ends_at,
    eventDate: b.event_date,
    talentProfileIds: ids(talents.data, "talent_profile_id"),
    reviewedTalentIds: ids(reviews.data, "talent_profile_id"),
    openRequestToken: ids(requests.data, "invite_token")[0] ?? null,
  };
}

/** The talent of a talent-site host (proxy-set header, stripped when inbound); null elsewhere. */
export async function readHostTalentProfileId(): Promise<string | null> {
  try {
    return (await headers()).get(HOST_TALENT_PROFILE_HEADER)?.trim() || null;
  } catch {
    return null;
  }
}

export async function loadVisitReviewState(userId: string, tenantId: string, bookingId: string | null): Promise<VisitReviewState | null> {
  if (!bookingId) return null;
  const facts = await loadVisitReviewFacts(userId, tenantId, bookingId);
  if (!facts) return null;
  return decideVisitReview({ sessionUserId: userId, siteTenantId: tenantId, hostTalentProfileId: await readHostTalentProfileId(), facts });
}
