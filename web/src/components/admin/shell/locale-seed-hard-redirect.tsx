"use client";

import { useEffect } from "react";

/**
 * TUL-1182: the admin layout's one-time language-seed hop as a HARD browser
 * navigation. A layout `redirect()` to the seed Route Handler inside the
 * post-sign-in soft navigation made the client router re-apply the redirect
 * forever (hundreds of requests in seconds, blank page until a reload). A
 * document navigation keeps the router out of it; the seed route sets the
 * attempt cookie, so this runs once.
 */
export function LocaleSeedHardRedirect({ href }: { href: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);
  return null;
}
