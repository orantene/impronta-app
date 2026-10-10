import { withPublishedShellAccountChrome } from "@/lib/client-account/published-shell-account-chrome";
import { prefixPublicHrefsDeep } from "@/lib/saas/public-hrefs";

/** Prefix public hrefs, then inject client-account header chrome when the flag is on. */
export function publishedShellLandmarkProps(
  sectionTypeKey: string,
  rawProps: Record<string, unknown>,
  publicPathPrefix: string,
): Record<string, unknown> {
  return withPublishedShellAccountChrome(
    sectionTypeKey,
    prefixPublicHrefsDeep(rawProps, publicPathPrefix),
  );
}
