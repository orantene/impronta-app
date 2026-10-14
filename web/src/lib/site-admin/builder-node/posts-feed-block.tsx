/**
 * posts-feed-block.tsx: the `posts_feed` widget view (Posts v1, PO1).
 *
 * 8 styles on ONE card component (`BlogCardList`, the same `.site-blog__*`
 * card the `blog_index` section and the post layout use, so theme styles
 * apply). Mobile-first at 390px; theme tokens only (no hex, no font stacks).
 * Server-safe: no hooks here. Load-more / numbered pagination is the small
 * `PostsFeedPager` island, which reveals pages the server already rendered.
 */
import type { CSSProperties, ReactNode } from "react";

import { BlogCardList, type BlogCardExtras } from "@/components/posts/BlogCardList";
import type { BlogCard } from "@/lib/cms/blog-index-cards";

import {
  chunkPostsFeedPages,
  normalizePostsFeedOptions,
  postsFeedCopy,
  resolvePostsFeedCards,
  type PostsFeedCard,
  type PostsFeedNodeData,
  type PostsFeedOptions,
} from "./posts-feed-model";
import { PostsFeedPager } from "./posts-feed-pager";
import type { BuilderPostsFeedNode } from "./types";

export const POSTS_FEED_CSS = `
.sb-pf{display:flex;flex-direction:column;gap:1.25rem;width:100%;box-sizing:border-box;color:var(--token-color-ink)}
.sb-pf-head{display:flex;flex-direction:column;gap:.35rem}
.sb-pf-eyebrow{margin:0;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:var(--token-color-muted)}
.sb-pf-title{margin:0;font-family:var(--token-typography-heading-font-family,var(--site-heading-font,inherit));font-size:clamp(1.6rem,4.6vw,2.6rem);line-height:1.1;font-weight:400;color:var(--token-color-ink)}
.sb-pf-note{margin:0;font-size:.8rem;color:var(--token-color-muted)}
.sb-pf-empty{margin:0;padding:1rem 0;color:var(--token-color-muted)}
.sb-pf .site-blog__grid{list-style:none;margin:0;padding:0;display:grid;gap:1.25rem;grid-template-columns:minmax(0,1fr)}
.sb-pf .site-blog__item{min-width:0}
.sb-pf .site-blog__item[hidden]{display:none}
.sb-pf .site-blog__link{display:flex;flex-direction:column;gap:.75rem;height:100%;color:inherit;text-decoration:none}
.sb-pf .site-blog__media{position:relative;overflow:hidden;aspect-ratio:4/3;border-radius:var(--site-radius-lg,var(--token-shape-radius-card,.75rem));background:color-mix(in oklab,var(--token-color-ink) 6%,var(--token-color-background))}
.sb-pf .site-blog__media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.sb-pf .site-blog__copy{display:flex;flex-direction:column;gap:.4rem;min-width:0}
.sb-pf .site-blog__meta{display:flex;flex-wrap:wrap;gap:.35rem .75rem;font-size:.78rem;color:var(--token-color-muted)}
.sb-pf .site-blog__category{color:var(--token-color-accent,var(--token-color-primary));text-transform:uppercase;letter-spacing:.08em}
.sb-pf .site-blog__title{margin:0;font-family:var(--token-typography-heading-font-family,var(--site-heading-font,inherit));font-size:1.2rem;line-height:1.25;font-weight:500;color:var(--token-color-ink);overflow-wrap:anywhere}
.sb-pf .site-blog__excerpt{margin:0;font-size:.95rem;line-height:1.5;color:var(--token-color-muted)}
.sb-pf .site-blog__tags{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.35rem}
.sb-pf .site-blog__tag{font-size:.72rem;padding:.15rem .5rem;border:1px solid var(--token-color-line);border-radius:999px;color:var(--token-color-muted)}
.sb-pf .site-blog__more{font-size:.85rem;color:var(--token-color-ink);text-decoration:underline;text-underline-offset:.2em}
.sb-pf .site-blog__link:hover .site-blog__title,.sb-pf .site-blog__link:focus-visible .site-blog__title{text-decoration:underline;text-underline-offset:.15em}
.sb-pf .site-blog__link:focus-visible{outline:2px solid var(--token-color-accent,var(--token-color-primary));outline-offset:4px}
/* grid */
@media (min-width:640px){.sb-pf--grid .site-blog__grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:1024px){.sb-pf--grid .site-blog__grid{grid-template-columns:repeat(var(--pf-cols,3),minmax(0,1fr))}}
/* slider: CSS scroll-snap, no library */
.sb-pf--slider .site-blog__grid{display:flex;gap:1rem;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding-inline:0;padding-bottom:.5rem;-webkit-overflow-scrolling:touch;scrollbar-width:thin}
.sb-pf--slider .site-blog__item{flex:0 0 82%;scroll-snap-align:start}
@media (min-width:640px){.sb-pf--slider .site-blog__item{flex-basis:46%}}
@media (min-width:1024px){.sb-pf--slider .site-blog__item{flex-basis:31%}}
/* magazine: one big + a list */
.sb-pf--magazine .sb-pf-rest .site-blog__link{flex-direction:row;align-items:flex-start;gap:.9rem}
.sb-pf--magazine .sb-pf-rest .site-blog__media{flex:0 0 34%;aspect-ratio:1/1}
.sb-pf--magazine .sb-pf-rest .site-blog__excerpt{display:none}
.sb-pf--magazine .sb-pf-lead .site-blog__title{font-size:clamp(1.4rem,4vw,2rem)}
@media (min-width:1024px){.sb-pf--magazine .site-blog__grid{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)}.sb-pf--magazine .sb-pf-lead{grid-row:span 4}}
/* masonry / collage */
.sb-pf--masonry .site-blog__grid{display:block;columns:1;column-gap:1.25rem}
.sb-pf--masonry .site-blog__item{break-inside:avoid;margin-bottom:1.25rem}
.sb-pf--masonry .site-blog__item:nth-child(3n+1) .site-blog__media{aspect-ratio:3/4}
.sb-pf--masonry .site-blog__item:nth-child(3n+2) .site-blog__media{aspect-ratio:1/1}
@media (min-width:640px){.sb-pf--masonry .site-blog__grid{columns:2}}
@media (min-width:1024px){.sb-pf--masonry .site-blog__grid{columns:var(--pf-cols,3)}}
/* list */
.sb-pf--list .site-blog__grid{gap:0}
.sb-pf--list .site-blog__item{padding:1rem 0;border-top:1px solid var(--token-color-line)}
.sb-pf--list .site-blog__link{flex-direction:row;align-items:flex-start;gap:1rem}
.sb-pf--list .site-blog__media{flex:0 0 30%;max-width:12rem;aspect-ratio:4/3}
/* minimal: text only */
.sb-pf--minimal .site-blog__grid{gap:0}
.sb-pf--minimal .site-blog__item{padding:.9rem 0;border-top:1px solid var(--token-color-line)}
.sb-pf--minimal .site-blog__copy{gap:.25rem}
.sb-pf--minimal .site-blog__title{font-size:1.1rem}
/* bento: asymmetric grid */
.sb-pf--bento .site-blog__grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}
.sb-pf--bento .sb-pf-big{grid-column:span 2}
.sb-pf--bento .site-blog__item:not(.sb-pf-big) .site-blog__excerpt{display:none}
.sb-pf--bento .site-blog__item:not(.sb-pf-big) .site-blog__title{font-size:1rem}
@media (min-width:1024px){.sb-pf--bento .site-blog__grid{grid-template-columns:repeat(var(--pf-cols,3),minmax(0,1fr));grid-auto-flow:dense}.sb-pf--bento .sb-pf-big{grid-column:span 2;grid-row:span 2}.sb-pf--bento .sb-pf-big .site-blog__media{aspect-ratio:auto;flex:1;min-height:16rem}.sb-pf--bento .sb-pf-tall{grid-row:span 2}}
/* hero: featured post large with overlay */
.sb-pf--hero .sb-pf-lead .site-blog__link{position:relative;display:block;min-height:22rem;border-radius:var(--site-radius-lg,var(--token-shape-radius-card,.75rem));overflow:hidden}
.sb-pf--hero .sb-pf-lead .site-blog__media{position:absolute;inset:0;aspect-ratio:auto;border-radius:0}
.sb-pf--hero .sb-pf-lead .site-blog__copy{position:absolute;inset:auto 0 0 0;padding:1.25rem;gap:.5rem;background:linear-gradient(to top,color-mix(in oklab,var(--token-color-ink) 82%,transparent),transparent);color:var(--token-color-background)}
.sb-pf--hero .sb-pf-lead .site-blog__title{font-size:clamp(1.5rem,5vw,2.6rem);color:var(--token-color-background)}
.sb-pf--hero .sb-pf-lead .site-blog__meta,.sb-pf--hero .sb-pf-lead .site-blog__excerpt,.sb-pf--hero .sb-pf-lead .site-blog__more,.sb-pf--hero .sb-pf-lead .site-blog__category{color:var(--token-color-background)}
.sb-pf--hero .sb-pf-lead .site-blog__media--placeholder{background:var(--token-color-ink)}
@media (min-width:640px){.sb-pf--hero .site-blog__grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sb-pf--hero .sb-pf-lead{grid-column:1/-1}.sb-pf--hero .sb-pf-lead .site-blog__link{min-height:28rem}}
@media (min-width:1024px){.sb-pf--hero .site-blog__grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
/* pager */
.sb-pf-pager{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;justify-content:center}
.sb-pf-pager button,.sb-pf-pager a{min-height:44px;min-width:44px;padding:.5rem 1rem;border:1px solid var(--token-color-line);border-radius:999px;background:transparent;color:var(--token-color-ink);font:inherit;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box}
.sb-pf-pager [aria-current="page"]{background:var(--token-color-ink);color:var(--token-color-background);border-color:var(--token-color-ink)}
`;

