import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { BlogIndexV1 } from "./schema";

export function BlogIndexComponent({ props }: SectionComponentProps<BlogIndexV1>) {
  const { eyebrow, headline, posts, variant, columnsDesktop, presentation } = props;
  return (
    <section
      className="site-blog"
      data-variant={variant}
      style={{
        ["--blog-cols" as string]: String(columnsDesktop),
        ...presentationInlineStyles(presentation),
      }}
      {...presentationDataAttrs(presentation)}
    >
      <div className="site-blog__inner">
        {(eyebrow || headline) && (
          <header className="site-blog__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-blog__headline">{renderInlineRich(headline)}</h2>
            ) : null}
          </header>
        )}
        <ul className="site-blog__grid">
          {posts.map((post, i) => (
            <li className="site-blog__item" key={`${post.title}-${i}`}>
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
      </div>
    </section>
  );
}
