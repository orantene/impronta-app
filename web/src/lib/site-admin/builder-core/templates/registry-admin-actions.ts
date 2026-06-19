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
import { isSafeMediaUrl } from "@/lib/site-admin/media/validation";
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

/** A single template row by id (any status). super_admin only. Used by the
 *  Playground draft-bound adapter's `load` to hydrate the editor with the
 *  draft's `builder_tree`. */
export async function getTemplateById(
  templateId: string,
): Promise<AdminTemplateResult<BuilderTemplateRow>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  try {
    const sb = getAdminClient();
    const { data, error } = await sb
      .from("builder_templates")
      .select()
      .eq("id", templateId)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Draft not found." };
    return { ok: true, data: data as BuilderTemplateRow };
  } catch (err) {
    logServerError("getTemplateById", err);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

/**
 * A2 — the platform Builder Lab's media scope (tenant id). The Lab is scoped to
 * the Tulala hub tenant (mirrors the builder-lab page's tenant resolution), and
 * the thumbnail `MediaPickerDrawer` needs that tenant id to list/upload assets.
 * Returning it from a super_admin-gated action keeps the client components from
 * having to thread it through the catalog shell. super_admin only.
 */
export async function resolveLabMediaTenantId(): Promise<
  AdminTemplateResult<string>
> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  try {
    const sb = getAdminClient();
    const { data, error } = await sb
      .from("agencies")
      .select("id")
      .eq("kind", "hub")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data?.id) return { ok: false, error: "No platform hub tenant found." };
    return { ok: true, data: data.id as string };
  } catch (err) {
    logServerError("resolveLabMediaTenantId", err);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

/**
 * A2 — batch-resolve `media_assets` ids → public URLs for the template/starter
 * thumbnail cells. Resolves by id (the thumbnail asset may live on any tenant the
 * Lab authored against), prefers the stored `public_url`, and falls back to the
 * storage bucket's public URL. Non-safe / missing URLs are simply omitted. The
 * caller maps `templateId → url` with `resolveTemplateThumbnailMap` (pure).
 * super_admin only.
 */
export async function resolveTemplateThumbnails(
  assetIds: ReadonlyArray<string>,
): Promise<AdminTemplateResult<Record<string, string>>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const ids = [...new Set(assetIds.filter((id) => id && id.trim()))];
  if (ids.length === 0) return { ok: true, data: {} };

  try {
    const sb = getAdminClient();
    const { data, error } = await sb
      .from("media_assets")
      .select("id, bucket_id, storage_path, public_url")
      .in("id", ids);

    if (error) return { ok: false, error: error.message };

    const out: Record<string, string> = {};
    for (const row of data ?? []) {
      const r = row as {
        id: string;
        bucket_id: string | null;
        storage_path: string | null;
        public_url: string | null;
      };
      let url = isSafeMediaUrl(r.public_url) ? r.public_url : "";
      if (!url && r.bucket_id && r.storage_path) {
        const { data: pub } = sb.storage
          .from(r.bucket_id)
          .getPublicUrl(r.storage_path);
        if (isSafeMediaUrl(pub?.publicUrl)) url = pub.publicUrl;
      }
      if (url) out[r.id] = url;
    }
    return { ok: true, data: out };
  } catch (err) {
    logServerError("resolveTemplateThumbnails", err);
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
