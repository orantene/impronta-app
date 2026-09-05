import { notFound } from "next/navigation";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { DoorClient } from "./door-client";

/**
 * `/admin/events/door?session=<id>` — the door, as a real route file.
 *
 * A REAL ROUTE UNDER AN ALREADY-REGISTERED SEGMENT, on purpose. `events` is
 * in `WORKSPACE_PAGE_SEGMENTS` and the layout strips to the first segment,
 * so this needs no allow-list entry, no reserved slug, no DB mirror — the
 * five-registration round that `/events` cost. Precedent:
 * `admin/settings/reservations/page.tsx`.
 *
 * Server-side auth once, here, then a client island does the tapping. The
 * staff guard takes no tenant argument by design; scope comes from the session.
 */

export const dynamic = "force-dynamic";

type Search = { searchParams: Promise<{ session?: string }> };

export default async function DoorPage({ searchParams }: Search) {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) notFound();

  const { session } = await searchParams;
  const sessionId = typeof session === "string" && /^[0-9a-f-]{36}$/i.test(session) ? session : null;

  return <DoorClient sessionId={sessionId} tenantId={guard.tenantId} />;
}
