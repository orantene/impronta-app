import "server-only";

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { logServerError } from "@/lib/server/safe-error";
import type { DirectoryV1 } from "./schema";

/**
 * Resolve a directory section's `by_talent_type` scope (catalog talent-type
 * keys, e.g. "fashion-model") to taxonomy term ids.
 *
 * The directory's term-id filter (used by BOTH the SSR seed via
 * `getPublicDirectoryFirstPage` and the reactive client via `?tax=`) is what
 * actually scopes the grid. The section config stored only the talent-type
 * *keys* and never resolved them to ids, so a `by_talent_type` page (e.g.
 * "Our Fashion Models") fell through to the whole roster. The keys are real
 * `taxonomy_terms.slug` values (term_type='talent_type'), so a slug→id lookup
 * closes the gap. Returns `[]` for unscoped sections or when nothing resolves
 * (fail-open: the page degrades to the prior unscoped behavior, never errors).
 */
export async function resolveDirectoryScopeTermIds(
  props: Pick<DirectoryV1, "scope" | "talentTypeKeys">,
): Promise<string[]> {
  if (props.scope !== "by_talent_type" || props.talentTypeKeys.length === 0) {
    return [];
  }
  const supabase = createPublicSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("taxonomy_terms")
    .select("id")
    .in("slug", props.talentTypeKeys)
    .eq("term_type", "talent_type")
    .eq("is_active", true)
    .is("archived_at", null);
  if (error) {
    logServerError("directory-section/scope-resolver", error);
    return [];
  }
  return (data ?? []).map((r) => r.id as string).filter(Boolean);
}
