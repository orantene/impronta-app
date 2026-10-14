"use client";

/**
 * WebsitePostsPage.tsx — the Website → Posts destination (W3).
 *
 * WHY THIS EXISTS
 * ───────────────
 * Posts could be SERVED publicly (`/posts/{slug}`, the sitemap, the public
 * RLS policy) while nothing anywhere in the product could create or edit
 * one: the admin showed a read-only list with fixture author/tags/hits and
 * both legacy post routes were redirect stubs. This surface closes that
 * loop: list, create, edit, publish, unpublish, delete.
 *
 * SHAPE
 * ─────
 * A single-column list of rows (title, address, status chip, freshness),
 * read like the Pages list. Opening a post navigates to the shared Posts v1
 * writer at `website/posts/[id]` (TUL-1011), the same writer the talent
 * dashboard uses. The old in-place editor was retired.
 *
 * GATING — same as Pages: `canEdit && !isPlatformHub` shows the write
 * affordances; the platform hub's site is managed in code. Viewers see the
 * read-only list.
 *
 * STYLING — admin Tailwind tokens only; `ratchet/no-new-inline-style`
 * freezes new inline `style={{…}}` anywhere under `components/admin/shell`.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { Locale } from "@/i18n/config";
import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { interpolate } from "@/i18n/interpolate";
import { buildPostPublicPathname } from "@/lib/cms/paths";
import { resolveWebsiteLiveOrigin } from "@/lib/admin/website-editor-links";
import { workspaceCreatePostDraftAction } from "@/lib/server-actions/posts-writer-actions";

import { EmptyState, Icon } from "../primitives";
import { meetsRole, useAdminShell } from "../state";
import type { WebsitePost } from "../state";
import { PageStatusChip } from "./PageStatusChip";
import { PageHeader } from "./pages-shared";
import { formatPageUpdatedAt } from "./WebsitePage-2";

/** Strip the display slug ("/spring-drop") back to the raw slug. */
function rawPostSlug(slug: string): string {
  return slug.trim().replace(/^\/+/u, "").split("/").filter(Boolean)[0] ?? "";
}

/** "Write a post" — creates an Untitled draft and opens it in the editor. */
function AddPostButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex shrink-0 cursor-pointer items-center gap-[5px] rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[6px] text-admin-12h font-semibold text-admin-ink disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Icon name="plus" size={12} stroke={1.7} />
      {t("dashboard.adminWebsite.postsAddPost")}
    </button>
  );
}

