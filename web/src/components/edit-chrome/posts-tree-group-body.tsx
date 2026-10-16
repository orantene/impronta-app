"use client";

/**
 * The POSTS group of a builder page tree (Posts v1, TUL-1008). Presentational
 * and family-agnostic: the agency and talent wrappers
 * (`posts-tree-group-workspace.tsx`, `posts-tree-group-talent.tsx`) pass their
 * own actions and links. Nothing here knows about tenants or talent profiles.
 */
import { ChevronDown, ChevronUp, Palette, Plus, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  addPostLayoutSection,
  movePostLayoutSection,
  removePostLayoutSection,
  setMorePostsLimit,
  type PostLayoutSection,
} from "@/lib/cms/post-layout";
import {
  buildPostsTreeModel,
  postsTreeCopy,
  sectionLabel,
  type TreePostInput,
} from "@/components/posts/tree/posts-tree-model";
import { CHROME } from "./kit";

export type PostsTreeActions = {
  listPosts: () => Promise<{ ok: true; posts: TreePostInput[] } | { ok: false; error: string }>;
  ensureLayout: () => Promise<{ ok: true; sections: PostLayoutSection[] } | { ok: false; error: string }>;
  saveLayout: (sections: PostLayoutSection[]) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Create a draft and return the href of its writer; null when the family has no create route. */
  createPost?: () => Promise<{ ok: true; href: string } | { ok: false; error: string }>;
};

export type PostsTreeGroupBodyProps = {
  locale: string;
  open: boolean;
  actions: PostsTreeActions;
  /** "+ Nuevo post" target when `actions.createPost` is absent, and "ver todos". */
  listHref: string;
  /** Writer href of an existing post. */
  postHref: (id: string) => string;
  onNavigate?: () => void;
  testId: string;
};

type Layout = { sections: PostLayoutSection[]; status: "idle" | "saving" | "saved" | "error" };

