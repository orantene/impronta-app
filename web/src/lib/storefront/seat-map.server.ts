"use server";

/** seat_map — the server actions the island imports dynamically. */

import { releaseCapacity } from "@/lib/capacity";
import { resolveGuestSessionId } from "@/lib/guest/guest-session";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { admissionHoldSeats } from "@/lib/venues/event-holds";

import { mapEngineRefusal } from "./refusals";
import { resolveStorefrontIdentity, storefrontLocale } from "./request-context";
import { actSeatMapCore, readSeatMapCore, type SeatMapDeps } from "./seat-map.core";
import type { SeatMapData, SeatMapInput, SeatMapProps, SeatMapResult } from "./seat-map.types";

async function bind(locale: string | null | undefined): Promise<SeatMapDeps | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const [identity, guestSessionRowId, lang] = await Promise.all([resolveStorefrontIdentity(), resolveGuestSessionId(), storefrontLocale(locale)]);
  return {
    admin,
    identity,
    guestSessionRowId,
    locale: lang,
    holdSeats: (client, input) => admissionHoldSeats(client, input),
    releaseCapacity: (ids, client) => releaseCapacity(ids, client as Parameters<typeof releaseCapacity>[1]),
  };
}

export async function readSeatMap(
  tenantId: string,
  props: SeatMapProps,
): Promise<{ ok: true; data: SeatMapData } | { ok: false; reason: string }> {
  try {
    const deps = await bind(props.locale);
    if (!deps) return { ok: false, reason: "unavailable" };
    return await readSeatMapCore(deps, tenantId, props);
  } catch (error) {
    logServerError("storefront.seatMap.read", error);
    return { ok: false, reason: "unavailable" };
  }
}

export async function actSeatMap(input: SeatMapInput, _expectedVersion?: number): Promise<SeatMapResult> {
  try {
    const deps = await bind(input.locale);
    if (!deps) return mapEngineRefusal("unavailable", "en");
    return await actSeatMapCore(deps, input);
  } catch (error) {
    logServerError("storefront.seatMap.act", error);
    return mapEngineRefusal("engine_error", input.locale === "es" ? "es" : "en");
  }
}
