"use client";

import { useEffect, type ReactNode } from "react";

/**
 * TUL-1182: the admin layout's one-time language-seed hop as a HARD browser
 * navigation. A layout `redirect()` to the seed Route Handler inside the
 * post-sign-in soft navigation made the client router re-apply the redirect
 * forever (hundreds of requests in seconds, blank page until a reload). A
 * document navigation keeps the router out of it; the seed route sets the
 * attempt cookie, so this runs once. TUL-1177: the talent layout uses it too (same
 * soft-navigation hop, it showed as a 6-10 s textless skeleton after sign-in).
 */
export function LocaleSeedHardRedirect({
  href,
  children = null,
}: {
  href: string;
  /** What to paint while the document navigation happens (the shell skeleton), not a blank page. */
  children?: ReactNode;
}) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);
  return <>{children}</>;
}
