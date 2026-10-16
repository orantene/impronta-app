"use client";

/**
 * Content inspector for the Posts v1 (PO1) `posts_feed` widget. Same idiom as
 * the reviews / portfolio inspectors: one flat panel, sections, `commitPatch`.
 *
 *   Style   → 7 styles, each with a small preview thumbnail
 *   Source  → latest / featured / hand-picked (multi-select + order, fed by
 *             `listPostsForWidgetPickerAction`, a READ action)
 *   Filters → hidden posts, sort
 *   Show    → field toggles; sort, limit, columns, pagination, empty state
 *
 * The picker asks the action for THIS builder's site (`gallerySurface.surfaceTarget`
 * says talent or workspace); the owner id always comes from the session.
 */
import { useEffect, useState, type ReactNode } from "react";

import { listPostsForWidgetPickerAction, type PostsWidgetPickerResult } from "@/lib/server-actions/posts-widget-actions";
import {
  POSTS_FEED_COLUMN_STYLES,
  POSTS_FEED_DEMO_TRADES,
  POSTS_FEED_FIELDS,
  POSTS_FEED_LIMIT_MAX,
  POSTS_FEED_LIMIT_MIN,
  POSTS_FEED_PAGINATION,
  POSTS_FEED_SORTS,
  POSTS_FEED_SOURCES,
  POSTS_FEED_STYLES,
  POSTS_FEED_STYLE_LABELS,
  normalizePostsFeedOptions,
  type PostsFeedStyle,
} from "@/lib/site-admin/builder-node/posts-feed-model";
import { postsFeedInspectorCopy } from "@/lib/site-admin/builder-node/posts-feed-inspector-copy";
import type { BuilderPostsFeedNode } from "@/lib/site-admin/builder-node/types";

import { useEditContext } from "../edit-context";
import { KIT } from "./kit/tokens";
import { InspectorLabelWithInfo } from "./kit";

type CommitPatch = (patch: Record<string, unknown>) => void;

function Section({ title, info, children }: { title: string; info?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className={KIT.blockHeading}>{info ? <InspectorLabelWithInfo label={title} info={info} /> : title}</h3>
      {children}
    </section>
  );
}

/** Tiny schematic of each style (currentColor only, so it follows the chrome). */
export function PostsFeedStyleThumb({ layout }: { layout: PostsFeedStyle }) {
  const r = (x: number, y: number, w: number, h: number, o = 0.35) => (
    <rect key={`${x}-${y}-${w}-${h}`} x={x} y={y} width={w} height={h} rx={1.5} fill="currentColor" opacity={o} />
  );
  const line = (x: number, y: number, w: number) => r(x, y, w, 2, 0.6);
  const shapes: Record<PostsFeedStyle, ReactNode[]> = {
    grid: [r(2, 3, 12, 9), r(18, 3, 12, 9), r(34, 3, 12, 9), line(2, 14, 10), line(18, 14, 10), line(34, 14, 10), r(2, 19, 12, 9), r(18, 19, 12, 9), r(34, 19, 12, 9)],
    slider: [r(2, 5, 16, 14), r(21, 5, 16, 14), r(40, 5, 8, 14, 0.2), line(2, 22, 12), line(21, 22, 12), r(20, 28, 8, 1.5, 0.6)],
    magazine: [r(2, 3, 24, 20), line(2, 26, 18), r(29, 3, 7, 6), line(38, 5, 10), r(29, 12, 7, 6), line(38, 14, 10), r(29, 21, 7, 6), line(38, 23, 10)],
    list: [r(2, 3, 10, 7), line(15, 5, 26), r(2, 12, 10, 7), line(15, 14, 22), r(2, 21, 10, 7), line(15, 23, 28)],
    minimal: [line(2, 5, 34), r(2, 9, 18, 1.5, 0.3), line(2, 14, 28), r(2, 18, 18, 1.5, 0.3), line(2, 23, 38), r(2, 27, 18, 1.5, 0.3)],
    bento: [r(2, 3, 22, 25), r(26, 3, 10, 12), r(38, 3, 10, 25), r(26, 17, 10, 11)],
    hero: [r(2, 3, 46, 16, 0.5), line(5, 14, 22), r(2, 21, 14, 8), r(18, 21, 14, 8), r(34, 21, 14, 8)],
  };
  return (
    <svg viewBox="0 0 50 31" width="50" height="31" aria-hidden focusable="false">
      {shapes[layout]}
    </svg>
  );
}

