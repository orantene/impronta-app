// Client Messages dashboard — consistent shell with Talent + Admin Messages.
// Two-pane (list + thread) + prominent "+ New inquiry" header CTA that
// opens a drawer with the real inquiry form.

import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { clientPageReadCtx } from "../_data-bridge/client-read-ctx";
import { loadMessagesPageData } from "../_data-bridge/client-page-loaders";
import { ClientMessagesShell } from "./ClientMessagesShell";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;
type SearchParams = Promise<{
  inquiry?: string;
  new?: string;
  talent?: string;
  just_submitted?: string;
  /** Phase C — which thread-pane tab to open: chat / lineup / offer / details / files. Default = chat. */
  tab?: string;
}>;

export default async function ClientMessagesPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { tenantSlug } = await params;
  const sp = await searchParams;
  const pinnedInquiry = sp.inquiry;
  const autoOpenDrawer = sp.new === "1" || sp.new === "true";
  const prefilledTalentId = sp.talent;
  const justSubmittedInquiryId = sp.just_submitted === "1" ? pinnedInquiry : null;

  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // Inquiry list + the pinned/first thread preload (TRUST GUARD for a pinned id
  // outside the loaded set, and the re-home tenant lookup) live in the loader,
  // keyed on the effective user.
  const pageData = await loadMessagesPageData(
    session.user.id,
    scope.tenantId,
    await clientPageReadCtx(session.user.id),
    pinnedInquiry,
  );
  if (!pageData) notFound();
  const {
    inquiries,
    roster,
    initialActiveId,
    pinnedNotFound,
    initialMessages,
    initialDetails,
    read: { profile: clientProfile },
  } = pageData;

  // Validate ?tab= against the allow-list. Any unknown value falls back to chat.
  const allowedTabs = new Set(["chat", "lineup", "offer", "details", "files"]);
  const initialTab = sp.tab && allowedTabs.has(sp.tab) ? sp.tab : "chat";

  return (
    <ClientMessagesShell
      tenantSlug={tenantSlug}
      tenantName={clientProfile.agencyName}
      inquiries={inquiries}
      client={{
        displayName: clientProfile.displayName,
        company: clientProfile.company,
        agencyName: clientProfile.agencyName,
      }}
      roster={roster}
      initialMessages={initialMessages}
      initialDetails={initialDetails}
      initialActiveId={initialActiveId}
      pinnedNotFound={pinnedNotFound}
      initialTab={initialTab as "chat" | "lineup" | "offer" | "details" | "files"}
      autoOpenDrawer={autoOpenDrawer}
      prefilledTalentId={prefilledTalentId}
      justSubmittedInquiryId={justSubmittedInquiryId ?? undefined}
    />
  );
}
