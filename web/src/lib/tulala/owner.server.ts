/**
 * owner.server.ts — who a brief belongs to, for the current request.
 *
 * Four surfaces need this exact three-step resolution (session, then signed
 * guest cookie, then refuse) and it was already written three times. The fourth
 * copy is the one that drifts, so it lives here instead.
 *
 * A null return means "no identity at all" and callers must treat it as a hard
 * stop, not as an anonymous fallback. Writing a brief with no owner would create
 * a row nobody can ever read back, and briefs are the only place the intake's
 * work is stored.
 */

import "server-only";

import { resolveGuestSessionId } from "@/lib/guest/guest-session";
import { getCachedActorSession } from "@/lib/server/request-cache";

import type { BriefOwner } from "./brief-store.server";

export type ResolvedBriefOwner = {
  owner: BriefOwner;
  userId: string | null;
  guestSessionId: string | null;
  isAuthenticated: boolean;
};

export async function resolveBriefOwner(): Promise<ResolvedBriefOwner | null> {
  const session = await getCachedActorSession();

  if (session.user) {
    return {
      owner: { kind: "profile", profileId: session.user.id },
      userId: session.user.id,
      guestSessionId: null,
      isAuthenticated: true,
    };
  }

  const guestSessionId = await resolveGuestSessionId();
  if (!guestSessionId) return null;

  return {
    owner: { kind: "guest", guestSessionId },
    userId: null,
    guestSessionId,
    isAuthenticated: false,
  };
}
