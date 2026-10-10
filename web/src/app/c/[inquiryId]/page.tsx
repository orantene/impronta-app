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

import { publicThreadPath } from "@/lib/messaging/thread-token";
import { hostSafeRedirectDestination } from "@/lib/saas/host-safe-destination";
import { getPublicHostContext } from "@/lib/saas/scope";
import { getAppUrl } from "@/lib/auth-flow";
import { clientAccountEnabledFor } from "@/lib/client-account/flag";

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

  // ── 0. A signed POS thread token (`v1.<payload>.<sig>`, `lib/messaging/
  // thread-token.ts`) is not an inquiry id. Customer cards ship it at
  // `/c/t/<token>` (D-POS-89); a card that arrives here dispatches there,
  // and the guest-cookie UUID path below stays as it is (contract seam 6).
  if (inquiryId.startsWith("v1.")) {
    redirect(publicThreadPath(inquiryId));
  }

  // ── 1. Check for a signed-in owning client FIRST (before the guest cookie
  // path). getGuestFullThread gates on the guest cookie; a signed-in client
  // whose current guest cookie doesn't own the inquiry would hit notFound()
  // before the redirect was ever reached. Instead we do a lightweight
  // service-role read to compare session.user.id to the inquiry's
  // client_user_id, BEFORE touching the guest path. Non-owned → fall through.
  const session = await getCachedActorSession();
  // TUL-92: a talent's own site (subdomain or custom domain) serves NO workspace
  // routes, and `hostSafeDestination` cannot speak for that host kind, so the
  // old relative redirect landed every guest on the platform 404 right after
  // "Confirmar cita". On a talent host the guest thread below is the page.
  const { kind: hostKind } = await getPublicHostContext();
  const onTalentSite = hostKind === "talent_site";
  let ownerRedirect: string | null = null;
  if (session.user) {
    const clientRedirect = await resolveSignedInClientRedirect(inquiryId);
    if (
      clientRedirect &&
      clientRedirect.clientUserId &&
      session.user.id === clientRedirect.clientUserId &&
      clientRedirect.tenantSlug
    ) {
      const workspacePath = `/${clientRedirect.tenantSlug}/client/messages?inquiry=${encodeURIComponent(
        inquiryId,
      )}&tab=chat`;
      if (!onTalentSite) {
        // Host-safe: `/c/<id>` resolves on every surface (the link is emailed
        // and opened from anywhere), but `/<slug>/client/messages` only exists
        // on the app + agency surfaces.
        redirect(await hostSafeRedirectDestination(workspacePath));
      }
      // TUL-62: a signed-in client who just booked on a talent site stays on
      // that site, on the visit in their account area, not the app dashboard.
      if (clientAccountEnabledFor("talent")) {
        redirect(`/account/visits/${encodeURIComponent(inquiryId)}`);
      }
      // Talent host: render the guest thread when this browser owns it, and
      // only fall back to the app host (absolute, session cookie is parent
      // domain scoped) when it does not.
      ownerRedirect = `${getAppUrl()}${workspacePath}`;
    }
    // If the signed-in user is NOT the owner of this inquiry, fall through to
    // the guest path — they may have a valid guest cookie that owns it.
  }

  // ── 2. Ownership-gated guest read + brand resolve (the gate runs first; a
  // non-owner learns nothing). Any failure here → 404 (never reveal whether
  // the inquiry exists or who owns it).
  const result = await getGuestFullThread({ inquiryId });
  if (!result.ok) {
    if (ownerRedirect) redirect(ownerRedirect);
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
