"use server";

/**
 * feed-actions.ts — the Calendar sync drawer's two writes.
 *
 * There are only two, and there is deliberately no third:
 *
 *   • `issueCalendarFeedUrl` mints a URL and returns it once.
 *   • `disconnectCalendarFeed` kills it.
 *
 * NO "SHOW ME MY EXISTING URL". Only the hash is stored, so there is no read
 * path back to the plaintext. Faking one — keeping a decryptable copy so the
 * drawer could redisplay it — would trade the entire benefit of hashing for a
 * convenience the operator gets anyway by pressing the button again.
 *
 * The consequence is stated on screen rather than discovered: generating a new
 * URL stops the old one, so an operator with the feed on both a laptop and a
 * phone re-subscribes both. That is the correct trade for a credential whose
 * realistic incident is "it got forwarded".
 *
 * BOTH ACTIONS ARE WORKSPACE-SCOPED THROUGH `requireWorkspaceStaffAction`, not
 * through the caller's preferred-tenant cookie. A multi-workspace operator
 * standing on `/nova-crew/admin` must not mint a feed for whichever workspace a
 * cookie happens to prefer — that is the P0 the workspace-scoped guard exists
 * for, and a calendar feed is exactly the sort of long-lived credential where
 * pointing it at the wrong workspace would go unnoticed for months.
 */

import { headers } from "next/headers";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  mintCalendarFeedToken,
  revokeCalendarFeedTokens,
} from "./feed-token";

export type IssueFeedUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * The absolute origin to build the subscription URL on.
 *
 * Taken from the REQUEST rather than from a configured app URL, because the
 * operator is standing on the host they will paste from: a workspace on a
 * custom domain gets a URL on their own domain, and the allow-list entry for
 * `/api/calendar` is what makes that resolve. Falling back to a global app URL
 * would hand a custom-domain tenant a link to a host their staff may not
 * recognise, which is how a working URL gets deleted as suspicious.
 */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "https://app.tulala.digital";
}

export async function issueCalendarFeedUrl(): Promise<IssueFeedUrlResult> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("calendar.issueFeedUrl", "createServiceRoleClient returned null");
    return { ok: false, error: "Calendar sync is unavailable right now." };
  }

  const minted = await mintCalendarFeedToken(admin, {
    tenantId: guard.tenantId,
    userId: guard.user.id,
  });
  if (!minted) {
    return { ok: false, error: "Could not create a subscription URL." };
  }

  const origin = await requestOrigin();
  return { ok: true, url: `${origin}/api/calendar/feed/${minted.token}.ics` };
}

export async function disconnectCalendarFeed(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("calendar.disconnectFeed", "createServiceRoleClient returned null");
    return { ok: false, error: "Calendar sync is unavailable right now." };
  }

  const revoked = await revokeCalendarFeedTokens(admin, {
    tenantId: guard.tenantId,
    userId: guard.user.id,
  });
  return revoked ? { ok: true } : { ok: false, error: "Could not stop the subscription." };
}
