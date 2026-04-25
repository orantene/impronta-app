"use server";

/**
 * Phase 12 — scheduled-publish server actions.
 *
 * Operators set/cancel a future fire time on the homepage row from the
 * Schedule drawer in the editor. The cron route under
 * `/api/cron/publish-scheduled` (Vercel cron, secret-gated) sweeps every
 * minute, finds rows whose `scheduled_publish_at <= now()` and whose
 * `status='draft'`, then calls the same `publishHomepage()` flow the
 * operator would have hit manually.
 *
 * Constraints:
 *   - `requireStaff` + `requireTenantScope` gate every entry point.
 *   - The DB trigger `cms_pages_scheduled_publish_check` rejects past
 *     timestamps (with a 1-minute grace for clock skew) — we still
 *     validate client-side so the UI gives a clean error.
 *   - We don't enforce a max horizon today; the cron sweep doesn't care
 *     how far out the timestamp is. Realistic UI surfaces ≤ 30 days.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { logServerError } from "@/lib/server/safe-error";
import { isLocale, type Locale } from "@/lib/site-admin/locales";

export interface SchedulePublishInput {
  /** Locale of the homepage to schedule. Defaults to "en" if omitted. */
  locale?: string;
  /** ISO8601 UTC timestamp at which the cron sweep should publish the page. */
  publishAt: string;
}

export type SchedulePublishResult =
  | {
      ok: true;
      pageId: string;
      publishAt: string;
      scheduledBy: string;
    }
  | { ok: false; error: string; code?: string };

function asLocale(raw: string | undefined): Locale | null {
  return isLocale(raw ?? "en") ? ((raw ?? "en") as Locale) : null;
}

function parsePublishAt(raw: string): Date | null {
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

/** Set (or replace) the scheduled-publish fire time on the homepage row. */
export async function schedulePublishAction(
  input: SchedulePublishInput,
): Promise<SchedulePublishResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before scheduling a publish.",
      code: "NO_TENANT",
    };
  }

  const locale = asLocale(input.locale);
  if (!locale) return { ok: false, error: "Invalid locale.", code: "BAD_INPUT" };

  const fireAt = parsePublishAt(input.publishAt);
  if (!fireAt) {
    return { ok: false, error: "Invalid publish timestamp.", code: "BAD_INPUT" };
  }
  // Client-side floor: must be at least 60s in the future. The DB trigger
  // also enforces this with a 60s skew window; mirroring it here gives the
  // UI a clean error before the round-trip.
  if (fireAt.getTime() < Date.now() + 60_000) {
    return {
      ok: false,
      error: "Pick a publish time at least one minute in the future.",
      code: "PAST_TIMESTAMP",
    };
  }

  const { supabase, user } = auth;
  const { tenantId } = scope;

  const { data: pageRow, error: pageErr } = await supabase
    .from("cms_pages")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("locale", locale)
    .eq("is_system_owned", true)
    .eq("system_template_key", "homepage")
    .maybeSingle<{ id: string }>();
  if (pageErr || !pageRow) {
    if (pageErr) logServerError("schedule-publish/load-homepage", pageErr);
    return { ok: false, error: "Homepage row not found.", code: "NOT_FOUND" };
  }

  const { error: updateErr } = await supabase
    .from("cms_pages")
    .update({
      scheduled_publish_at: fireAt.toISOString(),
      scheduled_by: user.id,
    })
    .eq("id", pageRow.id)
    .eq("tenant_id", tenantId);

  if (updateErr) {
    logServerError("schedule-publish/update", updateErr);
    return {
      ok: false,
      error: updateErr.message ?? "Could not schedule publish.",
      code: "WRITE_FAILED",
    };
  }

  return {
    ok: true,
    pageId: pageRow.id,
    publishAt: fireAt.toISOString(),
    scheduledBy: user.id,
  };
}

export type CancelScheduledPublishResult =
  | { ok: true; pageId: string }
  | { ok: false; error: string; code?: string };

/** Clear the scheduled fire time on the homepage row. Idempotent. */
export async function cancelScheduledPublishAction(
  input: { locale?: string } = {},
): Promise<CancelScheduledPublishResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before clearing the schedule.",
      code: "NO_TENANT",
    };
  }

  const locale = asLocale(input.locale);
  if (!locale) return { ok: false, error: "Invalid locale.", code: "BAD_INPUT" };

  const { supabase } = auth;
  const { tenantId } = scope;

  const { data: pageRow, error: pageErr } = await supabase
    .from("cms_pages")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("locale", locale)
    .eq("is_system_owned", true)
    .eq("system_template_key", "homepage")
    .maybeSingle<{ id: string }>();
  if (pageErr || !pageRow) {
    if (pageErr) logServerError("schedule-publish/cancel-load", pageErr);
    return { ok: false, error: "Homepage row not found.", code: "NOT_FOUND" };
  }

  const { error: updateErr } = await supabase
    .from("cms_pages")
    .update({
      scheduled_publish_at: null,
      scheduled_by: null,
    })
    .eq("id", pageRow.id)
    .eq("tenant_id", tenantId);

  if (updateErr) {
    logServerError("schedule-publish/cancel-update", updateErr);
    return {
      ok: false,
      error: updateErr.message ?? "Could not clear schedule.",
      code: "WRITE_FAILED",
    };
  }

  return { ok: true, pageId: pageRow.id };
}

export type LoadScheduledPublishResult =
  | {
      ok: true;
      pageId: string;
      /** ISO8601 UTC fire time, or `null` if unscheduled. */
      scheduledPublishAt: string | null;
      /** Display name of the staff who scheduled it (or null if unscheduled / unknown). */
      scheduledByName: string | null;
    }
  | { ok: false; error: string; code?: string };

/**
 * Read the current schedule state for the homepage row. The drawer calls
 * this on open so a previously-set fire time round-trips without
 * re-rendering the whole EditContext.
 */
export async function loadScheduledPublishAction(
  input: { locale?: string } = {},
): Promise<LoadScheduledPublishResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before reading the schedule.",
      code: "NO_TENANT",
    };
  }

  const locale = asLocale(input.locale);
  if (!locale) return { ok: false, error: "Invalid locale.", code: "BAD_INPUT" };

  const { supabase } = auth;
  const { tenantId } = scope;

  const { data: pageRow, error: pageErr } = await supabase
    .from("cms_pages")
    .select("id, scheduled_publish_at, scheduled_by")
    .eq("tenant_id", tenantId)
    .eq("locale", locale)
    .eq("is_system_owned", true)
    .eq("system_template_key", "homepage")
    .maybeSingle<{
      id: string;
      scheduled_publish_at: string | null;
      scheduled_by: string | null;
    }>();
  if (pageErr || !pageRow) {
    if (pageErr) logServerError("schedule-publish/load-state", pageErr);
    return { ok: false, error: "Homepage row not found.", code: "NOT_FOUND" };
  }

  let scheduledByName: string | null = null;
  if (pageRow.scheduled_by) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", pageRow.scheduled_by)
      .maybeSingle<{ display_name: string | null }>();
    scheduledByName = profile?.display_name ?? null;
  }

  return {
    ok: true,
    pageId: pageRow.id,
    scheduledPublishAt: pageRow.scheduled_publish_at,
    scheduledByName,
  };
}
