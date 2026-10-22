/**
 * post-writer-types.ts — client-safe shapes shared by the Posts v1 writer UI
 * (talent and workspace admin) and the server loaders that feed it.
 *
 * The writer takes its server actions as props (`PostWriterActions`) so the
 * same component serves the talent dashboard and, later, the agency admin.
 */
import type { PostBlock } from "@/lib/cms/post-blocks";
import type { PostSeoLevel } from "@/lib/cms/post-seo-dot";
import type { PostLocale } from "@/lib/cms/posts-shared";
import type { PostDraftValues, PostSettingsPatch } from "@/lib/cms/posts-writer";
import type { PostWriterActionResult } from "@/lib/server-actions/posts-writer-actions";

export type WriterPostData = {
  id: string;
  locale: PostLocale;
  /** cms_page_status: draft | published | archived. */
  status: string;
  slug: string;
  title: string;
  excerpt: string;
  /** TUL-1399: root post of the EN/ES group this one translates, or null. */
  translationOf: string | null;
  blocks: PostBlock[];
  publishedAt: string | null;
  scheduledPublishAt: string | null;
  categoryId: string | null;
  isFeatured: boolean;
  isUnlisted: boolean;
  expiresAt: string | null;
  relatedOfferingId: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  ogImageUrl: string | null;
  noindex: boolean;
  /** Set when the platform admin took the post down. Read-only for the owner. */
  takenDownReason: string | null;
  takenDown: boolean;
  updatedAt: string | null;
};

/** A service the owner can attach to a post. Only the id is ever stored. */
export type WriterOffering = { id: string; name: string; priceLabel?: string | null };

/** A post in the other language the writer can link as "this is its translation". */
export type WriterTranslationOption = {
  id: string;
  title: string;
  locale: PostLocale;
  /** Its own link, so a reverse link (it points at the post being edited) shows as selected. */
  translationOf: string | null;
};

export type WriterCategory = { id: string; name: string };

export type PostListRow = {
  id: string;
  title: string;
  slug: string;
  locale: PostLocale;
  status: string;
  isUnlisted: boolean;
  takenDown: boolean;
  /** The platform admin's reason, shown on the list chip. */
  takenDownReason?: string | null;
  scheduledPublishAt: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  seoLevel: PostSeoLevel;
};

export type PostWriterActions = {
  save: (input: { id: string } & PostDraftValues) => Promise<PostWriterActionResult>;
  updateSettings: (input: { id: string; patch: PostSettingsPatch }) => Promise<PostWriterActionResult>;
  publish: (input: { id: string; draft?: PostDraftValues }) => Promise<PostWriterActionResult>;
  unpublish: (input: { id: string }) => Promise<PostWriterActionResult>;
};
