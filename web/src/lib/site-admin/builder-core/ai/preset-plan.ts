/**
 * AI-1 (B4) — text-to-page PRESET PLANNER.
 *
 * The deterministic spine of the shared text-to-page composer. Given a one-line
 * brief + a surface context, it scores the EXISTING page-design presets (the
 * `PAGE_DESIGN_SUMMARIES` registry every starter picker already uses) by keyword
 * overlap and returns an ORDERED list of design ids — best match first. The
 * composer (text-to-page.ts) bakes the top-ranked design into a real, governed
 * BuilderNode tree.
 *
 * Why a plan of EXISTING presets and not free-form node generation: the program
 * invariant is "compose from existing section presets / the registry". A planner
 * that can only emit ids from the fixed in-repo registry can NEVER produce an
 * illegal/locked node or arbitrary HTML — the worst case is a sub-optimal but
 * always-valid page. The optional LLM seam (resolveAiChatAdapter) only RE-RANKS
 * this same closed candidate list; it can never widen it, so the safety property
 * holds whether or not a live model is connected.
 *
 * Pure + client-safe (no React, no server imports) so the planner is unit-tested
 * in isolation (gate requirement) and the surface filter is shared with the
 * EmptyCanvasStarter audience split.
 */

import {
  PAGE_DESIGN_SUMMARIES,
  type PageDesignSummary,
} from "@/lib/site-admin/builder-node/page-designs/summaries";

/**
 * The audience the generated page serves. Mirrors the EmptyCanvasStarter surface
 * vocabulary so the planner offers the same starter set the manual picker does
 * (a single-subject talent surface never gets an agency-roster home, and vice
 * versa). `platform` (Builder Lab authoring) and the homepage see the full set.
 */
export type TextToPageSurface =
  | "workspace"
  | "talent"
  | "talent-site"
  | "platform";

/**
 * Which design `target` values a surface may compose from. Matches
 * `targetsForStarterSurface` in empty-canvas-starter-surface.ts; `platform`
 * (Lab authoring, no single subject) sees everything, like the homepage.
 */
export function targetsForTextToPageSurface(
  surface: TextToPageSurface,
): ReadonlyArray<PageDesignSummary["target"]> | null {
  switch (surface) {
    case "talent":
    case "talent-site":
      return ["talent", "both"];
    case "workspace":
      return ["workspace", "both"];
    case "platform":
    default:
      // Full set (no audience filter) for super-admin authoring.
      return null;
  }
}

/**
 * Keyword → design affinity. Each design earns points when the brief mentions
 * any of its cue words. Hand-curated from the design archetypes / descriptions
 * so a plain-language brief ("a portfolio for my photography") deterministically
 * lands on a sensible preset even with no model connected. Cues are matched
 * case-insensitively on word boundaries.
 */
const DESIGN_KEYWORD_CUES: Record<string, ReadonlyArray<string>> = {
  impronta: [
    "agency",
    "roster",
    "talent",
    "models",
    "directory",
    "representation",
    "bookings",
    "modeling",
  ],
  editorial: [
    "portfolio",
    "photographer",
    "photography",
    "editorial",
    "artist",
    "gallery",
    "series",
    "fashion",
    "visual",
  ],
  agency: [
    "agency",
    "production",
    "studio",
    "creative",
    "credits",
    "services",
    "film",
    "video",
    "advertising",
  ],
  saas: [
    "saas",
    "software",
    "product",
    "app",
    "platform",
    "startup",
    "pricing",
    "features",
    "tech",
    "tool",
  ],
  store: [
    "store",
    "shop",
    "prints",
    "print",
    "buy",
    "sell",
    "ecommerce",
    "products",
    "merch",
    "edition",
  ],
  festival: [
    "festival",
    "event",
    "concert",
    "show",
    "live",
    "lineup",
    "music",
    "tour",
    "gig",
    "performance",
  ],
  studio: [
    "studio",
    "design",
    "creative",
    "brand",
    "branding",
    "agency",
    "work",
    "projects",
  ],
  noir: [
    "noir",
    "dark",
    "moody",
    "luxury",
    "premium",
    "cinematic",
    "bold",
    "dramatic",
  ],
  restaurant: [
    "restaurant",
    "menu",
    "food",
    "cafe",
    "dining",
    "chef",
    "bar",
    "bistro",
    "cuisine",
    "kitchen",
  ],
  conference: [
    "conference",
    "summit",
    "event",
    "speakers",
    "schedule",
    "agenda",
    "tickets",
    "meetup",
    "workshop",
    "talks",
  ],
  coach: [
    "coach",
    "coaching",
    "personal",
    "brand",
    "consultant",
    "speaker",
    "author",
    "mentor",
    "wellness",
    "fitness",
    "trainer",
  ],
};

