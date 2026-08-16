/**
 * Cron — stale unassigned-coordinator alert (WS-D2).
 *
 * Endpoint: GET /api/cron/flag-unassigned-inquiries  (CRON_SECRET bearer auth)
 *
 * Background: an inquiry can be submitted with `coordinator_id IS NULL` — the
 * 3-tier assignment fallback (lib/inquiry/coordinator-assignment.ts) can find
 * no default coordinator / owner and leave the inquiry with nobody driving it.
 * /admin/triage already surfaces these in its "Unassigned" bucket (passive). This
 * cron is the PROACTIVE counterpart: it pings workspace admins when such an
 * inquiry has sat unclaimed for too long, so it doesn't rot silently in the queue.
 *
 * Scan (mirrors the triage "Unassigned" bucket — open inquiries, no coordinator):
 *   inquiries
 *   WHERE coordinator_id IS NULL
 *     AND status NOT IN (INQUIRY_CLOSED_STATUSES)   -- open, not terminal
 *     AND created_at < now() - STALE_THRESHOLD       -- sat too long
 *
 * For each match that has NOT already been alerted, we emit the existing
 * `COORDINATOR_ASSIGNMENT_TIMED_OUT` event (the same event the assignment-lapse
 * sweep `processCoordinatorTimeouts` raises). Emission uses BOTH halves of the
 * engine's standard pair, exactly as the engine RPCs do:
 *   1. `engine_emit_system_event` (SECURITY DEFINER, built for service-role
 *      cron/TTL jobs) writes the `inquiry_events` timeline row with
 *      actor_user_id = NULL, actor_role = 'system'. This row is BOTH the
 *      user-visible timeline entry AND our idempotency anchor.
 *   2. `emitStandardEngineEvent` (actorUserId: null — the system/cron path used
 *      by processExpirations) dispatches the side-effects the RPC doesn't own:
 *      the in-app bell to workspace admins (buildInquiryBells) plus the
 *      catalog-driven email (coordinator.assignment_timed_out.workspace).
 *
 * IDEMPOTENCY GUARD (do NOT double-fire): this cron runs hourly, but an inquiry
 * can sit unassigned for days. Before emitting we check `inquiry_events` for an
 * existing `coordinator.assignment_timed_out` row for that inquiry; if one
 * exists we skip it. Because step 1 above writes that exact row, the FIRST run
 * alerts and every subsequent run is a no-op — admins get one ping per stale
 * inquiry, not one per hour. (Re-assigning then re-orphaning an inquiry will not
 * re-alert; that is an accepted trade-off — the triage bucket still shows it,
 * and the lapse sweep covers coordinators that time out after assignment.)
 *
 * SHARED WITH `processCoordinatorTimeouts` (cron /api/cron/inquiry-engine).
 * That sweep unassigns a coordinator who never accepted, which turns the inquiry
 * into exactly the shape this one alerts on. Both now read AND write the same
 * anchor via `COORDINATOR_STALE_ANCHOR_EVENT`, so an inquiry is alerted once by
 * whichever sweep reaches it first — never once by each.
 * See `lib/inquiry/coordinator-stale-policy.ts`.
 *
 * STALENESS CUTOFF: `classifyStaleAlert` suppresses the notification (but still
 * anchors + timelines the row) when the inquiry went stale longer ago than the
 * policy's window. That keeps a never-run sweep from emptying months of backlog
 * into staff inboxes in one burst.
 *
 * Scheduled hourly in `web/vercel.json` at minute 45 (distinct from
 * retry-failed-emails @:00 and expire-offers @:30). Threshold is a clear
 * constant below.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/flag-unassigned-inquiries
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "@/lib/inquiry/inquiry-events";
import { buildInquiryBells } from "@/lib/inquiry/inquiry-notifications";
import {
  COORDINATOR_STALE_ANCHOR_EVENT,
  classifyStaleAlert,
} from "@/lib/inquiry/coordinator-stale-policy";
import { INQUIRY_CLOSED_STATUSES } from "@/app/(workspace)/[tenantSlug]/_data-bridge/inquiries-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How long an inquiry may sit with no coordinator before staff are alerted.
 * Two hours: long enough to absorb a normal pickup, short enough that a dropped
 * inquiry surfaces the same business day.
 */
