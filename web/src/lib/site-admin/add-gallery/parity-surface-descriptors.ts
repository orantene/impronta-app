/**
 * parity-surface-descriptors.ts (X5) — synthesize a `GallerySurfaceDescriptor`
 * for each real builder surface × plan × talent tier.
 *
 * The four surfaces the probe covers mirror the live config factories
 * (`builder-core/config.ts`) EXACTLY — same `allowedTabs`, `allowDbTemplates`,
 * `surfaceTarget` — so the probe gates against the same shape the live
 * `fetchSurfaceGalleryItems` receives. Kept PURE + dependency-light (no config
 * import) so the test graph stays `.css`-free per the X1 finding; the constants
 * below are pinned to the factories and guarded by a parity test.
 *
 * The lossy reality this de-risks (X1 / X4): the talent SITE-SHELL surface
 * declares `surfaceTarget:'workspace'` (because `buildSiteShellBuilderConfig`
 * hardcodes it), so a talent's own Max-site header/footer gallery is gated by the
 * WORKSPACE audience, not the talent one. The probe therefore exposes a talent
 * shell as a distinct, workspace-targeted surface.
 */

import type { AddGalleryAllowTab, GallerySurfaceDescriptor } from "./types";

/** The probe's surface keys — the four real builder surfaces. */
export type ParitySurfaceKey =
  | "talent_profile"
  | "talent_shell"
  | "workspace_page"
  | "workspace_shell";

export const PARITY_PLAN_KEYS = ["free", "studio", "agency", "network"] as const;
export type ParityPlanKey = (typeof PARITY_PLAN_KEYS)[number];

export const PARITY_TIER_KEYS = [
  "talent_basic",
  "talent_pro",
  "talent_portfolio",
] as const;
export type ParityTierKey = (typeof PARITY_TIER_KEYS)[number];

/**
 * Static per-surface shape, pinned to the live config factories:
 *   - talent_profile → `buildTalentPageBuilderConfig`
 *   - talent_shell   → `buildSiteShellBuilderConfig` (target 'workspace' — the surprise)
 *   - workspace_page → `buildCmsPageBuilderConfig`
 *   - workspace_shell→ `buildSiteShellBuilderConfig`
 *
 * `usesTalentTier` marks the only surface (talent profile) that actually carries
 * a talent tier; the others ignore the tier selector (tier-gated templates are
 * filtered out via `templateTalentTierAllowed`'s "surface has no tier" branch).
 */
interface ParitySurfaceShape {
  key: ParitySurfaceKey;
  label: string;
  blurb: string;
  allowedTabs: ReadonlyArray<AddGalleryAllowTab>;
  allowDbTemplates: boolean;
  surfaceTarget: GallerySurfaceDescriptor["surfaceTarget"];
  usesTalentTier: boolean;
}

export const PARITY_SURFACES: ReadonlyArray<ParitySurfaceShape> = [
  {
    key: "talent_profile",
    label: "Talent profile",
    blurb: "The talent's freeform profile page (buildTalentPageBuilderConfig).",
    allowedTabs: ["blocks", "designs", "data", "page_templates"],
    allowDbTemplates: true,
    surfaceTarget: "talent",
    usesTalentTier: true,
  },
  {
    key: "talent_shell",
    label: "Talent shell",
    blurb:
      "The talent Max-SITE header/footer shell — governed by the WORKSPACE target (surfaceTarget:'workspace').",
    allowedTabs: ["blocks", "designs", "data", "shell"],
    allowDbTemplates: true,
    surfaceTarget: "workspace",
    usesTalentTier: false,
  },
  {
    key: "workspace_page",
    label: "Workspace page",
    blurb: "The agency storefront freeform page (buildCmsPageBuilderConfig).",
    allowedTabs: ["blocks", "designs", "data", "page_templates"],
    allowDbTemplates: true,
    surfaceTarget: "workspace",
    usesTalentTier: false,
  },
  {
    key: "workspace_shell",
    label: "Workspace shell",
    blurb: "The agency site header/footer shell (buildSiteShellBuilderConfig).",
    allowedTabs: ["blocks", "designs", "data", "shell"],
    allowDbTemplates: true,
    surfaceTarget: "workspace",
    usesTalentTier: false,
  },
];

export function paritySurfaceByKey(key: ParitySurfaceKey): ParitySurfaceShape {
  const shape = PARITY_SURFACES.find((s) => s.key === key);
  if (!shape) throw new Error(`Unknown parity surface key: ${key}`);
  return shape;
}

/**
 * Build the `GallerySurfaceDescriptor` for one (surface, plan, tier, tenant)
 * combination. The talent tier is applied ONLY on the talent-profile surface
 * (the others have no tier — mirroring the real factories), so a tier-gated
 * template is correctly seen on the profile but filtered out on the shells. PURE.
 */
export function buildParityDescriptor(input: {
  surface: ParitySurfaceKey;
  plan: ParityPlanKey;
  tier: ParityTierKey;
  /** Live tenant id for staged-rollout bucketing. null ⇒ no rollout gating. */
  tenantId: string | null;
}): GallerySurfaceDescriptor {
  const shape = paritySurfaceByKey(input.surface);
  return {
    allowedTabs: shape.allowedTabs,
    allowDbTemplates: shape.allowDbTemplates,
    surfaceTarget: shape.surfaceTarget,
    // X4 — the parity surface key IS the precise 4-surface overlay key, so the
    // probe now exercises the same per-surface subtraction the live merge does.
    surfaceKey: shape.key,
    plan: input.plan,
    talentTier: shape.usesTalentTier ? input.tier : null,
    tenantId: input.tenantId,
  };
}