/** Default fallback order when a brief matches nothing — broad business-first. */
const DEFAULT_PRIORITY: ReadonlyArray<string> = [
  "saas",
  "studio",
  "agency",
  "editorial",
  "coach",
  "store",
  "impronta",
  "festival",
  "conference",
  "restaurant",
  "noir",
];

function normalizeBrief(brief: string): string[] {
  return brief
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export interface PresetPlanEntry {
  id: string;
  label: string;
  score: number;
}

export interface PresetPlan {
  /** Ordered candidate designs, best match first (always non-empty). */
  ordered: PresetPlanEntry[];
  /** The chosen design id (ordered[0].id) — what the composer bakes. */
  chosenId: string;
  /** How the score was reached — drives the "matched"/"default" copy. */
  matched: boolean;
}

/**
 * Score the available presets against a brief and return an ordered plan. Pure +
 * deterministic: the SAME brief + surface always yields the SAME order, so it is
 * fully testable and works with no model connected. The returned `ordered` list
 * is the closed candidate set the optional LLM re-ranker is constrained to.
 */
export function planPresetsFromBrief(
  brief: string,
  surface: TextToPageSurface,
): PresetPlan {
  const allowedTargets = targetsForTextToPageSurface(surface);
  const candidates = PAGE_DESIGN_SUMMARIES.filter(
    (d) => allowedTargets === null || allowedTargets.includes(d.target),
  );
  // Defensive: the registry is never empty, but never return an empty plan.
  const pool =
    candidates.length > 0 ? candidates : [...PAGE_DESIGN_SUMMARIES];

  const words = new Set(normalizeBrief(brief));
  const scored = pool.map((design) => {
    const cues = DESIGN_KEYWORD_CUES[design.id] ?? [];
    let score = 0;
    for (const cue of cues) {
      // A multi-word cue ("personal brand") matches if every token is present;
      // single-word cues match on the token set.
      const tokens = cue.split(/\s+/);
      if (tokens.every((t) => words.has(t))) score += 1;
    }
    return { id: design.id, label: design.label, score };
  });

  const anyMatch = scored.some((s) => s.score > 0);

  // Stable sort: by score desc, then by the default-priority order so ties are
  // deterministic (and a no-match brief falls through to the business-first
  // default without ever returning an empty list).
  const priorityRank = (id: string): number => {
    const i = DEFAULT_PRIORITY.indexOf(id);
    return i === -1 ? DEFAULT_PRIORITY.length : i;
  };
  const ordered = [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return priorityRank(a.id) - priorityRank(b.id);
  });

  return {
    ordered,
    chosenId: ordered[0].id,
    matched: anyMatch,
  };
}

/**
 * Re-order a plan to honor an LLM's preference of design ids, DISCARDING any id
 * the model invented that isn't in the closed candidate set. This is the only
 * place the model influences the outcome — it can re-rank, never widen, so the
 * "presets only, never arbitrary nodes" safety property is preserved even if the
 * model hallucinates. Unknown ids are dropped; remaining candidates keep their
 * deterministic order so the result is always a full, valid plan.
 */
export function applyModelPreference(
  plan: PresetPlan,
  preferredIds: ReadonlyArray<string>,
): PresetPlan {
  const byId = new Map(plan.ordered.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const reordered: PresetPlanEntry[] = [];
  for (const id of preferredIds) {
    const entry = byId.get(id);
    if (entry && !seen.has(id)) {
      reordered.push(entry);
      seen.add(id);
    }
  }
  // Append any candidates the model omitted, preserving the deterministic order.
  for (const entry of plan.ordered) {
    if (!seen.has(entry.id)) reordered.push(entry);
  }
  return {
    ordered: reordered,
    chosenId: reordered[0]?.id ?? plan.chosenId,
    matched: plan.matched,
  };
}
