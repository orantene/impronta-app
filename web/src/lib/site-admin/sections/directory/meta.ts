import type { SectionMeta } from "../types";

export const directoryMeta: SectionMeta = {
  key: "directory",
  // W2-T2 — async server data-loader (awaits the roster query at render time):
  // an in-editor prop edit must still router.refresh() to repaint the island.
  hasLiveData: true,
  label: "Directory",
  description:
    "A portable, filterable talent directory. Drop it on any page, scope it to a talent type (e.g. \"Our Chefs\"), pick a template + card style, and add optional AI search. One engine, unlimited directory pages.",
  businessPurpose: "feature",
  visibleToAgency: true,
  category: "showcase",
  inDefault: true,
  tag: "premium",
};

/**
 * Directory-section instance cap by plan tier (Directory Section Plan §
 * "Free=5 inline / Studio=1 / Agency=full").
 *
 * The product rule has two distinct, non-interchangeable caps that are easy
 * to conflate:
 *
 *   1. INSTANCE cap (this helper) — how many directory SECTIONS a tenant may
 *      place across all builder pages. Free gets none of its own dedicated
 *      directory pages (it relies on the ~5 inline featured profiles on the
 *      starter homepage); Studio gets exactly one curated directory section;
 *      Agency and up get unlimited instances. This is what the add-flow
 *      enforces (block the "Add → Directory" action once the cap is hit).
 *
 *   2. The Free public-DISPLAY cap of 5 talent is a SEPARATE, render-time,
 *      client-side limit on how many cards render — NOT an engine param and
 *      NOT this helper. See `resolvePublicRosterDisplayCap`. Do not collapse
 *      the two: a Free tenant could be shown a directory section seeded by an
 *      upgrade-then-downgrade, and the display cap still has to hold.
 *
 * `null` = unlimited (Agency / Network / legacy / unknown-paid). A finite
 * number is the maximum number of directory section instances allowed.
 *
 * Pure + framework-free so the add-flow (server) and any client gating banner
 * can both import it without bundling hazards. Mirrors the
 * `WorkspaceUrlPlan`-style string tiers used elsewhere; tolerant of `null` /
 * unknown tiers (treated as paid-unlimited — fail-open on COUNT is safe
 * because seat/roster caps already fail-closed on the data that matters).
 */
export function resolveDirectoryInstanceCap(
  planTier: string | null | undefined,
): number | null {
  switch ((planTier ?? "").toLowerCase()) {
    case "free":
      return 0;
    case "studio":
      return 1;
    // agency / network / legacy / unknown → unlimited
    default:
      return null;
  }
}

export type DirectoryInstanceCapState = {
  /** Resolved cap (`null` = unlimited). */
  cap: number | null;
  /** Current directory-section instance count across the tenant's pages. */
  current: number;
  /** Whether ANOTHER instance may be added. */
  canAdd: boolean;
  /** Operator-facing reason when `canAdd` is false (no em dashes). */
  reason: string | null;
};

/**
 * Decide whether a tenant may add one more directory section. The add-flow
 * (owned by `add-gallery/insert.ts`) must call this with the tenant's
 * `plan_tier` and the live count of existing directory instances, and block
 * the insert when `canAdd` is false, surfacing `reason` in the gallery.
 */
export function evaluateDirectoryInstanceAdd(input: {
  planTier: string | null | undefined;
  current: number;
}): DirectoryInstanceCapState {
  const cap = resolveDirectoryInstanceCap(input.planTier);
  const current = Math.max(0, Math.trunc(input.current));
  if (cap == null) {
    return { cap: null, current, canAdd: true, reason: null };
  }
  if (current < cap) {
    return { cap, current, canAdd: true, reason: null };
  }
  const tier = (input.planTier ?? "").toLowerCase();
  const reason =
    cap === 0
      ? "The Free plan uses inline featured profiles on your homepage. Upgrade to Studio to add a dedicated directory page."
      : tier === "studio"
        ? "Studio includes one directory page. Upgrade to Agency for unlimited directory pages."
        : `This plan allows ${cap} directory ${cap === 1 ? "page" : "pages"}. Upgrade to add more.`;
  return { cap, current, canAdd: false, reason };
}
