/**
 * Cron — Builder Lab timed rollout ramp + auto-archive sweep (G8).
 *
 * Endpoint: GET /api/cron/builder-rollout-ramp  (CRON_SECRET bearer auth)
 *
 * FLAG-GATED. Inert unless BUILDER_ROLLOUT_CRON_ENABLED is truthy ("1"/"true"),
 * so the schedule can ship dark and be flipped on per-environment. When enabled:
 *
 *   1. Ramp advance — for every template with rollout_ramp_at <= now() and a
 *      rollout_ramp_to set, advance rollout_percentage one step toward the
 *      target (computeRampStep). On reaching the target, clear both ramp columns
 *      (the ramp is done); otherwise re-arm rollout_ramp_at for the next tick.
 *      "canary 10% → 100% over the weekend" runs unattended this way.
 *
 *   2. Auto-archive — for every draft with status_expire_at <= now(), flip
 *      status to 'archived' and clear status_expire_at.
 *
 * Every transition appends a best-effort `builder_lab_audit` row via
 * appendBuilderLabAudit (G1), actored to the system. Writes go through the
 * service-role client (the CRON_SECRET bearer IS the auth boundary).
 *
 * Schedule it in `web/vercel.json` once the flag is flipped on.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/builder-rollout-ramp
 */

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { appendBuilderLabAudit } from "@/lib/site-admin/builder-core/templates/builder-lab-audit";
import { shouldAutoArchive } from "@/lib/site-admin/builder-core/templates/rollout-ramp";
import {
  parseRolloutCronFlag,
  checkCronSecret,
  buildRampPatch,
} from "./rollout-ramp-cron-logic";
import type { RampRow } from "./rollout-ramp-cron-logic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** System/cron actor for audit rows. The audit `actor` column is a nullable
 *  uuid FK to profiles, so it stays `null` (no human actor — a sentinel string
 *  would fail the uuid cast and the row would silently never land). The
 *  human-readable identity rides in `actor_label` instead, so the Activity feed
 *  attributes these transitions to the cron rather than rendering blank. */
const CRON_ACTOR = null;
const CRON_ACTOR_LABEL = "system:builder-rollout-cron";

/** Best-effort Sentry capture for a cron failure — gives the failure a dedicated
 *  `cron` tag so a broken (otherwise invisible, flag-OFF) cron can page someone.
 *  `logServerError` already routes to Sentry, but with a generic `context` tag;
 *  this adds the cron-scoped tag + error level. Must NEVER throw. */
function captureCronError(err: unknown, phase: string): void {
  try {
    const exception = err instanceof Error ? err : new Error(String(err));
    Sentry.captureException(exception, {
      level: "error",
      tags: { cron: "builder-rollout-ramp", phase },
    });
  } catch {
    // Observability must not affect the request path.
  }
}

/** How far in the future to re-arm rollout_ramp_at after a non-final tick. */
const RAMP_TICK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day

interface ExpiringDraftRow {
  id: string;
  status: string;
  status_expire_at: string | null;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/builder-rollout-ramp", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (!checkCronSecret(authHeader, secret).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Flag gate — inert until explicitly enabled.
  if (!parseRolloutCronFlag(process.env.BUILDER_ROLLOUT_CRON_ENABLED)) {
    return NextResponse.json({ ok: true, skipped: "flag_disabled" });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 503 });
  }

  try {
    const now = new Date();
    const nowIso = now.toISOString();

    let ramped = 0;
    let rampsCompleted = 0;
    let archived = 0;

    // ── 1. Ramp advance ──────────────────────────────────────────────────────
    const { data: dueRamps, error: rampErr } = await admin
      .from("builder_templates")
      .select("id, rollout_percentage, rollout_ramp_to, rollout_ramp_at")
      .not("rollout_ramp_to", "is", null)
      .lte("rollout_ramp_at", nowIso)
      .limit(200);
    if (rampErr) throw rampErr;

    for (const row of (dueRamps ?? []) as RampRow[]) {
      const patch = buildRampPatch(row, now, RAMP_TICK_INTERVAL_MS);
      if (patch === null) continue;

      const stepComplete = patch.rollout_ramp_to === null;

      const { error: updErr } = await admin
        .from("builder_templates")
        .update(patch as never)
        .eq("id", row.id);
      if (updErr) {
        logServerError("cron/builder-rollout-ramp", updErr);
        captureCronError(updErr, "ramp_update");
        continue;
      }

      ramped++;
      if (stepComplete) rampsCompleted++;

      await appendBuilderLabAudit({
        action: "template.rollout",
        templateId: row.id,
        actor: CRON_ACTOR,
        actorLabel: CRON_ACTOR_LABEL,
        before: {
          rollout_percentage: row.rollout_percentage,
          rollout_ramp_to: row.rollout_ramp_to,
        },
        after: {
          rollout_percentage: patch.rollout_percentage,
          rollout_ramp_to: stepComplete ? null : row.rollout_ramp_to,
          ramp_complete: stepComplete,
        },
      });
    }

    // ── 2. Auto-archive stale drafts ─────────────────────────────────────────
    const { data: expiring, error: expErr } = await admin
      .from("builder_templates")
      .select("id, status, status_expire_at")
      .eq("status", "draft")
      .not("status_expire_at", "is", null)
      .lte("status_expire_at", nowIso)
      .limit(200);
    if (expErr) throw expErr;

    for (const row of (expiring ?? []) as ExpiringDraftRow[]) {
      // Defensive re-check with the pure predicate (in case of clock/filter skew).
      if (!shouldAutoArchive(row.status_expire_at, now)) continue;

      const { error: arcErr } = await admin
        .from("builder_templates")
        .update({ status: "archived", status_expire_at: null } as never)
        .eq("id", row.id)
        .eq("status", "draft"); // guard: only archive if still a draft
      if (arcErr) {
        logServerError("cron/builder-rollout-ramp", arcErr);
        captureCronError(arcErr, "archive_update");
        continue;
      }

      archived++;

      await appendBuilderLabAudit({
        action: "template.archive",
        templateId: row.id,
        actor: CRON_ACTOR,
        actorLabel: CRON_ACTOR_LABEL,
        before: { status: "draft", status_expire_at: row.status_expire_at },
        after: { status: "archived", reason: "auto_expire" },
      });
    }

    const result = { ramped, rampsCompleted, archived };
    void improntaLog("builder.cron.rollout_ramp", { ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logServerError("cron/builder-rollout-ramp", err);
    // Dedicated cron-tagged alert so a broken (flag-OFF, otherwise invisible) cron
    // can page someone instead of failing silently.
    captureCronError(err, "outer");
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
