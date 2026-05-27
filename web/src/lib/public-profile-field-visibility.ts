/**
 * @deprecated `public-profile-field-visibility.ts` — Phase 1.4 successor:
 * `isResolvedFieldVisibleInPublicProfileSidebar` from
 * `web/src/lib/field-engine/public-surface-visibility.ts`.
 *
 * The call site in `web/src/app/t/[profileCode]/page.tsx` has been migrated
 * to the unified resolver helper (Phase 1.4, Lane B). This file is retained
 * only in case external integrations still import `getPublicProfileFieldVisibility`
 * during the Phase 1.x stagger window.
 *
 * Calls to `getPublicProfileFieldVisibility` are tracked via the
 * `public_profile_field_visibility.call` structured-log event. Sunset
 * condition: **after Phase 5 deploy + 7 consecutive quiet days with zero
 * `public_profile_field_visibility.call` events in prod telemetry, remove
 * this file entirely. Hard date: no later than 2026-07-15.**
 *
 * Do NOT delete this file before the telemetry condition is met.
 */

import { improntaLog } from "@/lib/server/structured-log";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

/**
 * Sidebar taxonomy sections on /t/[code] use public_visible + profile_visible only.
 * Directory card traits use an additional card_visible gate in directory-card-display-catalog.
 */
export type PublicProfileFieldVisibility = {
  // Sidebar sections
  showFitLabels: boolean;
  showSkills: boolean;
  showLanguages: boolean;
  // Optional future sections (only gated; UI still must exist to show)
  showIndustries: boolean;
  showEventTypes: boolean;
  showTags: boolean;
};

async function isFieldVisible(key: string): Promise<boolean> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) return true;

  const { data, error } = await supabase
    .from("field_definitions")
    .select("active, archived_at, profile_visible, public_visible, internal_only")
    .eq("key", key)
    .maybeSingle();

  if (error || !data) return true;
  if (data.archived_at) return false;
  if (!data.active) return false;
  if (data.internal_only) return false;
  if (!data.public_visible) return false;
  return data.profile_visible === true;
}

/**
 * @deprecated Use `isResolvedFieldVisibleInPublicProfileSidebar` from
 * `web/src/lib/field-engine/public-surface-visibility.ts` instead.
 * This function fires a `public_profile_field_visibility.call` telemetry
 * event to track remaining callers. Remove after the sunset condition is
 * met (Phase 5 deploy + 7 quiet days, no later than 2026-07-15).
 */
export async function getPublicProfileFieldVisibility(): Promise<PublicProfileFieldVisibility> {
  // Telemetry: track any remaining callers in prod. Zero calls for 7 days
  // after Phase 5 deploy = safe to delete this file (see module @deprecated).
  void improntaLog("public_profile_field_visibility.call", {});

  const [fit, skills, langs, industries, events, tags] = await Promise.all([
    isFieldVisible("fit_labels"),
    isFieldVisible("skills"),
    isFieldVisible("languages"),
    isFieldVisible("industries"),
    isFieldVisible("event_types"),
    isFieldVisible("tags"),
  ]);

  return {
    showFitLabels: fit,
    showSkills: skills,
    showLanguages: langs,
    showIndustries: industries,
    showEventTypes: events,
    showTags: tags,
  };
}
