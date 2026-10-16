"use server";

/**
 * "AI can read my site" toggle actions (Posts v1, P6). Default is ON; these
 * only flip `ai_crawlers_allowed` for the caller's OWN scope. Nothing about the
 * target comes from client input. Impersonation is refused first.
 */

import { requireSession } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { requirePhase5Capability } from "@/lib/site-admin";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadOwnAiCrawlersAllowed, writeAiCrawlersAllowed, type AiToggleResult } from "@/lib/cms/posts-ai-toggle";

export type AiCrawlersActionResult = AiToggleResult;
export type AiCrawlersReadResult = { ok: true; allowed: boolean } | { ok: false; message: string };

const fail = (message: string, code: "write_failed" = "write_failed"): AiCrawlersActionResult => ({
  ok: false,
  code,
  message,
});

export async function talentSetAiCrawlersAllowedAction(allowed: boolean): Promise<AiCrawlersActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return fail(readOnly.error);
  try {
    const self = await requireTalentSelf();
    if (!self.ok) return fail(self.error);
    const db = createServiceRoleClient();
    if (!db) return fail("Could not save. Try again.");
    return await writeAiCrawlersAllowed(db, { kind: "talent", talentProfileId: self.talentProfile.id }, allowed);
  } catch (error) {
    logServerError("cms/posts-ai-toggle/talent", error);
    return fail("Could not save. Try again.");
  }
}

export async function workspaceSetAiCrawlersAllowedAction(allowed: boolean): Promise<AiCrawlersActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return fail(readOnly.error);
  try {
    const auth = await requireSession();
    if (!auth.ok) return fail(auth.error);
    const scope = await requireTenantScope().catch(() => null);
    if (!scope) return fail("Select an agency workspace first.");
    try {
      await requirePhase5Capability("agency.site_admin.pages.publish", scope.tenantId);
    } catch {
      return fail("Not authorized.");
    }
    const db = createServiceRoleClient();
    if (!db) return fail("Could not save. Try again.");
    return await writeAiCrawlersAllowed(db, { kind: "tenant", tenantId: scope.tenantId }, allowed);
  } catch (error) {
    logServerError("cms/posts-ai-toggle/workspace", error);
    return fail("Could not save. Try again.");
  }
}

/** Owner read for the workspace Posts list. Default ON when the read fails. */
export async function workspaceLoadAiCrawlersAllowedAction(): Promise<AiCrawlersReadResult> {
  try {
    const auth = await requireSession();
    if (!auth.ok) return { ok: false, message: auth.error };
    const scope = await requireTenantScope().catch(() => null);
    if (!scope) return { ok: false, message: "Select an agency workspace first." };
    try {
      await requirePhase5Capability("agency.site_admin.pages.edit", scope.tenantId);
    } catch {
      return { ok: false, message: "Not authorized." };
    }
    return { ok: true, allowed: await loadOwnAiCrawlersAllowed({ kind: "tenant", tenantId: scope.tenantId }) };
  } catch (error) {
    logServerError("cms/posts-ai-toggle/ws-load", error);
    return { ok: false, message: "Could not load." };
  }
}
