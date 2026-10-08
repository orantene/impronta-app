/**
 * TUL-269 · a studio owner converts, after sign-up, to "I also take bookings
 * myself" (the Ambos shape). Pure orchestration over injected steps; the real
 * steps live in `also-bookable.server.ts` and reuse the same writers the build
 * path and the Settings "How you work" move use.
 *
 *   talent profile (create or reuse) → profile approved/public
 *     → self roster row (active, site_visible) → own talent site published
 *
 * Idempotent: every step is an "ensure". A second call on a finished account
 * changes nothing and reports `changed: false`. A failure part-way returns
 * `ok: false` naming the steps that DID finish and the ones that did not, so
 * the UI never claims a state the records do not have; a retry finishes it.
 * Nothing is deleted.
 */

import type { HowYouWorkFacts } from "./how-you-work";

type Fail = { ok: false; error: string };

export type AlsoBookableFacts = HowYouWorkFacts & {
  /** Active owner of `tenantId`, verified server-side from the session. */
  isOwner: boolean;
  /** The owner's own talent site exists and is published. */
  hasOwnSite: boolean;
};

export type AlsoBookableStep = "profile" | "live" | "roster" | "site";

export type AlsoBookableDeps = {
  addProvider(input: { tenantSlug: string; displayName: string }): Promise<{ ok: true; talentProfileId: string } | Fail>;
  promoteProfileLive(talentProfileId: string): Promise<{ ok: true } | Fail>;
  ensureSelfRoster(tenantId: string, talentProfileId: string): Promise<{ ok: true } | Fail>;
  ensureOwnSite(talentProfileId: string): Promise<{ ok: true } | Fail>;
};

export type AlsoBookableResult =
  | { ok: true; changed: boolean; completed: AlsoBookableStep[]; talentProfileId: string; slug: string }
  | { ok: false; error: string; completed: AlsoBookableStep[]; pending: AlsoBookableStep[] };

const ALL: AlsoBookableStep[] = ["profile", "live", "roster", "site"];

export function alsoBookableRefusal(f: AlsoBookableFacts): string | null {
  if (!f.isOwner) return "Only the workspace owner can do this.";
  if (!f.ownsWorkspace || !f.tenantId || !f.tenantSlug) return "This is only available for a studio workspace you own.";
  return null;
}

export async function runAlsoBookable(
  facts: AlsoBookableFacts,
  input: { displayName?: string },
  deps: AlsoBookableDeps,
): Promise<AlsoBookableResult> {
  const refusal = alsoBookableRefusal(facts);
  if (refusal) return { ok: false, error: refusal, completed: [], pending: [] };
  const tenantId = facts.tenantId as string;
  const slug = facts.tenantSlug as string;

  const completed: AlsoBookableStep[] = [];
  const fail = (error: string): AlsoBookableResult => ({
    ok: false,
    error,
    completed,
    pending: ALL.filter((s) => !completed.includes(s)),
  });

  // Already converted end to end: write nothing.
  if (facts.hasTalentProfile && facts.talentProfileId && facts.bookable && facts.hasOwnSite) {
    return { ok: true, changed: false, completed: [...ALL], talentProfileId: facts.talentProfileId, slug };
  }

  let talentProfileId = facts.talentProfileId;
  if (!talentProfileId) {
    const name = (input.displayName ?? facts.displayName ?? "").trim();
    const tp = await deps.addProvider({ tenantSlug: slug, displayName: name });
    if (!tp.ok) return fail(tp.error);
    talentProfileId = tp.talentProfileId;
  }
  completed.push("profile");

  const live = await deps.promoteProfileLive(talentProfileId);
  if (!live.ok) return fail(live.error);
  completed.push("live");

  const roster = await deps.ensureSelfRoster(tenantId, talentProfileId);
  if (!roster.ok) return fail(roster.error);
  completed.push("roster");

  const site = await deps.ensureOwnSite(talentProfileId);
  if (!site.ok) return fail(site.error);
  completed.push("site");

  return { ok: true, changed: true, completed, talentProfileId, slug };
}
