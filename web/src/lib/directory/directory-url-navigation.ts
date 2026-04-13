import { clientDirectoryHref } from "@/i18n/client-directory-href";
import { canonicalizeDirectorySearchParams } from "@/lib/directory/search-params";

export const DIRECTORY_QUERY_DEBOUNCE_MS = 320;

type AppRouterLike = {
  push(href: string, options?: { scroll?: boolean }): void;
  replace(href: string, options?: { scroll?: boolean }): void;
};

/**
 * Directory listing navigations: filter edits use `replace` + `scroll: false` by default
 * so history stays usable and the page does not jump.
 */
export function commitDirectoryListingUrl(
  router: AppRouterLike,
  pathname: string,
  currentSearchString: string,
  mutate: (params: URLSearchParams) => void,
  options: { replace?: boolean; scroll?: boolean } = {},
): void {
  const params = new URLSearchParams(currentSearchString);
  mutate(params);
  canonicalizeDirectorySearchParams(params);
  const qs = params.toString();
  const href = clientDirectoryHref(pathname, qs ? `?${qs}` : "");
  const navOpts = { scroll: options.scroll ?? false };
  if (options.replace ?? true) {
    router.replace(href, navOpts);
  } else {
    router.push(href, navOpts);
  }
}
