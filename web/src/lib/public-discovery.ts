import { cache } from "react";
import { getGuestSessionKey } from "@/lib/guest-session";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

async function loadSavedTalentIds(): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];

  const pub = createPublicSupabaseClient();
  if (!pub) return [];

  // NO `ensure_guest_session` HERE. THIS IS A READ.
  //
  // This function runs on RENDER of every public talent profile (via
  // `getSavedTalentIds` in profile-view.tsx and the client layout), and it used
  // to mint a `guest_sessions` row before the visitor had done anything at all
  // — in order to read a saved-talent list that is empty for a first-time
  // visitor. It ran BEFORE the signed-in branch too, so even a logged-in user
  // carrying a guest cookie minted one.
  //
  // Crawlers carry no cookie, so every crawl hit minted a fresh row. Measured
  // on production 2026-09-06: 40,241 rows, of which exactly 12 are referenced by
  // any of the seven tables with a foreign key to them — 99.97% orphans, oldest
  // 2026-04-09, and 1,060 minted in the last 24 hours alone.
  //
  // `guest_list_saved_talent_ids` already handles an unknown key correctly:
  //
  //     IF gid IS NULL THEN RETURN;   -- returns zero rows
  //
  // so the read needs no row to exist. Creating one is the write that a read
  // should never do.
  const guestKey = await getGuestSessionKey();

  const actor = await getCachedActorSession();
  if (actor.user && actor.supabase) {
    const { data: saves } = await actor.supabase
      .from("saved_talent")
      .select("talent_profile_id")
      .eq("client_user_id", actor.user.id)
      .order("created_at", { ascending: false });
    return saves?.map((save) => save.talent_profile_id) ?? [];
  }

  if (!guestKey) return [];

  const { data: guestRows } = await pub.rpc("guest_list_saved_talent_ids", {
    p_session_key: guestKey,
  });

  return (
    (guestRows as { talent_profile_id: string }[] | null)?.map(
      (row) => row.talent_profile_id,
    ) ?? []
  );
}

/** One guest ensure + saved list resolution per RSC request when reused. */
export const getSavedTalentIds = cache(loadSavedTalentIds);

async function loadFavoriteTalentIds(): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];

  const actor = await getCachedActorSession();
  if (!actor.user || !actor.supabase) return [];

  const { data: favs } = await actor.supabase
    .from("client_favorites")
    .select("talent_profile_id")
    .eq("client_user_id", actor.user.id)
    .order("added_at", { ascending: false });

  return favs?.map((fav: { talent_profile_id: string }) => fav.talent_profile_id) ?? [];
}

/**
 * Server-side reader for the visitor's personal favorites. Auth-only;
 * guests' favorites live in localStorage on the client and aren't
 * server-readable until signup (when `mergeGuestActivity()` mirrors them
 * into `client_favorites`).
 */
export const getFavoriteTalentIds = cache(loadFavoriteTalentIds);
