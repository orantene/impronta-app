import type { ReactNode } from "react";

import { BlogCardList } from "@/components/posts/BlogCardList";
import type { ResolvedPostLayoutSection } from "@/lib/cms/post-layout-data";
import type { PostAuthor } from "@/lib/cms/post-author";

/** The "Autor" widget: name, avatar and short bio. Renders nothing without a name. */
export function PostAuthorCard({ author }: { author: PostAuthor | null }) {
  if (!author) return null;
  return (
    <aside className="site-post__author" data-post-widget="post_author">
      {author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="site-post__author-avatar" src={author.avatarUrl} alt="" width={56} height={56} loading="lazy" />
      ) : null}
      <div className="site-post__author-copy">
        <p className="site-post__author-name">{author.name}</p>
        {author.bio ? <p className="site-post__author-bio">{author.bio}</p> : null}
      </div>
    </aside>
  );
}

/**
 * Composes a post page from its "Diseño de posts" sections. `content` is the
 * already-rendered Post content widget (the article), so this file has no
 * dependency on the page module that renders it.
 */
export function PostLayoutSections({
  sections,
  content,
}: {
  sections: readonly ResolvedPostLayoutSection[];
  content: ReactNode;
}) {
  return (
    <div className="site-post-layout" data-post-layout="1">
      {sections.map((s) => {
        if (s.type === "post_content") return <div key={s.id}>{content}</div>;
        if (s.type === "post_author") return <PostAuthorCard key={s.id} author={s.author} />;
        if (s.cards.length === 0) return null;
        return (
          <section key={s.id} className="site-blog site-post__more" data-post-widget="blog_index">
            {s.heading ? <h2 className="site-post__more-title">{s.heading}</h2> : null}
            <BlogCardList cards={s.cards} />
          </section>
        );
      })}
    </div>
  );
}
