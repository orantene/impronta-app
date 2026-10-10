"use client";

import { useEffect } from "react";

import type { BookEntry } from "@/lib/talent-site/book-entry";
import { TALENT_BOOK_HREF } from "@/lib/talent-site/contact-channels";
import { hubBookHashIntent } from "@/lib/talent-site/hub-book-hash";
import { requestTalentOpen } from "@/lib/talent-site/open-intent-client";

/** The URL whose fragment already opened: effect re-runs must not re-open it. */
let coldLoadHandledFor = "";

/**
 * Hub `/t/<code>#book` opener (TUL-246). Cold load, paste, hashchange and
 * in-page `#book` clicks queue the same intent the vanity bridge uses so the
 * catalog booking sheet (or inquire chat) opens when its listener is ready.
 */
export function HubBookHashBridge({ bookEntry }: { bookEntry: BookEntry }) {
  useEffect(() => {
    const openFrom = (hashOrHref: string) => {
      const intent = hubBookHashIntent(hashOrHref, bookEntry);
      if (intent) requestTalentOpen(intent);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a");
      if (!link) return;
      const href = link.getAttribute("href") ?? "";
      if (hubBookHashIntent(href, bookEntry) == null) return;
      event.preventDefault();
      if (window.location.hash !== TALENT_BOOK_HREF) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${TALENT_BOOK_HREF}`);
      }
      openFrom(TALENT_BOOK_HREF);
    };
    const onHash = () => openFrom(window.location.hash);
    if (coldLoadHandledFor !== window.location.href) {
      coldLoadHandledFor = window.location.href;
      onHash();
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("hashchange", onHash);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("hashchange", onHash);
    };
  }, [bookEntry]);

  return <span id="book" data-hub-book-target="" aria-hidden="true" />;
}
