import "server-only";

import { getCachedActorSession } from "@/lib/server/request-cache";
import type { TalentSiteSnapshot } from "@/lib/talent-site/types";
import {
  loadTalentPublicSiteByProfileCode,
  loadTalentPublicSiteDraftForOwner,
} from "@/lib/talent-site/server/public-load";

export type PlatformTalentSiteResolveResult =
  | { kind: "render"; snapshot: TalentSiteSnapshot; draftPreview: boolean }
  | { kind: "fallback" }
  | { kind: "not_found" };

/**
 * On Tulala platform hosts, resolve whether `/t/<code>` should render the Max
 * snapshot or fall back to the default profile template.
 */
export async function resolvePlatformTalentSiteForProfile(
  profileCode: string,
  opts: { previewDraft?: boolean },
): Promise<PlatformTalentSiteResolveResult> {
  const loaded = await loadTalentPublicSiteByProfileCode(profileCode);

  if (loaded.kind === "not_found") {
    return { kind: "not_found" };
  }

  if (opts.previewDraft) {
    const session = await getCachedActorSession();
    if (session.user) {
      const draft = await loadTalentPublicSiteDraftForOwner(
        profileCode,
        session.user.id,
      );
      if (draft) {
        return { kind: "render", snapshot: draft, draftPreview: true };
      }
    }
  }

  if (loaded.kind === "published") {
    return {
      kind: "render",
      snapshot: loaded.snapshot,
      draftPreview: false,
    };
  }

  return { kind: "fallback" };
}
