"use server";

/**
 * Posts v1 (PO1) `posts_feed` inspector picker: the site's listable posts
 * and categories. PURE READ (allow-listed READ in
 * `impersonation/readonly-actions.allow.ts`); no write path.
 *
 *   workspace → the session tenant (cms_posts.tenant_id), pages.edit capability
 *   talent    → the talent's own personal site (cms_posts.talent_profile_id),
 *               the same scope the public talent `/blog` routes read
 *
 * Scope ids NEVER come from client input; `family` only says which builder
 * is asking, and each family resolves its owner from the session.
 */
import type { PublicPostCategoryRow } from "@/lib/cms/posts-public-model";
import type { PostScope } from "@/lib/cms/posts-writer";
import { createSupabasePostsWidgetSource, selectPostsWidgetRows } from "@/lib/cms/posts-widget-query";
import { requireTenantScope } from "@/lib/saas";
import { requireSession } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { requirePhase5Capability } from "@/lib/site-admin";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type PostsWidgetPickerPost = { id: string; title: string; categoryId: string | null; featured: boolean };

export type PostsWidgetPickerResult =
  | { ok: true; posts: PostsWidgetPickerPost[]; categories: { id: string; name: string }[] }
  | { ok: false; error: string };

async function resolveScope(family: "workspace" | "talent"): Promise<{ ok: true; scope: PostScope } | { ok: false; error: string }> {
  if (family === "talent") {
    const self = await requireTalentSelf();
    if (!self.ok) return { ok: false, error: self.error };
    return { ok: true, scope: { kind: "talent", talentProfileId: self.talentProfile.id } };
  }
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Select an agency workspace first." };
  try {
    await requirePhase5Capability("agency.site_admin.pages.edit", scope.tenantId);
  } catch {
    return { ok: false, error: "Not authorized." };
  }
  return { ok: true, scope: { kind: "tenant", tenantId: scope.tenantId } };
}

export async function listPostsForWidgetPickerAction(
  family: "workspace" | "talent",
  locale: string,
): Promise<PostsWidgetPickerResult> {
  const fam = family === "talent" ? "talent" : "workspace";
  const loc = locale === "es" ? "es" : "en";
  const resolved = await resolveScope(fam);
  if (!resolved.ok) return resolved;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Could not load posts." };
  try {
    const source = createSupabasePostsWidgetSource(admin);
    const [rows, categories] = await Promise.all([
      source.listPublished(resolved.scope, loc),
      source.listCategories(resolved.scope, loc).catch((): PublicPostCategoryRow[] => []),
    ]);
    const now = new Date();
    const listable = selectPostsWidgetRows(rows, { source: "latest", sort: "newest", limit: 200 }, now).rows;
    return {
      ok: true,
      posts: listable.map((r) => ({
        id: r.id,
        title: r.title,
        categoryId: r.category_id,
        featured: r.is_featured === true,
      })),
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
    };
  } catch (error) {
    logServerError("posts-widget-actions/picker", error);
    return { ok: false, error: "Could not load posts." };
  }
}