export function PostsTreeGroupBody(props: PostsTreeGroupBodyProps) {
  const { locale, open, actions, listHref, postHref, onNavigate, testId } = props;
  const copy = postsTreeCopy(locale);
  const [posts, setPosts] = useState<TreePostInput[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [designOpen, setDesignOpen] = useState(false);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [creating, setCreating] = useState(false);

  // Latest listPosts + copy, read inside the load effect so the effect only
  // re-runs when the panel opens (the wrapper may pass a fresh object).
  const loadRef = useRef({ listPosts: actions.listPosts, loadFailed: copy.loadFailed });
  useEffect(() => {
    loadRef.current = { listPosts: actions.listPosts, loadFailed: copy.loadFailed };
  });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const { listPosts, loadFailed } = loadRef.current;
    void listPosts()
      .then((r) => {
        if (!alive) return;
        if (r.ok) setPosts(r.posts);
        else setError(loadFailed);
      })
      .catch(() => alive && setError(loadFailed));
    return () => {
      alive = false;
    };
  }, [open]);

  const toggleDesign = useCallback(async () => {
    const next = !designOpen;
    setDesignOpen(next);
    if (!next || layout) return;
    const r = await actions.ensureLayout().catch(() => ({ ok: false as const, error: "" }));
    if (r.ok) setLayout({ sections: r.sections, status: "idle" });
    else {
      setError(copy.layoutFailed);
      setDesignOpen(false);
    }
  }, [actions, copy.layoutFailed, designOpen, layout]);

  const commit = useCallback(
    async (sections: PostLayoutSection[]) => {
      setLayout({ sections, status: "saving" });
      const r = await actions.saveLayout(sections).catch(() => ({ ok: false as const, error: "" }));
      setLayout({ sections, status: r.ok ? "saved" : "error" });
    },
    [actions],
  );

  const newPost = async () => {
    if (!actions.createPost || creating) return;
    setCreating(true);
    const r = await actions.createPost().catch(() => ({ ok: false as const, error: "" }));
    setCreating(false);
    if (r.ok) {
      onNavigate?.();
      window.location.assign(r.href);
    } else setError(r.error || copy.loadFailed);
  };

  const model = posts ? buildPostsTreeModel(posts, copy) : null;
  const rowStyle = { color: CHROME.ink } as const;

  return (
    <div className="mt-[14px] border-t pt-[10px]" style={{ borderColor: CHROME.line }} data-testid={testId}>
      <div className="mb-[6px] flex items-center justify-between px-[6px]">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: CHROME.muted }}>
          {copy.group}
        </span>
        {actions.createPost ? (
          <button
            type="button"
            onClick={() => void newPost()}
            disabled={creating}
            data-testid={`${testId}-new`}
            className="inline-flex cursor-pointer items-center gap-[4px] rounded-[8px] border-none px-[8px] py-[4px] text-[12px] font-medium"
            style={{ background: CHROME.paper2, color: CHROME.ink }}
          >
            <Plus size={12} aria-hidden /> {copy.newPost}
          </button>
        ) : (
          <Link
            href={listHref}
            onClick={onNavigate}
            data-testid={`${testId}-new`}
            className="inline-flex items-center gap-[4px] rounded-[8px] px-[8px] py-[4px] text-[12px] font-medium no-underline"
            style={{ background: CHROME.paper2, color: CHROME.ink }}
          >
            <Plus size={12} aria-hidden /> {copy.newPost}
          </Link>
        )}
      </div>

      <button
        type="button"
        onClick={() => void toggleDesign()}
        aria-expanded={designOpen}
        data-testid={`${testId}-design`}
        title={copy.designHint}
        className="mb-[4px] flex w-full cursor-pointer items-center gap-[8px] rounded-[10px] border-none px-[10px] py-[8px] text-left text-[13px] font-medium"
        style={{ background: designOpen ? "rgba(124,58,237,0.08)" : "transparent", ...rowStyle }}
      >
        <Palette size={14} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{copy.design}</span>
      </button>

      {designOpen && layout ? (
        <div className="mb-[8px] rounded-[10px] px-[8px] py-[6px]" style={{ background: CHROME.paper2 }} data-testid={`${testId}-layout`}>
          {layout.sections.map((s, i) => (
            <div key={s.id} className="flex items-center gap-[4px] py-[3px]">
              <span className="min-w-0 flex-1 truncate text-[12px]" style={rowStyle}>
                {sectionLabel(copy, s.type)}
              </span>
              {s.type === "blog_index" ? (
                <label className="flex items-center gap-[4px] text-[11px]" style={{ color: CHROME.muted }}>
                  {copy.count}
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={s.limit}
                    onChange={(e) => void commit(setMorePostsLimit(layout.sections, s.id, Number(e.target.value) || 1))}
                    className="w-[44px] rounded-[6px] border px-[4px] py-[1px] text-[12px]"
                    style={{ borderColor: CHROME.line }}
                  />
                </label>
              ) : null}
              <button type="button" aria-label={copy.moveUp} title={copy.moveUp} disabled={i === 0}
                onClick={() => void commit(movePostLayoutSection(layout.sections, s.id, -1))}
                className="cursor-pointer border-none bg-transparent p-[3px] disabled:opacity-30" style={rowStyle}>
                <ChevronUp size={14} aria-hidden />
              </button>
              <button type="button" aria-label={copy.moveDown} title={copy.moveDown} disabled={i === layout.sections.length - 1}
                onClick={() => void commit(movePostLayoutSection(layout.sections, s.id, 1))}
                className="cursor-pointer border-none bg-transparent p-[3px] disabled:opacity-30" style={rowStyle}>
                <ChevronDown size={14} aria-hidden />
              </button>
              {s.type !== "post_content" ? (
                <button type="button" aria-label={copy.remove} title={copy.remove}
                  onClick={() => void commit(removePostLayoutSection(layout.sections, s.id))}
                  className="cursor-pointer border-none bg-transparent p-[3px]" style={rowStyle}>
                  <X size={14} aria-hidden />
                </button>
              ) : null}
            </div>
          ))}
          <div className="mt-[4px] flex items-center gap-[6px]">
            {!layout.sections.some((s) => s.type === "post_author") ? (
              <button type="button" onClick={() => void commit(addPostLayoutSection(layout.sections, "post_author", locale))}
                className="cursor-pointer rounded-[6px] border px-[6px] py-[2px] text-[11px]" style={{ borderColor: CHROME.line, background: "transparent", ...rowStyle }}>
                + {copy.addAuthor}
              </button>
            ) : null}
            <button type="button" onClick={() => void commit(addPostLayoutSection(layout.sections, "blog_index", locale))}
              className="cursor-pointer rounded-[6px] border px-[6px] py-[2px] text-[11px]" style={{ borderColor: CHROME.line, background: "transparent", ...rowStyle }}>
              + {copy.addMorePosts}
            </button>
            <span className="ml-auto text-[11px]" style={{ color: layout.status === "error" ? CHROME.rose : CHROME.muted }} role="status">
              {layout.status === "saving" ? copy.saving : layout.status === "saved" ? copy.saved : layout.status === "error" ? copy.saveFailed : ""}
            </span>
          </div>
        </div>
      ) : null}

      {model?.rows.map((row) => (
        <Link
          key={row.id}
          href={postHref(row.id)}
          onClick={onNavigate}
          className="mb-[2px] flex items-center gap-[8px] rounded-[8px] px-[10px] py-[6px] text-[13px] no-underline"
          style={rowStyle}
        >
          <span className="min-w-0 flex-1 truncate">{row.title}</span>
          {row.badge ? (
            <span className="shrink-0 rounded-[4px] px-[5px] py-[1px] text-[9px] font-semibold uppercase" style={{ background: CHROME.amberBg, color: CHROME.amber }}>
              {row.badge}
            </span>
          ) : null}
        </Link>
      ))}
      {model?.empty ? (
        <p className="px-[10px] text-[12px]" style={{ color: CHROME.muted }}>{copy.empty}</p>
      ) : null}
      {model?.showViewAll ? (
        <Link href={listHref} onClick={onNavigate} className="block px-[10px] py-[4px] text-[12px] no-underline" style={{ color: CHROME.muted }} data-testid={`${testId}-all`}>
          {copy.viewAll}
        </Link>
      ) : null}
      {error ? (
        <p className="px-[10px] text-[12px]" style={{ color: CHROME.rose }} role="alert">{error}</p>
      ) : null}
    </div>
  );
}
