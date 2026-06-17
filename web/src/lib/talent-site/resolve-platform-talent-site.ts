import "server-only";

import type { TalentSiteSnapshot } from "@/lib/talent-site/types";
import { loadTalentPublicSiteByProfileCode } from "@/lib/talent-site/server/public-load";
import {
  buildDefaultTalentFreeformSnapshot,
  isDefaultTalentFreeformEnabled,
} from "@/lib/talent-site/default-talent-template";
import { loadPlatformDefaultTemplatePointers } from "@/lib/platform/default-templates";
import {
  loadDefaultTalentFreeformContext,
} from "@/lib/talent-site/server/default-talent-context";
import { loadTalentMaxSiteLink } from "@/lib/talent-site/server/load-max-site-link";

export type PlatformTalentSiteResolveResult =
  | {
      kind: "render";
      snapshot: TalentSiteSnapshot;
      draftPreview: boolean;
      /**
       * ADDITIVE — present ONLY for a platform-default FREEFORM snapshot, so the
       * page can thread tenant + talent subject context to the freeform
       * renderer (curated `section_embed` data + connected sections). Absent for
       * every published slot snapshot (the renderer ignores it).
       */
      freeformContext?: {
        tenantId: string | null;
        talentProfileId: string;
      };
    }
  | { kind: "fallback" }
  | { kind: "not_found" };

/**
 * On Tulala platform hosts, resolve what `/t/<code>` renders.
 *
 * REPOINTED (Talent Max Site): `/t/<code>` is now ALWAYS the DISCOVERY PROFILE
 * — the freeform default (when the `default_talent_freeform_enabled` Lab toggle
 * or the `DEFAULT_TALENT_FREEFORM_PROFILE` env flag is on) or the untouched
 * `LightProfileLayout` fallback. It NO LONGER renders the legacy
 * `talent_sites.published_snapshot` / `draft_snapshot` as the profile — the
 * talent's multi-page Max website lives at its own route (`/t/site/<slug>`),
 * rendered by `renderTalentMaxSite()`. The legacy snapshot columns remain in the
 * DB (untouched) — they are simply no longer the profile render. Because the
 * snapshot is never served here, the previous published-snapshot plan gate +
 * draft-preview snapshot branches are gone (including the now-removed
 * `previewDraft` option); the profile's own preview (`?preview=1`) and
 * `LightProfileLayout` are byte-identical to before.
 */
export async function resolvePlatformTalentSiteForProfile(
  profileCode: string,
): Promise<PlatformTalentSiteResolveResult> {
  const loaded = await loadTalentPublicSiteByProfileCode(profileCode);

  if (loaded.kind === "not_found") {
    return { kind: "not_found" };
  }

  // Both load kinds now carry only the `talent_profile_id` (the legacy published
  // snapshot is intentionally never read as the profile render). The previous
  // `previewDraft` option drove a draft-snapshot-as-profile branch that no
  // longer exists — the Max site's own draft preview lives on
  // `/t/site/<slug>?preview=draft` — so it is gone.
  const talentProfileId = loaded.talentProfileId;

  // ALWAYS the discovery profile: the freeform default when enabled, otherwise
  // `{ kind: "fallback" }` → the untouched `LightProfileLayout`.
  return resolveDefaultProfile(talentProfileId);
}

/**
 * Build the platform-default FREEFORM profile for a talent. The freeform default
 * is ON when the Builder Lab toggle (`default_talent_freeform_enabled`) OR the
 * legacy env flag `DEFAULT_TALENT_FREEFORM_PROFILE` is true — so the env flag
 * still works and the Lab toggle is the new no-deploy path. Returns
 * `{ kind: "fallback" }` when BOTH are OFF (→ the untouched `LightProfileLayout`,
 * byte-identical to today) OR when the talent's profile data can't be loaded
 * (degrade safe). Never throws.
 */
async function resolveDefaultProfile(
  talentProfileId: string,
): Promise<PlatformTalentSiteResolveResult> {
  const { talentFreeformEnabled } = await loadPlatformDefaultTemplatePointers();
  const freeformEnabled =
    talentFreeformEnabled || isDefaultTalentFreeformEnabled();
  if (!freeformEnabled) {
    return { kind: "fallback" };
  }
  const ctx = await loadDefaultTalentFreeformContext(talentProfileId);
  if (!ctx) return { kind: "fallback" };
  const maxSiteLink = await loadTalentMaxSiteLink(talentProfileId);
  const snapshot = await buildDefaultTalentFreeformSnapshot({
    profile: ctx.profile,
    media: ctx.media,
    freeformEnabled,
    maxSiteUrl: maxSiteLink?.url ?? "",
  });
  if (!snapshot) return { kind: "fallback" };
  return {
    kind: "render",
    snapshot,
    draftPreview: false,
    freeformContext: { tenantId: ctx.tenantId, talentProfileId },
  };
}
