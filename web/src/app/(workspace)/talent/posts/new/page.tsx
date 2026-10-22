import { notFound } from "next/navigation";

import { TalentNewPostWriterClient } from "@/components/posts/writer/TalentNewPostWriterClient";
import { isPostLocale } from "@/lib/cms/posts-shared";
import { listPostCategories, listTalentOfferings } from "@/lib/cms/posts-writer-read";
import { loadOwnAiCrawlersAllowed } from "@/lib/cms/posts-ai-toggle";
import { resolveTalentPostContext } from "@/lib/cms/talent-post-context";
import { getRequestLocale } from "@/i18n/request-locale";

export const dynamic = "force-dynamic";

// TUL-1249: the writer for a post that does not exist yet. Nothing is written
// until the talent types something; the first autosave creates the row.
export default async function PlatformTalentNewPostWriterPage() {
  const ctx = await resolveTalentPostContext();
  if (!ctx.ok) notFound();

  const ui = await getRequestLocale();
  const locale: "es" | "en" = ui === "es" ? "es" : "en";
  const postLocale = isPostLocale(locale) ? locale : "es";
  const [categories, offerings, aiCrawlersAllowed] = await Promise.all([
    listPostCategories(ctx.supabase, ctx.scope, postLocale),
    listTalentOfferings(ctx.supabase, ctx.talentProfileId, postLocale),
    loadOwnAiCrawlersAllowed({ kind: "talent", talentProfileId: ctx.talentProfileId }),
  ]);

  return (
    <TalentNewPostWriterClient
      postLocale={postLocale}
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
