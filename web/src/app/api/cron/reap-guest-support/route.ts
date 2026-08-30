/**
 * Cron — purge unconverted guest tickets after GUEST_TICKET_RETENTION_DAYS.
 * Only surface='guest' AND requester_user_id IS NULL. Claimed tickets stay.
 * Messages/events cascade. Logs counts so a silent reaper is not trusted.
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { supportFrom } from "@/lib/support/support-from";
import { mapTicketRow, type SupportTicketRow } from "@/lib/support/support-types";
import {
  GUEST_TICKET_RETENTION_DAYS,
  guestTicketRetentionCutoff,
  isUnconvertedGuestExpired,
} from "@/lib/support/guest-retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/reap-guest-support", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 503 });
  }

  const cutoff = guestTicketRetentionCutoff();
  const { data, error } = await supportFrom(admin, "support_tickets")
    .select("*")
    .eq("surface", "guest")
    .is("requester_user_id", null)
    .lt("created_at", cutoff);

  if (error) {
    logServerError("cron/reap-guest-support.list", error);
    return NextResponse.json({ ok: false, error: "list failed" }, { status: 500 });
  }

  const expired = (data ?? [])
    .map(mapTicketRow)
    .filter((t: SupportTicketRow | null): t is SupportTicketRow => Boolean(t))
    .filter((t: SupportTicketRow) =>
      isUnconvertedGuestExpired({
        surface: t.surface,
        requesterUserId: t.requesterUserId,
        createdAt: t.createdAt,
      }),
    );

  let deleted = 0;
  for (const ticket of expired) {
    const { error: delErr } = await supportFrom(admin, "support_tickets")
      .delete()
      .eq("id", ticket.id)
      .eq("surface", "guest")
      .is("requester_user_id", null);
    if (delErr) {
      logServerError("cron/reap-guest-support.delete", delErr);
      continue;
    }
    deleted += 1;
  }

  await improntaLog("cron.reap-guest-support", {
    retentionDays: GUEST_TICKET_RETENTION_DAYS,
    cutoff,
    matched: expired.length,
    deleted,
  });

  return NextResponse.json({
    ok: true,
    retentionDays: GUEST_TICKET_RETENTION_DAYS,
    cutoff,
    matched: expired.length,
    deleted,
  });
}
