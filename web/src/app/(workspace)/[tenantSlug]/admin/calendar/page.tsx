// Phase 3 — workspace Calendar page.
// Server page: auth + data fetch; CalendarShell client component handles
// interactive month navigation and the day grid.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadCalendarEvents } from "../../_data-bridge";
import { CalendarShell } from "./CalendarShell";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:    "#0B0B0D",
  accent: "#0F4F3E",
} as const;
const FONT = '"Inter", system-ui, sans-serif';

export default async function WorkspaceCalendarPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const events = await loadCalendarEvents(scope.tenantId);

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
          Calendar
        </h1>
      </div>

      {/* Interactive calendar shell */}
      <CalendarShell events={events} tenantSlug={tenantSlug} />
    </div>
  );
}
