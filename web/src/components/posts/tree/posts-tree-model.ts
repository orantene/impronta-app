/**
 * posts-tree-model.ts — the POSTS group of the builder page tree (Posts v1,
 * TUL-1008). PURE and client-safe; both builders (agency + talent) use it.
 *
 *   POSTS                      [+ Nuevo post]
 *   Diseño de posts            (pinned, always first)
 *   <latest 5 posts>
 *   ver todos
 *
 * The copy lives here (es/en) so the strings do not touch messages/*.json.
 */
import type { PostLayoutSectionType } from "@/lib/cms/post-layout";

export const POSTS_TREE_MAX = 5;

export type PostsTreeLocale = "es" | "en";

export const POSTS_TREE_COPY = {
  es: {
    group: "POSTS",
    newPost: "Nuevo post",
    newPostPlus: "+ Nuevo post",
    design: "Diseño de posts",
    designHint: "Cambia cómo se ven todos tus posts",
    viewAll: "ver todos",
    empty: "Aún no hay posts.",
    untitled: "Sin título",
    loadFailed: "No se pudieron cargar los posts.",
    layoutFailed: "No se pudo abrir el diseño.",
    saveFailed: "No se pudo guardar el diseño.",
    draft: "Borrador",
    scheduled: "Programado",
    published: "Publicado",
    hidden: "Oculto",
    sectionPostContent: "Contenido del post",
    sectionPostAuthor: "Autor",
    sectionBlogIndex: "Más posts",
    moveUp: "Subir",
    moveDown: "Bajar",
    remove: "Quitar",
    addAuthor: "Autor",
    addMorePosts: "Más posts",
    count: "Cantidad",
    saving: "Guardando…",
    saved: "Guardado",
  },
  en: {
    group: "POSTS",
    newPost: "New post",
    newPostPlus: "+ New post",
    design: "Post design",
    designHint: "Change how all your posts look",
    viewAll: "view all",
    empty: "No posts yet.",
    untitled: "Untitled",
    loadFailed: "Could not load posts.",
    layoutFailed: "Could not open the design.",
    saveFailed: "Could not save the design.",
    draft: "Draft",
    scheduled: "Scheduled",
    published: "Published",
    hidden: "Hidden",
    sectionPostContent: "Post content",
    sectionPostAuthor: "Author",
    sectionBlogIndex: "More posts",
    moveUp: "Move up",
    moveDown: "Move down",
    remove: "Remove",
    addAuthor: "Author",
    addMorePosts: "More posts",
    count: "Count",
    saving: "Saving…",
    saved: "Saved",
  },
} as const satisfies Record<PostsTreeLocale, Record<string, string>>;

export type PostsTreeCopy = (typeof POSTS_TREE_COPY)[PostsTreeLocale];

export function postsTreeCopy(locale: string): PostsTreeCopy {
  return POSTS_TREE_COPY[locale === "es" ? "es" : "en"];
}

export function sectionLabel(copy: PostsTreeCopy, type: PostLayoutSectionType): string {
  if (type === "post_content") return copy.sectionPostContent;
  if (type === "post_author") return copy.sectionPostAuthor;
  return copy.sectionBlogIndex;
}

export type TreePostInput = {
  id: string;
  title: string;
  status: string;
  isUnlisted: boolean;
  scheduledPublishAt: string | null;
  updatedAt: string | null;
};

export type PostsTreeRow = { id: string; title: string; badge: string | null };

export type PostsTreeModel = {
  rows: PostsTreeRow[];
  /** "ver todos" shows when there is anything to list (it is the way into the Posts list). */
  showViewAll: boolean;
  empty: boolean;
};

/** Latest first by last edit, capped at five. Titles fall back to "Sin título". */
export function buildPostsTreeModel(
  posts: readonly TreePostInput[],
  copy: PostsTreeCopy,
  max: number = POSTS_TREE_MAX,
): PostsTreeModel {
  const ms = (v: string | null) => (v ? Date.parse(v) || 0 : 0);
  const sorted = [...posts].sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt));
  const rows = sorted.slice(0, max).map((p): PostsTreeRow => {
    const title = p.title.trim() === "" || p.title === "Sin título" ? copy.untitled : p.title;
    let badge: string | null = null;
    if (p.status === "published") badge = p.isUnlisted ? copy.hidden : null;
    else if (p.scheduledPublishAt) badge = copy.scheduled;
    else badge = copy.draft;
    return { id: p.id, title, badge };
  });
  return { rows, showViewAll: posts.length > 0, empty: posts.length === 0 };
}
