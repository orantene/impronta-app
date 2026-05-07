// Workspace admin layout — cutover version.
//
// Replaces the old two-bar shell (TulalaIdentityBar + WorkspaceTopbar +
// content area) with the full prototype shell, which has all of that chrome
// built in. Each admin surface page (admin/page.tsx, admin/messages/page.tsx,
// etc.) renders only a <PageRouteSyncer page="…" /> as its content — a
// client component that calls useProto().setPage() on mount to sync the
// shell's internal page with the current Next.js route.
//
// initialPage is derived from the request pathname so hard refreshes on
// /admin/messages start on the correct surface without a flash.

import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadWorkspaceRosterForCurrentTenant } from "@/app/prototypes/admin-shell/_data-bridge";
import { AdminShellPrototypePageClient } from "@/app/prototypes/admin-shell/_shell-client";
import type { WorkspacePage } from "@/app/prototypes/admin-shell/_state";
import { resolveWorkspaceAdminPage } from "./workspace-page-routing";

export const dynamic = "force-dynamic";

type LayoutParams = Promise<{ tenantSlug: string }>;

/** Derive the workspace page from the raw request pathname. */
function deriveInitialPage(pathname: string, tenantSlug: string): WorkspacePage {
  // Strip leading /{tenantSlug}/admin/ (or /{tenantSlug}/admin) to get segment
  const prefix = `/${tenantSlug}/admin`;
  const after = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
  // after is "" | "/messages" | "/messages/…" | "/roster" | etc.
  const segment = after.replace(/^\//, "").split("/")[0] ?? "";
  return resolveWorkspaceAdminPage(segment || "overview");
}

export default async function WorkspaceAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: LayoutParams;
}) {
  const { tenantSlug } = await params;

  // ── Auth ───────────────────────────────────────────────────────────────────
  const session = await getCachedActorSession();
  if (!session.supabase) redirect("/login?error=config");
  if (!session.user) redirect(`/login?next=/${tenantSlug}/admin`);

  // ── Tenant ─────────────────────────────────────────────────────────────────
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // ── Capability ─────────────────────────────────────────────────────────────
  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  // ── Derive initialPage from URL (avoids hard-refresh flash) ───────────────
  const hdrs = await headers();
  const pathname = hdrs.get("x-impronta-original-pathname") ?? `/${tenantSlug}/admin`;
  const initialPage = deriveInitialPage(pathname, tenantSlug);

  // ── Prefetch bridge data ───────────────────────────────────────────────────
  const roster = await loadWorkspaceRosterForCurrentTenant();

  return (
    <AdminShellPrototypePageClient
      tenantSlug={tenantSlug}
      initialPage={initialPage}
      initialBridgeData={{ roster }}
    >
      {/* PageRouteSyncer lives here — inside ProtoProvider context, returns null */}
      {children}
    </AdminShellPrototypePageClient>
  );
}
