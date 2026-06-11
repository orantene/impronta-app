"use server";

/**
 * Workspace-page server actions (WS6 / Gap 2).
 *
 * The actual DB mutations for the workspace_page surface, as individual
 * "use server" actions (the directive requires every export to be an async
 * function). The adapter binding (`workspace-page-adapter.ts`) references these
 * — it is NOT itself "use server", so it can also export the non-async factory
 * + types and be imported by the client editor. This mirrors how the homepage
 * adapter binds the "use server" composition actions.
 *
 * All DB access uses the cookie-session Supabase client so `workspace_pages`
 * RLS (is_staff_of_tenant) takes effect. NEVER writes `cms_page_sections`.
 */

import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

import type {
  WorkspacePageAdapterActions,
  WorkspacePageRow,
} from "./workspace-page-adapter-core";

export async function loadWorkspacePageAction(
  input: Parameters<WorkspacePageAdapterActions["loadPage"]>[0],
): Promise<WorkspacePageRow | null> {
  try {
    const sb = await getCachedServerSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from("workspace_pages")
      .select(
        "id, tenant_id, slug, title, status, blocks, theme, published_at, updated_at",
      )
      .eq("tenant_id", input.tenantId)
      .eq("slug", input.slug)
      .single();
    if (error || !data) return null;
    return data as WorkspacePageRow;
  } catch (err) {
    logServerError("workspacePageAdapter/loadPage", err);
    return null;
  }
}

export async function saveWorkspacePageAction(
  input: Parameters<WorkspacePageAdapterActions["savePage"]>[0],
): ReturnType<WorkspacePageAdapterActions["savePage"]> {
  try {
    const sb = await getCachedServerSupabase();
    if (!sb) return { ok: false as const, error: "Supabase client unavailable." };

    const { tenantId, pageId, patch } = input;
    const updatePayload: Record<string, unknown> = {
      blocks: patch.blocks,
      theme: patch.theme,
      updated_at: patch.updated_at,
    };
    if (patch.title !== undefined) updatePayload.title = patch.title;

    const { data, error } = await sb
      .from("workspace_pages")
      .update(updatePayload)
      .eq("id", pageId)
      .eq("tenant_id", tenantId)
      .select("updated_at")
      .single();

    if (error || !data)
      return { ok: false as const, error: error?.message ?? "Save failed." };
    return { ok: true as const, updatedAt: data.updated_at as string };
  } catch (err) {
    logServerError("workspacePageAdapter/savePage", err);
    return { ok: false as const, error: "Unexpected error saving workspace page." };
  }
}

export async function publishWorkspacePageAction(
  input: Parameters<WorkspacePageAdapterActions["publishPage"]>[0],
): ReturnType<WorkspacePageAdapterActions["publishPage"]> {
  try {
    const sb = await getCachedServerSupabase();
    if (!sb) return { ok: false as const, error: "Supabase client unavailable." };

    const { tenantId, pageId } = input;
    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("workspace_pages")
      .update({ status: "published", published_at: now, updated_at: now })
      .eq("id", pageId)
      .eq("tenant_id", tenantId)
      .select("published_at, updated_at")
      .single();

    if (error || !data)
      return { ok: false as const, error: error?.message ?? "Publish failed." };
    return {
      ok: true as const,
      publishedAt: data.published_at as string,
      updatedAt: data.updated_at as string,
    };
  } catch (err) {
    logServerError("workspacePageAdapter/publishPage", err);
    return { ok: false as const, error: "Unexpected error publishing workspace page." };
  }
}

export async function restoreWorkspacePageRevisionAction(
  input: Parameters<NonNullable<WorkspacePageAdapterActions["restoreRevision"]>>[0],
): ReturnType<NonNullable<WorkspacePageAdapterActions["restoreRevision"]>> {
  try {
    const sb = await getCachedServerSupabase();
    if (!sb) return { ok: false as const, error: "Supabase client unavailable." };

    const { tenantId, pageId, revisionId } = input;
    const { data: rev, error: revErr } = await sb
      .from("workspace_page_revisions")
      .select("blocks, theme")
      .eq("id", revisionId)
      .single();

    if (revErr || !rev)
      return { ok: false as const, error: revErr?.message ?? "Revision not found." };

    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("workspace_pages")
      .update({ blocks: rev.blocks, theme: rev.theme, updated_at: now, status: "draft" })
      .eq("id", pageId)
      .eq("tenant_id", tenantId)
      .select("updated_at")
      .single();

    if (error || !data)
      return { ok: false as const, error: error?.message ?? "Restore failed." };
    return { ok: true as const, updatedAt: data.updated_at as string };
  } catch (err) {
    logServerError("workspacePageAdapter/restoreRevision", err);
    return { ok: false as const, error: "Unexpected error restoring workspace page revision." };
  }
}
