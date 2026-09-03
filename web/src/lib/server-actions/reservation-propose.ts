"use server";

/* eslint-disable ratchet/no-untenanted-from -- talent_offerings filtered by id after tenant-scoped inquiry load; agencies is keyed by id. */

/**
 * Staff propose / client confirm a reservation time.
 * Creates or moves the firm hold and drops a reservation card.
 */

import { revalidatePath } from "next/cache";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantTimezone } from "@/lib/spaces/venues";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { logServerError } from "@/lib/server/safe-error";
import { placeReservationHold, releaseHoldsForInquiry } from "@/lib/scheduling/reservation-hold";
import { parseReservationStamp, type ReservationStamp } from "@/lib/scheduling/reservation-intent";
import { insertReservationCards, reservationCardPayload } from "@/lib/scheduling/reservation-card";
import { emitStandardEngineEvent, ENGINE_EVENT_TYPES } from "@/lib/inquiry/inquiry-events";
import { normalizeTenantAppointmentsSettings } from "@/lib/scheduling/appointments-settings-types";
import { terminologyCopy } from "@/lib/scheduling/terminology";
import { assertTalentReservationAllowed } from "@/lib/scheduling/booking-surface";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReservationProposeResult =
  | { ok: true }
  | { ok: false; error: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function loadInquiryRow(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  inquiryId: string,
  tenantId: string,
) {
  const { data, error } = await tenantScopedQuery(admin, "inquiries", tenantId)
    .select("id, tenant_id, source_context, source_channel")
    .eq("id", inquiryId)
    .maybeSingle();
  if (error || !data) return null;
  return data as {
    id: string;
    tenant_id: string;
    source_context: Record<string, unknown> | null;
    source_channel: string | null;
  };
}

async function termNoun(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
): Promise<string> {
  const { data } = await admin.from("agencies").select("settings").eq("id", tenantId).maybeSingle();
  const settings = isPlainObject(data?.settings) ? data.settings : null;
  const appointments = isPlainObject(settings?.appointments) ? settings.appointments : null;
  return terminologyCopy(normalizeTenantAppointmentsSettings(appointments).terminology, "en").singular;
}

export async function proposeReservationTimeAction(raw: {
  tenantSlug: string;
  inquiryId: string;
  startsAt: string;
  endsAt: string;
  /**
   * Ignored. The stamp's zone is resolved on the server from the venue, because
   * a reservation stamp is a RECORD and a client-supplied zone is display. Kept
   * in the signature so the existing caller still typechecks; it goes when the
   * caller stops sending it.
   */
  timezone?: string;
  offeringId?: string | null;
  talentProfileId?: string | null;
}): Promise<ReservationProposeResult> {
  const staff = await requireWorkspaceStaffAction();
  if (!staff.ok) return { ok: false, error: "Not allowed." };
  if (staff.tenantSlug !== raw.tenantSlug.trim().toLowerCase()) {
    return { ok: false, error: "Not allowed." };
  }
  if (!UUID_RE.test(raw.inquiryId)) return { ok: false, error: "Invalid inquiry." };
  const starts = Date.parse(raw.startsAt);
  const ends = Date.parse(raw.endsAt);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) {
    return { ok: false, error: "Pick a valid time window." };
  }
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Unavailable." };

  const inquiry = await loadInquiryRow(admin, raw.inquiryId, staff.tenantId);
  if (!inquiry) return { ok: false, error: "Inquiry not found." };

  const existing = parseReservationStamp(inquiry.source_context);
  const offeringId = raw.offeringId || existing?.offering_id;
  if (!offeringId || !UUID_RE.test(offeringId)) {
    return { ok: false, error: "This conversation has no bookable service yet." };
  }

  const { data: offering } = await admin
    .from("talent_offerings")
    .select("id, talent_profile_id, tenant_id, title, duration_minutes")
    .eq("id", offeringId)
    .eq("tenant_id", staff.tenantId)
    .maybeSingle();
  const talentId =
    raw.talentProfileId ||
    (typeof offering?.talent_profile_id === "string" ? offering.talent_profile_id : null);
  if (!talentId) return { ok: false, error: "No staff member is tied to this service." };

  const gate = await assertTalentReservationAllowed(admin, {
    talentProfileId: talentId,
    offeringId,
    host: { kind: "agency", tenantId: staff.tenantId },
  });
  if (!gate.ok) return { ok: false, error: gate.error };

  const released = await releaseHoldsForInquiry(admin, raw.inquiryId);
  if (!released.ok) return { ok: false, error: released.error };

  const hold = await placeReservationHold(admin, {
    talentProfileId: talentId,
    tenantId: staff.tenantId,
    inquiryId: raw.inquiryId,
    startsAt: new Date(starts).toISOString(),
    endsAt: new Date(ends).toISOString(),
    title: typeof offering?.title === "string" ? offering.title : "Reservation",
    createdByUserId: staff.user.id,
  });
  if (!hold.ok) return { ok: false, error: hold.error };

  const stamp: ReservationStamp = {
    v: 1,
    offering_id: offeringId,
    starts_at: new Date(starts).toISOString(),
    ends_at: new Date(ends).toISOString(),
    // The venue's clock, never the browser's. The prop that used to feed this
    // was never passed by the only caller, so every reservation ever proposed
    // was stamped "UTC" regardless of where the workspace is.
    timezone: await tenantTimezone(staff.tenantId),
    duration_minutes:
      typeof offering?.duration_minutes === "number" && offering.duration_minutes > 0
        ? offering.duration_minutes
        : Math.round((ends - starts) / 60_000),
    mode: "request",
    hold_id: hold.holdId,
    hold_expires_at: hold.expiresAt,
  };

  const prev = isPlainObject(inquiry.source_context) ? inquiry.source_context : {};
  const nextContext = { ...prev, reservation: stamp };

  const { error: updErr } = await tenantScopedQuery(admin, "inquiries", staff.tenantId)
    .update({
      source_context: nextContext,
      source_channel:
        inquiry.source_channel === "offering_request" ? inquiry.source_channel : "offering_request",
    })
    .eq("id", raw.inquiryId);
  if (updErr) {
    logServerError("reservation-propose.update", updErr);
    return { ok: false, error: "Could not save the proposed time." };
  }

  await insertReservationCards(admin, {
    inquiryId: raw.inquiryId,
    tenantId: staff.tenantId,
    actorUserId: staff.user.id,
    payload: reservationCardPayload(stamp, "proposed", "staff"),
    body: "A time was proposed.",
  });

  await emitStandardEngineEvent(admin, {
    type: ENGINE_EVENT_TYPES.RESERVATION_PROPOSED,
    inquiryId: raw.inquiryId,
    actorUserId: staff.user.id,
    data: {
      startsAt: stamp.starts_at,
      timezone: stamp.timezone,
      termSingular: await termNoun(admin, staff.tenantId),
    },
  });

  revalidatePath(`/${raw.tenantSlug}/admin`);
  revalidatePath(`/${raw.tenantSlug}/client/messages`);
  return { ok: true };
}

