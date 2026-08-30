import "server-only";

import { cookies } from "next/headers";

import { verifyGuestCookie } from "@/lib/guest-cookie";
import { logServerError } from "@/lib/server/safe-error";
import { claimBriefForUser, type BriefRpcClient } from "./brief-store.server";

const GUEST_COOKIE = "impronta_guest";

/**
 * Attach the visitor's anonymous Brief to the account they just created.
 *
 * Called from the auth actions, beside `claimGuestSupportOnAuth`, for the same
 * reason that one is: intake starts before signup, and a brief that does not
 * survive account creation makes the whole anonymous-first flow a demo.
 *
 * Takes the caller's session-bound client rather than resolving one. The RPC
 * refuses to claim for anyone but `auth.uid()`, so it needs the client that
 * carries the session that was just established — a service-role client has no
 * `auth.uid()` and a cached one may predate the sign-in by a few milliseconds.
 *
 * Never throws: an unclaimed brief is a lost enrichment, not a failed signup.
 */
export async function claimTulalaBriefOnAuth(
  supabase: BriefRpcClient,
  userId: string,
): Promise<{ briefId: string | null }> {
  try {
    const cookieStore = await cookies();
    const sessionKey = verifyGuestCookie(cookieStore.get(GUEST_COOKIE)?.value);
    if (!sessionKey) return { briefId: null };
    const briefId = await claimBriefForUser(sessionKey, userId, supabase);
    return { briefId };
  } catch (err) {
    logServerError("tulala.claimTulalaBriefOnAuth", err);
    return { briefId: null };
  }
}
