"use server";

/**
 * Switch events on or off for the caller's workspace.
 *
 * WHY THIS EXISTS. `…372_runs_events_flag.sql` added the column and the rail
 * contract gates the Events slot on it — and nothing wrote it. A flag with a
 * migration, a type and no control is a feature no workspace can turn on
 * except by editing the database by hand (the same gap #1363 left for
 * `workspace_type`, closed by `setWorkspaceType`). This is that control.
 *
 * GATING. Owner-class (`manage_billing`), mirroring `setWorkspaceType`: which
 * surfaces a workspace has is an owner decision, and the two cards sit
 * together on the same settings group.
 *
 * WHAT SWITCHING OFF DOES NOT DO. It hides a rail link. It does not cancel,
 * unpublish, delete or refund one event, session, tier or admission; every
 * row is still there and every public event page still resolves. Copy on the
 * card says exactly that and must not drift into a destructive warning.
 *
 * THE TENANT IS NEVER A PARAMETER — `requireWorkspaceStaffAction` derives it.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR } from "@/lib/server/safe-error";
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { readRunsEvents, writeRunsEvents } from "@/lib/events/runs-events-store";

const CAPABILITY = "manage_billing" as const;

const inputSchema = z.object({ runs_events: z.boolean() });

export type RunsEventsResult =
  | { ok: true; runs_events: boolean }
  | { ok: false; error: string };

/** Current value. `ok: false` when it cannot be read — never a guessed `false`. */
export async function getRunsEvents(): Promise<RunsEventsResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const current = await readRunsEvents(auth.supabase, auth.tenantId);
  if (current === null) return { ok: false, error: "Could not read the events setting." };
  return { ok: true, runs_events: current };
}

export async function setRunsEvents(input: { runs_events: boolean }): Promise<RunsEventsResult> {
  const auth = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const target = parsed.data.runs_events;

  const current = await readRunsEvents(supabase, tenantId);
  if (current === null) return { ok: false, error: CLIENT_ERROR.update };
  if (current === target) return { ok: true, runs_events: target };

  const wrote = await writeRunsEvents(supabase, tenantId, target);
  if (!wrote) return { ok: false, error: CLIENT_ERROR.update };

  scheduleWorkspaceAudit({
    tenantId,
    category: "settings",
    action: "settings.runs_events.changed",
    summary: target
      ? "Events switched on — the Events surface is shown"
      : "Events switched off — the Events link is hidden; no event, session, tier or ticket was changed",
    targetType: "agency",
    targetId: tenantId,
    metadata: { from: current, to: target, rows_deleted: 0 },
  });

  // The rail reads the flag from the layout's tenant-identity payload.
  revalidatePath("/", "layout");
  return { ok: true, runs_events: target };
}
