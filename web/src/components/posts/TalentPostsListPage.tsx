"use client";

/**
 * TalentPostsListPage — Website -> Posts for the talent dashboard (TUL-1007).
 *
 * Lists the talent's posts with a status chip and the SEO dot, filters
 * (Todos / Publicados / Borradores / Programados) and "+ Nuevo post". When the
 * plan can't publish it shows the lock hint: drafts are free, Publicar is Web
 * Office. The list loads through `talentListPostsAction` (owner-scoped on the
 * server); the writer is its own full-screen route.
 */

import { Lock, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { derivePostUiStatus, type PostUiStatus } from "@/lib/cms/post-writer-status";
import type { PostListRow } from "@/lib/cms/post-writer-types";
import { talentListPostsAction } from "@/lib/server-actions/posts-reader-actions";
import { AiCrawlerToggle } from "@/components/posts/AiCrawlerToggle";
import { talentSetAiCrawlersAllowedAction } from "@/lib/server-actions/posts-ai-toggle-actions";
import { talentCreatePostDraftAction } from "@/lib/server-actions/posts-writer-actions";
import { SEO_DOT_CLASS, seoLevelLabel } from "@/components/posts/writer/PostSettingsSheet";
import { postsTranslator, type PostsT } from "@/components/posts/writer/posts-t";

type Filter = "all" | "published" | "drafts" | "scheduled";
type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; posts: PostListRow[]; canPublish: boolean; aiCrawlersAllowed: boolean };

const FILTERS: readonly Filter[] = ["all", "published", "drafts", "scheduled"];

function filterLabel(f: Filter, t: PostsT): string {
  switch (f) {
    case "all":
      return t("dashboard.talentPosts.filterAll");
    case "published":
      return t("dashboard.talentPosts.filterPublished");
    case "drafts":
      return t("dashboard.talentPosts.filterDrafts");
    case "scheduled":
      return t("dashboard.talentPosts.filterScheduled");
  }
}

function rowStatus(post: PostListRow): PostUiStatus {
  return derivePostUiStatus({
    status: post.status,
    isUnlisted: post.isUnlisted,
    scheduledPublishAt: post.scheduledPublishAt,
  });
}

function matches(filter: Filter, ui: PostUiStatus): boolean {
  switch (filter) {
    case "all":
      return true;
    case "published":
      return ui === "published" || ui === "hidden";
    case "drafts":
      return ui === "draft";
    case "scheduled":
      return ui === "scheduled";
  }
}

