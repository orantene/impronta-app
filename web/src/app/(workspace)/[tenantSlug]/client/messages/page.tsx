// Client Messages dashboard — consistent shell with Talent + Admin Messages.
// Two-pane (list + thread) + prominent "+ New inquiry" header CTA that
// opens a drawer with the real inquiry form.

import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
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

  // Pick the active inquiry: ?inquiry= takes precedence, else first row
  const initialActiveId = pinnedInquiry
    ? inquiries.find((i) => i.id === pinnedInquiry)?.id ?? inquiries[0]?.id ?? null
    : inquiries[0]?.id ?? null;

  // The initial thread/details loaders are tenant-scoped (they filter
  // inquiries.tenant_id). Under XTENANT_REHOME the active row may be one this
  // client OWNS but that was re-homed onto a managing agency, so its real
  // tenant_id differs from this hub's scope; preloading against the hub scope
  // would render a blank first paint for a re-homed inquiry. Resolve the row's
  // ACTUAL tenant (RLS gates this read to the client's own inquiry via
  // client_user_id = auth.uid()) and preload against it. Gated on the flag so
  // it is a strict no-op — zero extra round-trips — while re-home is off.
  let activeTenantId = scope.tenantId;
  if (initialActiveId && process.env.XTENANT_REHOME === "1") {
    const supabase = await createSupabaseServerClient();
    const { data: activeRow } = supabase
      ? await supabase
          .from("inquiries")
          .select("tenant_id")
          .eq("id", initialActiveId)
          .eq("client_user_id", session.user.id)
          .maybeSingle()
      : { data: null };
    if (activeRow?.tenant_id) activeTenantId = activeRow.tenant_id as string;
  }

  // Phase C — load Details payload + private-thread messages in parallel for
  // the initial active inquiry. The shell mounts Details tab content from
  // server data so the first paint is rich (no spinner-and-fetch).
  // Private thread = agency + client; group thread is the talent fan-out.
  const [initialMessages, initialDetails] = await Promise.all([
    initialActiveId
      ? loadInquiryMessages(activeTenantId, initialActiveId, "private")
      : Promise.resolve([]),
    initialActiveId
      ? loadClientInquiryDetails(activeTenantId, initialActiveId)
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
      initialTab={initialTab as "chat" | "lineup" | "offer" | "details" | "files"}
      autoOpenDrawer={autoOpenDrawer}
      prefilledTalentId={prefilledTalentId}
      justSubmittedInquiryId={justSubmittedInquiryId ?? undefined}
    />
  );
}
