// Phase 3.4 — workspace Messages page.
// Two-pane shell: inbox list (left) + inquiry thread detail (right).
// Real-time via Supabase Realtime in MessagesShell client component.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadInquiriesForMessages } from "../../_data-bridge";
import MessagesShell from "./MessagesShell";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:    "#0B0B0D",
  accent: "#0F4F3E",
} as const;
const FONT = '"Inter", system-ui, sans-serif';

export default async function WorkspaceMessagesPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const inquiries = await loadInquiriesForMessages(scope.tenantId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONT }}>
      {/* Page header */}
      <div>
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7,
          textTransform: "uppercase", color: C.accent, marginBottom: 4,
        }}>
          {scope.membership.display_name}
        </div>
        <h1 style={{
          fontFamily: FONT, fontSize: 26, fontWeight: 700, color: C.ink,
          margin: 0, letterSpacing: -0.5, lineHeight: 1.1,
        }}>
          Messages
        </h1>
      </div>

      {/* Two-pane shell */}
      <MessagesShell inquiries={inquiries} tenantSlug={tenantSlug} />
    </div>
  );
}
