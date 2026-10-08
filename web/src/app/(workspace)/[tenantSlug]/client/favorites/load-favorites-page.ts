import "server-only";

import {
  loadClientSelfProfile,
  type ClientSelfProfile,
} from "../../_data-bridge/clients";
import {
  loadClientFavoritesForUser,
  type DiscoverShortlistTalent,
} from "../../_data-bridge/discover";
import {
  readUserId,
  type EffectiveReadContext,
} from "@/lib/impersonation/effective-read";

/**
 * TUL-254. What the client Favorites page reads, keyed on the EFFECTIVE user.
 * Under a verified impersonation that is the subject, not the staff actor whose
 * session renders the page; otherwise it is the session user, unchanged.
 * `ctx` comes only from `effectiveReadContext` in the page, never from a request.
 */
export type FavoritesPageDeps = {
  profile: typeof loadClientSelfProfile;
  favorites: typeof loadClientFavoritesForUser;
};

const DEFAULT_DEPS: FavoritesPageDeps = {
  profile: loadClientSelfProfile,
  favorites: loadClientFavoritesForUser,
};

export async function loadFavoritesPageData(
  sessionUserId: string,
  tenantId: string,
  ctx: EffectiveReadContext | undefined,
  deps: FavoritesPageDeps = DEFAULT_DEPS,
): Promise<{
  profile: ClientSelfProfile;
  favorites: DiscoverShortlistTalent[];
} | null> {
  const userId = readUserId(sessionUserId, ctx);
  const profile = await deps.profile(userId, tenantId, ctx);
  if (!profile) return null;
  const favorites = await deps.favorites(userId);
  return { profile, favorites };
}
