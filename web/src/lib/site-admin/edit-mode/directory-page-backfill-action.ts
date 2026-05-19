"use server";

/**
 * Phase 3 Step 1 — directory system-page backfill action.
 *
 * One-shot, idempotent backfill so an already-live tenant (e.g. Impronta
 * on the shared remote Supabase) gets its seeded `__directory__` system
 * page immediately — without waiting for a fresh signup. Mirrors
 * `backfillSiteShellForCurrentTenant`: requireStaff + requireTenantScope
 * → service-role client → `ensureDirectoryPage`. Safe to re-run.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  ensureDirectoryPage,
  type EnsureDirectoryResult,
} from "@/lib/site-admin/server/onboard-directory-page";

export async function backfillDirectoryPageForCurrentTenant(): Promise<EnsureDirectoryResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }

  return ensureDirectoryPage({
    admin,
    tenantId: scope.tenantId,
    actorProfileId: auth.user.id,
  });
}
