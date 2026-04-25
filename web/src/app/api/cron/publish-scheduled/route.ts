import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { publishHomepage } from "@/lib/site-admin/server/homepage";
import { logServerError } from "@/lib/server/safe-error";
import { isLocale, type Locale } from "@/lib/site-admin/locales";

/**
 * Phase 12 — scheduled-publish cron sweep.
 *
 * Wakes once a minute (Vercel cron config below), finds homepage rows
 * whose `scheduled_publish_at <= now()` and `status = 'draft'`, and
 * runs the same `publishHomepage()` flow the operator would have hit
 * manually. The capability check inside `publishHomepage` is bypassed
 * for cron callers via the `bypassCapabilityCheck` flag — the audit row
 * still attributes the publish to the human who originally scheduled it
 * (`scheduled_by`) so the trail is honest.
 *
 * Auth: gated on the `CRON_SECRET` env var (Vercel cron jobs forward
 * `Authorization: Bearer $CRON_SECRET`). The same secret is shared with
 * `inquiry-engine` so we don't proliferate secrets.
 *
 * Idempotency: the schedule columns are cleared on success so a row
 * never publishes twice. On failure we leave the schedule intact and
 * the next sweep retries — the publish itself uses CAS on `version` so
 * a duplicate run on a stale draft is rejected at the DB layer.
 *
 * Configure in `vercel.json`:
 *
 * ```json
 * {
 *   "crons": [
 *     { "path": "/api/cron/publish-scheduled", "schedule": "* * * * *" }
 *   ]
 * }
 * ```
 */

interface PublishedRowReport {
  pageId: string;
  locale: string;
  version: number;
  publishedAt: string;
}

interface FailedRowReport {
  pageId: string;
  locale: string | null;
  error: string;
}

interface ScheduledRow {
  id: string;
  tenant_id: string;
  locale: string | null;
  version: number;
  scheduled_publish_at: string;
  scheduled_by: string | null;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const token =
    url.searchParams.get("token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  // Find every draft homepage whose fire time has arrived. The partial
  // index `idx_cms_pages_scheduled_sweep` keeps this O(due-rows).
  const nowIso = new Date().toISOString();
  const { data: dueRowsRaw, error: dueErr } = await supabase
    .from("cms_pages")
    .select(
      "id, tenant_id, locale, version, scheduled_publish_at, scheduled_by",
    )
    .lte("scheduled_publish_at", nowIso)
    .eq("status", "draft")
    .eq("is_system_owned", true)
    .eq("system_template_key", "homepage");

  if (dueErr) {
    logServerError("cron/publish-scheduled/load-due", dueErr);
    return NextResponse.json(
      { ok: false, error: dueErr.message },
      { status: 500 },
    );
  }

  const dueRows = (dueRowsRaw ?? []) as ScheduledRow[];

  const published: PublishedRowReport[] = [];
  const failed: FailedRowReport[] = [];

  for (const row of dueRows) {
    if (!row.locale || !isLocale(row.locale)) {
      failed.push({
        pageId: row.id,
        locale: row.locale,
        error: `Invalid locale "${row.locale ?? "<null>"}"`,
      });
      continue;
    }
    const locale = row.locale as Locale;

    try {
      const result = await publishHomepage(supabase, {
        tenantId: row.tenant_id,
        values: {
          tenantId: row.tenant_id,
          locale,
          expectedVersion: row.version,
        },
        actorProfileId: row.scheduled_by,
        // The capability check requires a user-context membership row;
        // cron runs without a session. The audit row still attributes
        // the publish to `scheduled_by` so the trail is honest.
        bypassCapabilityCheck: true,
      });

      if (!result.ok) {
        failed.push({
          pageId: row.id,
          locale,
          error: `${result.code}: ${result.message ?? "Publish failed"}`,
        });
        continue;
      }

      // Clear the schedule columns so the row doesn't re-fire on the
      // next sweep. We do this AFTER a successful publish — a failed
      // run leaves the schedule in place so the next sweep retries.
      const { error: clearErr } = await supabase
        .from("cms_pages")
        .update({
          scheduled_publish_at: null,
          scheduled_by: null,
          scheduled_revision_id: null,
        })
        .eq("id", row.id)
        .eq("tenant_id", row.tenant_id);
      if (clearErr) {
        logServerError("cron/publish-scheduled/clear-schedule", clearErr);
      }

      published.push({
        pageId: row.id,
        locale,
        version: result.data.version,
        publishedAt: result.data.publishedAt,
      });
    } catch (err) {
      logServerError("cron/publish-scheduled/publish", err);
      failed.push({
        pageId: row.id,
        locale: row.locale,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    sweptAt: nowIso,
    dueCount: dueRows.length,
    publishedCount: published.length,
    failedCount: failed.length,
    published,
    failed,
  });
}
