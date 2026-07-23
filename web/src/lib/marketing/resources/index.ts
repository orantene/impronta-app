/**
 * Educational resource articles (`/resources/{slug}`).
 *
 * Split into themed modules so the content stays under the file-size rule as
 * articles are added. Adding an article is a data edit: append it to the right
 * group and it appears on the hub, in the sitemap, in the cross-links, and in
 * the allow-list (which permits the whole `/resources` prefix).
 */

import { AGENCY_ARTICLES } from "./articles-agency";
import { BASICS_ARTICLES } from "./articles-basics";
import { MONEY_ARTICLES } from "./articles-money";
import { OPERATIONS_ARTICLES } from "./articles-operations";
import { PLATFORM_ARTICLES } from "./articles-platform";
import type { ArticleContent, ResourceArticle } from "./types";

export type {
  ArticleContent,
  ArticleFaq,
  ArticleSection,
  ResourceArticle,
} from "./types";

export const RESOURCE_ARTICLES: ResourceArticle[] = [
  ...BASICS_ARTICLES,
  ...MONEY_ARTICLES,
  ...AGENCY_ARTICLES,
  ...OPERATIONS_ARTICLES,
  ...PLATFORM_ARTICLES,
];

export function getResourceArticle(slug: string): ResourceArticle | undefined {
  return RESOURCE_ARTICLES.find((a) => a.slug === slug);
}

export function getArticleContent(
  article: ResourceArticle,
  locale: string,
): ArticleContent {
  return locale === "es" ? article.es : article.en;
}
