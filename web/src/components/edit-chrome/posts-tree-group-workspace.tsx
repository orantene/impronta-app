"use client";

/**
 * POSTS group of the AGENCY (workspace) builder page tree (Posts v1, TUL-1008).
 * The post design is the system-owned `cms_pages` row `post_layout`, created on
 * first use. Posts are managed from the admin Website -> Posts page.
 */
import { useMemo } from "react";

import {
  workspaceEnsurePostLayoutAction,
  workspaceListPostsTreeAction,
  workspaceSavePostLayoutAction,
} from "@/lib/server-actions/posts-layout-actions";
import { PostsTreeGroupBody, type PostsTreeActions } from "./posts-tree-group-body";

export function WorkspacePostsTreeGroup({
  open,
  locale,
  adminBase,
  onNavigate,
}: {
  open: boolean;
  locale: string;
  /** `/admin` or `/w/<slug>/admin`, resolved by the panel. */
  adminBase: string;
  onNavigate?: () => void;
}) {
  const uiLocale = locale === "es" ? "es" : "en";
  const actions = useMemo<PostsTreeActions>(
    () => ({
      listPosts: () => workspaceListPostsTreeAction(5),
      ensureLayout: async () => {
        const r = await workspaceEnsurePostLayoutAction(uiLocale);
        return r.ok ? { ok: true, sections: r.sections } : r;
      },
      saveLayout: async (sections) => {
        const r = await workspaceSavePostLayoutAction(uiLocale, sections);
        return r.ok ? { ok: true } : r;
      },
    }),
    [uiLocale],
  );
  const listHref = `${adminBase}/website/posts`;
  return (
    <PostsTreeGroupBody
      locale={uiLocale}
      open={open}
      actions={actions}
      listHref={listHref}
      postHref={() => listHref}
      onNavigate={onNavigate}
      testId="workspace-posts-tree"
    />
  );
}
