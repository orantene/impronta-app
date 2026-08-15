"use server";

/**
 * Phase 12 — scheduled-publish server actions.
 *
 * Operators set/cancel a future fire time on the page they are editing, from
 * the Schedule drawer. The cron route under `/api/cron/publish-scheduled`
 * (Vercel cron, secret-gated) sweeps every minute, finds rows whose
 * `scheduled_publish_at <= now()`, and runs the publish path that page kind
 * needs (homepage / freeform / template).
 *
 * PAGE-SCOPED, NOT HOMEPAGE-ONLY. These actions used to resolve the tenant's
 * homepage row unconditionally, so an operator who opened Schedule while
 * editing an inner page silently scheduled a HOMEPAGE publish, and the drawer
 * showed the homepage's schedule under the inner page's title. The drawer now
 * passes the editor's page identity (`EditContext.pageId` / `pageSlug`) and
 * `resolveEditorPage` turns it into the right row; with neither, the homepage
 * is still the answer (the storefront homepage mounts with no slug), so any
 * legacy caller keeps its old behaviour.
 *
 * Constraints:
 *   - `requireSession` + `requireEditSurfaceTenantScope` gate every entry point.
 *   - The DB trigger `cms_pages_scheduled_publish_check` rejects past
 *     timestamps (with a 1-minute grace for clock skew) — we still
 *     validate client-side so the UI gives a clean error.
 *   - We don't enforce a max horizon today; the cron sweep doesn't care
 *     how far out the timestamp is. Realistic UI surfaces ≤ 30 days.
 */

import { requireSession } from "@/lib/server/action-guards";
import { requireEditSurfaceTenantScope } from "@/lib/saas";
import { logServerError } from "@/lib/server/safe-error";
import { isLocale, type Locale } from "@/lib/site-admin/locales";
import { resolveEditorPage } from "@/lib/site-admin/server/editor-page-ref";

/**
 * Page identity forwarded by the Schedule drawer. Both fields are optional and
 * untrusted (they come from a client component); `resolveEditorPage` scopes
 * every lookup to the caller's tenant. Omitting both selects the homepage.
 */
export interface SchedulePageRefInput {
  /** `cms_pages.id` of the page being edited. Authoritative when present. */
  pageId?: string | null;
  /** `cms_pages.slug` of the page being edited. Used when no id is available. */
  pageSlug?: string | null;
}

export interface SchedulePublishInput extends SchedulePageRefInput {
  /** Locale of the page to schedule. Defaults to "en" if omitted. */
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
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  const scope = await requireEditSurfaceTenantScope().catch(() => null);
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

  const pageRow = await resolveEditorPage(supabase, tenantId, {
    pageId: input.pageId,
    pageSlug: input.pageSlug,
    locale,
  }).catch((err) => {
    logServerError("schedule-publish/resolve-page", err);
    return null;
  });
  if (!pageRow) {
    return { ok: false, error: "Page not found.", code: "NOT_FOUND" };
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

/** Clear the scheduled fire time on the edited page's row. Idempotent. */
export async function cancelScheduledPublishAction(
  input: SchedulePageRefInput & { locale?: string } = {},
): Promise<CancelScheduledPublishResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  const scope = await requireEditSurfaceTenantScope().catch(() => null);
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

  const pageRow = await resolveEditorPage(supabase, tenantId, {
    pageId: input.pageId,
    pageSlug: input.pageSlug,
    locale,
  }).catch((err) => {
    logServerError("schedule-publish/cancel-resolve-page", err);
    return null;
  });
  if (!pageRow) {
    return { ok: false, error: "Page not found.", code: "NOT_FOUND" };
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
 * Read the current schedule state for the edited page's row. The drawer calls
 * this on open so a previously-set fire time round-trips without
 * re-rendering the whole EditContext.
 */
export async function loadScheduledPublishAction(
  input: SchedulePageRefInput & { locale?: string } = {},
): Promise<LoadScheduledPublishResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  const scope = await requireEditSurfaceTenantScope().catch(() => null);
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

  const resolved = await resolveEditorPage(supabase, tenantId, {
    pageId: input.pageId,
    pageSlug: input.pageSlug,
    locale,
  }).catch((err) => {
    logServerError("schedule-publish/load-state-resolve", err);
    return null;
  });
  if (!resolved) {
    return { ok: false, error: "Page not found.", code: "NOT_FOUND" };
  }

  const { data: pageRow, error: pageErr } = await supabase
    .from("cms_pages")
    .select("id, scheduled_publish_at, scheduled_by")
    .eq("id", resolved.id)
    .eq("tenant_id", tenantId)
    .maybeSingle<{
      id: string;
      scheduled_publish_at: string | null;
      scheduled_by: string | null;
    }>();
  if (pageErr || !pageRow) {
    if (pageErr) logServerError("schedule-publish/load-state", pageErr);
    return { ok: false, error: "Page not found.", code: "NOT_FOUND" };
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
