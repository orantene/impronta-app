import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { buildMaxSiteTemplateTrees } from "../max-site-templates/registry";
import type { MaxSiteTemplateKey } from "../max-site-templates/types";
import { hydrateTalentTree } from "../default-talent-tree";
import { talentProfileTokens } from "../default-talent-template";
import { loadDefaultTalentFreeformContext } from "./default-talent-context";

/**
 * Talent Max SITE — APPLY-TEMPLATE core (server-only, NOT "use server").
 *
 * The DB write + auth gating live in the thin `applyMaxSiteTemplateAction`
 * ("use server"); this module owns the pure-ish heavy lifting it delegates to:
 * load the talent's `{{token}}` data, build + hydrate the chosen template's
 * shell + home trees, and validate both before persistence. Split out to keep
 * the "use server" actions file under the 800-line cap and to give the apply
 * logic a unit-testable seam.
 */

/**
 * Load the talent's `{{token}}` map (name / photo / bio / services / gallery /
 * inquiry CTA) for hydrating a starter template's home tree. Degrade-safe: when
 * the talent has no loadable profile data (no profile row / no service role) this
 * returns `null` so the caller seeds the template's UN-hydrated tree (placeholders
 * resolve to "" via `hydrateTalentTree`, never leaking a raw `{{x}}` to the page).
 *
 * `maxSiteUrl` is passed EMPTY on purpose — this IS the talent's own site, so the
 * "Visit my site" Max badge prunes (no self-referential link). Mirrors the
 * provisioning helper's `buildStarterHomeBlocks`.
 */
export async function loadTemplateHydrationTokens(
  talentProfileId: string,
): Promise<ReturnType<typeof talentProfileTokens> | null> {
  try {
    const ctx = await loadDefaultTalentFreeformContext(talentProfileId);
    if (ctx?.profile) {
      return talentProfileTokens(ctx.profile, ctx.media, "");
    }
  } catch (err) {
    logServerError("maxSiteManager.applyTemplate.hydrate", err);
  }
  return null;
}

export type BuildAppliedTemplateResult =
  | { ok: true; shellTree: BuilderNode[]; homeTree: BuilderNode[] }
  | { ok: false };

/**
 * Build + hydrate + validate the shell and home trees for `templateKey`,
 * pre-filled with the talent's real profile data. Returns the validated trees
 * (the validator's repaired, schema-clean output) ready to persist, or
 * `{ ok: false }` when either tree fails validation (logged) — a malformed
 * starter must never land in a draft.
 */
export async function buildAppliedTemplateTrees(
  talentProfileId: string,
  displayName: string,
  templateKey: MaxSiteTemplateKey,
): Promise<BuildAppliedTemplateResult> {
  const { shellTree, homeTree } = buildMaxSiteTemplateTrees(templateKey, { displayName });

  const tokens = await loadTemplateHydrationTokens(talentProfileId);
  const hydratedHome: BuilderNode[] = tokens
    ? hydrateTalentTree(homeTree, tokens)
    : homeTree;

  const shellCheck = validateBuilderNodeTree(shellTree);
  const homeCheck = validateBuilderNodeTree(hydratedHome);
  if (!shellCheck.ok || !homeCheck.ok) {
    logServerError("maxSiteManager.applyTemplate.invalidTree", {
      templateKey,
      shellIssues: shellCheck.ok ? [] : shellCheck.issues,
      homeIssues: homeCheck.ok ? [] : homeCheck.issues,
    });
    return { ok: false };
  }

  return { ok: true, shellTree: shellCheck.tree, homeTree: homeCheck.tree };
}
