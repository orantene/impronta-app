import "server-only";

import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import {
  loadTalentStarterMedia,
  loadTalentStarterProfileData,
} from "@/lib/talent-site/server/load-starter-data";
import {
  buildTemplatePreviewHydration,
  demoFixtureToMedia,
  demoFixtureToStarterProfile,
  type TemplatePreviewHydration,
} from "@/lib/talent-site/templates/preview-hydration";

/**
 * TMPL-2 — resolve the data the shared template-preview route hydrates with.
 *
 * SECURITY (the load-bearing gate). The preview route is public-by-default, so a
 * `?talent=<id>` param MUST NOT be allowed to leak an arbitrary talent's profile.
 * The ONLY way a real profile is loaded is when the CURRENT SESSION owns it: we
 * resolve the requester's own talent profile via `requireTalentSelf()` and load
 * real data only when its id equals the requested `talentProfileId`. Any other
 * case — no session, a different talent's id, a non-talent user, a missing
 * profile — falls back to the public-safe demo persona (never a 403 and never a
 * data leak; the requester just sees sample data). This makes the route safe to
 * link from any picker without a signed token.
 */
export async function resolvePreviewHydration(
  talentProfileId: string | null | undefined,
): Promise<TemplatePreviewHydration> {
  const requested = talentProfileId?.trim();
  if (requested) {
    const scope = await requireTalentSelf();
    if (scope.ok && scope.talentProfile.id === requested) {
      const profile = await loadTalentStarterProfileData(requested);
      if (profile) {
        const media = await loadTalentStarterMedia(requested, profile.displayName);
        return buildTemplatePreviewHydration({ profile, media }, { isReal: true });
      }
    }
  }
  // Anonymous / non-owner / unresolved → public-safe demo persona.
  return buildTemplatePreviewHydration(
    {
      profile: demoFixtureToStarterProfile(),
      media: demoFixtureToMedia(),
    },
    { isReal: false },
  );
}
