// Client Messages dashboard — consistent shell with Talent + Admin Messages.
// Two-pane (list + thread) + prominent "+ New inquiry" header CTA that
// opens a drawer with the real inquiry form.

import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadClientSelfProfile,
  loadClientInquiries,
  loadWorkspaceRosterLite,
} from "../../_data-bridge";
import { loadInquiryMessages } from "../../_data-bridge/inquiries-messages";
import { loadClientInquiryDetails } from "../../_data-bridge/client-inquiry-details";
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

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  // Parallel load: inquiries + roster (lite — only the four fields the
  // drawer's NewInquiryForm needs). Previously called the enriched roster
  // which fanned out to media + signed-URL + language-count queries; that
  // made every client page wait on a heavy join.
  const [inquiries, roster] = await Promise.all([
    loadClientInquiries(session.user.id, scope.tenantId),
    loadWorkspaceRosterLite(scope.tenantId),
  ]);

  // Pick the active inquiry: ?inquiry= takes precedence, else first row.
  //
  // TRUST GUARD: every "View inquiry / Review your offer" email + notification
  // deep-links here with ?inquiry=<id>. If that id is NOT in the loaded set
  // (archived, no permission, or paginated out), we must NOT silently fall back
  // to the client's first inquiry — that would open an unrelated thread on the
  // money surface. Instead flag pinnedNotFound so the shell renders an explicit
  // "this inquiry isn't available" notice while still listing their others.
  const pinnedMatch = pinnedInquiry
    ? inquiries.find((i) => i.id === pinnedInquiry)?.id ?? null
    : null;
  const pinnedNotFound = Boolean(pinnedInquiry) && pinnedMatch === null;
  const initialActiveId = pinnedInquiry
    ? pinnedMatch
    : inquiries[0]?.id ?? null;

  // Phase C — load Details payload + private-thread messages in parallel for
  // the initial active inquiry. The shell mounts Details tab content from
  // server data so the first paint is rich (no spinner-and-fetch).
  // Private thread = agency + client; group thread is the talent fan-out.
  const [initialMessages, initialDetails] = await Promise.all([
    initialActiveId
      ? loadInquiryMessages(scope.tenantId, initialActiveId, "private")
      : Promise.resolve([]),
    initialActiveId
      ? loadClientInquiryDetails(scope.tenantId, initialActiveId)
      : Promise.resolve(null),
  ]);

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
