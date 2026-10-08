/**
 * Cron — one-way Support Desk → Notion ticket mirror (TUL-45).
 *
 * Auth: Authorization: Bearer $CRON_SECRET
 * Soft-skip when Notion env is missing (Desk keeps working; sync retries later).
 * Notion never writes back into Tulala.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/support-notion-mirror
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  isNotionMirrorForceDisabled,
  readNotionMirrorConfig,
} from "@/lib/support/notion-mirror/config";
import {
  NOTION_MIRROR_BATCH_LIMIT,
  checkCronBearer,
  mapDbMirrorRow,
  pushTicketToNotion,
  shouldStopForElapsedBudget,
  type MirrorTicketRow,
} from "@/lib/support/notion-mirror/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminClient = NonNullable<ReturnType<typeof createServiceRoleClient>>;

async function listDueTickets(
  admin: AdminClient,
  limit: number,
): Promise<{ rows: MirrorTicketRow[]; error: unknown }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc(
    "list_support_tickets_notion_mirror_due",
    { p_limit: limit },
  );
  if (error) return { rows: [], error };
  const rows: MirrorTicketRow[] = [];
  for (const raw of data ?? []) {
    const row = mapDbMirrorRow(raw as Record<string, unknown>);
    if (row) rows.push(row);
  }
  return { rows, error: null };
}

async function markMirrored(
  admin: AdminClient,
  ticketId: string,
  pageId: string,
): Promise<{ error: unknown }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).rpc("mark_support_ticket_notion_mirrored", {
    p_id: ticketId,
    p_page_id: pageId,
  });
  return { error };
}

async function markMirrorFailed(
  admin: AdminClient,
  ticketId: string,
): Promise<{ error: unknown }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).rpc("mark_support_ticket_notion_mirror_failed", {
    p_id: ticketId,
  });
  return { error };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/support-notion-mirror", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (!checkCronBearer(request.headers.get("authorization"), secret).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isNotionMirrorForceDisabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const { configured, config, missing } = readNotionMirrorConfig();
  if (!configured || !config) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "notion_env_missing",
      missing,
    });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 503 });
  }

  const { rows: due, error } = await listDueTickets(admin, NOTION_MIRROR_BATCH_LIMIT);
  if (error) {
    logServerError("cron/support-notion-mirror.list", error);
    return NextResponse.json({ ok: false, error: "list failed" }, { status: 500 });
  }

  const stats = {
    scanned: due.length,
    due: due.length,
    created: 0,
    updated: 0,
    failed: 0,
    stopped: null as string | null,
  };

  const startedAtMs = Date.now();

  for (const ticket of due) {
    if (shouldStopForElapsedBudget(startedAtMs, Date.now())) {
      stats.stopped = "elapsed_budget";
      break;
    }
    const hadPageId = Boolean(ticket.notionPageId);
    try {
      const result = await pushTicketToNotion({ config, ticket });
      if (!result.ok) {
        stats.failed += 1;
        logServerError(
          "cron/support-notion-mirror.push",
          `ticket ${ticket.ticketNumber}: ${result.status} ${result.message}`,
        );
        const { error: failErr } = await markMirrorFailed(admin, ticket.id);
        if (failErr) {
          logServerError("cron/support-notion-mirror.mark-failed", failErr);
        }
        if (result.status === 429) {
          stats.stopped = result.retryAfterSec != null
            ? `rate_limited_retry_after_${result.retryAfterSec}s`
            : "rate_limited";
          break;
        }
        continue;
      }
      const { error: writeErr } = await markMirrored(admin, ticket.id, result.pageId);
      if (writeErr) {
        stats.failed += 1;
        logServerError("cron/support-notion-mirror.writeback", writeErr);
        const { error: failErr } = await markMirrorFailed(admin, ticket.id);
        if (failErr) {
          logServerError("cron/support-notion-mirror.mark-failed", failErr);
        }
        continue;
      }
      if (hadPageId) stats.updated += 1;
      else stats.created += 1;
    } catch (err) {
      stats.failed += 1;
      logServerError("cron/support-notion-mirror.push", err);
      const { error: failErr } = await markMirrorFailed(admin, ticket.id);
      if (failErr) {
        logServerError("cron/support-notion-mirror.mark-failed", failErr);
      }
    }
  }

  return NextResponse.json({ ok: true, ...stats });
}
