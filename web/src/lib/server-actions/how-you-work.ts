"use server";

// TUL-86 · 1E: Settings "How you work". Loads the derived current choice and
// runs one move. Reuses the 1A writers; the move validity is re-derived on the
// server from records, never trusted from the client. Nothing is deleted.

import { revalidatePath } from "next/cache";

import {
  deriveHowYouWork,
  movesFor,
  runHowYouWorkMove,
  type HowYouWorkMove,
  type MoveInput,
} from "@/lib/onboarding/how-you-work";
import { hideSelfFromBooking, loadFacts, promoteTalentProfileLive, setHomeSurfacePreference } from "@/lib/onboarding/how-you-work.server";
import type { OnboardingChoice } from "@/lib/onboarding/choice";
import { ensureSelfRosterSiteVisible } from "@/lib/saas/ensure-self-roster";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { provisionTalentProfileSelf } from "./talent-self-provision";
import { provisionFreeWorkspaceFromTalent } from "./talent-workspace-provision";

export type HowYouWorkView = {
  choice: OnboardingChoice;
  moves: HowYouWorkMove[];
  workspaceName: string | null;
  defaultDisplayName: string | null;
};

export type LoadHowYouWorkResult = { ok: true; view: HowYouWorkView } | { ok: false; error: string };
export type RunHowYouWorkMoveResult =
  | { ok: true; choice: OnboardingChoice; slug: string | null }
  | { ok: false; error: string };

export async function loadHowYouWork(): Promise<LoadHowYouWorkResult> {
  const session = await getCachedActorSession();
  const admin = createServiceRoleClient();
  if (!session.user || !admin) return { ok: false, error: "You must be signed in." };
  try {
    const { facts, workspaceName } = await loadFacts(admin, session.user.id);
    return { ok: true, view: { choice: deriveHowYouWork(facts), moves: movesFor(facts), workspaceName, defaultDisplayName: facts.displayName } };
  } catch (err) {
    logServerError("how-you-work.load", err);
    return { ok: false, error: "Could not load this right now." };
  }
}

export async function runHowYouWorkMoveAction(move: HowYouWorkMove, input: MoveInput): Promise<RunHowYouWorkMoveResult> {
  const session = await getCachedActorSession();
  const admin = createServiceRoleClient();
  if (!session.user || !admin) return { ok: false, error: "You must be signed in." };
  const userId = session.user.id;
  try {
    const { facts } = await loadFacts(admin, userId);
    const res = await runHowYouWorkMove(move, facts, input, {
      openStudio: (i) => provisionFreeWorkspaceFromTalent(i),
      async addProvider(i) {
        const r = await provisionTalentProfileSelf(i);
        return r.ok ? { ok: true, talentProfileId: r.talentProfileId } : r;
      },
      async ensureSelfRoster(tenantId, talentProfileId) {
        const r = await ensureSelfRosterSiteVisible(admin, { tenantId, talentProfileId, addedBy: userId });
        return r.ok ? r : { ok: false, error: r.error };
      },
      promoteProfileLive: (id) => promoteTalentProfileLive(admin, id),
      hideFromBooking: (tenantId, talentProfileId) => hideSelfFromBooking(admin, tenantId, talentProfileId),
      setHomeSurface: (surface) => setHomeSurfacePreference(admin, userId, surface),
    });
    if (!res.ok) return { ok: false, error: res.error };
    if (facts.tenantSlug) revalidatePath(`/${facts.tenantSlug}/admin/roster`);
    return { ok: true, choice: res.choice, slug: res.slug };
  } catch (err) {
    logServerError("how-you-work.move", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
