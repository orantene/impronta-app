import type { BlogCard } from "@/lib/cms/blog-index-cards";

/**
 * The card grid shared by the `blog_index` section and the post layout's
 * "Más posts". Same `.site-blog__*` classes, so theme styles apply to both.
 */
export function BlogCardList({ cards }: { cards: readonly BlogCard[] }) {
  return (
    <ul className="site-blog__grid">
      {cards.map((post, i) => (
        <li className="site-blog__item" key={`${post.href}-${post.title}-${i}`}>
          <a className="site-blog__link" href={post.href}>
            {post.imageUrl ? (
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
              <div className="site-blog__meta">
                {post.category ? <span className="site-blog__category">{post.category}</span> : null}
                {post.date ? <span className="site-blog__date">{post.date}</span> : null}
              </div>
              <h3 className="site-blog__title">{post.title}</h3>
              {post.excerpt ? <p className="site-blog__excerpt">{post.excerpt}</p> : null}
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