function PostsListRow({
  post,
  showLocaleChip,
  canWrite,
  liveUrl,
  onEdit,
}: {
  post: WebsitePost;
  showLocaleChip: boolean;
  canWrite: boolean;
  liveUrl: string | null;
  onEdit: () => void;
}) {
  const t = useT();
  const dashboardLocale = useDashboardLocale();

  return (
    <div className="flex min-h-[56px] items-center gap-[10px] rounded-admin-lg border border-admin-border-soft bg-admin-card px-[12px] py-[8px]">
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex flex-wrap items-center gap-x-[8px] gap-y-[3px]">
          <span className="truncate text-admin-13 font-semibold text-admin-ink">{post.title}</span>
          <span className="truncate font-mono text-admin-11 text-admin-ink-muted">{post.slug}</span>
          <PageStatusChip status={post.status} />
          {post.takenDown ? (
            <span
              className="shrink-0 rounded-admin-sm bg-admin-coral-soft px-[6px] py-px text-admin-10 font-semibold text-admin-red"
              data-testid="post-takedown-chip"
            >
              {post.takenDownReason
                ? interpolate(t("dashboard.talentPosts.takenDown"), { reason: post.takenDownReason })
                : t("dashboard.talentPosts.statusTakenDown")}
            </span>
          ) : null}
          {showLocaleChip ? (
            <span className="shrink-0 rounded-admin-sm bg-admin-indigo-soft px-[6px] py-px text-admin-10 font-semibold uppercase tracking-[0.5px] text-admin-indigo-deep">
              {post.locale}
            </span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-center gap-x-[10px] gap-y-[2px] text-admin-11 text-admin-ink-muted">
          <span>
            {formatPageUpdatedAt(post.updatedAt, t, dashboardLocale)}
            {post.lastEditedBy
              ? ` · ${interpolate(t("dashboard.adminWebsite.byAuthor"), {
                  name: post.lastEditedBy,
                })}`
              : ""}
          </span>
          {!post.hasExcerpt ? (
            <span className="text-admin-ink-dim">{t("dashboard.adminWebsite.postsNoSummary")}</span>
          ) : null}
        </span>
      </span>
      {post.status === "published" && liveUrl ? (
        <a
          href={liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-[5px] rounded-admin-md border border-admin-border bg-admin-card px-[10px] py-[5px] text-admin-12h font-semibold text-admin-ink no-underline"
        >
          <Icon name="external" size={12} stroke={1.7} />
          {t("dashboard.adminWebsite.viewLive")}
        </a>
      ) : null}
      {canWrite ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={interpolate(t("dashboard.adminWebsite.postsEditAria"), {
            title: post.title,
          })}
          className="shrink-0 cursor-pointer rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[6px] text-admin-12h font-semibold text-admin-ink"
        >
          {t("dashboard.adminWebsite.pagesListEdit")}
        </button>
      ) : null}
    </div>
  );
}

/** Website → Posts. The list, and the editor it opens. */
export function WebsitePostsPage() {
  const t = useT();
  const router = useRouter();
  const { state, toast, effectiveWebsiteState, websiteUsesLiveCms, bridgeTenantIdentity } =
    useAdminShell();
  const canEdit = meetsRole(state.role, "admin");
  const isPlatformHub =
    bridgeTenantIdentity?.kind === "hub" && bridgeTenantIdentity?.planTier === "network";
  // Same gate as the Pages surface: write affordances need the live CMS and
  // the admin role; the platform hub's site is managed in code.
  const canWrite = websiteUsesLiveCms && canEdit && !isPlatformHub;
  const posts = effectiveWebsiteState.posts;

  const [windowOrigin, setWindowOrigin] = useState("");
  useEffect(() => {
    setWindowOrigin(window.location.origin);
  }, []);
  const liveOrigin = useMemo(
    () => resolveWebsiteLiveOrigin(effectiveWebsiteState.domain.primaryDomain, windowOrigin),
    [effectiveWebsiteState.domain.primaryDomain, windowOrigin],
  );

  const pathname = usePathname();
  const dashboardLocale = useDashboardLocale();
  const [isCreating, startCreateTransition] = useTransition();

  // Admin base on the current host: "/{slug}/admin" on the shared app host,
  // "/admin" on a tenant's own domain. Taken from the live pathname so both work.
  const writerHref = useCallback(
    (id: string) => {
      const at = pathname.indexOf("/admin");
      const base = at >= 0 ? pathname.slice(0, at + "/admin".length) : "/admin";
      return `${base}/website/posts/${id}`;
    },
    [pathname],
  );

  const handleAddPost = useCallback(() => {
    startCreateTransition(() => {
      void (async () => {
        const uiLocale: "es" | "en" = dashboardLocale === "es" ? "es" : "en";
        const result = await workspaceCreatePostDraftAction({ locale: uiLocale }, uiLocale);
        if (!result.ok) {
          toast(result.message);
          return;
        }
        toast(t("dashboard.adminWebsite.postsCreatedToast"));
        router.push(writerHref(result.data.id));
      })();
    });
  }, [dashboardLocale, router, t, toast, writerHref]);

  // The public URL is built at the POST's locale — the public route 404s a
  // slug requested at a locale it was not written in.
  const liveUrlFor = useCallback(
    (post: WebsitePost): string | null => {
      if (!liveOrigin) return null;
      const raw = rawPostSlug(post.slug);
      if (!raw) return null;
      return `${liveOrigin}${buildPostPublicPathname(post.locale as Locale, raw)}`;
    },
    [liveOrigin],
  );

  // Locale chips only when a second language is actually in play, same
  // reasoning as the Pages list's LocaleChips.
  const showLocaleChips = useMemo(
    () => new Set(posts.map((p) => p.locale)).size > 1,
    [posts],
  );

  return (
    <>
      <PageHeader
        title={t("dashboard.adminWebsite.postsHeading")}
        subtitle={t("dashboard.adminWebsite.postsPageSubtitle")}
        actions={canWrite ? <AddPostButton busy={isCreating} onClick={handleAddPost} /> : undefined}
      />
      {posts.length === 0 ? (
        canWrite ? (
          <div className="flex flex-col items-start gap-[10px] rounded-admin-lg border border-admin-border-soft bg-admin-card p-[16px]">
            <div className="text-admin-13 font-semibold text-admin-ink">
              {t("dashboard.adminWebsite.postsWriteFirstTitle")}
            </div>
            <p className="m-0 text-admin-12h leading-relaxed text-admin-ink-muted">
              {t("dashboard.adminWebsite.postsWriteFirstBody")}
            </p>
            <AddPostButton busy={isCreating} onClick={handleAddPost} />
          </div>
        ) : (
          <EmptyState
            icon="info"
            title={t("dashboard.adminWebsite.postsEmptyTitle")}
            body={t("dashboard.adminWebsite.postsEmptyBody")}
            compact
          />
        )
      ) : (
        <div className="flex flex-col gap-[6px]">
          {posts.map((post) => (
            <PostsListRow
              key={post.id}
              post={post}
              showLocaleChip={showLocaleChips}
              canWrite={canWrite}
              liveUrl={liveUrlFor(post)}
              onEdit={() => router.push(writerHref(post.id))}
            />
          ))}
        </div>
      )}
    </>
  );
}
