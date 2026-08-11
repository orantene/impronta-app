import type { ResolvedSkill } from "@/lib/server-actions/admin-talent-skills.types";

// ─── Module-level skills cache ───────────────────────────────────────────────
// Keyed by talentProfileId. Survives drawer open/close within the same session
// so re-opening the same talent is instant. Mutations always bypass it.
//
// Extracted from skill-slot-panel.tsx, which sits at the hard 800-line
// `max-lines` cap — module-level state is not panel rendering, so it lives here.
export type SkillsCacheEntry = {
  skills: ResolvedSkill[];
  aspirations: Array<{ term_id: string; slug: string; name_en: string }>;
  ts: number;
};

export const CACHE_TTL = 60_000;
export const _skillsCache = new Map<string, SkillsCacheEntry>();

// In-flight dedup — prevents React Strict Mode's double-invoke from firing two
// simultaneous server action calls for the same talentProfileId.
export const _inflight = new Map<string, Promise<void>>();
