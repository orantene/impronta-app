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
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { appendBuilderLabAudit } from "@/lib/site-admin/builder-core/templates/builder-lab-audit";
import {
  computeRampStep,
  shouldAutoArchive,
  DEFAULT_RAMP_STEP,
} from "@/lib/site-admin/builder-core/templates/rollout-ramp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** System actor stamped on cron-driven audit rows (no human acted). */
const CRON_ACTOR = "system:builder-rollout-cron";

/** How far in the future to re-arm rollout_ramp_at after a non-final tick. */
const RAMP_TICK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day

function flagEnabled(): boolean {
  const v = (process.env.BUILDER_ROLLOUT_CRON_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

interface RampRow {
  id: string;
  rollout_percentage: number;
  rollout_ramp_to: number | null;
  rollout_ramp_at: string | null;
}

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

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Flag gate — inert until explicitly enabled.
  if (!flagEnabled()) {
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
      if (row.rollout_ramp_to === null) continue;
      const stepResult = computeRampStep({
        current: row.rollout_percentage,
        target: row.rollout_ramp_to,
        step: DEFAULT_RAMP_STEP,
      });

      // Build the patch: always advance the %, then either clear the ramp (done)
      // or re-arm the next tick.
      const patch: Record<string, unknown> = {
        rollout_percentage: stepResult.next,
      };
      if (stepResult.complete) {
        patch.rollout_ramp_to = null;
        patch.rollout_ramp_at = null;
      } else {
        patch.rollout_ramp_at = new Date(
          now.getTime() + RAMP_TICK_INTERVAL_MS,
        ).toISOString();
      }

      const { error: updErr } = await admin
        .from("builder_templates")
        .update(patch as never)
        .eq("id", row.id);
      if (updErr) {
        logServerError("cron/builder-rollout-ramp", updErr);
        continue;
      }

      ramped++;
      if (stepResult.complete) rampsCompleted++;

      await appendBuilderLabAudit({
        action: "template.rollout",
        templateId: row.id,
        actor: CRON_ACTOR,
        before: {
          rollout_percentage: row.rollout_percentage,
          rollout_ramp_to: row.rollout_ramp_to,
        },
        after: {
          rollout_percentage: stepResult.next,
          rollout_ramp_to: stepResult.complete ? null : row.rollout_ramp_to,
          ramp_complete: stepResult.complete,
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
        continue;
      }

      archived++;

      await appendBuilderLabAudit({
        action: "template.archive",
        templateId: row.id,
        actor: CRON_ACTOR,
        before: { status: "draft", status_expire_at: row.status_expire_at },
        after: { status: "archived", reason: "auto_expire" },
      });
    }

    const result = { ramped, rampsCompleted, archived };
    void improntaLog("builder.cron.rollout_ramp", { ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logServerError("cron/builder-rollout-ramp", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
