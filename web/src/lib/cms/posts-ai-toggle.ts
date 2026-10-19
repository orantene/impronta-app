import "server-only";

/**
 * posts-ai-toggle.ts — write path for the "AI can read my site" flag (P6).
 *
 * Pure of session logic: the caller (server actions) resolves WHO the actor is
 * and passes the scope. The id is never read from input; the update is pinned
 * to the caller's own row (`tenant_id` for agency_branding, `talent_profile_id`
 * for talent_sites). Reads of the flag live in `loadAiCrawlersAllowed`
 * (posts-public-site.ts): default ON.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { readAiCrawlersFlag } from "@/lib/cms/posts-public-site";
import type { PostScope } from "@/lib/cms/posts-writer";
import { logServerError } from "@/lib/server/safe-error";

export type AiToggleResult =
  | { ok: true; allowed: boolean }
  | { ok: false; code: "invalid_input" | "not_found" | "write_failed"; message: string };

export async function writeAiCrawlersAllowed(
  db: SupabaseClient,
  scope: PostScope,
  allowed: unknown,
): Promise<AiToggleResult> {
  if (typeof allowed !== "boolean") {
    return { ok: false, code: "invalid_input", message: "Invalid value." };
  }
  const { data, error } =
    scope.kind === "tenant"
      ? await db
          .from("agency_branding")
          .update({ ai_crawlers_allowed: allowed })
          .eq("tenant_id", scope.tenantId)
          .select("ai_crawlers_allowed")
      : await db
          .from("talent_sites")
          .update({ ai_crawlers_allowed: allowed })
          .eq("talent_profile_id", scope.talentProfileId)
          .select("ai_crawlers_allowed");
  if (error) return { ok: false, code: "write_failed", message: "Could not save. Try again." };
  if (!data || data.length === 0) {
    return { ok: false, code: "not_found", message: "Your site is not set up yet." };
  }
  return { ok: true, allowed };
}

/** Owner-read helper: reuses the public loader; default ON on any failure. */
export async function loadOwnAiCrawlersAllowed(scope: PostScope): Promise<boolean> {
  try {
    // The owner's screen shows the saved value; unreadable shows the default (ON).
    return (await readAiCrawlersFlag(scope)) ?? true;
  } catch (error) {
    logServerError("cms/posts-ai-toggle/own-read", error);
    return true;
  }
}
