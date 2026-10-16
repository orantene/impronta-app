import "server-only";

/**
 * workspace-post-context.ts — the workspace admin's side of the Posts writer
 * pages (TUL-1011). Mirror of `talent-post-context.ts`: the tenant comes from
 * the session (`requireTenantScope`), never from the URL's post id, and the
 * capability is the same `pages.edit` the workspace* actions check. The
 * publish gate is the workspace plan (`website` and up).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadWorkspaceCanPublishPosts } from "@/lib/cms/posts-scope";
import { requireTenantScope } from "@/lib/saas";
import { requireSession } from "@/lib/server/action-guards";
import { requirePhase5Capability } from "@/lib/site-admin";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type WorkspacePostContext =
  | { ok: true; supabase: SupabaseClient; tenantId: string; canPublish: boolean }
  | { ok: false; error: string };

export async function resolveWorkspacePostContext(): Promise<WorkspacePostContext> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Select an agency workspace before managing posts." };
  try {
    await requirePhase5Capability("agency.site_admin.pages.edit", scope.tenantId);
  } catch {
    return { ok: false, error: "Not authorized." };
  }
  const admin = createServiceRoleClient();
  const canPublish = admin ? await loadWorkspaceCanPublishPosts(admin, scope.tenantId) : false;
  return { ok: true, supabase: auth.supabase, tenantId: scope.tenantId, canPublish };
}
