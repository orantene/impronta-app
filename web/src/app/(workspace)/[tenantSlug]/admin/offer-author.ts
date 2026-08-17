import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve the display name of the user who created an offer, so the offer
 * editor can show "Offer created by <name>" — an agency team needs to know
 * who wrote the numbers before they go to a client. Best-effort: a missing
 * or removed profile yields null (the editor then simply omits the line).
 */
export async function resolveOfferAuthorName(
  supabase: SupabaseClient,
  authorId: string | null,
): Promise<string | null> {
  if (!authorId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", authorId)
    .maybeSingle();
  const name = (data as { full_name?: string | null } | null)?.full_name?.trim();
  return name && name.length > 0 ? name : null;
}
