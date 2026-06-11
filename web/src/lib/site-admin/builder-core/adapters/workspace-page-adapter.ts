"use server";

/**
 * Workspace-page surface adapter (WS6) — the production binding.
 *
 * Persists the freeform `builderTree` to `workspace_pages.blocks`.
 *
 * NEVER writes `cms_page_sections` / `composition[]` — enforced by:
 *   1. `assertNoLegacyBuilderWrite("workspace_page", "workspace_pages")` called
 *      in every mutation path (§F.1 runtime guard).
 *   2. The CI static grep (`legacy-write-guard.test.ts`) that fails if the
 *      literal "cms_page_sections" appears in a non-homepage adapter source.
 *
 * The pure DI factory lives in `workspace-page-adapter-core.ts` (no runtime
 * imports), so the spy test can import and drive it without pulling in the
 * Supabase / Next.js server-action graph.
 */

import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

import {
  createWorkspacePageAdapter,
  type WorkspacePageAdapterActions,
  type WorkspacePageRow,
} from "./workspace-page-adapter-core";

export {
  createWorkspacePageAdapter,
  buildEmptyWorkspacePageComposition,
  type WorkspacePageAdapterActions,
  type WorkspacePageRow,
} from "./workspace-page-adapter-core";

// ── Supabase action implementations ─────────────────────────────────────────

/** Production action surface — all DB access goes through the cookie-session
 *  Supabase client so workspace_pages RLS (is_staff_of_tenant) takes effect. */
const productionActions: WorkspacePageAdapterActions = {
  async loadPage({ tenantId, slug }) {
    try {
      const sb = await getCachedServerSupabase();
      if (!sb) return null;
      const { data, error } = await sb
        .from("workspace_pages")
        .select(
          "id, tenant_id, slug, title, status, blocks, theme, published_at, updated_at",
        )
        .eq("tenant_id", tenantId)
        .eq("slug", slug)
        .single();
      if (error || !data) return null;
      return data as WorkspacePageRow;
    } catch (err) {
      logServerError("workspacePageAdapter/loadPage", err);
      return null;
    }
  },

  async savePage({ tenantId, pageId, patch }) {
    try {
      const sb = await getCachedServerSupabase();
      if (!sb)
        return { ok: false as const, error: "Supabase client unavailable." };

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
  },

  async publishPage({ tenantId, pageId }) {
    try {
      const sb = await getCachedServerSupabase();
      if (!sb)
        return { ok: false as const, error: "Supabase client unavailable." };

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
  },

  async restoreRevision({ tenantId, pageId, revisionId }) {
    try {
      const sb = await getCachedServerSupabase();
      if (!sb)
        return { ok: false as const, error: "Supabase client unavailable." };

      // Load the revision row
      const { data: rev, error: revErr } = await sb
        .from("workspace_page_revisions")
        .select("blocks, theme")
        .eq("id", revisionId)
        .single();

      if (revErr || !rev)
        return {
          ok: false as const,
          error: revErr?.message ?? "Revision not found.",
        };

      const now = new Date().toISOString();
      const { data, error } = await sb
        .from("workspace_pages")
        .update({
          blocks: rev.blocks,
          theme: rev.theme,
          updated_at: now,
          status: "draft",
        })
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
  },
};

/**
 * Create a workspace_page adapter bound to a specific tenant. Persists the
 * freeform builderTree to `workspace_pages.blocks`; NEVER writes
 * `cms_page_sections`.
 *
 * Call once per mount (the tenantId is captured in closure so the adapter's
 * load/save/publish can scope their queries to the correct workspace row).
 */
export function createBoundWorkspacePageAdapter(tenantId: string) {
  return createWorkspacePageAdapter(productionActions, { tenantId });
}
