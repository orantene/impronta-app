import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { BlogDetailV1 } from "./schema";

export function BlogDetailComponent({ props }: SectionComponentProps<BlogDetailV1>) {
  const { category, date, title, byline, heroImageUrl, heroImageAlt, body, pullQuote, presentation } = props;
  return (
    <article
      className="site-post"
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <header className="site-post__head">
        {(category || date) && (
          <div className="site-post__meta">
            {category ? <span>{category}</span> : null}
            {category && date ? <span aria-hidden> · </span> : null}
            {date ? <time>{date}</time> : null}
          </div>
        )}
        <h1 className="site-post__title">{renderInlineRich(title)}</h1>
        {byline ? <p className="site-post__byline">{byline}</p> : null}
      </header>
      {heroImageUrl ? (
        <figure className="site-post__hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImageUrl}
            alt={heroImageAlt ?? ""}
            aria-hidden={heroImageAlt ? undefined : true}
          />
        </figure>
      ) : null}
      <div className="site-post__body">
        {body.split("\n\n").map((p, i) => (
          <p key={i}>{renderInlineRich(p)}</p>
        ))}
      </div>
      {pullQuote ? (
        <blockquote className="site-post__pullquote">{pullQuote}</blockquote>
      ) : null}
    </article>
  );
}
