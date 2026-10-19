import { notFound } from "next/navigation";

import { WorkspacePostWriterClient } from "@/components/posts/writer/WorkspacePostWriterClient";
import { isPostLocale } from "@/lib/cms/posts-shared";
import {
  listPostCategories,
  listWorkspaceOfferings,
  loadPostForWriter,
} from "@/lib/cms/posts-writer-read";
import { loadOwnAiCrawlersAllowed } from "@/lib/cms/posts-ai-toggle";
import { resolveWorkspacePostContext } from "@/lib/cms/workspace-post-context";
import { getRequestLocale } from "@/i18n/request-locale";

export const dynamic = "force-dynamic";

// Posts v1 (TUL-1011): the workspace admin uses the SAME writer as the talent
// dashboard. The wrapper covers the admin shell (the writer owns its viewport,
// like the page builder). The tenant comes from the session; the id in the URL
// only selects a row INSIDE that tenant.
export default async function AdminWebsitePostWriterPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; id: string }>;
}) {
  const { tenantSlug, id } = await params;
  const ctx = await resolveWorkspacePostContext();
  if (!ctx.ok) notFound();
  const scope = { kind: "tenant", tenantId: ctx.tenantId } as const;

  const post = await loadPostForWriter(ctx.supabase, scope, id);
  if (!post) notFound();

  const ui = await getRequestLocale();
  const locale: "es" | "en" = ui === "es" ? "es" : "en";
  const postLocale = isPostLocale(post.locale) ? post.locale : "es";
  const [categories, offerings, aiCrawlersAllowed] = await Promise.all([
    listPostCategories(ctx.supabase, scope, postLocale),
    listWorkspaceOfferings(ctx.supabase, ctx.tenantId, postLocale),
    loadOwnAiCrawlersAllowed(scope),
  ]);

  const writerPost = post.title === "Sin título" ? { ...post, title: "" } : post;
  const adminBase = `/${tenantSlug}/admin`;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-admin-card">
      <WorkspacePostWriterClient
        post={writerPost}
        locale={locale}
        offerings={offerings}
        categories={categories}
        backHref={`${adminBase}/website/posts`}
        upgradeHref={`${adminBase}/account`}
        lapsed={!ctx.canPublish}
        aiCrawlersAllowed={aiCrawlersAllowed}
        mediaTenantId={ctx.tenantId}
        mediaTalentProfileId={null}
      />
    </div>
  );
}
