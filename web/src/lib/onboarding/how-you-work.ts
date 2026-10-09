/**
 * TUL-86 · Onboarding 1E: "How you work", changeable later from Settings.
 *
 * Pure: the current choice is DERIVED from records (never stored), and each
 * move is a fixed call sequence over injected steps, so the sequences are
 * unit-tested. The real steps live in `lib/server-actions/how-you-work.ts` and
 * reuse the same writers as onboarding 1A, so a move leaves the records a fresh
 * signup of the target choice would. Nothing here deletes anything.
 */

import { homeSurfaceForChoice, type OnboardingChoice } from "./choice";

export type HowYouWorkFacts = {
  hasTalentProfile: boolean;
  ownsWorkspace: boolean;
  /** Own roster row in an owned workspace is active and site_visible/featured. */
  bookable: boolean;
  tenantId: string | null;
  tenantSlug: string | null;
  talentProfileId: string | null;
  displayName: string | null;
};

/**
 * The name "add me as a provider" uses for the new talent profile. A studio owner
 * has no talent profile yet, so the profile's own name is empty: fall back to the
 * account's display name, then the workspace name. First non-blank wins.
 */
export function resolveProviderDisplayName(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    const v = typeof c === "string" ? c.trim() : "";
    if (v) return v;
  }
  return null;
}

export type HowYouWorkMove = "open_studio" | "add_provider" | "resume_bookings" | "stop_bookings";

/** myself = talent only; studio = workspace without me bookable; both = workspace + me bookable. */
export function deriveHowYouWork(f: Pick<HowYouWorkFacts, "hasTalentProfile" | "ownsWorkspace" | "bookable">): OnboardingChoice {
  if (!f.ownsWorkspace) return "myself";
  return f.hasTalentProfile && f.bookable ? "both" : "studio";
}

export function movesFor(f: HowYouWorkFacts): HowYouWorkMove[] {
  const choice = deriveHowYouWork(f);
  if (choice === "myself") return f.hasTalentProfile ? ["open_studio"] : [];
  if (choice === "both") return ["stop_bookings"];
  return [f.hasTalentProfile ? "resume_bookings" : "add_provider"];
}

type Fail = { ok: false; error: string };

export type MoveDeps = {
  /** provisionFreeWorkspaceFromTalent (workspace + owner + domain + self roster). */
  openStudio(input: { workspaceName: string; slug: string; location: string }): Promise<{ ok: true; slug: string } | Fail>;
  /** provisionTalentProfileSelf (talent profile + roster link, or reuse). */
  addProvider(input: { tenantSlug: string; displayName: string }): Promise<{ ok: true; talentProfileId: string } | Fail>;
  /** ensureSelfRosterSiteVisible, the same function 1A uses. */
  ensureSelfRoster(tenantId: string, talentProfileId: string): Promise<{ ok: true } | Fail>;
  /** Promote a draft/hidden talent profile to approved/public (planProfilePromotion). */
  promoteProfileLive(talentProfileId: string): Promise<{ ok: true } | Fail>;
  /** Roster row to roster_only + direct booking off. Never a delete. */
  hideFromBooking(tenantId: string, talentProfileId: string): Promise<{ ok: true } | Fail>;
  setHomeSurface(surface: "talent" | "workspace"): Promise<{ ok: true } | Fail>;
};

export type MoveInput = { workspaceName?: string; slug?: string; location?: string; displayName?: string };

export type MoveResult =
  | { ok: true; move: HowYouWorkMove; choice: OnboardingChoice; slug: string | null; warnings: string[] }
  | { ok: false; move: HowYouWorkMove; error: string };

export async function runHowYouWorkMove(
  move: HowYouWorkMove,
  facts: HowYouWorkFacts,
  input: MoveInput,
  deps: MoveDeps,
): Promise<MoveResult> {
  const fail = (error: string): MoveResult => ({ ok: false, move, error });
  if (!movesFor(facts).includes(move)) return fail("This change is not available for your account right now.");
  const warnings: string[] = [];

  if (move === "open_studio") {
    const ws = await deps.openStudio({
      workspaceName: (input.workspaceName ?? "").trim(),
      slug: (input.slug ?? "").trim(),
      location: (input.location ?? "").trim(),
    });
    if (!ws.ok) return fail(ws.error);
    if (facts.talentProfileId) {
      const live = await deps.promoteProfileLive(facts.talentProfileId);
      if (!live.ok) return fail(live.error);
    }
    const home = await deps.setHomeSurface(homeSurfaceForChoice("both"));
    if (!home.ok) warnings.push("home");
    return { ok: true, move, choice: "both", slug: ws.slug, warnings };
  }

  if (!facts.tenantId || !facts.tenantSlug) return fail("Workspace not found.");

  if (move === "add_provider") {
    const name = (input.displayName ?? facts.displayName ?? "").trim();
    const tp = await deps.addProvider({ tenantSlug: facts.tenantSlug, displayName: name });
    if (!tp.ok) return fail(tp.error);
    const live = await deps.promoteProfileLive(tp.talentProfileId);
    if (!live.ok) return fail(live.error);
    const roster = await deps.ensureSelfRoster(facts.tenantId, tp.talentProfileId);
    if (!roster.ok) return fail(roster.error);
    return { ok: true, move, choice: "both", slug: facts.tenantSlug, warnings };
  }

  if (!facts.talentProfileId) return fail("No talent profile found.");

  if (move === "resume_bookings") {
    const live = await deps.promoteProfileLive(facts.talentProfileId);
    if (!live.ok) return fail(live.error);
    const roster = await deps.ensureSelfRoster(facts.tenantId, facts.talentProfileId);
    if (!roster.ok) return fail(roster.error);
    return { ok: true, move, choice: "both", slug: facts.tenantSlug, warnings };
  }

  const hidden = await deps.hideFromBooking(facts.tenantId, facts.talentProfileId);
  if (!hidden.ok) return fail(hidden.error);
  return { ok: true, move, choice: "studio", slug: facts.tenantSlug, warnings };
}
