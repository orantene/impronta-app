/**
 * gallery-policy.ts — PURE policy/mapping leaves split out of
 * `registry-db-merge.ts` to keep that file under the 800-line `max-lines` cap.
 *
 * These are the §E target/tier gating predicates and the DB-tab → gallery-tab /
 * row-id mappers. They depend only on types (no I/O, no React), so both
 * `registry-db-merge` and the extracted `catalog-admin-view` can import them
 * without a cycle. RE-EXPORTED from `registry-db-merge` so existing
 * `from "./registry-db-merge"` imports keep working unchanged.
 */
import type {
  BuilderGalleryTab,
  BuilderTemplateTarget,
} from "@/lib/site-admin/builder-core/templates/registry-rows";
import type { AddGalleryTab } from "./types";

/**
 * Map a DB `builder_templates.gallery_tab` to the live `AddGalleryTab`. Code
 * items already carry an `AddGalleryTab`; DB rows use the builder-tab vocabulary
 * so they land beside the code items of the same family; `page_templates` is the
 * fallback for unknown tabs.
 */
export function dbGalleryTabToAddGalleryTab(tab: BuilderGalleryTab): AddGalleryTab {
  switch (tab) {
    case "elements":
      return "elements";
    case "sections":
      return "sections";
    case "connected":
      return "connected";
    case "page_templates":
      return "page_templates";
    // WS-A A7 — shell templates land on the shell-only tab (offered solely on
    // the site-shell surface via `allowedTabs`).
    case "shell":
      return "shell";
    default:
      return "page_templates";
  }
}

/** Stable, namespaced gallery-item id for a DB template row. */
export function dbTemplateGalleryItemId(rowId: string): string {
  return `db-template:${rowId}`;
}

// ── target_context gating (§E) ───────────────────────────────────────────────

/**
 * A surface viewing the gallery declares which subject it builds for
 * (`talent` | `workspace` | `platform`). A row is visible when its
 * `target_context` is `both` or matches the surface target.
 */
export function templateTargetAllowed(
  rowTarget: BuilderTemplateTarget,
  surfaceTarget: BuilderTemplateTarget | null | undefined,
): boolean {
  if (rowTarget === "both") return true;
  if (!surfaceTarget) return true; // no surface constraint → allow
  if (surfaceTarget === "both") return true;
  return rowTarget === surfaceTarget;
}

/**
 * Talent-tier gating (§E). A row may require a talent tier
 * (e.g. `talent_pro`). When the row requires a tier, the viewing surface must
 * supply a tier that meets/exceeds it. Workspace surfaces (no tier) only see
 * rows with no tier requirement.
 */
const TALENT_TIER_RANK: Record<string, number> = {
  talent_basic: 0,
  talent_pro: 1,
  talent_portfolio: 2,
};

export function templateTalentTierAllowed(
  rowTier: string | null | undefined,
  surfaceTier: string | null | undefined,
): boolean {
  if (!rowTier) return true; // no tier requirement
  const required = TALENT_TIER_RANK[rowTier];
  if (required === undefined) return true; // unknown tier → don't block
  const current = surfaceTier ? TALENT_TIER_RANK[surfaceTier] : undefined;
  if (current === undefined) return false; // row needs a tier; surface has none
  return current >= required;
}
