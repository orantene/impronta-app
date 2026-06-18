import {
  talentPlanToTier,
  type TalentPlanTier,
} from "@/lib/access/talent-membership";

import { EDITORIAL_TEMPLATE } from "./editorial";
import { CREATOR_TEMPLATE, EPK_TEMPLATE, STAGE_TEMPLATE } from "./max-templates";
import { ROSTER_TEMPLATE } from "./roster";
import { STUDIO_TEMPLATE } from "./studio";
import { buildTulalaDigitalSnapshotFields, TULALA_DIGITAL_TEMPLATE } from "./tulala-digital";
import type { TalentSiteTemplateDef, TalentSiteTemplateKey, TemplateBuildContext } from "./types";

export type { TalentSiteTemplateKey } from "./types";
import type { TalentSiteSnapshot } from "../types";

export const TALENT_SITE_TEMPLATES: Record<TalentSiteTemplateKey, TalentSiteTemplateDef> = {
  "tulala-digital": TULALA_DIGITAL_TEMPLATE,
  roster: ROSTER_TEMPLATE,
  editorial: EDITORIAL_TEMPLATE,
  studio: STUDIO_TEMPLATE,
  stage: STAGE_TEMPLATE,
  creator: CREATOR_TEMPLATE,
  epk: EPK_TEMPLATE,
};

/** True when `key` is a known slot-based talent-site template key. */
export function isTalentSiteTemplateKey(key: unknown): key is TalentSiteTemplateKey {
  return typeof key === "string" && key in TALENT_SITE_TEMPLATES;
}

const TIER_RANK: Record<TalentPlanTier, number> = { free: 0, pro: 1, max: 2 };

export function isTemplateAllowedForTier(
  templateKey: TalentSiteTemplateKey,
  tier: TalentPlanTier,
): boolean {
  const def = TALENT_SITE_TEMPLATES[templateKey];
  if (!def) return false;
  return TIER_RANK[tier] >= TIER_RANK[def.availableAt];
}

export function listTemplatesForTier(tier: TalentPlanTier): TalentSiteTemplateDef[] {
  return Object.values(TALENT_SITE_TEMPLATES).filter((t) => isTemplateAllowedForTier(t.key, tier));
}

export function defaultTemplateKeyForTier(tier: TalentPlanTier): TalentSiteTemplateKey {
  return "tulala-digital";
}

export function buildTemplateSnapshot(
  templateKey: TalentSiteTemplateKey,
  ctx: TemplateBuildContext,
  opts?: { compositionMode?: "template" | "custom"; pageVersion?: number },
): TalentSiteSnapshot {
  const def = TALENT_SITE_TEMPLATES[templateKey];
  if (!def) {
    throw new Error(`Unknown template: ${templateKey}`);
  }

  const fields =
    templateKey === "tulala-digital"
      ? buildTulalaDigitalSnapshotFields(ctx)
      : {
          title: ctx.profile.displayName.trim() || "My profile",
          metaDescription:
            ctx.profile.publicBio?.trim().slice(0, 240) ??
            ctx.profile.primaryTypeLabel,
          introTagline:
            ctx.profile.publicBio?.trim().slice(0, 240) ??
            ctx.profile.primaryTypeLabel,
        };

  return {
    version: 1,
    siteKind: "talent_personal",
    templateKey,
    compositionMode: opts?.compositionMode ?? "template",
    publishedAt: null,
    pageVersion: opts?.pageVersion ?? 1,
    locale: "en",
    fields: {
      title: fields.title ?? "My profile",
      metaDescription: fields.metaDescription ?? null,
      introTagline: fields.introTagline ?? null,
    },
    templateSchemaVersion: 1,
    slots: def.buildSlots(ctx),
  };
}

export function templateKeyForPlan(planKey: string | null | undefined): TalentSiteTemplateKey {
  return defaultTemplateKeyForTier(talentPlanToTier(planKey));
}
