import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadClientSelfProfile,
  loadWorkspaceRosterEnriched,
} from "../../../_data-bridge";
import { NewInquiryForm } from "./new-inquiry-form";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;
type SearchParams = Promise<{ talent?: string; err?: string }>;

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg: "#ffffff",
  accent: "#1D4ED8",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

export default async function NewClientInquiryPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { tenantSlug } = await params;
  const { talent, err } = await searchParams;

  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const client = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!client) notFound();

  // Include "claimed" talent (has a user account, not yet fully published)
  // alongside "published" so the dropdown isn't empty on fresh workspaces.
  const roster = (await loadWorkspaceRosterEnriched(scope.tenantId)).filter(
    (item) => item.state === "published" || item.state === "claimed",
  );
  const selectedTalent = talent ? roster.find((item) => item.id === talent) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: FONT }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>
            New inquiry
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 24, color: C.ink, letterSpacing: 0 }}>
            Request booking
          </h1>
          <p style={{ margin: "6px 0 0", maxWidth: 620, fontSize: 13, lineHeight: 1.5, color: C.inkMuted }}>
            Send the workspace enough context to start coordination.
          </p>
        </div>
        <Link
          href={`/${tenantSlug}/client/discover`}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 8,
            border: `1px solid ${C.borderSoft}`,
            display: "inline-flex",
            alignItems: "center",
            textDecoration: "none",
            color: C.ink,
            fontSize: 12.5,
          }}
        >
          Back to discover
        </Link>
      </div>

      <NewInquiryForm
        tenantSlug={tenantSlug}
        client={{
          displayName: client.displayName,
          company: client.company,
          agencyName: client.agencyName,
        }}
        roster={roster}
        selectedTalentId={selectedTalent?.id}
        initialError={err}
      />
    </div>
  );
}