export type PostsFeedViewArgs = {
  node: BuilderPostsFeedNode;
  data: PostsFeedNodeData | null | undefined;
  /** Builder canvas / theme preview / demo account: show example posts when empty. */
  allowDemo: boolean;
  locale: string | undefined;
  /** Locale-free path → href in this site's URL grammar. */
  hrefFor: (path: string) => string;
  styleAttr?: CSSProperties;
  editorPreview?: boolean;
};

function toBlogCard(card: PostsFeedCard, hrefFor: (path: string) => string): BlogCard {
  return {
    title: card.title,
    href: card.path === "#" ? "#" : hrefFor(card.path),
    ...(card.excerpt ? { excerpt: card.excerpt } : {}),
    ...(card.date ? { date: card.date } : {}),
    ...(card.category ? { category: card.category } : {}),
    ...(card.imageUrl ? { imageUrl: card.imageUrl, imageAlt: card.imageAlt ?? "" } : {}),
  };
}

/** Per-item class for the asymmetric styles. Exported for the smoke tests. */
export function postsFeedItemClass(layout: PostsFeedOptions["layout"], index: number): string | undefined {
  if (layout === "magazine" || layout === "hero") return index === 0 ? "sb-pf-lead" : "sb-pf-rest";
  if (layout === "bento") {
    const slot = index % 6;
    if (slot === 0) return "sb-pf-big";
    if (slot === 3) return "sb-pf-tall";
  }
  return undefined;
}

