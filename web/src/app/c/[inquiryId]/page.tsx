/**
 * /c/[inquiryId] — U1 (Mini→Full Messages expansion): the guest-accessible
 * FULL-WINDOW conversation route.
 *
 * Why it lives OUTSIDE (workspace): a guest has no tenantSlug in the URL and no
 * auth session. Middleware injects `x-impronta-guest` on EVERY route (the
 * HMAC-signed impronta_guest cookie → plain id), so the guest's identity is
 * resolved server-side for free inside getGuestFullThread — RLS is NOT weakened,
 * and there is no client-supplied session id anywhere in this path.
 *
 * Two destinations (per the U1 split):
 *   • GUEST (cookie owns the inquiry) → render <GuestFullThreadView/>, the
 *     self-contained full-window guest thread, with the real guest-chat actions
 *     injected as callbacks (same pattern as TalentProfileChatLauncherMount).
 *   • SIGNED-IN OWNING CLIENT (session.user.id === inquiry.client_user_id) →
 *     redirect into the EXISTING real client Messages shell at
 *     /{tenantSlug}/client/messages?inquiry={id}&tab=chat. No new shell.
 *
 * Not-owned / not-found → notFound() (a 404, leaking nothing).
 */

import { notFound, redirect } from "next/navigation";

import {
  getGuestThreadMessages,
  sendGuestMessageAction,
} from "@/app/t/[profileCode]/_actions/guest-chat-actions";
import {
  getGuestFullThread,
  resolveSignedInClientRedirect,
} from "@/app/t/[profileCode]/_actions/guest-full-thread-actions";
import { getCachedActorSession } from "@/lib/server/request-cache";

import { GuestFullThreadView } from "./GuestFullThreadView";

export const dynamic = "force-dynamic";

export default async function GuestFullConversationPage({
  params,
}: {
  params: Promise<{ inquiryId: string }>;
}) {
  const { inquiryId } = await params;

  // ── 1. Check for a signed-in owning client FIRST (before the guest cookie
  // path). getGuestFullThread gates on the guest cookie; a signed-in client
  // whose current guest cookie doesn't own the inquiry would hit notFound()
  // before the redirect was ever reached. Instead we do a lightweight
  // service-role read to compare session.user.id to the inquiry's
  // client_user_id, BEFORE touching the guest path. Non-owned → fall through.
  const session = await getCachedActorSession();
  if (session.user) {
    const clientRedirect = await resolveSignedInClientRedirect(inquiryId);
    if (
      clientRedirect &&
      clientRedirect.clientUserId &&
      session.user.id === clientRedirect.clientUserId &&
      clientRedirect.tenantSlug
    ) {
      redirect(
        `/${clientRedirect.tenantSlug}/client/messages?inquiry=${encodeURIComponent(
          inquiryId,
        )}&tab=chat`,
      );
    }
    // If the signed-in user is NOT the owner of this inquiry, fall through to
    // the guest path — they may have a valid guest cookie that owns it.
  }

  // ── 2. Ownership-gated guest read + brand resolve (the gate runs first; a
  // non-owner learns nothing). Any failure here → 404 (never reveal whether
  // the inquiry exists or who owns it).
  const result = await getGuestFullThread({ inquiryId });
  if (!result.ok) {
    notFound();
  }

  // GUEST destination — render the full-window thread. The two server actions
  // are injected as callbacks (their signatures match the contract 1:1), so the
  // client component imports no backend module; the guest cookie boundary is
  // resolved server-side inside them.
  return (
    <GuestFullThreadView
      inquiryId={inquiryId}
      brand={result.brand}
      initialMessages={result.messages}
      initialThreadStatus={result.threadStatus}
      typicalReplyLabel={result.typicalReplyLabel}
      locale={result.locale}
      onFetch={getGuestThreadMessages}
      onSend={sendGuestMessageAction}
    />
  );
}
