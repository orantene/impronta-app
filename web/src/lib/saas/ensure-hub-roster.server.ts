import "server-only";

/**
 * TUL-157 · the hub (tulala.digital) is every independent talent's default
 * home. A talent with NO active roster row anywhere resolves `tenantId = null`
 * in `requireTalentSelfAction`, which breaks media, hero text, services,
 * skills and taxonomy. This is the ONE idempotent helper every sign-up path
 * calls right after the talent profile exists (and again on re-runs, so it
 * heals).
 *
 * Rule: no active roster row on any tenant => ensure an ACTIVE row on the hub.
 * A talent already on an agency (or the hub) keeps what they have; nothing is
 * added. Never throws: sign-up must not fail because of this step.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";

/** Pure decision: add a hub row only when the talent has no active roster row. */
export function shouldCreateHubRoster(input: { hasActiveRoster: boolean }): boolean {
  return !input.hasActiveRoster;
}

export type EnsureHubRosterResult =
  | { ok: true; outcome: "created" | "promoted" | "skipped_has_roster"; tenantId: string | null }
  | { ok: false; reason: "no_hub" | "db_error" };

type Db = Pick<SupabaseClient, "from">;

export async function ensureHubRosterRow(
  admin: Db,
  args: { talentProfileId: string; addedBy: string | null },
  deps?: { resolveHub?: () => Promise<{ tenantId: string } | null> },
): Promise<EnsureHubRosterResult> {
  try {
    const { talentProfileId, addedBy } = args;

    const { data: active, error: activeErr } = await admin
      .from("agency_talent_roster")
      .select("tenant_id")
      .eq("talent_profile_id", talentProfileId)
      .eq("status", "active")
      .limit(1);
    if (activeErr) {
      logServerError("ensure-hub-roster.readActive", activeErr);
      return { ok: false, reason: "db_error" };
    }
    const activeRows = (active ?? []) as Array<{ tenant_id: string }>;
    if (!shouldCreateHubRoster({ hasActiveRoster: activeRows.length > 0 })) {
      return { ok: true, outcome: "skipped_has_roster", tenantId: activeRows[0]?.tenant_id ?? null };
    }

    const hub = await (deps?.resolveHub ?? getPlatformHubTenant)();
    if (!hub) {
      logServerError("ensure-hub-roster.noHub", new Error("Platform hub tenant not found"));
      return { ok: false, reason: "no_hub" };
    }

    // A pending/inactive hub row (live unique key) is promoted, not duplicated.
    const { data: stale, error: staleErr } = await admin
      .from("agency_talent_roster")
      .select("id")
      .eq("tenant_id", hub.tenantId)
      .eq("talent_profile_id", talentProfileId)
      .in("status", ["pending", "inactive"])
      .limit(1);
    if (staleErr) {
      logServerError("ensure-hub-roster.readStale", staleErr);
      return { ok: false, reason: "db_error" };
    }
    const staleRow = ((stale ?? []) as Array<{ id: string }>)[0];
    if (staleRow) {
      const { error } = await admin
        .from("agency_talent_roster")
        .update({ status: "active", agency_visibility: "site_visible" })
        .eq("id", staleRow.id);
      if (error) {
        logServerError("ensure-hub-roster.promote", error);
        return { ok: false, reason: "db_error" };
      }
      return { ok: true, outcome: "promoted", tenantId: hub.tenantId };
    }

    const { error } = await admin.from("agency_talent_roster").insert({
      tenant_id: hub.tenantId,
      talent_profile_id: talentProfileId,
      source_type: "freelancer_claimed",
      status: "active",
      agency_visibility: "site_visible",
      hub_visibility_status: "not_submitted",
      is_primary: false,
      added_by: addedBy,
      source_workspace_id: hub.tenantId,
    });
    // 23505: a concurrent sign-up step already created it. Idempotent success.
    if (error && (error as { code?: string }).code !== "23505") {
      logServerError("ensure-hub-roster.insert", error);
      return { ok: false, reason: "db_error" };
    }
    return { ok: true, outcome: "created", tenantId: hub.tenantId };
  } catch (err) {
    logServerError("ensure-hub-roster.unexpected", err);
    return { ok: false, reason: "db_error" };
  }
}
