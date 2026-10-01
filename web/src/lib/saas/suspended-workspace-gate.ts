import { NextResponse, type NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * A suspended workspace's public storefront is not served.
 *
 * `agencies.status = 'suspended'` is set by platform admin and by account
 * deletion (a workspace whose only owner left). Before this gate nothing on
 * the public render path read that column: `agency_domains` has no status of
 * the workspace, and `agencies` is staff-only under RLS so the anon-key host
 * resolver cannot join it. The storefront kept answering 200 for a workspace
 * nobody could administer.
 *
 * Decided at the edge so the status is real (a notFound() raised under a
 * streamed layout is a soft 200), and answered with the branded
 * `/_page-not-found` 404, the same target the off-roster gate uses: no
 * "domain not connected" wording, no workspace data, noindex.
 *
 * SAFETY
 *   • Only agency and hub hosts reach this (the caller checks the host kind).
 *   • Fails OPEN: a missing service key or a DB blip serves the site as before.
 *     Suspension is a policy state, not a security boundary; hiding a healthy
 *     storefront on a read error would be the worse failure.
 *   • Cached per tenant for 60s, matching the host cache TTL, so steady state
 *     is one tiny read per workspace per minute per worker.
 */

export const SUSPENDED_STATUS = "suspended";
const TTL_MS = 60_000;
const MAX_ENTRIES = 500;

export type WorkspaceStatusReader = (tenantId: string) => Promise<string | null>;

const cache = new Map<string, { hidden: boolean; expiresAt: number }>();

/** Test hook. */
export function clearSuspendedWorkspaceCache(): void {
  cache.clear();
}

export function isSuspendedStatus(status: string | null | undefined): boolean {
  return status === SUSPENDED_STATUS;
}

async function readStatusWithServiceRole(tenantId: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) throw new Error("no service client");
  const { data, error } = await admin.from("agencies").select("status").eq("id", tenantId).limit(1).maybeSingle();
  if (error) throw error;
  return ((data ?? null) as { status?: string | null } | null)?.status ?? null;
}

/** true when the workspace is suspended. Never throws; false on any failure. */
export async function isWorkspaceSuspended(
  tenantId: string,
  readStatus: WorkspaceStatusReader = readStatusWithServiceRole,
  now: number = Date.now(),
): Promise<boolean> {
  const hit = cache.get(tenantId);
  if (hit && hit.expiresAt > now) return hit.hidden;
  try {
    const hidden = isSuspendedStatus(await readStatus(tenantId));
    cache.delete(tenantId);
    cache.set(tenantId, { hidden, expiresAt: now + TTL_MS });
    while (cache.size > MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    return hidden;
  } catch {
    return false;
  }
}

/** A 404 rewrite when the tenant's workspace is suspended, else null. */
export async function suspendedWorkspaceResponse(
  request: NextRequest,
  tenantId: string,
  readStatus?: WorkspaceStatusReader,
): Promise<NextResponse | null> {
  if (!(await isWorkspaceSuspended(tenantId, readStatus))) return null;
  return NextResponse.rewrite(new URL("/_page-not-found", request.url), { status: 404 });
}
