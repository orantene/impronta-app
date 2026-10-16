/**
 * Platform HQ · Posts (Posts v1 takedown, TUL-1011)
 * /platform/admin/posts
 *
 * Every post on every workspace and talent site, with search and a
 * "Hide (takedown)" action. Hiding forces noindex, drops the post from lists,
 * sitemap and llms.txt, and the URL shows the soft-unavailable page.
 */

import { notFound } from "next/navigation";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { listPostsForPlatformAdmin } from "@/lib/cms/posts-platform-admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { PostsModeration } from "./posts-moderation";

export const dynamic = "force-dynamic";

export default async function PlatformPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; hidden?: string }>;
}) {
  const session = await getCachedActorSession();
  if (!isPlatformAdmin(session.profile)) notFound();
  const { q, hidden } = await searchParams;
  const admin = createServiceRoleClient();
  const search = typeof q === "string" ? q : "";
  const onlyHidden = hidden === "1";
  const rows = admin ? await listPostsForPlatformAdmin(admin, { search, onlyHidden, limit: 100 }) : [];
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8 text-white">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-white/50">Platform</p>
        <h1 className="text-2xl font-semibold">Posts</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/60">
          Hide a post that breaks the rules. It stops showing everywhere, search engines are told not to index it, and the owner
          sees the reason. Only a platform admin can restore it.
        </p>
      </header>
      <PostsModeration rows={rows} search={search} onlyHidden={onlyHidden} />
    </div>
  );
}
