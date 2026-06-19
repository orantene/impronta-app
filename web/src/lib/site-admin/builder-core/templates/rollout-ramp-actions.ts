"use server";

/**
 * rollout-ramp-actions.ts — super_admin-gated WRITE for the G8 timed rollout
 * schedule (the ramp-stamp): set/clear `rollout_ramp_to` / `rollout_ramp_at` and
 * the draft `status_expire_at` on a builder_templates row.
 *
 * This is the human-facing companion to the flag-gated cron in
 * `/api/cron/builder-rollout-ramp`: an admin stamps "ramp this canary to 100%
 * starting Friday night" (or "auto-archive this draft in 30 days") and the cron
 * then advances it unattended.
 *
 * Self-contained by design (Wave-11 ownership constraint): it does NOT import
 * registry-actions.ts. It mirrors how `setTemplateRollout` writes — own
 * requireSuperAdmin() gate + service-role write + best-effort audit append — but
 * lives entirely in this file so it touches none of the reserved shared modules.
 */

import { revalidatePath } from "next/cache";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError, CLIENT_ERROR } from "@/lib/server/safe-error";
import { appendBuilderLabAudit } from "./builder-lab-audit";
import { clampRollout } from "./rollout-ramp";

// ── Result type (local; mirrors registry-actions' TemplateActionResult shape) ──

export type RampActionResult =
  | { ok: true }
  | { ok: false; error: string };

function fail(error: string): RampActionResult {
  return { ok: false, error };
}

// ── Auth gate (local copy — see ownership note above) ─────────────────────────

type GateOk = { ok: true; userId: string };
type GateErr = { ok: false; error: string };

async function requireSuperAdmin(): Promise<GateOk | GateErr> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Super admin access required." };
  }
  return { ok: true, userId: session.user.id };
}

const TEMPLATE_CACHE_PATH = "/platform/admin";

export interface SetRolloutRampInput {
  /** Target % to ramp toward. Pass null to clear an existing ramp. Omit = leave. */
  rolloutRampTo?: number | null;
  /** ISO timestamp of the next ramp tick. Pass null to clear. Omit = leave. */
  rolloutRampAt?: string | null;
  /** ISO timestamp at which a draft auto-archives. Pass null to clear. Omit = leave. */
  statusExpireAt?: string | null;
}

/** Build the normalized column patch from the input (pure-ish, but kept inline
 *  since it's tiny and specific to this action's three columns). */
function buildRampPatch(input: SetRolloutRampInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.rolloutRampTo !== undefined) {
    patch.rollout_ramp_to =
      input.rolloutRampTo === null ? null : clampRollout(input.rolloutRampTo);
  }
  if (input.rolloutRampAt !== undefined) {
    patch.rollout_ramp_at = input.rolloutRampAt ?? null;
  }
  if (input.statusExpireAt !== undefined) {
    patch.status_expire_at = input.statusExpireAt ?? null;
  }
  return patch;
}

/**
 * Persist a template's timed-rollout schedule. super_admin-gated; writes via the
 * service-role client (the gate IS the auth boundary). Each stamp appends a
 * best-effort `template.rollout` audit row (the ramp is a rollout-config change).
 */
export async function setRolloutRamp(
  templateId: string,
  input: SetRolloutRampInput,
): Promise<RampActionResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  const patch = buildRampPatch(input);
  if (Object.keys(patch).length === 0) {
    return fail("No ramp fields to update.");
  }

  try {
    const sb = createServiceRoleClient();
    if (!sb) return fail("Service-role client unavailable.");

    const { data: beforeRow } = await sb
      .from("builder_templates")
      .select("rollout_ramp_to, rollout_ramp_at, status_expire_at")
      .eq("id", templateId)
      .maybeSingle();

    const { data, error } = await sb
      .from("builder_templates")
      .update(patch as never)
      .eq("id", templateId)
      .select("id")
      .single();

    if (error) return fail(error.message);
    if (!data) return fail("Template not found.");

    await appendBuilderLabAudit({
      action: "template.rollout",
      templateId,
      actor: gate.userId,
      before: beforeRow ?? null,
      after: patch,
    });
    revalidatePath(TEMPLATE_CACHE_PATH);
    return { ok: true };
  } catch (err) {
    logServerError("setRolloutRamp", err);
    return fail(CLIENT_ERROR.generic);
  }
}
