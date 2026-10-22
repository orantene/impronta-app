"use client";

/**
 * POSTS group of the TALENT builder page tree (Posts v1, TUL-1008). A talent
 * site has no cms_pages: its post design is `talent_sites.post_layout`, edited
 * inline here. The writer is the talent dashboard route `/talent/posts/<id>`.
 */
import { useMemo } from "react";

import {
  talentEnsurePostLayoutAction,
  talentListPostsTreeAction,
  talentSavePostLayoutAction,
} from "@/lib/server-actions/posts-layout-actions";
import { PostsTreeGroupBody, type PostsTreeActions } from "./posts-tree-group-body";

export function TalentPostsTreeGroup({ open, locale, onNavigate }: { open: boolean; locale: string; onNavigate?: () => void }) {
  const uiLocale = locale === "es" ? "es" : "en";
  const actions = useMemo<PostsTreeActions>(
    () => ({
      listPosts: () => talentListPostsTreeAction(5),
      ensureLayout: async () => {
        const r = await talentEnsurePostLayoutAction(uiLocale);
        return r.ok ? { ok: true, sections: r.sections } : r;
      },
      saveLayout: async (sections) => {
        const r = await talentSavePostLayoutAction(uiLocale, sections);
        return r.ok ? { ok: true } : r;
      },
      createPost: async () => {
        // TUL-1249: the writer creates the draft on the first real edit.
        return { ok: true, href: "/talent/posts/new" };
      },
    }),
    [uiLocale],
  );
  return (
    <PostsTreeGroupBody
      locale={uiLocale}
      open={open}
      actions={actions}
      listHref="/talent/posts"
      postHref={(id) => `/talent/posts/${id}`}
      onNavigate={onNavigate}
      testId="talent-posts-tree"
    />
  );
}
