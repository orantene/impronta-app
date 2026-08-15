import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { publishHomepage } from "@/lib/site-admin/server/homepage";
import { publishPage } from "@/lib/site-admin/server/pages";
import { publishCmsFreeformPageWithClient } from "@/lib/site-admin/builder-core/adapters/cms-freeform-publish-core";
import { logServerError } from "@/lib/server/safe-error";
import { isLocale, type Locale } from "@/lib/site-admin/locales";
import {
  runScheduledPublishSweep,
  SCHEDULED_SWEEP_COLUMNS,
  type ScheduledPageRow,
  type ScheduledPublishHandlers,
} from "@/lib/site-admin/server/scheduled-publish-sweep";

/**
 * Phase 12 — scheduled-publish cron sweep.
 *
 * Wakes once a minute (Vercel cron config below), finds EVERY cms page whose
 * `scheduled_publish_at <= now()`, and runs the same publish flow the operator
 * would have hit manually for that page's kind. The capability check inside
 * each publish path is bypassed for cron callers — the audit row still
 * attributes the publish to the human who scheduled it (`scheduled_by`) so the
 * trail is honest.
 *
 * SITE-WIDE, NOT HOMEPAGE-ONLY. This sweep used to hard-filter
 * `system_template_key = 'homepage'` while the editor's Publish caret offered
 * "Schedule publish" on every surface, so a schedule set on an inner page
 * never fired. Row-kind routing lives in `scheduled-publish-sweep.ts` (pure,
 * unit-tested) because the three kinds take three different publish paths and
 * simply dropping the filter would have pushed freeform pages through the
 * homepage publisher, which reads `cms_page_sections` and would have published
 * an empty slot composition over a real page.
 *
 * Locale keying: `cms_pages` is unique on (tenant_id, locale, slug), so each
 * locale of a page is its OWN row with its own schedule. The sweep publishes
 * per row; scheduling the "en" page does not touch the "es" one.
 *
 * Auth: gated on the `CRON_SECRET` env var (Vercel cron jobs forward
 * `Authorization: Bearer $CRON_SECRET`). The same secret is shared with
 * `inquiry-engine` so we don't proliferate secrets.
 *
 * Idempotency: the schedule columns are cleared on success so a row never
 * publishes twice. On failure we leave the schedule intact and the next sweep
 * retries — the publish itself uses CAS on `version` so a duplicate run on a
 * stale draft is rejected at the DB layer.
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

export async function GET(request: Request) {
  // Auth (audit H12): Authorization header bearer only — query-param token
  // was removed because it leaks via access logs.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  // Find every page whose fire time has arrived, of any kind. The partial
  // index `idx_cms_pages_scheduled_sweep` keeps this O(due-rows).
  //
  // `archived` is excluded so a stale schedule can never resurrect an archived
  // page. We deliberately do NOT filter `status='draft'`: publishing a freeform
  // page never flips its status back to draft, so a draft-only filter meant a
  // page that had been published once could never fire a later schedule.
  // `isRowDue` in the sweep re-asserts both conditions.
  const nowIso = new Date().toISOString();
  const { data: dueRowsRaw, error: dueErr } = await supabase
    .from("cms_pages")
    .select(SCHEDULED_SWEEP_COLUMNS)
    .lte("scheduled_publish_at", nowIso)
    .neq("status", "archived");

  if (dueErr) {
    logServerError("cron/publish-scheduled/load-due", dueErr);
    return NextResponse.json(
      { ok: false, error: dueErr.message },
      { status: 500 },
    );
  }

  const rows = (dueRowsRaw ?? []) as unknown as ScheduledPageRow[];

  const handlers: ScheduledPublishHandlers = {
    async homepage(row, locale) {
      const result = await publishHomepage(supabase, {
        tenantId: row.tenant_id,
        values: {
          tenantId: row.tenant_id,
          locale: locale as Locale,
          expectedVersion: row.version,
        },
        actorProfileId: row.scheduled_by,
        // The capability check requires a user-context membership row; cron
        // runs without a session. The audit row still attributes the publish
        // to `scheduled_by` so the trail is honest.
        bypassCapabilityCheck: true,
      });
      if (!result.ok) {
        return {
          ok: false,
          error: `${result.code}: ${result.message ?? "Publish failed"}`,
        };
      }
      return {
        ok: true,
        version: result.data.version,
        publishedAt: result.data.publishedAt,
      };
    },

    async freeform(row) {
      // Freeform pages persist their tree to `cms_pages.blocks` and never touch
      // `cms_page_sections`; the shared core is the exact sequence the operator's
      // Publish button runs (status flip + `kind='published'` revision).
      const result = await publishCmsFreeformPageWithClient({
        supabase,
        tenantId: row.tenant_id,
        pageId: row.id,
        actorProfileId: row.scheduled_by,
      });
      if (!result.ok) return { ok: false, error: result.error };
      // Freeform publishing does not bump `cms_pages.version` (the adapter
      // derives its CAS token from `updated_at`), so report the row's version.
      return { ok: true, version: row.version, publishedAt: result.publishedAt };
    },

    async template(row) {
      const result = await publishPage(supabase, {
        tenantId: row.tenant_id,
        values: {
          id: row.id,
          tenantId: row.tenant_id,
          expectedVersion: row.version,
        },
        actorProfileId: row.scheduled_by,
        bypassCapabilityCheck: true,
      });
      if (!result.ok) {
        return {
          ok: false,
          error: `${result.code}: ${result.message ?? "Publish failed"}`,
        };
      }
      return {
        ok: true,
        version: result.data.version,
        publishedAt: result.data.publishedAt,
      };
    },
  };

  const report = await runScheduledPublishSweep({
    nowIso,
    rows,
    handlers,
    isLocale,
    async clearSchedule(row) {
      // Cleared AFTER a successful publish only — a failed run leaves the
      // schedule in place so the next sweep retries.
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
    },
  });

  for (const failure of report.failed) {
    logServerError(
      "cron/publish-scheduled/publish",
      new Error(`${failure.pageId} (${failure.kind ?? "unknown"}): ${failure.error}`),
    );
  }

  return NextResponse.json({ ok: true, ...report });
}
