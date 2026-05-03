// Phase 3 — workspace Calendar page (placeholder).
// Full implementation in Phase 3.x.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:      "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  border:   "rgba(24,24,27,0.08)",
  cardBg:   "#ffffff",
  accent:   "#0F4F3E",
  surface:  "rgba(11,11,13,0.02)",
} as const;
const FONT = '"Inter", system-ui, sans-serif';

export default async function WorkspaceCalendarPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: FONT }}>
      {/* Header */}
      <div>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: C.accent,
            marginBottom: 4,
            fontFamily: FONT,
          }}
        >
          {scope.membership.display_name}
        </div>
        <h1
          style={{
            fontFamily: FONT,
            fontSize: 26,
            fontWeight: 700,
            color: C.ink,
            margin: 0,
            letterSpacing: -0.5,
            lineHeight: 1.1,
          }}
        >
          Calendar
        </h1>
      </div>

      {/* Placeholder card */}
      <div
        style={{
          background: C.surface,
          border: `1px dashed ${C.border}`,
          borderRadius: 14,
          padding: "48px 24px",
          textAlign: "center",
          fontFamily: FONT,
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }} aria-hidden>📅</div>
        <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
          Calendar coming soon
        </p>
        <p style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.5 }}>
          See upcoming bookings in the{" "}
          <Link
            href={`/${tenantSlug}/admin/bookings`}
            style={{ color: C.accent, textDecoration: "underline" }}
          >
            Bookings
          </Link>{" "}
          view in the meantime.
        </p>
      </div>
    </div>
  );
}
