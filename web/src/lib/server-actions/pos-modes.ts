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
 * A REFUSAL IS A CODE, NOT A SENTENCE. Everything this file can answer with
 * is one of the `PosModesRefusal` ids below; `PosModesSettingsCard` turns it
 * into a sentence in the reader's own language out of the message catalogue
 * (`settings-refusal-copy.static.test.ts` fails if any of the three locales
 * is missing one). A server action that returned English prose would render
 * that prose to a Spanish or French operator, which is what this card used
 * to do with `auth.error`. The guard's own English reason is not lost — it
 * goes to the server log for whoever is on call, where nobody has to read it
 * in their second language.
 *
 * A MODE WITH NO SCREEN CANNOT BE SWITCHED ON HERE. Whichever modes carry
 * `built: false` in `POS_MODE_META` (the list is that file's, not this one's) — turning
 * one on would show a mode switch that leads nowhere, exactly the "control
 * that cannot work" this settings surface must never offer. This refuses to
 * persist an unbuilt mode that was not already on (an unbuilt mode already
 * enabled by a fixture or a future build stays untouched — this only blocks
 * turning one ON, never fails to reflect one already there).
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { POS_MODES, POS_MODE_META, parsePosMode, type PosMode } from "@/lib/pos/modes";
import { readPosModes, writePosModes } from "@/lib/pos/pos-modes-store";
// `"use server"` files may export nothing but async functions, so the id list
// lives in a pure module both this action and its card import.
import type { PosModesRefusal } from "@/lib/settings/refusals";

const CAPABILITY = "manage_billing" as const;

const inputSchema = z.object({ modes: z.array(z.string()).max(POS_MODES.length) });

export type PosModesResult =
  | { ok: true; modes: PosMode[] }
  | { ok: false; reason: PosModesRefusal };

export async function getPosModes(): Promise<PosModesResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) {
    logServerError("pos-modes.getPosModes.denied", auth.error);
    return { ok: false, reason: "not_allowed" };
  }
  const { supabase, tenantId } = auth;

  const modes = await readPosModes(supabase, tenantId);
  if (modes === null) return { ok: false, reason: "unreadable" };
  return { ok: true, modes };
}

export async function setPosModes(input: { modes: string[] }): Promise<PosModesResult> {
  const auth = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!auth.ok) {
    logServerError("pos-modes.setPosModes.denied", auth.error);
    return { ok: false, reason: "not_allowed" };
  }
  const { supabase, tenantId } = auth;

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_request" };

  const target: PosMode[] = [];
  for (const raw of parsed.data.modes) {
    const mode = parsePosMode(raw);
    if (!mode) return { ok: false, reason: "unknown_mode" };
    if (!target.includes(mode)) target.push(mode);
  }

  const before = await readPosModes(supabase, tenantId);
  if (before === null) return { ok: false, reason: "unreadable" };

  // Refuse to turn ON a mode with no screen behind it yet — never a control
  // that cannot work. A mode already on (however it got there) is left alone
  // either way, since this only rejects an ADDITION, never a removal.
  for (const mode of target) {
    if (!POS_MODE_META[mode].built && !before.includes(mode)) {
      return { ok: false, reason: "mode_not_built" };
    }
  }

  const wrote = await writePosModes(supabase, tenantId, target);
  if (!wrote.ok) return { ok: false, reason: "write_failed" };

  // READ IT BACK BEFORE SAYING IT SAVED. The card draws its switches from
  // whatever this returns, so returning `target` would report the value we
  // MEANT to store, not the one the app will read next. That is exactly how
  // this panel came to say "Saved" for a change the reader then undid. One
  // more select, and the sentence on screen is a round trip rather than an
  // echo; a re-read that fails is reported as a failed write, because from
  // the operator's side an unconfirmable save is not a save.
  const after = await readPosModes(supabase, tenantId);
  if (after === null) return { ok: false, reason: "write_failed" };

  scheduleWorkspaceAudit({
    tenantId,
    category: "settings",
    action: "settings.pos_modes.changed",
    summary: `Selling modes set to: ${after.length > 0 ? after.join(", ") : "none"}`,
    targetType: "agency",
    targetId: tenantId,
    metadata: { from: wrote.before, to: after },
  });

  // The POS frame and mobile nav read this off the layout's tenant-identity
  // bridge — same revalidation as setRunsEvents.
  revalidatePath("/", "layout");
  return { ok: true, modes: after };
}
