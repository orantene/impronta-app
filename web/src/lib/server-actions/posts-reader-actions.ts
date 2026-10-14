"use server";

/**
 * Posts v1 list read for the talent dashboard (TUL-1007). The owner scope and
 * the publish capability come from the session; nothing is taken from input.
 */

import type { PostListRow } from "@/lib/cms/post-writer-types";
import { listPostsForOwner } from "@/lib/cms/posts-writer-read";
import { resolveTalentPostContext } from "@/lib/cms/talent-post-context";
import { logServerError } from "@/lib/server/safe-error";

export type TalentPostsListResult =
  | { ok: true; posts: PostListRow[]; canPublish: boolean }
  | { ok: false; message: string };

export async function talentListPostsAction(): Promise<TalentPostsListResult> {
  try {
    const ctx = await resolveTalentPostContext();
    if (!ctx.ok) return { ok: false, message: ctx.error };
    const posts = await listPostsForOwner(ctx.supabase, ctx.scope);
    return { ok: true, posts, canPublish: ctx.canPublish };
  } catch (error) {
    logServerError("cms/posts-reader-actions/talent-list", error);
    return { ok: false, message: "Could not load posts." };
  }
}
