/**
 * The workspace admin layout's URL → page resolver.
 *
 * This used to carry its own alias map and its own segment allow-list, which
 * had to agree by hand with `resolveWorkspacePage` in the shell fixtures, with
 * the sidebar's group template, and with the canonical route matchers. It does
 * not any more: `resolveWorkspacePageId` reads the destination registry, which
 * is the one place a segment, its aliases and the route it actually renders at
 * are written down.
 *
 * PURITY MATTERS HERE. This module is imported by the SERVER layout and by
 * `lib/saas/workspace-type.test.ts`, a plain node test — so it delegates to
 * `lib/workspace/page-ids.ts` (whose only runtime import is the registry) and
 * never to the `"use client"` shell fixtures.
 *
 * Unknown segments still resolve to `overview`, exactly as the old allow-list
 * did: `/admin/activity-log`, `/admin/triage`, `/admin/bookings` and friends
 * render through a canonical matcher with Overview as the SPA page underneath.
 */
import type { WorkspacePage } from "@/components/admin/shell/internal/state";
import { resolveWorkspacePageId } from "@/lib/workspace/page-ids";

export function resolveWorkspaceAdminPage(raw: string): WorkspacePage {
  return resolveWorkspacePageId(raw);
}