function statusText(post: PostListRow, ui: PostUiStatus, t: PostsT, locale: string): string {
  if (post.takenDown) {
    return post.takenDownReason
      ? t("dashboard.talentPosts.takenDown", { reason: post.takenDownReason })
      : t("dashboard.talentPosts.statusTakenDown");
  }
  switch (ui) {
    case "draft":
      return t("dashboard.talentPosts.statusDraft");
    case "published":
      return t("dashboard.talentPosts.statusPublished");
    case "hidden":
      return t("dashboard.talentPosts.statusHidden");
    case "scheduled": {
      const when = post.scheduledPublishAt
        ? new Date(post.scheduledPublishAt).toLocaleString(locale === "es" ? "es" : "en", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      return t("dashboard.talentPosts.scheduledOn", { date: when });
    }
  }
}

export function TalentPostsListPage() {
  const dashboardLocale = useDashboardLocale();
  const uiLocale: "es" | "en" = dashboardLocale === "es" ? "es" : "en";
  const t = useMemo(() => postsTranslator(uiLocale), [uiLocale]);
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void talentListPostsAction().then((res) => {
      if (cancelled) return;
      setLoad(
        res.ok
          ? { status: "ready", posts: res.posts, canPublish: res.canPublish, aiCrawlersAllowed: res.aiCrawlersAllowed }
          : { status: "error", message: res.message },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setLoad({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const createPost = async () => {
    setCreating(true);
    setCreateError(null);
    const res = await talentCreatePostDraftAction({ locale: uiLocale }, uiLocale);
    if (res.ok) {
      router.push(`/talent/posts/${res.data.id}`);
      return;
    }
    setCreating(false);
    setCreateError(res.message || t("dashboard.talentPosts.createFailed"));
  };

  const visible = load.status === "ready" ? load.posts.filter((p) => matches(filter, rowStatus(p))) : [];

  return (
    <div className="flex flex-col gap-[16px]" data-testid="talent-posts-list">
      <div className="flex items-center justify-between gap-[12px]">
        <h1 className="m-0 text-[22px] font-semibold text-admin-ink">{t("dashboard.talentPosts.listTitle")}</h1>
        <button
          type="button"
          disabled={creating}
          onClick={() => void createPost()}
          className="inline-flex min-h-11 cursor-pointer items-center gap-[6px] rounded-admin-md border-0 bg-admin-ink px-[16px] text-[14px] font-semibold text-admin-surface disabled:cursor-default disabled:opacity-60"
        >
          <Plus size={16} />
          {creating ? t("dashboard.talentPosts.creating") : t("dashboard.talentPosts.newPost")}
        </button>
      </div>

      {createError ? (
        <p role="alert" className="m-0 text-[14px] text-admin-ink">
          {createError}
        </p>
      ) : null}

      {load.status === "ready" ? (
        <AiCrawlerToggle
          initialAllowed={load.aiCrawlersAllowed}
          locale={uiLocale}
          onSave={talentSetAiCrawlersAllowedAction}
        />
      ) : null}

      {load.status === "ready" && !load.canPublish ? (
        <Link
          href="/talent/plan"
          data-testid="posts-lock-hint"
          className="flex min-h-11 items-center gap-[8px] rounded-admin-md border border-admin-border bg-admin-surface-alt px-[12px] text-[13px] text-admin-ink no-underline"
        >
          <Lock size={14} className="shrink-0" />
          {t("dashboard.talentPosts.lockHint")}
        </Link>
      ) : null}

      <div role="tablist" className="flex gap-[6px] overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`min-h-11 shrink-0 cursor-pointer rounded-full border px-[14px] text-[13px] font-medium ${
              filter === f
                ? "border-admin-ink bg-admin-ink text-admin-surface"
                : "border-admin-border bg-admin-card text-admin-ink"
            }`}
          >
            {filterLabel(f, t)}
          </button>
        ))}
      </div>

      {load.status === "loading" ? (
        <p className="m-0 text-[14px] text-admin-ink-muted">{t("dashboard.talentPosts.loading")}</p>
      ) : null}

      {load.status === "error" ? (
        <div role="alert" className="flex flex-col items-start gap-[8px]">
          <p className="m-0 text-[14px] text-admin-ink">{t("dashboard.talentPosts.loadError")}</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-admin-md border border-admin-border bg-admin-card px-[14px] text-[14px] text-admin-ink"
          >
            {t("dashboard.talentPosts.retry")}
          </button>
        </div>
      ) : null}

      {load.status === "ready" && load.posts.length === 0 ? (
        <div className="flex flex-col items-center gap-[6px] rounded-admin-lg border border-dashed border-admin-border px-[16px] py-[36px] text-center">
          <h2 className="m-0 text-[16px] font-semibold text-admin-ink">{t("dashboard.talentPosts.emptyTitle")}</h2>
          <p className="m-0 max-w-[320px] text-[14px] text-admin-ink-muted">{t("dashboard.talentPosts.emptyBody")}</p>
        </div>
      ) : null}

      {load.status === "ready" && load.posts.length > 0 && visible.length === 0 ? (
        <p className="m-0 text-[14px] text-admin-ink-muted">{t("dashboard.talentPosts.emptyFilter")}</p>
      ) : null}

      {visible.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-[8px] p-0">
          {visible.map((post) => {
            const ui = rowStatus(post);
            return (
              <li key={post.id}>
                <Link
                  href={`/talent/posts/${post.id}`}
                  className="flex min-h-[64px] items-center gap-[12px] rounded-admin-lg border border-admin-border bg-admin-card px-[14px] py-[10px] text-admin-ink no-underline hover:bg-admin-surface-alt"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <span className="truncate text-[15px] font-semibold">
                      {post.title.trim() && post.title !== "Sin título" ? post.title : t("dashboard.talentPosts.untitled")}
                    </span>
                    <span className="truncate text-[13px] text-admin-ink-muted">
                      {statusText(post, ui, t, uiLocale)}
                    </span>
                  </span>
                  <span
                    role="img"
                    aria-label={seoLevelLabel(post.seoLevel, t)}
                    title={seoLevelLabel(post.seoLevel, t)}
                    className={`size-[10px] shrink-0 rounded-full ${SEO_DOT_CLASS[post.seoLevel]}`}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
