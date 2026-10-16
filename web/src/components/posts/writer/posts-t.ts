import { withInterpolation } from "@/i18n/interpolate";
import { translatorFor } from "@/i18n/use-t";

/** Translator with `{name}` values. Keys live under `dashboard.talentPosts`. */
export type PostsT = ReturnType<typeof withInterpolation>;

const CACHE = new Map<string, PostsT>();

/** Stable per locale, so it is safe in hook dependency arrays. */
export function postsTranslator(locale: string): PostsT {
  let t = CACHE.get(locale);
  if (!t) {
    t = withInterpolation(translatorFor(locale));
    CACHE.set(locale, t);
  }
  return t;
}
