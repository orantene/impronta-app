// Client Messages dashboard — consistent shell with Talent + Admin Messages.
// Two-pane (list + thread) + prominent "+ New inquiry" header CTA that
// opens a drawer with the real inquiry form.

import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadClientSelfProfile,
  loadClientInquiries,
  loadWorkspaceRosterEnriched,
} from "../../_data-bridge";
import { loadInquiryMessages } from "../../_data-bridge/inquiries-messages";
import { ClientMessagesShell } from "./ClientMessagesShell";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;
type SearchParams = Promise<{ inquiry?: string }>;

export default async function ClientMessagesPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { tenantSlug } = await params;
  const { inquiry: pinnedInquiry } = await searchParams;

  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const inquiries = await loadClientInquiries(session.user.id, scope.tenantId);

  // Roster used by the drawer's NewInquiryForm. Include claimed talent so
  // the picker isn't empty on a fresh workspace.
  const roster = (await loadWorkspaceRosterEnriched(scope.tenantId))
    .filter((item) => item.state === "published" || item.state === "claimed")
    .map((item) => ({
      id: item.id,
      name: item.name,
      primaryTypeLabel: item.primaryTypeLabel,
      city: item.city,
    }));

  // Pick the active inquiry: ?inquiry= takes precedence, else first row
  const initialActiveId = pinnedInquiry
    ? inquiries.find((i) => i.id === pinnedInquiry)?.id ?? inquiries[0]?.id ?? null
    : inquiries[0]?.id ?? null;

  // Pre-load messages for the initial active inquiry (private thread)
  const initialMessages = initialActiveId
    ? await loadInquiryMessages(scope.tenantId, initialActiveId, "private")
    : [];

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
      initialActiveId={initialActiveId}
    />
  );
}
