// Talent inbox read as a plain GET (2026-10-07 incident).
//
// The inbox used to be read through the `messagingTalentLoadInbox` server
// action. Server actions go through Next's router action queue, and on a
// direct load of /talent/inbox a history write during hydration discarded the
// pending action: its promise never settled and the router stayed suspended,
// so Messages sat on its SSR skeleton ("0 conversations") forever. A route
// handler is a normal fetch outside the router, so nothing can discard it.
// Same reader, same session guard (loadTalentActor inside the action body).

import { NextResponse, type NextRequest } from "next/server";

import { INBOX_FILTERS, type InboxFilter } from "@/lib/messaging/types";
import { messagingTalentLoadInbox } from "@/lib/server-actions/messaging-talent";

export const dynamic = "force-dynamic";

function parseFilter(value: string | null): InboxFilter {
  return (INBOX_FILTERS as readonly string[]).includes(value ?? "") ? (value as InboxFilter) : "all";
}

export async function GET(request: NextRequest) {
  const filter = parseFilter(request.nextUrl.searchParams.get("filter"));
  const result = await messagingTalentLoadInbox({ locationSlug: "all", filter });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
