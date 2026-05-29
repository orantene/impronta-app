"use server";

import { revalidatePath } from "next/cache";
import { getCachedActorSession, getCachedServerSupabase } from "@/lib/server/request-cache";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { findTenantMembership } from "@/lib/saas/tenant";

type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? object : T))
  | { ok: false; error: string };

async function requirePageAdmin(tenantSlug: string) {
  const [session, supabase] = await Promise.all([
    getCachedActorSession(),
    getCachedServerSupabase(),
  ]);
  if (!session.user || !supabase) {
    return { ok: false as const, error: "Not authenticated." };
  }
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) {
    return { ok: false as const, error: "Workspace not found." };
  }
  const membership = await findTenantMembership(scope.tenantId);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { ok: false as const, error: "Admin access required." };
  }
  return { ok: true as const, supabase, tenantId: scope.tenantId };
}

export type WorkspacePageActionResult = ActionResult<{ id: string; slug: string }>;

export async function createPage(
  tenantSlug: string,
  title = "Untitled",
): Promise<WorkspacePageActionResult> {
  const guard = await requirePageAdmin(tenantSlug);
  if (!guard.ok) return guard;
  const { supabase, tenantId } = guard;

  const slug = `untitled-${Date.now().toString(36)}`;
  const { data, error } = await supabase
    .from("workspace_pages")
    .insert({ tenant_id: tenantId, slug, title, status: "draft", blocks: [], theme: {} })
    .select("id, slug")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to create page." };
  }

  revalidatePath(`/${tenantSlug}/admin/website`);
  return { ok: true, id: data.id, slug: data.slug };
}

export async function updatePageBlocks(
  tenantSlug: string,
  pageId: string,
  blocks: unknown[],
): Promise<ActionResult> {
  const guard = await requirePageAdmin(tenantSlug);
  if (!guard.ok) return guard;
  const { supabase, tenantId } = guard;

  const { error } = await supabase
    .from("workspace_pages")
    .update({ blocks, updated_at: new Date().toISOString() })
    .eq("id", pageId)
    .eq("tenant_id", tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${tenantSlug}/admin/website`);
  return { ok: true };
}

export async function updatePageTheme(
  tenantSlug: string,
  pageId: string,
  theme: Record<string, string>,
): Promise<ActionResult> {
  const guard = await requirePageAdmin(tenantSlug);
  if (!guard.ok) return guard;
  const { supabase, tenantId } = guard;

  const { error } = await supabase
    .from("workspace_pages")
    .update({ theme, updated_at: new Date().toISOString() })
    .eq("id", pageId)
    .eq("tenant_id", tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${tenantSlug}/admin/website`);
  return { ok: true };
}

export async function updatePageMeta(
  tenantSlug: string,
  pageId: string,
  meta: { title?: string; slug?: string },
): Promise<ActionResult> {
  const guard = await requirePageAdmin(tenantSlug);
  if (!guard.ok) return guard;
  const { supabase, tenantId } = guard;

  const { error } = await supabase
    .from("workspace_pages")
    .update({ ...meta, updated_at: new Date().toISOString() })
    .eq("id", pageId)
    .eq("tenant_id", tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${tenantSlug}/admin/website`);
  return { ok: true };
}

export async function publishPage(
  tenantSlug: string,
  pageId: string,
): Promise<ActionResult<{ slug: string }>> {
  const guard = await requirePageAdmin(tenantSlug);
  if (!guard.ok) return guard;
  const { supabase, tenantId } = guard;

  const { data, error } = await supabase
    .from("workspace_pages")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", pageId)
    .eq("tenant_id", tenantId)
    .select("slug")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Failed to publish." };

  revalidatePath(`/${tenantSlug}/p/${data.slug}`);
  revalidatePath(`/${tenantSlug}/admin/website`);
  return { ok: true, slug: data.slug };
}

export async function unpublishPage(
  tenantSlug: string,
  pageId: string,
): Promise<ActionResult<{ slug: string }>> {
  const guard = await requirePageAdmin(tenantSlug);
  if (!guard.ok) return guard;
  const { supabase, tenantId } = guard;

  const { data, error } = await supabase
    .from("workspace_pages")
    .update({ status: "draft", published_at: null, updated_at: new Date().toISOString() })
    .eq("id", pageId)
    .eq("tenant_id", tenantId)
    .select("slug")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Failed to unpublish." };

  revalidatePath(`/${tenantSlug}/p/${data.slug}`);
  revalidatePath(`/${tenantSlug}/admin/website`);
  return { ok: true, slug: data.slug };
}

export async function schedulePage(
  tenantSlug: string,
  pageId: string,
  scheduledFor: string,
): Promise<ActionResult> {
  const guard = await requirePageAdmin(tenantSlug);
  if (!guard.ok) return guard;
  const { supabase, tenantId } = guard;

  const { error } = await supabase
    .from("workspace_pages")
    .update({ status: "scheduled", scheduled_for: scheduledFor, updated_at: new Date().toISOString() })
    .eq("id", pageId)
    .eq("tenant_id", tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${tenantSlug}/admin/website`);
  return { ok: true };
}

export async function deletePage(
  tenantSlug: string,
  pageId: string,
): Promise<ActionResult<{ slug: string }>> {
  const guard = await requirePageAdmin(tenantSlug);
  if (!guard.ok) return guard;
  const { supabase, tenantId } = guard;

  const { data: existing } = await supabase
    .from("workspace_pages")
    .select("slug")
    .eq("id", pageId)
    .eq("tenant_id", tenantId)
    .single();

  const { error } = await supabase
    .from("workspace_pages")
    .delete()
    .eq("id", pageId)
    .eq("tenant_id", tenantId);

  if (error) return { ok: false, error: error.message };

  if (existing?.slug) {
    revalidatePath(`/${tenantSlug}/p/${existing.slug}`);
  }
  revalidatePath(`/${tenantSlug}/admin/website`);
  return { ok: true, slug: existing?.slug ?? "" };
}

export async function listPages(tenantSlug: string): Promise<
  ActionResult<{
    pages: Array<{
      id: string;
      slug: string;
      title: string;
      status: string;
      updatedAt: string;
      blocks: unknown[];
      theme: Record<string, string>;
    }>;
  }>
> {
  const guard = await requirePageAdmin(tenantSlug);
  if (!guard.ok) return guard;
  const { supabase, tenantId } = guard;

  const { data, error } = await supabase
    .from("workspace_pages")
    .select("id, slug, title, status, updated_at, blocks, theme")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    pages: (data ?? []).map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status,
      updatedAt: p.updated_at,
      blocks: (p.blocks as unknown[]) ?? [],
      theme: (p.theme as Record<string, string>) ?? {},
    })),
  };
}
