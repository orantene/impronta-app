import Link from "next/link";
import type { ReactNode } from "react";
import { postVideoEmbedUrl, type PostBlock } from "@/lib/cms/post-blocks";
import { renderInlineRich } from "@/lib/site-admin/sections/shared/rich-text";

/**
 * Server-safe renderer for `cms_posts.body_blocks`. Theme tokens only: no
 * per-block colours or fonts. Classes sit under `.site-post__body` so the
 * theme's existing post styles apply.
 */

export type PostServiceDisplay = { name?: string; label: string };

/** offeringId -> pre-resolved display. A missing id hides the service block. */
export type PostServiceMap = Readonly<Record<string, PostServiceDisplay | undefined>>;

export type PostBlocksRendererProps = {
  blocks: readonly PostBlock[];
  services?: PostServiceMap;
  /** The site's home path ("/" or "/en"): the booking sheet lives there (`#book`). */
  homePath?: string;
  /** Label of the Book button when the block has none. */
  locale?: string;
};

// Inlined (same output as serviceBookHref / offeringCtaLabel("book_now")) so the
// client writer preview does not pull the offerings, JSON-LD and booking-gate graph.
function bookHref(offeringId: string | undefined, homePath: string | undefined): string {
  const base = homePath && homePath.startsWith("/") ? homePath : "/";
  return offeringId
    ? `${base}?book=${encodeURIComponent(offeringId.toLowerCase())}#book`
    : `${base}#book`;
}

function renderBlock(block: PostBlock, p: PostBlocksRendererProps): ReactNode {
  switch (block.type) {
    case "paragraph":
      return (
        <div className="site-post__paragraphs">
          {block.text.split("\n\n").map((t, i) => (
            <p key={i}>{renderInlineRich(t)}</p>
          ))}
        </div>
      );
    case "heading":
      return block.level === 2 ? (
        <h2 className="site-post__h2">{block.text}</h2>
      ) : (
        <h3 className="site-post__h3">{block.text}</h3>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className="site-rich-list">
          {block.items.map((item, i) => (
            <li key={i}>{renderInlineRich(item)}</li>
          ))}
        </Tag>
      );
    }
    case "image":
      return (
        <figure className="site-post__figure">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.url} alt={block.alt} loading="lazy" />
          {block.caption ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      );
    case "gallery":
      return (
        <div className="site-post__gallery">
          {block.images.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={img.url} alt={img.alt} loading="lazy" />
          ))}
        </div>
      );
    case "quote":
      return (
        <blockquote className="site-post__pullquote">
          {block.text}
          {block.cite ? <cite>{block.cite}</cite> : null}
        </blockquote>
      );
    case "video": {
      const src = postVideoEmbedUrl(block.url);
      if (!src) return null;
      return (
        <div className="site-post__video">
          <iframe
            src={src}
            title="Video"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      );
    }
    case "divider":
      return <hr className="site-post__divider" />;
    case "service": {
      const svc = p.services?.[block.offering_id];
      if (!svc) return null;
      return (
        <div className="site-post__service">
          {svc.name ? <strong className="site-post__service-name">{svc.name}</strong> : null}
          <span className="site-post__service-price">{svc.label}</span>
        </div>
      );
    }
    case "book_button":
      return (
        <p className="site-post__book">
          <Link className="site-btn site-btn--primary" href={bookHref(block.offering_id, p.homePath)}>
            {block.label?.trim() || ((p.locale ?? "en").toLowerCase().startsWith("es") ? "Reservar" : "Book")}
          </Link>
        </p>
      );
    case "faq":
      return (
        <details className="site-post__faq">
          <summary>{block.question}</summary>
          <p>{renderInlineRich(block.answer)}</p>
        </details>
      );
  }
}

export function PostBlocksRenderer(props: PostBlocksRendererProps) {
  return (
    <>
      {props.blocks.map((block) => {
        const node = renderBlock(block, props);
        return node ? (
          <div key={block.id} className="site-post__block" data-block-type={block.type}>
            {node}
          </div>
        ) : null;
      })}
    </>
  );
}

export type PostBodyProps = Omit<PostBlocksRendererProps, "blocks"> & {
  /** `cms_posts.body_blocks` parsed; null = legacy post. */
  blocks: readonly PostBlock[] | null;
  /** Legacy `cms_posts.body` text. */
  body: string;
};

/** Blocks when present, otherwise the legacy body exactly as blog_detail does. */
export function PostBody({ blocks, body, ...rest }: PostBodyProps) {
  return (
    <div className="site-post__body">
      {blocks !== null ? (
        <PostBlocksRenderer blocks={blocks} {...rest} />
      ) : (
        body.split("\n\n").map((p, i) => <p key={i}>{renderInlineRich(p)}</p>)
      )}
    </div>
  );
}
