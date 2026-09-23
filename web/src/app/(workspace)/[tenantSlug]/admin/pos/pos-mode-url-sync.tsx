"use client";

/**
 * PosModeUrlSync — put `?mode=` in the address without an App Router navigation.
 *
 * THE DEFECT (D-MSG-318 / D-MSG-319, same family as D-155). The POS route used
 * to `redirect()` when the query had no (or an unusable) `mode`, rewriting
 * `/admin/pos` → `/admin/pos?mode=counter` (and the same with `?order=` /
 * `?view=`). That server redirect leaves the App Router holding two thenables;
 * React 19 throws `Rendered more hooks than during the previous render` (#310)
 * from the router's own `useMemo` (react#33556). Proven live: bare `/admin/pos`
 * and `/admin/pos?order=<id>` each throw once; the same URLs with `mode=`
 * already present do not.
 *
 * The page now resolves the mode in place and mounts this syncer. A
 * `history.replaceState` writes the mode into the address without asking the
 * router to navigate, so the till paints once and stays hook-stable.
 */

import { useEffect } from "react";

import type { PosMode } from "@/lib/pos/modes";

export function PosModeUrlSync(props: {
  readonly mode: PosMode;
  readonly orderId: string | null;
  readonly viewMessages: boolean;
}) {
  const { mode, orderId, viewMessages } = props;
  useEffect(() => {
    const url = new URL(window.location.href);
    let dirty = false;
    if (url.searchParams.get("mode") !== mode) {
      url.searchParams.set("mode", mode);
      dirty = true;
    }
    // Keep order / view that the server already rendered for; do not invent
    // them here. Only clear a stale view=messages when this render is not
    // the messages view (the mode fill-in used to preserve it explicitly).
    if (viewMessages && url.searchParams.get("view") !== "messages") {
      url.searchParams.set("view", "messages");
      dirty = true;
    }
    if (orderId && url.searchParams.get("order") !== orderId) {
      url.searchParams.set("order", orderId);
      dirty = true;
    }
    if (!dirty) return;
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [mode, orderId, viewMessages]);
  return null;
}
