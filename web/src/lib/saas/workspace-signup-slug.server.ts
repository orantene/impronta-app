/**
 * workspace-signup-slug.server.ts — pick the `agencies.slug` a new workspace
 * gets, and reclaim one a retired workspace is still sitting on.
 *
 * Split out of `workspace-signup.server.ts`, which is at its 800-line cap.
 *
 * WHY A RECLAIM EXISTS
 * ────────────────────
 * `agencies.slug` is UNIQUE and platform admin's delete is SOFT (it only sets
 * `status = 'cancelled'`). The row therefore keeps holding the name forever,
 * which is why /get-started used to answer "already taken" for a workspace
 * nobody can reach. `isRequestedLinkTaken` now ignores retired workspaces, and
 * this module is what makes that answer deliverable: rather than quietly
 * provisioning the visitor `<slug>-2`, it renames the dead row out of the way.
 */

import { isReservedSlug } from "@/lib/site-admin/reserved-routes";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import {
  RETIRED_WORKSPACE_STATUSES,
  isRetiredWorkspaceStatus,
  retiredWorkspaceSlugTombstone,
} from "./workspace-lifecycle";
import {
  isReservedWorkspaceSlug,
  normalizeWorkspaceSlugCandidate,
  WORKSPACE_SLUG_MAX_LENGTH,
} from "./workspace-signup";

export async function generateAvailableWorkspaceSlug(
  preferred: string,
): Promise<string> {
  const admin = createServiceRoleClient();
  if (!admin) {
    return preferred || "workspace";
  }

  const normalizedBase = normalizeWorkspaceSlugCandidate(preferred) || "workspace";
  const base = isReservedWorkspaceSlug(normalizedBase) ? "workspace" : normalizedBase;

  const { data, error } = await admin
    .from("agencies")
    .select("id, slug, status")
    .or(`slug.eq.${base},slug.like.${base}-%`)
    .limit(200);

  if (error) {
    logServerError("workspace-signup.generateAvailableWorkspaceSlug", error);
    return base;
  }

  const rows = (data ?? []) as Array<{
    id?: string;
    slug?: string;
    status?: string | null;
  }>;
  const existing = new Set<string>();
  /** slug → agencies.id, for rows whose workspace is cancelled/archived. */
  const retiredHolders = new Map<string, string>();
  for (const row of rows) {
    const rowSlug = String(row.slug ?? "").trim().toLowerCase();
    if (!rowSlug) continue;
    existing.add(rowSlug);
    if (row.id && isRetiredWorkspaceStatus(row.status)) {
      retiredHolders.set(rowSlug, row.id);
    }
  }

  if (!existing.has(base) && !isReservedSlug(base)) {
    return base;
  }

  // RECLAIM. `agencies.slug` is UNIQUE and platform admin's delete is SOFT, so
  // a cancelled workspace physically keeps holding its name and no insert can
  // reuse it. `isRequestedLinkTaken` now reports such a name as AVAILABLE on
  // /get-started, and this is the half that makes that promise deliverable:
  // rename the dead row out of the way, lazily, only when a real signup wants
  // the name back. Deliberately open to any signup rather than to the original
  // owner alone: at the form the visitor is usually anonymous, so "its own
  // owner" is not knowable, and a retired workspace has no live surface to
  // protect. A workspace that also holds a `<slug>.<domain>` row in
  // `agency_domains` never reaches here, because that row keeps the form
  // answering "taken". Non-fatal: any failure falls through to suffixing.
  const retiredHolderId = retiredHolders.get(base);
  if (retiredHolderId && !isReservedSlug(base)) {
    const tombstone = retiredWorkspaceSlugTombstone(
      base,
      Math.random().toString(36).slice(2, 8),
    );
    const { error: reclaimError } = await admin
      .from("agencies")
      .update({ slug: tombstone, updated_at: new Date().toISOString() })
      .eq("id", retiredHolderId)
      // Re-assert the terminal status in the WHERE clause: between the read
      // above and this write the workspace could have been restored, and
      // renaming a live tenant's slug would break its storefront.
      .in("status", [...RETIRED_WORKSPACE_STATUSES]);
    if (!reclaimError) {
      return base;
    }
    logServerError("workspace-signup.reclaimRetiredSlug", reclaimError);
  }

  for (let suffix = 2; suffix < 500; suffix += 1) {
    const suffixText = `-${suffix}`;
    const trimmedBase = base.slice(0, WORKSPACE_SLUG_MAX_LENGTH - suffixText.length);
    const candidate = `${trimmedBase.replace(/-+$/, "")}${suffixText}`;
    if (!existing.has(candidate) && !isReservedSlug(candidate)) {
      return candidate;
    }
  }

  return `${base.slice(0, 28).replace(/-+$/, "")}-${Date.now().toString().slice(-3)}`;
}
