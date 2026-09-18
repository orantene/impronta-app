import "server-only";

/**
 * L13 (Messages v5 guest dock) · the extras the dock's Chat view needs to
 * draw the v5 client cards and act on them, loaded beside the full thread
 * read in `getGuestThreadMessages`.
 *
 * The dock is guest-cookie identified; the v5 client cards act through
 * `lib/server-actions/messaging-client.ts`, which is thread-token identified.
 * `getGuestThreadMessages` has already proven the cookie OWNS the inquiry
 * (`loadOwnedInquiry`), which is exactly the proof `/c/t/[token]` carries in
 * its token, so minting the token here hands the dock the same identity the
 * link has and no more. Nothing here writes; the offers and pay code are the
 * link page's own readers (`lib/messaging/client-link.ts`).
 *
 * Split into a sibling: `guest-chat-actions.ts` is past the file-size cap.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuestThreadV5Extras } from "@/lib/inquiry/guest-chat-contract";
import { loadClientOfferSummaries, loadOpenPaymentCode } from "@/lib/messaging/client-link";
import { resolveThreadTokenExpiry, signThreadToken } from "@/lib/messaging/thread-token";


export async function loadGuestThreadV5Extras(
  admin: SupabaseClient,
  input: { tenantId: string; inquiryId: string },
): Promise<GuestThreadV5Extras> {
  const nowMs = Date.now();
  const [expMs, offers, payCode] = await Promise.all([
    resolveThreadTokenExpiry(admin, input.inquiryId, nowMs),
    loadClientOfferSummaries(admin, input),
    loadOpenPaymentCode(admin, input),
  ]);
  const threadToken = signThreadToken(input.inquiryId, input.tenantId, nowMs, expMs);
  return {
    threadToken,
    threadTokenExpiresAt: threadToken ? new Date(expMs).toISOString() : null,
    offers,
    payCode,
  };
}
