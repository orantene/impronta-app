"use server";

/**
 * registry-admin-actions.ts (WS5) — super_admin-gated READ actions that the
 * Platform Builder Lab's Template Manager needs but the WS2 public
 * `registry-actions.ts` doesn't expose:
 *
 *   - `listAllTemplates()`  — every template across ALL statuses (draft /
 *     in_review / published / archived). WS2's `listPublishedTemplates` is
 *     intentionally published-only (it drives the consumer gallery); the Lab
 *     manager needs the full pipeline view.
 *   - `listTemplateRevisions(id)` — the revision trail for a template, so the
 *     manager can offer "Restore vN" (the mutation itself is WS2's
 *     `restoreTemplateRevision`).
 *
 * Both go through the service-role client behind a `requireSuperAdmin` gate
 * (the same gate WS2's write actions use) — our gate IS the auth boundary.
 * These are reads only; all writes stay in `registry-actions.ts`.
 */

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError, CLIENT_ERROR } from "@/lib/server/safe-error";
import type {
  BuilderTemplateRow,
  BuilderTemplateStatus,
} from "./registry-rows";

export type AdminTemplateResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface TemplateRevisionSummary {
  version: number;
  status: BuilderTemplateStatus;
  note: string | null;
  created_at: string;
}

async function requireSuperAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Super admin access required." };
  }
  return { ok: true };
}

function getAdminClient() {
  const client = createServiceRoleClient();
  if (!client) throw new Error("Service-role client unavailable.");
  return client;
}

/** Every template, all statuses, newest first. super_admin only. */
export async function listAllTemplates(): Promise<
  AdminTemplateResult<BuilderTemplateRow[]>
> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  try {
    const sb = getAdminClient();
    const { data, error } = await sb
      .from("builder_templates")
      .select()
      .order("updated_at", { ascending: false });

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as BuilderTemplateRow[] };
  } catch (err) {
    logServerError("listAllTemplates", err);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

/** Revision trail (version + status + note) for a template. super_admin only. */
export async function listTemplateRevisions(
  templateId: string,
): Promise<AdminTemplateResult<TemplateRevisionSummary[]>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  try {
    const sb = getAdminClient();
    const { data, error } = await sb
      .from("builder_template_revisions")
      .select("version, status, note, created_at")
      .eq("template_id", templateId)
      .order("version", { ascending: false });

    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      data: (data ?? []) as TemplateRevisionSummary[],
    };
  } catch (err) {
    logServerError("listTemplateRevisions", err);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}
