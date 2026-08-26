"use server";

// ============================================================================
// workspace-type.ts — flip a workspace between "talent" and "business"
// ============================================================================
//
// WHAT THIS DOES
//   Writes `agencies.workspace_type`. That single column decides whether the
//   roster-shaped surfaces (Roster nav + its server routes, Pitches) exist for
//   this workspace. Everything else — site builder, inbox, calendar, clients,
//   media, settings, payments — is identical for both types. A business
//   workspace is NOT a read-only or downgraded workspace.
//
// WHAT THIS DELIBERATELY DOES NOT DO
//   It does not delete, archive, soft-delete, unpublish, or otherwise touch a
//   single roster row, talent profile, pitch, or membership. The preflight
//   below counts roster rows purely so the owner is told the truth ("N talent
//   profiles will be hidden, not deleted") before confirming. Flipping back to
//   "talent" restores every surface with the same rows behind it.
//
//   Contrast `admin-plan-downgrade.ts`, whose preflight is shaped the same way
//   but whose commit really does archive rows. Do not copy an archive step in
//   here; hiding is the entire product behaviour.
//
// GATING
//   Owner-only, via `manage_billing` — the capability OWNER_CAPS grants and
//   admin does not. This changes what the whole workspace is; it is not an
//   editor-grade setting.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { WORKSPACE_TYPES, type WorkspaceType } from "@/lib/saas/workspace-type";
// `agencies` is the tenant table itself (keyed on `id`, no `tenant_id`), so it
// cannot go through tenantScopedQuery. Its reads/write live in a store module
// whose every function REQUIRES a tenantId — see workspace-type-store.ts.
import { readWorkspaceType, writeWorkspaceType } from "@/lib/saas/workspace-type-store";

/** Roster statuses that count as "someone this workspace is representing". */
const LIVE_ROSTER_STATUSES = ["active", "pending"] as const;

/** Owner-class capability — see the GATING note above. */
const CAPABILITY = "manage_billing" as const;

export type WorkspaceTypePreflight = {
  current_type: WorkspaceType;
  target_type: WorkspaceType;
  /** Roster rows that would stop being SHOWN. None of them are touched. */
  hidden_roster_count: number;
  /** Workspace nav pages the target type does not show. */
  hidden_surfaces: string[];
  /** True when the caller must pass `confirm: true` to go through. */
  requires_confirmation: boolean;
};

const inputSchema = z.object({
  workspace_type: z.enum(WORKSPACE_TYPES),
  /** Owner acknowledged the "N profiles will be hidden, not deleted" notice. */
  confirm: z.boolean().optional(),
});

/**
 * How many people this workspace is currently representing. Counted for the
 * owner-facing "N will be hidden" message ONLY — nothing reads it to decide
 * what to write. `null` signals a failed count, which blocks the flip rather
 * than showing the owner a confident, wrong number.
 */
async function countLiveRoster(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<number | null> {
  const { count, error } = await tenantScopedQuery(supabase, "agency_talent_roster", tenantId)
    .select("talent_profile_id", { count: "exact", head: true })
    .in("status", [...LIVE_ROSTER_STATUSES]);
  if (error) {
    logServerError("workspace-type.countLiveRoster", error);
    return null;
  }
  return count ?? 0;
}

/**
 * What would change if this workspace became `target_type`?
 *
 * Read-only. Safe to call on every render of the settings control.
 */
export async function getWorkspaceTypePreflight(input: {
  target_type: WorkspaceType;
}): Promise<
  { ok: true; preflight: WorkspaceTypePreflight } | { ok: false; error: string }
> {
  const auth = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = z.object({ workspace_type: z.enum(WORKSPACE_TYPES) }).safeParse({
    workspace_type: input.target_type,
  });
  if (!parsed.success) {
    return { ok: false, error: "Unknown workspace type." };
  }
  const targetType = parsed.data.workspace_type;

  const currentType = await readWorkspaceType(supabase, tenantId);
  if (currentType === null) return { ok: false, error: CLIENT_ERROR.update };

  // Only the talent → business direction hides anything, so it is the only
  // direction that needs a count or a confirmation.
  const hidesSurfaces = currentType !== "business" && targetType === "business";
  const rosterCount = hidesSurfaces ? await countLiveRoster(supabase, tenantId) : 0;
  if (rosterCount === null) return { ok: false, error: CLIENT_ERROR.update };

  return {
    ok: true,
    preflight: {
      current_type: currentType,
      target_type: targetType,
      hidden_roster_count: rosterCount,
      hidden_surfaces: hidesSurfaces ? ["roster", "pitches"] : [],
      requires_confirmation: hidesSurfaces,
    },
  };
}

export type SetWorkspaceTypeResult =
  | { ok: true; workspace_type: WorkspaceType; hidden_roster_count: number }
  | {
      ok: false;
      error: string;
      /** Set when the caller must re-submit with `confirm: true`. */
      requires_confirmation?: true;
      preflight?: WorkspaceTypePreflight;
    };

/**
 * Set `agencies.workspace_type`.
 *
 *   business → talent : always allowed, no confirmation. It only reveals
 *                       surfaces, and every row behind them is still there.
 *   talent → business : requires `confirm: true`. Without it the action
 *                       returns the preflight so the caller can show the
 *                       owner exactly how many talent profiles will be
 *                       HIDDEN — never deleted, never archived.
 */
export async function setWorkspaceType(input: {
  workspace_type: WorkspaceType;
  confirm?: boolean;
}): Promise<SetWorkspaceTypeResult> {
  const auth = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const targetType = parsed.data.workspace_type;

  const currentType = await readWorkspaceType(supabase, tenantId);
  if (currentType === null) return { ok: false, error: CLIENT_ERROR.update };

  if (currentType === targetType) {
    // Idempotent: nothing to write, nothing to audit.
    return { ok: true, workspace_type: targetType, hidden_roster_count: 0 };
  }

  const hidesSurfaces = targetType === "business";
  const rosterCount = hidesSurfaces ? await countLiveRoster(supabase, tenantId) : 0;
  if (rosterCount === null) return { ok: false, error: CLIENT_ERROR.update };

  if (hidesSurfaces && parsed.data.confirm !== true) {
    return {
      ok: false,
      requires_confirmation: true,
      error:
        rosterCount === 1
          ? "1 talent profile will be hidden, not deleted. Confirm to switch this workspace to a business."
          : `${rosterCount} talent profiles will be hidden, not deleted. Confirm to switch this workspace to a business.`,
      preflight: {
        current_type: currentType,
        target_type: targetType,
        hidden_roster_count: rosterCount,
        hidden_surfaces: ["roster", "pitches"],
        requires_confirmation: true,
      },
    };
  }

  // The ONLY write. No roster/pitch/profile row is touched — see the header.
  const wrote = await writeWorkspaceType(supabase, tenantId, targetType);
  if (!wrote) return { ok: false, error: CLIENT_ERROR.update };

  scheduleWorkspaceAudit({
    tenantId,
    category: "settings",
    action: "settings.workspace_type.changed",
    summary:
      targetType === "business"
        ? `Workspace switched to business — roster and pitches hidden (${rosterCount} talent profile${rosterCount === 1 ? "" : "s"} hidden, none deleted)`
        : "Workspace switched to talent — roster and pitches restored",
    targetType: "agency",
    targetId: tenantId,
    metadata: {
      from: currentType,
      to: targetType,
      hidden_roster_count: rosterCount,
      // Stated explicitly in the trail so a later reader of the log never has
      // to wonder whether this event destroyed data. It did not.
      rows_deleted: 0,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true, workspace_type: targetType, hidden_roster_count: rosterCount };
}
