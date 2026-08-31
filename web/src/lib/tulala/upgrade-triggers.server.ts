/**
 * upgrade-triggers.server.ts — the hooks a Free recommendation leaves behind.
 *
 * Split from `brief-store.server.ts` because these rows are not part of the
 * Brief's own read/write surface. A Brief is what we UNDERSTAND about someone; a
 * trigger is a note about what to offer them LATER, written by the engine and
 * resolved by a sale or by the user saying no.
 *
 * Why they exist at all: "fit, not force" means most conversations end on a free
 * plan, and a free recommendation that leaves nothing behind reduces the business
 * to asking again later and hoping. The trigger records the reason in the user's
 * own situation ("you said you might bring someone on"), so the eventual ask can
 * quote them rather than guess.
 *
 * Service-role writes only, like the rest of the Brief surface. RLS grants
 * authenticated users SELECT on their own rows and nothing else.
 */

import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

// ─── Upgrade triggers ─────────────────────────────────────────────────────────

export type UpgradeTriggerInput = {
  triggerKey: string;
  targetPackage: string;
  targetTier: string;
  rationale: string;
};

/**
 * Record the conditions that would make a paid plan correct later.
 *
 * Upsert on (brief_id, trigger_key), and deliberately NOT resetting
 * `dismissed_at` or `fired_at`. Re-running the engine must not resurrect an
 * upsell the user already declined: a declined offer that comes back because a
 * classifier ran again is the exact behaviour that makes "fit, not force" a
 * slogan rather than a mechanism.
 */
export async function recordUpgradeTriggers(
  briefId: string,
  triggers: UpgradeTriggerInput[],
): Promise<{ ok: boolean; written: number }> {
  const sb = createServiceRoleClient();
  if (!sb || triggers.length === 0) return { ok: true, written: 0 };

  const { data: existing, error: readErr } = await sb
    .from("tulala_brief_upgrade_triggers")
    .select("trigger_key")
    .eq("brief_id", briefId);
  if (readErr) {
    logServerError("tulala.recordUpgradeTriggers.read", readErr);
    return { ok: false, written: 0 };
  }
  const known = new Set(((existing ?? []) as Array<{ trigger_key: string }>).map((r) => r.trigger_key));

  const rows = triggers
    .filter((t) => !known.has(t.triggerKey))
    .map((t) => ({
      brief_id: briefId,
      trigger_key: t.triggerKey,
      target_package: t.targetPackage,
      target_tier: t.targetTier,
      rationale: t.rationale,
    }));
  if (rows.length === 0) return { ok: true, written: 0 };

  const { error } = await sb.from("tulala_brief_upgrade_triggers").insert(rows);
  if (error) {
    logServerError("tulala.recordUpgradeTriggers.write", error);
    return { ok: false, written: 0 };
  }
  return { ok: true, written: rows.length };
}

export type PendingUpgradeTrigger = {
  id: string;
  triggerKey: string;
  targetPackage: string;
  targetTier: string;
  rationale: string | null;
};

/** Triggers that have neither fired nor been declined. Read by the Strategist. */
export async function listPendingUpgradeTriggers(
  briefId: string,
): Promise<PendingUpgradeTrigger[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("tulala_brief_upgrade_triggers")
    .select("id, trigger_key, target_package, target_tier, rationale")
    .eq("brief_id", briefId)
    .is("fired_at", null)
    .is("dismissed_at", null);
  if (error) {
    logServerError("tulala.listPendingUpgradeTriggers", error);
    return [];
  }
  return ((data ?? []) as Array<{
    id: string;
    trigger_key: string;
    target_package: string;
    target_tier: string;
    rationale: string | null;
  }>).map((r) => ({
    id: r.id,
    triggerKey: r.trigger_key,
    targetPackage: r.target_package,
    targetTier: r.target_tier,
    rationale: r.rationale,
  }));
}

/** Mark a trigger as raised with the user, or as declined by them. */
export async function resolveUpgradeTrigger(
  briefId: string,
  triggerKey: string,
  outcome: "fired" | "dismissed",
): Promise<{ ok: boolean }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false };
  const patch =
    outcome === "fired"
      ? { fired_at: new Date().toISOString() }
      : { dismissed_at: new Date().toISOString() };
  const { error } = await sb
    .from("tulala_brief_upgrade_triggers")
    .update(patch)
    .eq("brief_id", briefId)
    .eq("trigger_key", triggerKey);
  if (error) {
    logServerError("tulala.resolveUpgradeTrigger", error);
    return { ok: false };
  }
  return { ok: true };
}

