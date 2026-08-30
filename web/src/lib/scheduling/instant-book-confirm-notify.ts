import type { SupabaseClient } from "@supabase/supabase-js";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "@/lib/inquiry/inquiry-events";
import { normalizeTenantAppointmentsSettings } from "./appointments-settings-types";
import { instantReservationConfirmedBody } from "./instant-book-gates";
import { insertReservationCards, reservationCardPayload } from "./reservation-card";
import type { ReservationStamp } from "./reservation-intent";
import { terminologyCopy } from "./terminology";

export async function emitInstantReservationConfirmed(
  admin: SupabaseClient,
  input: {
    inquiryId: string;
    tenantId: string;
    actorUserId: string;
    stamp: ReservationStamp;
    agencySettings: unknown;
  },
): Promise<void> {
  const settings =
    typeof input.agencySettings === "object" &&
    input.agencySettings !== null &&
    !Array.isArray(input.agencySettings)
      ? (input.agencySettings as Record<string, unknown>)
      : null;
  const term = terminologyCopy(
    normalizeTenantAppointmentsSettings(settings?.appointments).terminology,
    "en",
  );
  await insertReservationCards(admin, {
    inquiryId: input.inquiryId,
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    payload: reservationCardPayload(input.stamp, "confirmed", "client"),
    body: instantReservationConfirmedBody(term.singular, "en"),
  });
  await emitStandardEngineEvent(admin, {
    type: ENGINE_EVENT_TYPES.RESERVATION_CONFIRMED,
    inquiryId: input.inquiryId,
    actorUserId: input.actorUserId,
    data: { startsAt: input.stamp.starts_at, timezone: input.stamp.timezone },
  });
}
