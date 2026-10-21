/**
 * GET /api/public/booking/slots?offering&from&days&duration
 *
 * Host-resolved, unauthenticated. Returns free slot starts only — never raw
 * holds, bookings, or blocks. Service-role internally. s-maxage=30.
 * Optional `duration` (minutes) is base + selected extras; omitted → offering.
 *
 * Guards and reasons live in `loadPublicOpenTimes`, shared with the AI-agent
 * tools (TUL-21) so both answer the same question the same way.
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { checkBookingSlots } from "@/lib/rate-limit-kv";
import { getPublicHostContext } from "@/lib/saas/scope";
import { resolvePublicWorkspaceTenantId } from "@/lib/scheduling/resolve-public-workspace";
import { workspaceSlugFromPathname } from "@/lib/scheduling/public-slots-workspace";
import { HOST_TALENT_PROFILE_HEADER } from "@/lib/saas/host-context";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { resolvePublicClientIp } from "@/lib/server/public-client-ip";
import {
  loadPublicOpenTimes,
  type OpenTimesReason,
  PUBLIC_BOOKING_HOST_KINDS,
} from "@/lib/scheduling/public-open-times";
import {
  clampPublicSlotDays,
  parsePublicSlotDuration,
  parsePublicSlotFrom,
} from "@/lib/scheduling/public-slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OFFERING_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SLOTS_CACHE = "public, s-maxage=30, stale-while-revalidate=60";

const SLOTS_VARY = "Host, x-impronta-host-name, x-impronta-host-context";

function slotsJson(
  slots: string[],
  status = 200,
  extra?: { timezone?: string; placeCity?: string | null; reason?: OpenTimesReason | null },
): NextResponse {
  return NextResponse.json(
    {
      slots,
      ...(extra?.timezone ? { timezone: extra.timezone } : {}),
      // Talent's home city for the zone chip (Houston time, not Chicago time).
      ...(extra?.placeCity ? { placeCity: extra.placeCity } : {}),
      // Only when empty: a caller with slots does not need a reason, and
      // sending one anyway invites a client to branch on it.
      ...(slots.length === 0 && extra?.reason ? { reason: extra.reason } : {}),
    },
    {
      status,
      headers: {
        "Cache-Control": SLOTS_CACHE,
        Vary: SLOTS_VARY,
      },
    },
  );
}

export async function GET(request: Request) {
  const reqHeaders = await headers();
  const limited = await checkBookingSlots(resolvePublicClientIp(reqHeaders));
  if (!limited.ok) {
    const retryAfter = Math.max(1, Math.ceil((limited.retryAfterMs ?? 1000) / 1000));
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  const url = new URL(request.url);
  const offeringId = (url.searchParams.get("offering") ?? "").trim();
  if (!OFFERING_ID_RE.test(offeringId)) {
    return NextResponse.json({ error: "invalid_offering" }, { status: 400 });
  }

  const host = await getPublicHostContext();
  const talentSiteId =
    host.kind === "talent_site"
      ? reqHeaders.get(HOST_TALENT_PROFILE_HEADER)?.trim() || null
      : null;
  if (!PUBLIC_BOOKING_HOST_KINDS.has(host.kind)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  try {
    const now = new Date();
    const workspaceSlug = workspaceSlugFromPathname(
      `/w/${(url.searchParams.get("workspace") ?? "").trim()}`,
    );
    const workspaceRequested = url.searchParams.has("workspace");
    const workspaceTenantId =
      workspaceRequested && workspaceSlug
        ? await resolvePublicWorkspaceTenantId(admin, workspaceSlug)
        : null;
    const result = await loadPublicOpenTimes(admin, {
      workspace: { requested: workspaceRequested, tenantId: workspaceTenantId },
      host: {
        kind: host.kind,
        tenantId: host.kind === "agency" || host.kind === "hub" ? host.tenantId : null,
        talentSiteId,
      },
      offeringId,
      from: parsePublicSlotFrom(url.searchParams.get("from"), now),
      days: clampPublicSlotDays(url.searchParams.get("days")),
      // Catalog extras lengthen the hold; clients send the total so projection
      // matches confirm. Garbage / omitted → offering duration alone.
      parseDuration: (base) => parsePublicSlotDuration(url.searchParams.get("duration"), base),
      now,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return slotsJson(result.slots, 200, { timezone: result.timezone, placeCity: result.placeCity, reason: result.reason });
  } catch (err) {
    logServerError("api.public.booking.slots", err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
