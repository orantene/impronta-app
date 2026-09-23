/**
 * The one place the draft-save chokepoints resolve "what may this saver do to
 * their own personal website".
 *
 * Both chokepoints — the page save (`talent-page-actions.ts`) and the shell
 * save (`talent-site-shell-actions.ts`) — are `"use server"` modules, so this
 * helper lives in a plain module they can both import (same reason as
 * `site-action-gate.ts`).
 *
 * It returns `null`, meaning "do not apply the free-site rules", in three
 * cases, each deliberate:
 *
 *   1. `TALENT_FREE_WEBSITE_ENABLED` is off — the guard must be completely
 *      inert so the flags-off behaviour is byte-identical to today;
 *   2. the actor is not a talent at all — the talent-page surface is also
 *      editable by WORKSPACE STAFF (see the `talent_pages` RLS), and a staff
 *      edit is not a talent's free-plan edit;
 *   3. the actor is a talent but not the OWNER of the row being written — RLS
 *      already refuses that write, and guessing a plan for someone else's row
 *      would be worse than leaving the database to say no.
 *
 * Plain module on purpose (no `"use server"`, no `server-only`): the marker
 * breaks the tsx test lanes that lack the polyfill.
 */

import { isTalentFreeWebsiteEnabled } from "@/lib/access/talent-free-website";
import {
  buildTalentSiteCapabilities,
  type TalentSiteCapabilities,
} from "@/lib/access/talent-membership";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";

/**
 * The saver's own personal-site capabilities, or `null` when the free-site
 * rules do not apply to this save (see the module comment).
 */
export async function loadTalentSiteSaveCapabilities(
  talentProfileId: string | null | undefined,
): Promise<TalentSiteCapabilities | null> {
  if (!isTalentFreeWebsiteEnabled()) return null;
  const scope = await requireTalentSelf();
  if (!scope.ok) return null;
  if (talentProfileId && talentProfileId !== scope.talentProfile.id) return null;
  return buildTalentSiteCapabilities(scope.planKey);
}
