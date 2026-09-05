"use server";

/**
 * Server action for the `qr_code` block's link picker in the builder inspector.
 *
 * Mirrors `site-admin/collections/actions.ts`: the tenant is resolved from the
 * WORKSPACE SURFACE via `requireWorkspaceStaffAction` and gated on a capability
 * — NO tenant identifier enters through the signature, so a client cannot list
 * another workspace's links (the anti-escalation contract, one level up from
 * the anon-RPC sweep). Returns `{ ok }` results, never throws, so the client
 * inspector reacts without try/catch.
 *
 * The picker shows PAUSED links (with `status`) — that is `listLinksForTenant`'s
 * job, and deliberately different from `findActiveLinkByCode`, which hides them:
 * an operator choosing what to PRINT must see a paused code. And a failed read
 * surfaces as `{ ok: false }` — never `{ ok: true, links: [] }` — so an empty
 * picker never masquerades as an empty workspace.
 */

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { listLinksForTenant, type LinkSummary } from "@/lib/links/link-store";

export type LinkPickerResult =
  | { ok: true; links: LinkSummary[] }
  | { ok: false; error: string };

export async function listLinksForPickerAction(): Promise<LinkPickerResult> {
  const guard = await requireWorkspaceStaffAction({
    capability: "agency.site_admin.pages.edit",
  });
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    const links = await listLinksForTenant(guard.tenantId, { limit: 200 });
    return { ok: true, links };
  } catch (error) {
    // listLinksForTenant THROWS on a read error rather than returning [], so a
    // dead read becomes an honest error state, not a false "no links".
    logServerError("links:listLinksForPickerAction", error);
    return { ok: false, error: "Could not load your links." };
  }
}
