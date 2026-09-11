"use client";

import { useEffect, useState } from "react";

/**
 * Whether the Messages surface should render its phone shape (`compact`):
 * the workspace shell's own mobile breakpoint (720px, `admin-shell-client.tsx`
 * shows the bottom tab bar under it), so the phone (390x844, MM01 to MM06)
 * and a narrow tablet split both get `PhoneMessages`, and the tablet in
 * landscape (1194x834, MS02) keeps the three panes. Live across resizes;
 * `false` on the server and on first paint so the markup matches.
 */
export function useCompactViewport(maxWidthPx = 720): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [maxWidthPx]);
  return compact;
}