async function requireOwningClient(tenantSlug: string, inquiryId: string) {
  const session = await getCachedActorSession();
  if (!session.supabase || !session.user) return { ok: false as const, error: "Not authenticated." };
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) return { ok: false as const, error: "Not allowed." };
  const { data: inq } = await session.supabase
    .from("inquiries")
    .select("id, client_user_id, tenant_id, source_context")
    .eq("id", inquiryId)
    .eq("client_user_id", session.user.id)
    .maybeSingle();
  if (!inq || inq.client_user_id !== session.user.id) {
    return { ok: false as const, error: "Inquiry not found." };
  }
  return {
    ok: true as const,
    userId: session.user.id,
    tenantId: inq.tenant_id as string,
    sourceContext: inq.source_context as Record<string, unknown> | null,
  };
}

export async function confirmReservationTimeAction(raw: {
  tenantSlug: string;
  inquiryId: string;
}): Promise<ReservationProposeResult> {
  if (!UUID_RE.test(raw.inquiryId)) return { ok: false, error: "Invalid inquiry." };
  const client = await requireOwningClient(raw.tenantSlug, raw.inquiryId);
  if (!client.ok) return { ok: false, error: client.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Unavailable." };

  const stamp = parseReservationStamp(client.sourceContext);
  if (!stamp) return { ok: false, error: "No time to confirm." };

  await insertReservationCards(admin, {
    inquiryId: raw.inquiryId,
    tenantId: client.tenantId,
    actorUserId: client.userId,
    payload: reservationCardPayload(stamp, "confirmed", "client"),
    body: "Time confirmed.",
  });

  await emitStandardEngineEvent(admin, {
    type: ENGINE_EVENT_TYPES.RESERVATION_CONFIRMED,
    inquiryId: raw.inquiryId,
    actorUserId: client.userId,
    data: {
      startsAt: stamp.starts_at,
      timezone: stamp.timezone,
      termSingular: await termNoun(admin, client.tenantId),
    },
  });

  revalidatePath(`/${raw.tenantSlug}/admin`);
  revalidatePath(`/${raw.tenantSlug}/client/messages`);
  return { ok: true };
}

export async function declineReservationTimeAction(raw: {
  tenantSlug: string;
  inquiryId: string;
}): Promise<ReservationProposeResult> {
  if (!UUID_RE.test(raw.inquiryId)) return { ok: false, error: "Invalid inquiry." };
  const client = await requireOwningClient(raw.tenantSlug, raw.inquiryId);
  if (!client.ok) return { ok: false, error: client.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Unavailable." };

  const stamp = parseReservationStamp(client.sourceContext);
  if (!stamp) return { ok: false, error: "No time to decline." };

  const released = await releaseHoldsForInquiry(admin, raw.inquiryId);
  if (!released.ok) return { ok: false, error: released.error };

  await insertReservationCards(admin, {
    inquiryId: raw.inquiryId,
    tenantId: client.tenantId,
    actorUserId: client.userId,
    payload: reservationCardPayload(stamp, "declined", "client"),
    body: "Time declined.",
  });

  await emitStandardEngineEvent(admin, {
    type: ENGINE_EVENT_TYPES.RESERVATION_DECLINED,
    inquiryId: raw.inquiryId,
    actorUserId: client.userId,
    data: {
      startsAt: stamp.starts_at,
      termSingular: await termNoun(admin, client.tenantId),
    },
  });

  revalidatePath(`/${raw.tenantSlug}/admin`);
  revalidatePath(`/${raw.tenantSlug}/client/messages`);
  return { ok: true };
}
