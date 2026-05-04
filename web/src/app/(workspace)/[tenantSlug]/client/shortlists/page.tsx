// Phase 3.10 — Client Shortlists page.
// Placeholder for saved talent shortlists (Phase 5+ feature).

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile } from "../../_data-bridge";

type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#1D4ED8",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

export default async function ClientShortlistsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 24,
            fontWeight: 600,
            color: C.ink,
            margin: 0,
            letterSpacing: -0.4,
          }}
        >
          Shortlists
        </h1>
        <p style={{ fontSize: 13, color: C.inkMuted, margin: "6px 0 0" }}>
          Save collections of talent for recurring events or future bookings.
        </p>
      </div>

      <div
        style={{
          padding: "60px 20px",
          textAlign: "center",
          background: C.surface,
          border: `1px dashed ${C.borderSoft}`,
          borderRadius: 14,
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}>🗂</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
          Shortlists coming soon
        </div>
        <p
          style={{
            fontSize: 13,
            color: C.inkMuted,
            margin: "0 auto",
            maxWidth: 400,
            lineHeight: 1.5,
          }}
        >
          You&apos;ll be able to save talent into named shortlists and share them with your team.
          This feature ships in a future update.
        </p>
      </div>
    </div>
  );
}
