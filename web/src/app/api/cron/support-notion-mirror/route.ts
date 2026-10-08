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
import { supportFrom } from "@/lib/support/support-from";
import {
  isNotionMirrorForceDisabled,
  readNotionMirrorConfig,
} from "@/lib/support/notion-mirror/config";
import {
  NOTION_MIRROR_BATCH_LIMIT,
  NOTION_MIRROR_SCAN_LIMIT,
  checkCronBearer,
  mapDbMirrorRow,
  pickDueMirrorTickets,
  pushTicketToNotion,
  type MirrorTicketRow,
} from "@/lib/support/notion-mirror/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT_COLS =
  "id, ticket_number, subject, status, category, created_at, updated_at, notion_page_id, notion_synced_at";

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

  const { data, error } = await supportFrom(admin, "support_tickets")
    .select(SELECT_COLS)
    .order("updated_at", { ascending: false })
    .limit(NOTION_MIRROR_SCAN_LIMIT);

  if (error) {
    logServerError("cron/support-notion-mirror.list", error);
    return NextResponse.json({ ok: false, error: "list failed" }, { status: 500 });
  }

  const mapped: MirrorTicketRow[] = [];
  for (const raw of data ?? []) {
    const row = mapDbMirrorRow(raw as Record<string, unknown>);
    if (row) mapped.push(row);
  }
  const due = pickDueMirrorTickets(mapped, NOTION_MIRROR_BATCH_LIMIT);

  const stats = { scanned: mapped.length, due: due.length, created: 0, updated: 0, failed: 0 };

  for (const ticket of due) {
    const wasCreate = !ticket.notionPageId;
    try {
      const result = await pushTicketToNotion({ config, ticket });
      if (!result.ok) {
        stats.failed += 1;
        logServerError(
          "cron/support-notion-mirror.push",
          `ticket ${ticket.ticketNumber}: ${result.status} ${result.message}`,
        );
        continue;
      }
      const syncedAt = new Date().toISOString();
      const { error: writeErr } = await supportFrom(admin, "support_tickets")
        .update({
          notion_page_id: result.pageId,
          notion_synced_at: syncedAt,
        })
        .eq("id", ticket.id);
      if (writeErr) {
        stats.failed += 1;
        logServerError("cron/support-notion-mirror.writeback", writeErr);
        continue;
      }
      if (wasCreate) stats.created += 1;
      else stats.updated += 1;
    } catch (err) {
      stats.failed += 1;
      logServerError("cron/support-notion-mirror.push", err);
    }
  }

  return NextResponse.json({ ok: true, ...stats });
}
