import { notFound } from "next/navigation";

import { TalentPostWriterClient } from "@/components/posts/writer/TalentPostWriterClient";
import { isPostLocale } from "@/lib/cms/posts-shared";
import {
  listPostCategories,
  listTalentOfferings,
  loadPostForWriter,
} from "@/lib/cms/posts-writer-read";
import { loadOwnAiCrawlersAllowed } from "@/lib/cms/posts-ai-toggle";
import { resolveTalentPostContext } from "@/lib/cms/talent-post-context";
import { getRequestLocale } from "@/i18n/request-locale";

export const dynamic = "force-dynamic";

// Posts v1 (TUL-1006): the full-screen writer. The layout renders this route
// bare (no dashboard shell), like the page builder. Data comes through the
// owner-scoped read helpers; the id in the URL only selects a row INSIDE the
// scope the session resolved.
export default async function PlatformTalentPostWriterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await resolveTalentPostContext();
  if (!ctx.ok) notFound();

  const post = await loadPostForWriter(ctx.supabase, ctx.scope, id);
  if (!post) notFound();

  const ui = await getRequestLocale();
  const locale: "es" | "en" = ui === "es" ? "es" : "en";
  const postLocale = isPostLocale(post.locale) ? post.locale : "es";
  const [categories, offerings, aiCrawlersAllowed] = await Promise.all([
    listPostCategories(ctx.supabase, ctx.scope, postLocale),
    listTalentOfferings(ctx.supabase, ctx.talentProfileId, postLocale),
    loadOwnAiCrawlersAllowed({ kind: "talent", talentProfileId: ctx.talentProfileId }),
  ]);

  // A fresh draft is stored as "Sin título"; the writer starts it with an empty title field.
  const writerPost = post.title === "Sin título" ? { ...post, title: "" } : post;

  return (
    <TalentPostWriterClient
      post={writerPost}
      locale={locale}
      offerings={offerings}
      categories={categories}
      backHref="/talent/posts"
      upgradeHref="/talent/plan"
      lapsed={!ctx.canPublish}
      aiCrawlersAllowed={aiCrawlersAllowed}
      mediaTenantId={ctx.scope.kind === "tenant" ? ctx.scope.tenantId : ""}
      mediaTalentProfileId={ctx.talentProfileId}
    />
  );
}
