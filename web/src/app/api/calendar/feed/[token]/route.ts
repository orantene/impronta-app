// GET /api/calendar/feed/<token>.ics
//   → 200 text/calendar   the workspace's bookings and sessions
//   → 404                 unknown token, revoked token, or no service role
//
// The route the Calendar sync drawer has been advertising since it was written.
// It printed `https://app.tulala.digital/cal/export/impronta-oran.ics?token=abc123`
// — a hardcoded string with no handler behind it — under a "Copy" button, so
// pasting it into Apple Calendar produced a subscription that failed forever
// with no explanation anywhere in the product.
//
// THE TOKEN IS THE ONLY CREDENTIAL, AND THERE IS NO SESSION.
// A calendar app polls this URL from its own servers (Google fetches
// server-side, entirely outside the operator's browser). Cookies do not travel,
// so requiring a session would mean requiring a subscription that cannot exist.
// The token carries the whole authority, which is why it is a 256-bit random
// secret, stored only as a hash, and revocable in one UPDATE.
//
// EVERY REFUSAL IS 404, never 401 or 403. A revoked token answering "403 this
// was revoked" confirms to whoever holds it that they had a real workspace's
// URL. There is nothing to gain from the distinction and something to lose.
//
// `no-store`, because a shared cache holding one workspace's calendar keyed on
// a URL that another workspace could also request is exactly the accident this
// header exists to prevent. Calendar clients do their own polling; they do not
// need us to be cacheable.

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { buildIcsFeed } from "@/lib/calendar/ics-feed";
import { loadCalendarFeedEvents } from "@/lib/calendar/feed-read";
import {
  resolveCalendarFeedToken,
  touchCalendarFeedToken,
} from "@/lib/calendar/feed-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Calendar clients decide what a URL is by its extension as often as by its
 * Content-Type, so the drawer hands out `<token>.ics`. Stripping the suffix
 * here means the same token also works without it, which is what an operator
 * who retyped the URL by hand ends up with.
 */
function stripIcsSuffix(raw: string): string {
  return raw.endsWith(".ics") ? raw.slice(0, -4) : raw;
}

const NOT_FOUND = new NextResponse("Not found", { status: 404 });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const token = stripIcsSuffix(decodeURIComponent(rawToken ?? ""));
  if (!token) return NOT_FOUND;

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("calendar.feed/admin", "createServiceRoleClient returned null");
    return NOT_FOUND;
  }

  const resolved = await resolveCalendarFeedToken(admin, token);
  if (!resolved) return NOT_FOUND;

  const origin = (() => {
    try {
      return new URL(request.url).origin;
    } catch {
      return null;
    }
  })();

  const events = await loadCalendarFeedEvents(admin, {
    tenantId: resolved.tenantId,
    publicOrigin: origin,
  });

  // Not awaited: a failed metadata stamp must never cost the operator their
  // calendar. See `touchCalendarFeedToken`.
  void touchCalendarFeedToken(admin, token);

  const body = buildIcsFeed(events, { calendarName: "Tulala", refreshMinutes: 15 });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="tulala.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