function Header({ o }: { o: PostsFeedOptions }): ReactNode {
  if (!o.eyebrow.trim() && !o.title.trim()) return null;
  return (
    <header className="sb-pf-head">
      {o.eyebrow.trim() ? <p className="sb-pf-eyebrow">{o.eyebrow}</p> : null}
      {o.title.trim() ? <h2 className="sb-pf-title">{o.title}</h2> : null}
    </header>
  );
}

export function PostsFeedBlockView(args: PostsFeedViewArgs): ReactNode {
  const o = normalizePostsFeedOptions(args.node.props);
  const locale = args.locale ?? "en";
  const copy = postsFeedCopy(locale);
  const resolved = resolvePostsFeedCards({ live: args.data, options: o, allowDemo: args.allowDemo, locale });
  const common = {
    "data-builder-node-kind": "posts_feed",
    "data-posts-feed-layout": o.layout,
    "data-posts-feed-source": o.source,
  };

  if (resolved.cards.length === 0) {
    if (o.emptyMessage.trim()) {
      return (
        <section {...common} data-posts-feed-empty="1" className={`sb-pf sb-pf--${o.layout}`} style={args.styleAttr}>
          <style>{POSTS_FEED_CSS}</style>
          <Header o={o} />
          <p className="sb-pf-empty">{o.emptyMessage}</p>
        </section>
      );
    }
    if (args.editorPreview) {
      return (
        <section
          {...common}
          data-posts-feed-empty="1"
          data-not-shown-on-site-host=""
          className={`sb-pf sb-pf--${o.layout}`}
          style={args.styleAttr}
        >
          <style>{POSTS_FEED_CSS}</style>
          <Header o={o} />
          <p className="sb-pf-empty">{copy.emptyEditor}</p>
        </section>
      );
    }
    // Real site, no posts: render nothing visible (never invent posts).
    return (
      <section {...common} data-posts-feed-empty="1" className="sb-pf" hidden aria-hidden="true" style={args.styleAttr} />
    );
  }

  const pages = chunkPostsFeedPages(resolved.cards, o.limit);
  const paged = o.pagination !== "none" && pages.length > 1;
  const cards = paged ? resolved.cards : resolved.cards.slice(0, o.limit);
  const extras: BlogCardExtras[] = cards.map((c) => ({
    ...(c.readingMinutes ? { readingLabel: copy.minutes(c.readingMinutes) } : {}),
    ...(c.author ? { author: c.author } : {}),
    ...(c.tags ? { tags: c.tags } : {}),
    ...(c.featured ? { featured: true } : {}),
  }));
  const style: CSSProperties = { ...args.styleAttr, ["--pf-cols" as string]: String(o.columns) };

  return (
    <section
      {...common}
      data-posts-feed-pagination={o.pagination}
      data-posts-feed-demo={resolved.demo ? "1" : undefined}
      className={`sb-pf sb-pf--${o.layout}`}
      style={style}
      aria-label={o.layout === "slider" && !o.title.trim() ? copy.sliderLabel : undefined}
    >
      <style>{POSTS_FEED_CSS}</style>
      <Header o={o} />
      {resolved.demo ? <p className="sb-pf-note">{copy.demoNote}</p> : null}
      <BlogCardList
        cards={cards.map((c) => toBlogCard(c, args.hrefFor))}
        extras={extras}
        fields={o.fields}
        listClassName={`sb-pf-list sb-pf-list--${o.layout}`}
        itemClassName={(i) => postsFeedItemClass(o.layout, i % o.limit)}
        readMoreLabel={copy.readMore}
        byLabel={copy.by}
        {...(paged ? { hiddenFrom: o.limit } : {})}
      />
      {paged ? (
        <PostsFeedPager
          mode={o.pagination === "numbered" ? "numbered" : "load_more"}
          pageCount={pages.length}
          perPage={o.limit}
          labels={{
            loadMore: copy.loadMore,
            pagination: copy.pagination,
            page: copy.page,
            previous: copy.previous,
            next: copy.next,
          }}
        />
      ) : null}
    </section>
  );
}
