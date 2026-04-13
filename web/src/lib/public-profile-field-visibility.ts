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

export async function getPublicProfileFieldVisibility(): Promise<PublicProfileFieldVisibility> {
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