type PickerState = { status: "loading" } | { status: "error" } | Extract<PostsWidgetPickerResult, { ok: true }> & { status: "ready" };

export function PostsFeedContentInspector({ node, commitPatch }: { node: BuilderPostsFeedNode; commitPatch: CommitPatch }) {
  const { locale, gallerySurface } = useEditContext();
  const t = postsFeedInspectorCopy(locale);
  const o = normalizePostsFeedOptions(node.props);
  const family = gallerySurface.surfaceTarget === "talent" ? "talent" : "workspace";
  const [picker, setPicker] = useState<PickerState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void listPostsForWidgetPickerAction(family, locale).then((res) => {
      if (!alive) return;
      setPicker(res.ok ? { ...res, status: "ready" } : { status: "error" });
    });
    return () => {
      alive = false;
    };
  }, [family, locale]);

  const posts = picker.status === "ready" ? picker.posts : [];
  const titleOf = (id: string) => posts.find((p) => p.id === id)?.title ?? id;
  const setFields = (key: string, value: boolean) => commitPatch({ fields: { ...o.fields, [key]: value } });
  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const move = (index: number, delta: number) => {
    const next = [...o.postIds];
    const j = index + delta;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j]!, next[index]!];
    commitPatch({ postIds: next });
  };

  return (
    <div className="flex flex-col gap-4" data-builder-node-content-panel="posts_feed" data-posts-feed-inspector="content">
      <Section title={t.style} info={t.styleInfo}>
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={t.style}>
          {POSTS_FEED_STYLES.map((key) => {
            const on = o.layout === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={on}
                data-posts-feed-style-option={key}
                className={`flex flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[11px] ${on ? KIT.enumChipOn : KIT.enumChipOff}`}
                onClick={() => commitPatch({ layout: key })}
              >
                <PostsFeedStyleThumb layout={key} />
                <span>{POSTS_FEED_STYLE_LABELS[key][locale.startsWith("es") ? "es" : "en"]}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={t.source}>
        <select className={KIT.input} value={o.source} onChange={(e) => commitPatch({ source: e.target.value })}>
          {POSTS_FEED_SOURCES.map((s) => (
            <option key={s} value={s}>
              {t.sources[s]}
            </option>
          ))}
        </select>
        {picker.status === "loading" ? <p className={KIT.hint}>{t.loading}</p> : null}
        {picker.status === "error" ? <p className={KIT.hint}>{t.loadError}</p> : null}
        {picker.status === "ready" && posts.length === 0 ? <p className={KIT.hint}>{t.noPosts}</p> : null}
        {o.source === "category" ? (
          <div className={KIT.field} data-posts-feed-category="">
            <label className={KIT.label}>{t.category}</label>
            <select className={KIT.input} value={o.categoryId ?? ""} onChange={(e) => commitPatch({ categoryId: e.target.value })}>
              <option value="">{t.chooseCategory}</option>
              {(picker.status === "ready" ? picker.categories : []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {o.source === "hand_picked" ? (
          <div className="flex flex-col gap-2" data-posts-feed-handpick="">
            <InspectorLabelWithInfo label={t.pick} info={t.pickInfo} />
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {posts.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 text-[13px] text-stone-800">
                    <input type="checkbox" checked={o.postIds.includes(p.id)} onChange={() => commitPatch({ postIds: toggleIn(o.postIds, p.id) })} />
                    <span className="truncate">{p.title}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className={KIT.label}>{t.picked}</p>
            {o.postIds.length === 0 ? <p className={KIT.hint}>{t.noPicked}</p> : null}
            <ol className="flex flex-col gap-1">
              {o.postIds.map((id, i) => (
                <li key={id} className="flex items-center gap-1 text-[13px] text-stone-800">
                  <span className="min-w-0 flex-1 truncate">{`${i + 1}. ${titleOf(id)}`}</span>
                  <button type="button" className={KIT.subtleButton} aria-label={t.moveUp} onClick={() => move(i, -1)} disabled={i === 0}>
                    ↑
                  </button>
                  <button type="button" className={KIT.subtleButton} aria-label={t.moveDown} onClick={() => move(i, 1)} disabled={i === o.postIds.length - 1}>
                    ↓
                  </button>
                  <button type="button" className={KIT.subtleButton} aria-label={t.remove} onClick={() => commitPatch({ postIds: o.postIds.filter((x) => x !== id) })}>
                    ×
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </Section>

      <Section title={t.content}>
        <div className={KIT.field}>
          <label className={KIT.label}>{t.limit}</label>
          <input
            className={KIT.input}
            type="number"
            min={POSTS_FEED_LIMIT_MIN}
            max={POSTS_FEED_LIMIT_MAX}
            value={o.limit}
            onChange={(e) => {
              const n = Number(e.target.value);
              commitPatch({ limit: Math.max(POSTS_FEED_LIMIT_MIN, Math.min(POSTS_FEED_LIMIT_MAX, Number.isFinite(n) ? Math.trunc(n) : 6)) });
            }}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>{t.heading}</label>
          <input className={KIT.input} value={o.title} placeholder={t.optional} onChange={(e) => commitPatch({ title: e.target.value })} />
        </div>
      </Section>

      <details className="rounded-md border border-stone-200 px-2.5 py-2" data-posts-feed-advanced="">
        <summary className={KIT.label}>{t.advanced}</summary>
        <div className="mt-3 flex flex-col gap-4">
          <Section title={t.eyebrow}>
        <div className={KIT.field}>
          <label className={KIT.label}>{t.eyebrow}</label>
          <input className={KIT.input} value={o.eyebrow} placeholder={t.optional} onChange={(e) => commitPatch({ eyebrow: e.target.value })} />
        </div>
          </Section>
      {o.source !== "hand_picked" ? (
        <Section title={t.filters}>
          {posts.length > 0 ? (
            <details className="text-[13px] text-stone-800">
              <summary className={KIT.label}>{t.exclude}</summary>
              <ul className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto">
                {posts.map((p) => (
                  <li key={p.id}>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={o.excludeIds.includes(p.id)} onChange={() => commitPatch({ excludeIds: toggleIn(o.excludeIds, p.id) })} />
                      <span className="truncate">{p.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className={KIT.field}>
            <label className={KIT.label}>{t.sort}</label>
            <select className={KIT.input} value={o.sort} onChange={(e) => commitPatch({ sort: e.target.value })}>
              {POSTS_FEED_SORTS.map((s) => (
                <option key={s} value={s}>
                  {t.sorts[s]}
                </option>
              ))}
            </select>
          </div>
        </Section>
      ) : null}

      <Section title={t.show}>
        {POSTS_FEED_COLUMN_STYLES.has(o.layout) ? (
          <div className={KIT.field}>
            <label className={KIT.label}>{t.columns}</label>
            <select className={KIT.input} value={String(o.columns)} onChange={(e) => commitPatch({ columns: Number(e.target.value) })}>
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-1.5">
          {POSTS_FEED_FIELDS.map((f) => (
            <label key={f} className="flex items-center gap-2 text-[13px] text-stone-800">
              <input
                type="checkbox"
                checked={o.fields[f]}
                disabled={f === "cover" && o.layout === "minimal"}
                onChange={(e) => setFields(f, e.target.checked)}
              />
              <span>{t.fields[f]}</span>
            </label>
          ))}
        </div>
        <div className={KIT.field}>
          <InspectorLabelWithInfo label={t.pagination} info={t.paginationInfo} />
          <select className={KIT.input} value={o.pagination} onChange={(e) => commitPatch({ pagination: e.target.value })}>
            {POSTS_FEED_PAGINATION.map((pg) => (
              <option key={pg} value={pg}>
                {t.paginations[pg]}
              </option>
            ))}
          </select>
        </div>
        <div className={KIT.field}>
          <InspectorLabelWithInfo label={t.empty} info={t.emptyInfo} />
          <input
            className={KIT.input}
            value={o.emptyMessage}
            placeholder={t.emptyPlaceholder}
            onChange={(e) => commitPatch({ emptyMessage: e.target.value })}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>{t.demoTrade}</label>
          <select className={KIT.input} value={o.demoTrade} onChange={(e) => commitPatch({ demoTrade: e.target.value })}>
            {POSTS_FEED_DEMO_TRADES.map((d) => (
              <option key={d} value={d}>
                {t.demoTrades[d]}
              </option>
            ))}
          </select>
        </div>
      </Section>
        </div>
      </details>
    </div>
  );
}
