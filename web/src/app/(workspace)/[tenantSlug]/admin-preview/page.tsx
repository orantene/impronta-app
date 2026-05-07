// Workspace admin — prototype preview surface.
//
// This route mounts the prototype's full admin shell
// (web/src/app/prototypes/admin-shell/_shell-client.tsx) and feeds it
// real Supabase data via _data-bridge.ts. It's the staging ground for
// replacing the legacy workspace admin route-by-route with the
// prototype's design.
//
// Why a new route instead of mutating /[tenantSlug]/admin/:
//   The prototype shell is a single-page React tree with its own
//   internal page-routing (Overview / Messages / Calendar / Roster /
//   Clients / Operations / Production / Website / Settings). The
//   legacy admin uses Next.js route conventions per surface. We can't
//   live-mount the prototype on top of the legacy route group without
//   double-rendering chrome (legacy topbar + prototype topbar) and
//   double-resolving auth. Putting the prototype on a side route lets
//   us QA it under real data, in isolation, while the legacy admin
//   keeps serving today's users.
//
// Cutover plan: once each prototype surface is wired through the data
// bridge with proven write paths, we swap the legacy /[tenantSlug]/admin/
// layout to render the prototype shell directly and delete the legacy
// surface routes one by one.
//
// Capability: agency.workspace.view — same gate as the rest of the
// admin tree.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { AdminShellPrototypePageClient } from "@/app/prototypes/admin-shell/_shell-client";
import { loadWorkspaceRosterForCurrentTenant } from "@/app/prototypes/admin-shell/_data-bridge";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function WorkspaceAdminPreviewPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  // Pre-fetch the roster on the server. The bridge resolves the active
  // tenant via getTenantScope() (header/cookie based, set by middleware),
  // so we don't need to thread tenantId here — the bridge picks it up.
  const roster = await loadWorkspaceRosterForCurrentTenant();

  return (
    <AdminShellPrototypePageClient initialBridgeData={{ roster }} />
  );
}
