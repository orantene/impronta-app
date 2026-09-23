import { notFound } from "next/navigation";

import { BoardPreview } from "@/components/admin/pos/messages/preview/BoardPreview";
import { KitPreview } from "@/components/messages-v5/kit/preview/KitPreview";
import { ClientThread } from "@/components/messages-v5/client/ClientThread";
import { ShellPreview } from "@/components/messages-v5/shell/ShellPreview";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadClientLinkBusiness, loadClientOfferSummaries, loadOpenPaymentCode } from "@/lib/messaging/client-link";
import { customerVisibleMessages, loadMessagingThread } from "@/lib/messaging/thread";
import { verifyThreadToken } from "@/lib/messaging/thread-token";

export const dynamic = "force-dynamic";

/**
 * The client's secure thread link (L9, boards C01/C02). Token verification
 * and the server render are unchanged from the POS-era page; the
 * presentation is the Messages v5 client thread, with the client's actions
 * wired through `lib/server-actions/messaging-client.ts`.
 */
export default async function PublicConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ board?: string; kit?: string; screen?: string; lang?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  if (token === "preview" && process.env.NODE_ENV !== "production") {
    // Messages v5 kit: every component in every state at 390 / 1194 / 1440.
    if (query.kit === "1") return <KitPreview />;
    // Messages v5 shell (L2) on fixture data at 390 / 1194 / 1440.
    if (query.screen === "shell") return <ShellPreview />;
    return <BoardPreview board={query.board ?? "MS02"} />;
  }
  const verified = verifyThreadToken(decodeURIComponent(token));
  if (!verified.ok) notFound();
  const admin = createServiceRoleClient();
  if (!admin) notFound();
  const scope = { tenantId: verified.tenantId, inquiryId: verified.inquiryId };
  const thread = await loadMessagingThread(admin, scope);
  if (!thread.ok) notFound();
  const [business, offers, payCode] = await Promise.all([
    loadClientLinkBusiness(admin, scope),
    loadClientOfferSummaries(admin, scope),
    loadOpenPaymentCode(admin, scope),
  ]);
  // `customerVisibleMessages` is the client reader (D-MSG-2): client thread only, no internal notes.
  const messages = customerVisibleMessages(thread.messages).map(({ render: _render, ...message }) => message);
  // D-MSG-337: honor ?lang=es|fr for QA / share links; fall back to business.locale.
  const lang = (query.lang || "").toLowerCase();
  const locale = lang === "es" || lang === "fr" || lang === "en" ? lang : business.locale;
  return (
    <ClientThread
      token={token}
      locale={locale}
      business={{ name: business.name, handlerFirstName: business.handlerFirstName }}
      messages={messages}
      offers={offers}
      payCode={payCode}
      threadTokenExpiresAt={new Date(verified.expiresAtMs).toISOString()}
    />
  );
}
