"use server";
import { improntaLog } from "@/lib/server/structured-log";

/**
 * P3 — consolidated editor loader (ADDITIVE).
 *
 * The talent-profile editor drawer previously fired the editor-data
 * action and the dyn-field-values action as TWO independent client→
 * server round trips (each with its own auth + roster preamble), on top
 * of the media bundle and the (now per-tenant cached) field catalog.
 *
 * This action coordinates the per-talent reads into ONE server round
 * trip. It deliberately delegates to the existing, verified actions
 * rather than reimplementing their queries — so behaviour is identical
 * and it is safe to adopt incrementally. The drawer keeps the old
 * `[edRes, dynRes]` destructuring shape unchanged (this returns exactly
 * that tuple), and on internal failure the existing P2 error/Retry
 * path in the drawer still applies.
 *
 * Not wired anywhere by simply existing — purely additive until the
 * drawer opts in.
 */

import {
  getTalentProfileEditorData,
  getTalentProfileDynFieldValuesForShell,
} from "@/lib/server-actions/admin-talent-profile-sections";
import {
  getTalentProfileDynFieldValuesForSelf,
  getTalentProfileEditorDataForSelf,
} from "@/lib/server-actions/talent-self-profile-sections";

// Not exported — `"use server"` modules may only export async functions.
type EditorDataResult = Awaited<
  ReturnType<typeof getTalentProfileEditorData>
>;
type DynValuesResult = Awaited<
  ReturnType<typeof getTalentProfileDynFieldValuesForShell>
>;

/**
 * One coordinated load of the per-talent editor payload. Returns the
 * exact `[editorDataResult, dynFieldValuesResult]` tuple the drawer
 * already consumes, so wiring is a one-expression swap with no change
 * to the hydration `.then` body.
 *
 * `isSelf` selects the talent-self dyn-values action (strict ownership)
 * vs the admin/shell one, mirroring the drawer's existing branch.
 */
export async function loadTalentProfileEditorData(input: {
  talentProfileId: string;
  isSelf: boolean;
}): Promise<[EditorDataResult, DynValuesResult]> {
  const { talentProfileId, isSelf } = input;
  // TEMP QA instrumentation (P3 debug) — remove once verified.
  const t0 = Date.now();
  void improntaLog("load_talent_profile_editor_data.info", {
    message: `[editor-loader] start talent=${talentProfileId} isSelf=${isSelf}`,
  });
  const out = await Promise.all([
    isSelf
      ? getTalentProfileEditorDataForSelf({
          talent_profile_id: talentProfileId,
        })
      : getTalentProfileEditorData({ talent_profile_id: talentProfileId }),
    isSelf
      ? getTalentProfileDynFieldValuesForSelf({
          talent_profile_id: talentProfileId,
        })
      : getTalentProfileDynFieldValuesForShell({
          talent_profile_id: talentProfileId,
        }),
  ]);
  void improntaLog("load_talent_profile_editor_data.info", {
    message: `[editor-loader] done talent=${talentProfileId} duration=${
      Date.now() - t0
    }ms editorOk=${out[0]?.ok ?? false} dynOk=${out[1]?.ok ?? false}`,
  });
  return out;
}
