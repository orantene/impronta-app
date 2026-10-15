import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { buildDirectoryQueryOrFilter } from "./directory-attribution";
import { matchingCategorySlugs, type CategoryTermRow } from "./directory-category-search";

/** `buildDirectoryQueryOrFilter` plus the talent types the text means (TUL-802). A lookup failure falls back to name/code/label search. */
export async function directoryQueryOrFilter(q: string): Promise<string | null> {
  const base = buildDirectoryQueryOrFilter(q);
  if (!base) return null;
  const admin = createServiceRoleClient();
  if (!admin) return base;
  const { data, error } = await admin.from("taxonomy_terms").select("slug, name_i18n").eq("kind", "talent_type");
  if (error) {
    logServerError("directory.categorySearch", error);
    return base;
  }
  return buildDirectoryQueryOrFilter(q, matchingCategorySlugs((data ?? []) as CategoryTermRow[], q));
}
