import "server-only";

/**
 * TUL-157 · the hub (tulala.digital) is every independent talent's default
 * home. A talent with NO roster row resolves `tenantId = null` in
 * `requireTalentSelfAction`, which breaks media, hero text, services, skills
 * and taxonomy. This is the ONE idempotent helper every independent sign-up
 * path calls right after the talent profile exists (and again on re-runs, so it
 * heals).
 *
 * Rule (PM decision, "one helper"): add a hub row ONLY when the talent has no
 * roster row at all, on any tenant, in any status (pending, active, inactive,
 * removed all count as "has a row"). A talent on an agency, or one that was
 * removed, never gets a surprise hub row. The single exception: the talent's
 * ONLY row is a pending/inactive hub row, which is promoted to active (the hub
 * is not a gate). Fails closed: a read error writes nothing. Never throws:
 * sign-up must not fail because of this step.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";

/** Pure decision: add a hub row only when the talent has no roster row at all. */
export function shouldCreateHubRoster(input: { hasAnyRosterRow: boolean }): boolean {
  return !input.hasAnyRosterRow;
}

export type EnsureHubRosterResult =
  | { ok: true; outcome: "created" | "promoted" | "skipped_has_roster"; tenantId: string | null }
  | { ok: false; reason: "no_hub" | "db_error" };

type Db = Pick<SupabaseClient, "from">;

export async function ensureHubRosterRow(
  admin: Db,
  args: { talentProfileId: string; addedBy: string | null; originDomain?: string | null },
  deps?: { resolveHub?: () => Promise<{ tenantId: string } | null> },
): Promise<EnsureHubRosterResult> {
  try {
    const { talentProfileId, addedBy } = args;

    // Any row, any tenant, any status. Two rows is enough to know the answer.
    const { data: rows, error: rowsErr } = await admin
      .from("agency_talent_roster")
      .select("id, tenant_id, status")
      .eq("talent_profile_id", talentProfileId)
      .limit(2);
    if (rowsErr) {
      logServerError("ensure-hub-roster.readRows", rowsErr);
      return { ok: false, reason: "db_error" };
    }
    const existing = (rows ?? []) as Array<{ id: string; tenant_id: string; status: string }>;
    const needsRow = shouldCreateHubRoster({ hasAnyRosterRow: existing.length > 0 });

    if (!needsRow) {
      const only = existing.length === 1 ? existing[0] : null;
      const promotable = only && (only.status === "pending" || only.status === "inactive") ? only : null;
      if (!promotable) {
        const active = existing.find((r) => r.status === "active");
        return { ok: true, outcome: "skipped_has_roster", tenantId: active?.tenant_id ?? null };
      }
      // Sole row: promote only when it is the hub's own row.
      const hubForPromote = await (deps?.resolveHub ?? getPlatformHubTenant)();
      if (!hubForPromote) {
        logServerError("ensure-hub-roster.noHub", new Error("Platform hub tenant not found"));
        return { ok: false, reason: "no_hub" };
      }
      if (promotable.tenant_id !== hubForPromote.tenantId) {
        return { ok: true, outcome: "skipped_has_roster", tenantId: null };
      }
      const { error } = await admin
        .from("agency_talent_roster")
        .update({ status: "active", agency_visibility: "site_visible" })
        .eq("id", promotable.id);
      if (error) {
        logServerError("ensure-hub-roster.promote", error);
        return { ok: false, reason: "db_error" };
      }
      return { ok: true, outcome: "promoted", tenantId: hubForPromote.tenantId };
    }

    const hub = await (deps?.resolveHub ?? getPlatformHubTenant)();
    if (!hub) {
      logServerError("ensure-hub-roster.noHub", new Error("Platform hub tenant not found"));
      return { ok: false, reason: "no_hub" };
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
      ...(args.originDomain ? { origin_domain: args.originDomain } : {}),
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