const STALE_THRESHOLD_HOURS = 2;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/flag-unassigned-inquiries", "CRON_SECRET not set; refusing to run");
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

  try {
    const nowMs = Date.now();
    const cutoff = new Date(
      nowMs - STALE_THRESHOLD_HOURS * 60 * 60 * 1000,
    ).toISOString();

    // Open + unassigned + stale. Mirrors the triage "Unassigned" bucket
    // (coordinator_id IS NULL on a non-terminal inquiry), narrowed to rows that
    // have aged past the threshold.
    const { data: rows, error } = await admin
      .from("inquiries")
      .select("id, tenant_id, created_at")
      .is("coordinator_id", null)
      .not("status", "in", `(${INQUIRY_CLOSED_STATUSES.join(",")})`)
      .lt("created_at", cutoff);

    if (error) {
      logServerError("cron/flag-unassigned-inquiries", error);
      return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
    }

    let alerted = 0;
    let drained = 0;
    let skipped = 0;

    for (const row of rows ?? []) {
      const inquiryId = row.id as string;
      const tenantId = row.tenant_id as string;

      // Idempotency guard: skip if this inquiry was already alerted — by THIS
      // sweep or by processCoordinatorTimeouts, which writes the same anchor.
      const { data: existing, error: existingErr } = await admin
        .from("inquiry_events")
        .select("id")
        .eq("inquiry_id", inquiryId)
        .eq("event_type", COORDINATOR_STALE_ANCHOR_EVENT)
        .limit(1)
        .maybeSingle();

      if (existingErr) {
        // Conservative: a failed dedupe lookup must not cause a spam-fire. Skip
        // this inquiry; the next sweep retries it.
        logServerError("cron/flag-unassigned-inquiries.dedupe", existingErr);
        skipped += 1;
        continue;
      }

      const action = classifyStaleAlert({
        alreadyAnchored: Boolean(existing),
        staleSinceIso: row.created_at as string | null,
        nowMs,
      });

      if (action === "skip") {
        skipped += 1;
        continue;
      }

      // 1) Write the timeline row + dedupe anchor via the service-role system
      //    emit RPC (actor_user_id = NULL, actor_role = 'system'). Happens on
      //    the drain path too, so a quieted row is never re-alerted later.
      const { error: emitErr } = await admin.rpc("engine_emit_system_event", {
        p_inquiry_id: inquiryId,
        p_event_type: COORDINATOR_STALE_ANCHOR_EVENT,
        p_payload: {
          automated: true,
          reason: "unassigned_too_long",
          ...(action === "drain" ? { notificationsSuppressed: "stale_backlog" } : {}),
        },
      });

      if (emitErr) {
        // Row-write failed → no anchor was created, so skip the side-effects to
        // avoid an un-deduped alert. The next sweep retries this inquiry.
        logServerError("cron/flag-unassigned-inquiries.emit", emitErr);
        skipped += 1;
        continue;
      }

      if (action === "drain") {
        // Accumulated backlog rather than a live signal: anchored and on the
        // timeline, but no bell and no email.
        drained += 1;
        continue;
      }

      // 2) Dispatch side-effects (in-app bell + catalog email) via the standard
      //    engine emit, actor = system (null), mirroring processExpirations.
      await emitStandardEngineEvent(admin, {
        type: ENGINE_EVENT_TYPES.COORDINATOR_ASSIGNMENT_TIMED_OUT,
        inquiryId,
        actorUserId: null,
        data: { automated: true, reason: "unassigned_too_long" },
        notifications: await buildInquiryBells({
          inquiryId,
          tenantId,
          audiences: ["workspaceAdmins"],
          title: "Inquiry needs a coordinator",
          body: "This inquiry has had no coordinator for too long. Please claim or assign one.",
        }),
      });

      alerted += 1;
    }

    void improntaLog("inquiry.cron.flag_unassigned", {
      scanned: (rows ?? []).length,
      alerted,
      drained,
      skipped,
    });
    return NextResponse.json({ ok: true, scanned: (rows ?? []).length, alerted, drained, skipped });
  } catch (err) {
    logServerError("cron/flag-unassigned-inquiries", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
