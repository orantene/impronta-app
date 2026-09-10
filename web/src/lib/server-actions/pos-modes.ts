"use server";

/**
 * Switch which point-of-sale modes this workspace has turned on.
 *
 * WHY `agencies.settings` AND NOT A COLUMN. `enabledPosModesFromSettings`
 * (`lib/pos/modes.ts`) already reads `agencies.settings.pos.locations.default
 * .modes`, and the POS frame + mobile nav already read that value off the
 * layout bridge (`lib/workspace/pos-bridge.ts`). `lib/pos/pos-modes-store.ts`
 * is the ONE reader/writer for that path — the bridge itself only reads.
 *
 * "default" IS THE WORKSPACE'S ONE IMPLICIT LOCATION. There is no locations
 * table yet (see `lib/pos/modes.ts` header); the store keys the same literal
 * `"default"` so a real locations table can replace it later without a shape
 * change.
 *
 * GATING mirrors `setRunsEvents` / `setWorkspaceType`: which surfaces a
 * workspace exposes is an owner-class decision (`manage_billing`), not a
 * day-to-day edit any admin can make.
 *
 * A MODE WITH NO SCREEN CANNOT BE SWITCHED ON HERE. `floor`, `door`,
 * `classes` and `projects` have `built: false` in `POS_MODE_META` — turning
 * one on would show a mode switch that leads nowhere, exactly the "control
 * that cannot work" this settings surface must never offer. This refuses to
 * persist an unbuilt mode that was not already on (an unbuilt mode already
 * enabled by a fixture or a future build stays untouched — this only blocks
 * turning one ON, never fails to reflect one already there).
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR } from "@/lib/server/safe-error";
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { POS_MODES, POS_MODE_META, parsePosMode, type PosMode } from "@/lib/pos/modes";
import { readPosModes, writePosModes } from "@/lib/pos/pos-modes-store";

const CAPABILITY = "manage_billing" as const;

const inputSchema = z.object({ modes: z.array(z.string()).max(POS_MODES.length) });

export type PosModesResult =
  | { ok: true; modes: PosMode[] }
  | { ok: false; error: string };

export async function getPosModes(): Promise<PosModesResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const modes = await readPosModes(supabase, tenantId);
  if (modes === null) return { ok: false, error: "Could not read the selling modes." };
  return { ok: true, modes };
}

export async function setPosModes(input: { modes: string[] }): Promise<PosModesResult> {
  const auth = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const target: PosMode[] = [];
  for (const raw of parsed.data.modes) {
    const mode = parsePosMode(raw);
    if (!mode) return { ok: false, error: "That is not a selling mode this workspace knows about." };
    if (!target.includes(mode)) target.push(mode);
  }

  const before = await readPosModes(supabase, tenantId);
  if (before === null) return { ok: false, error: CLIENT_ERROR.update };

  // Refuse to turn ON a mode with no screen behind it yet — never a control
  // that cannot work. A mode already on (however it got there) is left alone
  // either way, since this only rejects an ADDITION, never a removal.
  for (const mode of target) {
    if (!POS_MODE_META[mode].built && !before.includes(mode)) {
      return { ok: false, error: "That selling mode has no screens yet, so it cannot be switched on." };
    }
  }

  const wrote = await writePosModes(supabase, tenantId, target);
  if (!wrote.ok) return { ok: false, error: CLIENT_ERROR.update };

  scheduleWorkspaceAudit({
    tenantId,
    category: "settings",
    action: "settings.pos_modes.changed",
    summary: `Selling modes set to: ${target.length > 0 ? target.join(", ") : "none"}`,
    targetType: "agency",
    targetId: tenantId,
    metadata: { from: wrote.before, to: target },
  });

  // The POS frame and mobile nav read this off the layout's tenant-identity
  // bridge — same revalidation as setRunsEvents.
  revalidatePath("/", "layout");
  return { ok: true, modes: target };
}
