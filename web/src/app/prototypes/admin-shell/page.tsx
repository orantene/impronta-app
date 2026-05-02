// No "use client" — this file is a server component. It is the route
// entry for `/prototypes/admin-shell/*` and the only file in the
// prototype tree that can call server-only modules (Supabase SSR client,
// `getTenantScope()`, etc.).
//
// Phase 1 contract (per `~/.claude/plans/ancient-gathering-sparkle.md`):
//   - Read `searchParams.dataSource`.
//   - When `dataSource=live`, pre-fetch live Impronta data via
//     `_data-bridge.ts` and pass it as `initialBridgeData` into the
//     client shell.
//   - Otherwise, render the client shell with `initialBridgeData={null}`,
//     which preserves the existing 100% mock-data behaviour.
//
// The historical 2k+ line client tree was moved to `_shell-client.tsx`
// (named export `AdminShellPrototypePageClient`). This file owns the
// server boundary; that file owns the React tree.

import { AdminShellPrototypePageClient } from "./_shell-client";
import {
  loadWorkspaceRosterForCurrentTenant,
  type BridgeData,
} from "./_data-bridge";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readDataSource(value: string | string[] | undefined): "live" | "mock" {
  if (Array.isArray(value)) return readDataSource(value[0]);
  return value === "live" ? "live" : "mock";
}

export default async function AdminShellPrototypeRoute({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const dataSource = readDataSource(params.dataSource);

  let initialBridgeData: BridgeData | null = null;
  if (dataSource === "live") {
    // Tenant resolution lives entirely inside the bridge — middleware
    // sets `x-impronta-tenant-id` for tenant hosts, `getTenantScope()`
    // reads it. No URL params, no cookie reads, no fallback. If scope
    // is null (anonymous / stale cookie / no membership) the bridge
    // returns [], which the UI renders as the standard empty state.
    const roster = await loadWorkspaceRosterForCurrentTenant();
    initialBridgeData = { roster };
  }

  return <AdminShellPrototypePageClient initialBridgeData={initialBridgeData} />;
}
