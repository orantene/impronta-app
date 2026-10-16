"use client";

/**
 * posts-feed-editor-demo.tsx: example posts in the BUILDER CANVAS when a
 * `posts_feed` widget has no real posts yet (TUL-1164).
 *
 * The ~50 example posts used to ship inside `posts-feed-model.ts`, i.e. in the
 * admin client bundle. They now live server-side and arrive through
 * `loadPostsFeedDemoCardsAction`. While they load (or if the call fails) the
 * canvas shows the same "no posts yet" note it always had.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { loadPostsFeedDemoCardsAction } from "./posts-feed-demo-action";
import { Header, POSTS_FEED_CSS, PostsFeedCardsSection } from "./posts-feed-cards-view";
import { postsFeedCopy, type PostsFeedCard, type PostsFeedOptions } from "./posts-feed-model";

export function PostsFeedEditorDemo(props: {
  options: PostsFeedOptions;
  locale: string;
  count: number;
  styleAttr?: CSSProperties;
  emptyLabel: string;
}): ReactNode {
  const { options: o, locale, count } = props;
  const [cards, setCards] = useState<PostsFeedCard[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadPostsFeedDemoCardsAction(o.demoTrade, locale, count)
      .then((next) => {
        if (alive) setCards(next);
      })
      .catch(() => {
        if (alive) setCards([]);
      });
    return () => {
      alive = false;
    };
  }, [o.demoTrade, locale, count]);

  if (cards && cards.length > 0) {
    return (
      <PostsFeedCardsSection
        o={o}
        copy={postsFeedCopy(locale)}
        cards={cards}
        demo
        hrefFor={() => "#"}
        styleAttr={props.styleAttr}
      />
    );
  }
  return (
    <section
      data-builder-node-kind="posts_feed"
      data-posts-feed-layout={o.layout}
      data-posts-feed-source={o.source}
      data-posts-feed-empty="1"
      data-not-shown-on-site-host=""
      className={`sb-pf sb-pf--${o.layout}`}
      style={props.styleAttr}
    >
      <style>{POSTS_FEED_CSS}</style>
      <Header o={o} />
      <p className="sb-pf-empty">{props.emptyLabel}</p>
    </section>
  );
}
