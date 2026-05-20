import { cache } from "react";
import { getGuestSessionKey } from "@/lib/guest-session";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

async function loadSavedTalentIds(): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];

  const pub = createPublicSupabaseClient();
  if (!pub) return [];

  const guestKey = await getGuestSessionKey();
  if (guestKey) {
    await pub.rpc("ensure_guest_session", { p_session_key: guestKey });
  }

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
