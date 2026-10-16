import type { BlogCard } from "@/lib/cms/blog-index-cards";

/** Extra card facts the `posts_feed` widget can show (all optional). */
export type BlogCardExtras = {
  readingLabel?: string;
  author?: string;
  tags?: readonly string[];
  featured?: boolean;
};

/** Field toggles. Omitted = today's `blog_index` card (cover, category, date, excerpt). */
export type BlogCardFieldToggles = {
  cover?: boolean;
  category?: boolean;
  date?: boolean;
  excerpt?: boolean;
  readingTime?: boolean;
  author?: boolean;
  tags?: boolean;
  readMore?: boolean;
};

/**
 * The card grid shared by the `blog_index` section, the post layout's
 * "Más posts" and the `posts_feed` widget. Same `.site-blog__*` classes, so
 * theme styles apply to all of them. With no `fields` / class hooks the
 * markup is exactly the original `blog_index` card list.
 */
export function BlogCardList({
  cards,
  fields,
  extras,
  listClassName,
  itemClassName,
  readMoreLabel,
  byLabel,
  hiddenFrom,
}: {
  cards: readonly BlogCard[];
  fields?: BlogCardFieldToggles;
  /** Per-card extras, same index as `cards`. */
  extras?: readonly (BlogCardExtras | undefined)[];
  /** Appended to `site-blog__grid`. */
  listClassName?: string;
  /** Appended to `site-blog__item`. */
  itemClassName?: (index: number) => string | undefined;
  readMoreLabel?: string;
  byLabel?: string;
  /** Items at this index and after render `hidden` (load-more / numbered pages). */
  hiddenFrom?: number;
}) {
  const show = {
    cover: fields?.cover !== false,
    category: fields?.category !== false,
    date: fields?.date !== false,
    excerpt: fields?.excerpt !== false,
    readingTime: fields?.readingTime === true,
    author: fields?.author === true,
    tags: fields?.tags === true,
    readMore: fields?.readMore === true,
  };
  return (
    <ul className={listClassName ? `site-blog__grid ${listClassName}` : "site-blog__grid"}>
      {cards.map((post, i) => {
        const extra = extras?.[i];
        const itemExtra = itemClassName?.(i);
        const hasMeta =
          (show.category && post.category) ||
          (show.date && post.date) ||
          (show.readingTime && extra?.readingLabel) ||
          (show.author && extra?.author);
        return (
          <li
            className={itemExtra ? `site-blog__item ${itemExtra}` : "site-blog__item"}
            key={`${post.href}-${post.title}-${i}`}
            hidden={hiddenFrom !== undefined && i >= hiddenFrom ? true : undefined}
            data-post-index={fields ? i : undefined}
          >
            <a className="site-blog__link" href={post.href}>
              {!show.cover ? null : post.imageUrl ? (
                <div className="site-blog__media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.imageUrl}
                    alt={post.imageAlt ?? ""}
                    aria-hidden={post.imageAlt ? undefined : true}
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="site-blog__media site-blog__media--placeholder" aria-hidden />
              )}
              <div className="site-blog__copy">
                {fields && !hasMeta ? null : (
                  <div className="site-blog__meta">
                    {show.category && post.category ? <span className="site-blog__category">{post.category}</span> : null}
                    {show.date && post.date ? <span className="site-blog__date">{post.date}</span> : null}
                    {show.readingTime && extra?.readingLabel ? (
                      <span className="site-blog__reading">{extra.readingLabel}</span>
                    ) : null}
                    {show.author && extra?.author ? (
                      <span className="site-blog__author">
                        {byLabel ? `${byLabel} ` : ""}
                        {extra.author}
                      </span>
                    ) : null}
                  </div>
                )}
                <h3 className="site-blog__title">{post.title}</h3>
                {show.excerpt && post.excerpt ? <p className="site-blog__excerpt">{post.excerpt}</p> : null}
                {show.tags && extra?.tags && extra.tags.length > 0 ? (
                  <ul className="site-blog__tags">
                    {extra.tags.map((t) => (
                      <li key={t} className="site-blog__tag">
                        {t}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {show.readMore && readMoreLabel ? (
                  <span className="site-blog__more" aria-hidden>
                    {readMoreLabel}
                  </span>
                ) : null}
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
