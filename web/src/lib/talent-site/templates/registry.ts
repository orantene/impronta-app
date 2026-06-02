import {
  talentPlanToTier,
  type TalentPlanTier,
} from "@/lib/access/talent-membership";

import { BASE_BOLD_TEMPLATE, BASE_MINIMAL_TEMPLATE } from "./bases";
import { EDITORIAL_TEMPLATE } from "./editorial";
import { CREATOR_TEMPLATE, EPK_TEMPLATE, STAGE_TEMPLATE } from "./max-templates";
import { ROSTER_TEMPLATE } from "./roster";
import { STUDIO_TEMPLATE } from "./studio";
import { buildTulalaDigitalSnapshotFields, TULALA_DIGITAL_TEMPLATE } from "./tulala-digital";
import { CHEF_TEMPLATE } from "./professions/chef";
import { MODEL_TEMPLATE } from "./professions/model";
import { SINGER_TEMPLATE } from "./professions/singer";
import { TATTOO_TEMPLATE } from "./professions/tattoo";
import type { TalentSiteTemplateDef, TalentSiteTemplateKey, TemplateBuildContext } from "./types";

export type { TalentSiteTemplateKey } from "./types";
import type { TalentSiteSnapshot } from "../types";

/**
 * Registration order = gallery display order within a category. Bases first,
 * then profession templates, then legacy archetypes.
 */
export const TALENT_SITE_TEMPLATES: Record<TalentSiteTemplateKey, TalentSiteTemplateDef> = {
  // Free bases
  "tulala-digital": TULALA_DIGITAL_TEMPLATE,
  "base-minimal": BASE_MINIMAL_TEMPLATE,
  "base-bold": BASE_BOLD_TEMPLATE,
  // Pro professions
  singer: SINGER_TEMPLATE,
  chef: CHEF_TEMPLATE,
  model: MODEL_TEMPLATE,
  tattoo: TATTOO_TEMPLATE,
  // Legacy archetypes
  roster: ROSTER_TEMPLATE,
  editorial: EDITORIAL_TEMPLATE,
  studio: STUDIO_TEMPLATE,
  stage: STAGE_TEMPLATE,
  creator: CREATOR_TEMPLATE,
  epk: EPK_TEMPLATE,
};

const TIER_RANK: Record<TalentPlanTier, number> = { free: 0, pro: 1, max: 2 };

export function isTemplateKey(value: unknown): value is TalentSiteTemplateKey {
  return typeof value === "string" && value in TALENT_SITE_TEMPLATES;
}

export function isTemplateAllowedForTier(
  templateKey: string,
  tier: TalentPlanTier,
): boolean {
  const def = TALENT_SITE_TEMPLATES[templateKey as TalentSiteTemplateKey];
  if (!def) return false;
  return TIER_RANK[tier] >= TIER_RANK[def.availableAt];
}

/** All registered templates in display order. */
export function listAllTemplates(): TalentSiteTemplateDef[] {
  return Object.values(TALENT_SITE_TEMPLATES);
}

export function getTemplateDef(
  key: string,
): TalentSiteTemplateDef | undefined {
  return TALENT_SITE_TEMPLATES[key as TalentSiteTemplateKey];
}

export function listTemplatesForTier(tier: TalentPlanTier): TalentSiteTemplateDef[] {
  return Object.values(TALENT_SITE_TEMPLATES).filter((t) => isTemplateAllowedForTier(t.key, tier));
}

export function defaultTemplateKeyForTier(_tier: TalentPlanTier): TalentSiteTemplateKey {
  return "tulala-digital";
}

/** Free-tier templates a downgraded site may keep (no Pro clamp needed). */
export function isFreeTemplate(key: string): boolean {
  const def = TALENT_SITE_TEMPLATES[key as TalentSiteTemplateKey];
  return def?.availableAt === "free";
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
