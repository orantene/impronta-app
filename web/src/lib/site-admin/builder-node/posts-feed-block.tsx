/**
 * posts-feed-block.tsx: the `posts_feed` widget view (Posts v1, PO1).
 *
 * 8 styles on ONE card component (`BlogCardList`, the same `.site-blog__*`
 * card the `blog_index` section and the post layout use, so theme styles
 * apply). Mobile-first at 390px; theme tokens only (no hex, no font stacks).
 * Server-safe: no hooks here. Load-more pagination is the small
 * `PostsFeedPager` island, which reveals pages the server already rendered.
 *
 * Example posts are never generated here (TUL-1164): a demo account's site gets
 * them from the server (`posts-feed-sources.ts`), and the builder canvas shows
 * them through `PostsFeedEditorDemo`, which fetches them with a server action.
 */
import type { CSSProperties, ReactNode } from "react";

import {
  normalizePostsFeedOptions,
  postsFeedCopy,
  postsFeedDemoCount,
  resolvePostsFeedCards,
  type PostsFeedNodeData,
} from "./posts-feed-model";
import { Header, POSTS_FEED_CSS, PostsFeedCardsSection } from "./posts-feed-cards-view";
import { PostsFeedEditorDemo } from "./posts-feed-editor-demo";
import type { BuilderPostsFeedNode } from "./types";

export { POSTS_FEED_CSS, postsFeedItemClass } from "./posts-feed-cards-view";

export type PostsFeedViewArgs = {
  node: BuilderPostsFeedNode;
  data: PostsFeedNodeData | null | undefined;
  locale: string | undefined;
  /** Locale-free path → href in this site's URL grammar. */
  hrefFor: (path: string) => string;
  styleAttr?: CSSProperties;
  editorPreview?: boolean;
};

export function PostsFeedBlockView(args: PostsFeedViewArgs): ReactNode {
  const o = normalizePostsFeedOptions(args.node.props);
  const locale = args.locale ?? "en";
  const copy = postsFeedCopy(locale);
  const resolved = resolvePostsFeedCards({ live: args.data });
  const common = {
    "data-builder-node-kind": "posts_feed",
    "data-posts-feed-layout": o.layout,
    "data-posts-feed-source": o.source,
  };

  if (resolved.cards.length === 0) {
    // Builder canvas, no real posts: example posts, fetched on the server by the island.
    if (args.editorPreview) {
      return (
        <PostsFeedEditorDemo
          options={o}
          locale={locale}
          count={postsFeedDemoCount(o)}
          styleAttr={args.styleAttr}
          emptyLabel={copy.emptyEditor}
        />
      );
    }
    if (o.emptyMessage.trim()) {
      return (
        <section {...common} data-posts-feed-empty="1" className={`sb-pf sb-pf--${o.layout}`} style={args.styleAttr}>
          <style>{POSTS_FEED_CSS}</style>
          <Header o={o} />
          <p className="sb-pf-empty">{o.emptyMessage}</p>
        </section>
      );
    }
    // Real site, no posts: render nothing visible (never invent posts).
    return (
      <section {...common} data-posts-feed-empty="1" className="sb-pf" hidden aria-hidden="true" style={args.styleAttr} />
    );
  }

  return (
    <PostsFeedCardsSection
      o={o}
      copy={copy}
      cards={resolved.cards}
      demo={resolved.demo}
      hrefFor={args.hrefFor}
      styleAttr={args.styleAttr}
    />
  );
}
