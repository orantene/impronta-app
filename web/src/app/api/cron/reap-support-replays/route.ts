import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { supportFrom } from "@/lib/support/support-from";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "support-replays";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/reap-support-replays", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const enabled = process.env.REAP_SUPPORT_REPLAYS_ENABLED === "true";
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  return Sentry.withMonitor("reap-support-replays", async () => {
    const { data } = await supportFrom(admin, "support_replay_sessions")
      .select("id, storage_prefix")
      .lte("expires_at", new Date().toISOString())
      .in("status", ["recording", "ended", "uploaded"]);
    const rows = data ?? [];
    let deleted = 0;
    for (const row of rows as Array<{ id: string; storage_prefix: string | null }>) {
      if (enabled && row.storage_prefix) {
        const { data: objects } = await admin.storage.from(BUCKET).list(row.storage_prefix, { limit: 100 });
        const paths = (objects ?? []).map((o) => `${row.storage_prefix}/${o.name}`);
        if (paths.length) await admin.storage.from(BUCKET).remove(paths);
        await supportFrom(admin, "support_replay_sessions").update({ status: "expired" }).eq("id", row.id);
        deleted += 1;
      }
    }
    return NextResponse.json({
      ok: true,
      dryRun: !enabled,
      matched: rows.length,
      expired: enabled ? deleted : 0,
    });
  });
}
